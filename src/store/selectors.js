// src/store/selectors.js
import { useStore } from './useStore.js';
import { useShallow } from 'zustand/react/shallow';

export const useNodeProgress = (taskId) => {
  return useStore(useShallow(state => {
    const task = state.byId[taskId];
    if (!task) return { total: 0, completed: 0, remaining: 0, isParent: false };
    
    if (!task.childrenIds || task.childrenIds.length === 0) {
      const t = task.estimate || 0;
      return { total: t, completed: task.done ? t : 0, remaining: task.done ? 0 : t, isParent: false };
    }
    
    const calcChildren = (id) => {
      const t = state.byId[id];
      if (!t) return { t: 0, c: 0 };
      if (!t.childrenIds?.length) return { t: t.estimate || 0, c: t.done ? (t.estimate || 0) : 0 };
      return t.childrenIds.reduce((acc, childId) => {
        const res = calcChildren(childId);
        return { t: acc.t + res.t, c: acc.c + res.c };
      }, { t: t.estimate || 0, c: 0 });
    };

    const childrenStats = task.childrenIds.reduce((acc, childId) => {
      const res = calcChildren(childId);
      return { t: acc.t + res.t, c: acc.c + res.c };
    }, { t: 0, c: 0 });

    const total = (task.estimate || 0) + childrenStats.t;
    const completed = task.done ? total : childrenStats.c;
    return { total, completed, remaining: Math.max(0, total - completed), isParent: true };
  }));
};

export const useDailyIds = () => {
  return useStore(useShallow(state => {
    const { byId, ui: { selectedDate, sortMode } } = state;
    
    // Сканируем ВСЕ ключи объектов, а не только rootIds
    let daily = Object.keys(byId).filter(id => {
      const t = byId[id];
      if (!t || t.done || t.status !== 'active' || t.date !== selectedDate) return false;
      
      // Логика автономности: если у родителя ТАКАЯ ЖЕ дата, 
      // подзадачу отдельно не выводим (она будет внутри родителя).
      // Если у родителя дата другая или её нет — подзадача выводится как корень.
      if (t.parentId) {
        const parent = byId[t.parentId];
        if (parent && parent.date === selectedDate) return false;
      }
      return true;
    });

    if (sortMode === 'time') {
      daily.sort((a, b) => (byId[a].time || 'zz').localeCompare(byId[b].time || 'zz'));
    } else if (sortMode === 'priority') {
      const w = { 'ui': 1, 'in': 2, 'un': 3, 'nn': 4 };
      daily.sort((a, b) => {
        const tA = byId[a], tB = byId[b];
        if (w[tA.priority] !== w[tB.priority]) return w[tA.priority] - w[tB.priority];
        return (tA.time || 'zz').localeCompare(tB.time || 'zz');
      });
    }
    return daily;
  }));
};

export const useBacklogIds = () => {
  return useStore(useShallow(state => {
    const { rootIds, byId, ui: { baseViewMode, baseFilterDate, baseFilterDeadline } } = state;
    
    if (baseViewMode === 'completed') return Object.keys(byId).filter(id => byId[id].done);
    if (baseViewMode === 'unallocated') return rootIds.filter(id => !byId[id].done && !byId[id].date && !byId[id].deadline);
    
    if (baseFilterDate || baseFilterDeadline) {
      return Object.keys(byId).filter(id => {
        const t = byId[id]; if (t.done) return false;
        let match = true;
        if (baseFilterDate) match = match && t.date === baseFilterDate;
        if (baseFilterDeadline) match = match && t.deadline === baseFilterDeadline;
        return match;
      });
    }
    
    // Мастер-список: возвращаем абсолютно все активные (невыполненные) задачи
    return rootIds.filter(id => !byId[id].done);
  }));
};

export const useAnalyticsData = (days) => {
  return useStore(useShallow(state => {
    const ms = days * 86400000;
    const logs = state.activityLogs.filter(l => Date.now() - l.timestamp <= ms);
    return {
      completed: logs.filter(l => l.type === 'completed').length,
      rescheduled: logs.filter(l => l.type === 'rescheduled').length,
      deleted: logs.filter(l => l.type === 'deleted').length,
      points: Number(logs.filter(l => l.type === 'completed').reduce((a, l) => a + l.points, 0).toFixed(1))
    };
  }));
};