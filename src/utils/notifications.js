import { LocalNotifications } from '@capacitor/local-notifications';

// FNV-1a 32-bit hash function
function generateNotificationId(str) {
  let hash = 2166136261;
  if (!str || str.length === 0) return 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Ensure positive signed 32-bit integer for Capacitor compatibility
  return (hash >>> 0) & 0x7FFFFFFF;
}

export const syncNotifications = async (tasksById) => {
  try {
    // 1. Check permissions
    let permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== 'granted') {
      permStatus = await LocalNotifications.requestPermissions();
    }
    
    if (permStatus.display !== 'granted') {
      console.warn('Нет разрешения на уведомления');
      return;
    }

    // 2. Build target schedule Map from store
    const now = new Date().getTime();
    const targetMap = new Map(); // id -> notification object

    Object.values(tasksById).forEach((task) => {
      if (
        task.status === 'active' &&
        !task.done &&
        task.date &&
        task.time &&
        /^\d{2}:\d{2}$/.test(task.time)
      ) {
        const [hours, minutes] = task.time.split(':').map(Number);
        
        const scheduleDate = new Date(task.date);
        scheduleDate.setHours(hours, minutes, 0, 0);

        if (scheduleDate.getTime() > now) {
          const id = generateNotificationId(task.id);
          
          targetMap.set(id, {
            id,
            title: 'Фокус',
            body: task.title,
            schedule: { at: scheduleDate },
            sound: null,
            attachments: null,
            actionTypeId: '',
            extra: { 
              originalTime: scheduleDate.getTime(), 
              originalTitle: task.title 
            }
          });
        }
      }
    });

    // 3. Get pending notifications
    const pendingResult = await LocalNotifications.getPending();
    const pendingNotifications = pendingResult.notifications || [];

    const toCancelIds = [];
    const pendingMap = new Map();

    // 4. Diff: Identify notifications to cancel
    pendingNotifications.forEach(pn => {
      // Capacitor might return ID as string on some platforms
      const pnId = Number(pn.id);
      pendingMap.set(pnId, pn);

      const target = targetMap.get(pnId);
      
      let needsCancel = false;
      if (!target) {
        // Task was deleted, completed, or time cleared
        needsCancel = true;
      } else {
        // Task still exists, check if details changed using our embedded extra payload
        const prevExtra = pn.extra || {};
        if (
          prevExtra.originalTitle !== target.extra.originalTitle || 
          prevExtra.originalTime !== target.extra.originalTime
        ) {
          needsCancel = true;
        }
      }

      if (needsCancel) {
        toCancelIds.push({ id: pnId });
      }
    });

    // 5. Diff: Identify notifications to schedule
    const toSchedule = [];
    targetMap.forEach((target, id) => {
      const pn = pendingMap.get(id);
      if (!pn) {
        // Completely new notification
        toSchedule.push(target);
      } else {
        // Exists, but was it flagged for cancellation (meaning it changed)?
        const isCanceled = toCancelIds.some(c => c.id === id);
        if (isCanceled) {
          toSchedule.push(target);
        }
      }
    });

    // 6. Execute delta-sync
    if (toCancelIds.length > 0) {
      await LocalNotifications.cancel({ notifications: toCancelIds });
    }

    if (toSchedule.length > 0) {
      await LocalNotifications.schedule({ notifications: toSchedule });
    }

  } catch (e) {
    console.warn('Синхронизация уведомлений пропущена (возможно запуск не в Capacitor):', e.message);
  }
};
