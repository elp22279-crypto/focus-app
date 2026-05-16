// src/utils/haptics.js
/**
 * Обёртка над @capacitor/haptics.
 * На вебе / при отсутствии нативного слоя — молча деградирует без ошибок.
 *
 * Экспортируемые функции:
 *   triggerLightImpact() — лёгкий отклик: переключение меню, выбор дат/приоритетов
 *   triggerSuccess()     — успешное завершение: сохранение, выполнение задачи
 *   triggerWarning()     — предупреждение: пустая задача, ошибка API
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const safe = (fn) => async (...args) => {
  try { await fn(...args); } catch { /* web fallback — noop */ }
};

/** Лёгкий тактильный импульс — переключатели, выборы в меню */
export const triggerLightImpact = safe(() =>
  Haptics.impact({ style: ImpactStyle.Light })
);

/** Средний импульс — подтверждение действия (открытие редактора, свайп-выбор) */
export const triggerMediumImpact = safe(() =>
  Haptics.impact({ style: ImpactStyle.Medium })
);

/** Успешное завершение — зелёный паттерн виброотклика */
export const triggerSuccess = safe(() =>
  Haptics.notification({ type: NotificationType.Success })
);

/** Предупреждение — янтарный паттерн виброотклика */
export const triggerWarning = safe(() =>
  Haptics.notification({ type: NotificationType.Warning })
);

/** Ошибка — красный паттерн виброотклика */
export const triggerError = safe(() =>
  Haptics.notification({ type: NotificationType.Error })
);
