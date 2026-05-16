import { LocalNotifications } from '@capacitor/local-notifications';

// Функция для хеширования строки в 32-битное целое число (ID для уведомлений должен быть int32)
function hashCode(str) {
  let hash = 0;
  if (!str || str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; 
  }
  return Math.abs(hash);
}

export const syncNotifications = async (tasksById) => {
  try {
    // 1. Проверяем разрешения (сработает только на реальных устройствах, в браузере может кинуть ошибку, ловим в try/catch)
    let permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      permStatus = await LocalNotifications.requestPermissions();
    }
    
    if (permStatus.display !== 'granted') {
      console.warn('Нет разрешения на уведомления');
      return;
    }

    // 2. Очищаем все текущие запланированные уведомления
    const pending = await LocalNotifications.getPending();
    if (pending.notifications && pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications });
    }

    // 3. Формируем список новых уведомлений
    const notificationsToSchedule = [];
    const now = new Date().getTime();

    Object.values(tasksById).forEach((task) => {
      // Нужны только активные, невыполненные задачи с датой и конкретным временем (ЧЧ:ММ)
      if (
        task.status === 'active' &&
        !task.done &&
        task.date &&
        task.time &&
        /^\d{2}:\d{2}$/.test(task.time)
      ) {
        const [hours, minutes] = task.time.split(':').map(Number);
        
        // Создаем дату срабатывания
        const scheduleDate = new Date(task.date);
        scheduleDate.setHours(hours, minutes, 0, 0);

        // Если время еще не наступило (в будущем)
        if (scheduleDate.getTime() > now) {
          notificationsToSchedule.push({
            id: hashCode(task.id),
            title: 'Фокус',
            body: task.title,
            schedule: { at: scheduleDate },
            sound: null, // Использовать системный звук по умолчанию
            attachments: null,
            actionTypeId: '',
            extra: null
          });
        }
      }
    });

    // 4. Планируем
    if (notificationsToSchedule.length > 0) {
      await LocalNotifications.schedule({
        notifications: notificationsToSchedule
      });
    }

  } catch (e) {
    console.warn('Синхронизация уведомлений пропущена (возможно запуск не в Capacitor):', e.message);
  }
};
