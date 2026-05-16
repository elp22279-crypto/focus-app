// src/utils/backup.js
/**
 * Модуль резервного копирования и восстановления задач.
 *
 * exportTasks()  — сериализует задачи в JSON, сохраняет во временную
 *                  директорию через Filesystem API и вызывает Share API.
 *                  На вебе — скачивает файл через <a download>.
 *
 * importTasks()  — открывает нативный File Picker (или <input type="file">
 *                  на вебе), валидирует структуру и возвращает нормализованный
 *                  массив задач. Выбрасывает BackupValidationError при невалидных данных.
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useStore } from '../store/useStore.js';

// ── Кастомная ошибка валидации ───────────────────────────────────────────────
export class BackupValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

// ── Вспомогательные ─────────────────────────────────────────────────────────
const BACKUP_FILENAME = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `focus-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
};

/** Минимальная валидация одного объекта задачи */
const isValidTask = (t) =>
  t !== null &&
  typeof t === 'object' &&
  typeof t.id === 'string' && t.id.length > 0 &&
  typeof t.title === 'string';

/** Валидирует весь payload бэкапа */
const validatePayload = (parsed) => {
  // Формат A: массив задач (legacy / простой)
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && !isValidTask(parsed[0])) {
      throw new BackupValidationError(
        'Файл содержит массив, но объекты задач не имеют обязательных полей id и title.'
      );
    }
    return { tasks: parsed, rootIds: null, activityLogs: [] };
  }

  // Формат B: полный снимок стора { byId, rootIds, activityLogs }
  if (parsed && typeof parsed === 'object' && parsed.byId && parsed.rootIds) {
    const tasks = Object.values(parsed.byId);
    const invalid = tasks.find((t) => !isValidTask(t));
    if (invalid) {
      throw new BackupValidationError(
        `Объект с id «${invalid?.id ?? '?'}» не прошёл валидацию (отсутствует id или title).`
      );
    }
    return {
      tasks,
      byId: parsed.byId,
      rootIds: parsed.rootIds,
      activityLogs: Array.isArray(parsed.activityLogs) ? parsed.activityLogs : [],
    };
  }

  throw new BackupValidationError(
    'Неизвестный формат файла. Ожидается массив задач или объект { byId, rootIds }.'
  );
};

// ── exportTasks ──────────────────────────────────────────────────────────────
export const exportTasks = async () => {
  const state = useStore.getState();
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    byId: state.byId,
    rootIds: state.rootIds,
    activityLogs: state.activityLogs,
  };
  const json = JSON.stringify(payload, null, 2);
  const filename = BACKUP_FILENAME();

  // ── Попытка нативного пути (Capacitor) ──────────────────────────────────
  try {
    await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    await Share.share({
      title: 'Резервная копия задач Focus',
      text: `Бэкап от ${new Date().toLocaleString('ru-RU')}`,
      url: uri,
      dialogTitle: 'Сохранить или отправить резервную копию',
    });

    return; // успешно — выходим
  } catch (nativeErr) {
    // Share.canShare() вернул false или мы на вебе — fallback
    if (nativeErr?.message?.includes('Share is not implemented')) {
      // Ожидаемо на вебе
    } else {
      console.warn('Нативный Share недоступен, используем web-fallback:', nativeErr);
    }
  }

  // ── Web-fallback: скачать файл через <a download> ────────────────────────
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
};

// ── importTasks (читает файл + валидирует) ───────────────────────────────────
/**
 * Открывает нативный/веб File Picker, читает JSON, валидирует и возвращает
 * нормализованный объект { byId, rootIds, activityLogs }.
 *
 * @returns {Promise<{ byId: object, rootIds: string[], activityLogs: any[] }>}
 * @throws {BackupValidationError} при невалидной структуре
 */
export const importTasks = () =>
  new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('Файл не выбран')); return; }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const validated = validatePayload(parsed);

        // Нормализуем в формат { byId, rootIds, activityLogs }
        if (validated.byId) {
          resolve({
            byId: validated.byId,
            rootIds: validated.rootIds,
            activityLogs: validated.activityLogs,
          });
        } else {
          // legacy array — восстанавливаем byId / rootIds из массива
          const byId = {};
          const rootIds = [];
          validated.tasks.forEach((t) => {
            byId[t.id] = { childrenIds: [], ...t };
            if (!t.parentId) rootIds.push(t.id);
          });
          // Восстанавливаем childrenIds
          validated.tasks.forEach((t) => {
            if (t.parentId && byId[t.parentId]) {
              byId[t.parentId].childrenIds = [
                ...new Set([...byId[t.parentId].childrenIds, t.id]),
              ];
            }
          });
          resolve({ byId, rootIds, activityLogs: [] });
        }
      } catch (err) {
        if (err instanceof BackupValidationError) reject(err);
        else reject(new BackupValidationError(`Ошибка чтения файла: ${err.message}`));
      } finally {
        input.remove();
      }
    };

    input.oncancel = () => reject(new Error('Файл не выбран'));
    document.body.appendChild(input);
    input.click();
  });
