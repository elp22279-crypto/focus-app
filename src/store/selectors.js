// src/store/selectors.js
/**
 * Все сложные вычисления — итеративные (без рекурсии).
 * Мемоизация branch-load реализована через ручной кэш (prev-result pattern),
 * чтобы не вводить внешнюю зависимость (reselect).
 */
import { useStore } from './useStore.js';
import { useShallow } from 'zustand/react/shallow';
import { calcNodeProgress, buildBranchLoadMap } from '../utils/graphUtils.js';

// ── useNodeProgress ────────────────────────────────────────────────────────
// Итеративный расчёт прогресса ветки. Перерисовка только если изменился
// byId (конкретные задачи внутри ветки).
export const useNodeProgress = (taskId) => {
  return useStore(useShallow(state => {
    const { total, completed, isParent } = calcNodeProgress(taskId, state.byId);
    return { total, completed, remaining: Math.max(0, total - completed), isParent };
  }));
};

// ── useDailyIds ────────────────────────────────────────────────────────────
export const useDailyIds = () => {
  return useStore(useShallow(state => {
    const { byId, ui: { selectedDate, sortMode } } = state;

    let daily = Object.keys(byId).filter(id => {
      const t = byId[id];
      if (!t || t.done || t.isHidden || t.status !== 'active' || t.date !== selectedDate) return false;
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

// ── useBacklogIds ──────────────────────────────────────────────────────────
export const useBacklogIds = () => {
  return useStore(useShallow(state => {
    const { rootIds, byId, ui: { baseViewMode, baseFilterDate, baseFilterDeadline } } = state;

    if (baseViewMode === 'completed')   return Object.keys(byId).filter(id => byId[id].done && !byId[id].isHidden);
    if (baseViewMode === 'unallocated') return rootIds.filter(id => !byId[id].done && !byId[id].isHidden && !byId[id].date && !byId[id].deadline);

    if (baseFilterDate || baseFilterDeadline) {
      return Object.keys(byId).filter(id => {
        const t = byId[id]; if (t.done || t.isHidden) return false;
        let match = true;
        if (baseFilterDate)     match = match && t.date     === baseFilterDate;
        if (baseFilterDeadline) match = match && t.deadline === baseFilterDeadline;
        return match;
      });
    }

    return rootIds.filter(id => !byId[id].done && !byId[id].isHidden);
  }));
};

// ── useAnalyticsData ───────────────────────────────────────────────────────
export const useAnalyticsData = (days) => {
  return useStore(useShallow(state => {
    const ms = days * 86400000;
    const logs = state.activityLogs.filter(l => Date.now() - l.timestamp <= ms);
    return {
      completed:   logs.filter(l => l.type === 'completed').length,
      rescheduled: logs.filter(l => l.type === 'rescheduled').length,
      deleted:     logs.filter(l => l.type === 'deleted').length,
      points: Number(logs.filter(l => l.type === 'completed').reduce((a, l) => a + l.points, 0).toFixed(1))
    };
  }));
};

// ── useDailyLoad ────────────────────────────────────────────────────────────
/**
 * Мемоизированный расчёт суммарной нагрузки на день.
 * Использует buildBranchLoadMap (итеративный DFS) для O(N) прохода.
 *
 * Перерисовка происходит только если изменились:
 *   - byId (ключи или значения задач текущего дня)
 *   - selectedDate
 *   - dailyLimit
 *
 * Ручной кэш (prev-result pattern) позволяет избежать повторного вычисления
 * при перерисовке, вызванной несвязанными полями стора.
 */
let _loadCache = { byId: null, selectedDate: null, result: null };

export const useDailyLoad = () => {
  return useStore(useShallow(state => {
    const { byId, ui: { selectedDate }, settings: { dailyLimit } } = state;

    // Собираем видимые корневые задачи текущего дня
    const rootIds = Object.keys(byId).filter(id => {
      const t = byId[id];
      if (!t || t.done || t.isHidden || t.status !== 'active' || t.date !== selectedDate) return false;
      if (t.parentId && byId[t.parentId]?.date === selectedDate) return false;
      return true;
    });

    // Кэш: если byId и selectedDate не изменились — возвращаем предыдущий результат
    if (_loadCache.byId === byId && _loadCache.selectedDate === selectedDate) {
      const load = _loadCache.result;
      return { load, percentage: Math.min((load / dailyLimit) * 100, 100) };
    }

    // Вычисляем через buildBranchLoadMap (итеративный DFS)
    const loadMap = buildBranchLoadMap(rootIds, byId);
    let totalLoad = 0;
    for (const id of rootIds) {
      totalLoad += loadMap.get(id) ?? 0;
    }

    // Сохраняем в кэш
    _loadCache = { byId, selectedDate, result: totalLoad };

    return { load: totalLoad, percentage: Math.min((totalLoad / dailyLimit) * 100, 100) };
  }));
};