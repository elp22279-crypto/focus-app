// src/store/useStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId, calculatePoints, calculateNextDate } from '../utils/helpers.js';

const debounce = (fn, ms) => {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

const debouncedSetItem = debounce((name, value) => {
  try { localStorage.setItem(name, value); }
  catch (e) { console.error('Storage quota exceeded', e); }
}, 1000);

const customStorage = createJSONStorage(() => ({
  getItem: (name) => localStorage.getItem(name),
  setItem: debouncedSetItem,
  removeItem: (name) => localStorage.removeItem(name),
}));

const getAllDescendantIds = (taskId, byId) => {
  const task = byId[taskId];
  if (!task || !task.childrenIds?.length) return [];
  let descendantIds = [...task.childrenIds];
  task.childrenIds.forEach(childId => {
    descendantIds = [...descendantIds, ...getAllDescendantIds(childId, byId)];
  });
  return descendantIds;
};

export const useStore = create(
  persist(
    (set, get) => ({
      byId: {},
      rootIds: [],
      categories: ['Работа', 'Личное', 'Учеба', 'Здоровье'],
      activityLogs: [],
      settings: { dailyLimit: 6, retentionMonths: 3, goals: { daily: 100, weekly: 500, monthly: 2000 } },
      ui: {
        activeTab: 'daily', 
        selectedDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
        sortMode: 'none', 
        expandedNodes: [], 
        editingNodeId: null, 
        showSettings: false, 
        showOverdue: false,
        baseViewMode: 'active', 
        baseFilterDate: '', 
        baseFilterDeadline: '',
        selectedTaskIds: []
      },

      addTask: (payload) => set((state) => {
        const id = generateId();
        const newTask = {
          id, title: payload.title || '', estimate: payload.estimate || 0, done: false,
          status: payload.status || 'active', date: payload.date || null, deadline: payload.deadline || null,
          time: payload.time || null, category: payload.category || null, priority: payload.priority || 'nn',
          repeatType: payload.repeatType || 'none', repeatDays: payload.repeatDays || [],
          repeatMonthDay: payload.repeatMonthDay || null, completedAt: null, parentId: payload.parentId || null, childrenIds: []
        };
        const newById = { ...state.byId, [id]: newTask };
        const newRootIds = [...state.rootIds];

        if (newTask.parentId && newById[newTask.parentId]) {
          newById[newTask.parentId] = { ...newById[newTask.parentId], childrenIds: [...newById[newTask.parentId].childrenIds, id] };
        } else { newRootIds.push(id); }

        return { 
          byId: newById, 
          rootIds: newRootIds, 
          ui: payload.skipEdit ? state.ui : { ...state.ui, editingNodeId: id } 
        };
      }),

      updateTask: (id, payload) => set((state) => {
        const task = state.byId[id];
        if (!task) return state;
        const newLogs = [...state.activityLogs];
        if (payload.date !== undefined && payload.date !== task.date) {
          newLogs.push({ id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 });
        }
        const newById = { ...state.byId };
        let newRootIds = [...state.rootIds];

        if (payload.parentId !== undefined && payload.parentId !== task.parentId) {
          if (task.parentId && newById[task.parentId]) {
            newById[task.parentId] = { ...newById[task.parentId], childrenIds: newById[task.parentId].childrenIds.filter(cId => cId !== id) };
          } else { newRootIds = newRootIds.filter(rId => rId !== id); }

          if (payload.parentId && newById[payload.parentId]) {
            newById[payload.parentId] = { ...newById[payload.parentId], childrenIds: [...newById[payload.parentId].childrenIds, id] };
          } else { newRootIds.push(id); }
        }
        newById[id] = { ...task, ...payload };
        return { byId: newById, rootIds: newRootIds, activityLogs: newLogs };
      }),

      deleteTask: (id) => set((state) => {
        const task = state.byId[id];
        if (!task) return state;
        const idsToDelete = [id, ...getAllDescendantIds(id, state.byId)];
        const newById = { ...state.byId };
        idsToDelete.forEach(delId => delete newById[delId]);
        const newRootIds = state.rootIds.filter(rId => !idsToDelete.includes(rId));
        if (task.parentId && newById[task.parentId]) {
          newById[task.parentId] = { ...newById[task.parentId], childrenIds: newById[task.parentId].childrenIds.filter(cId => cId !== id) };
        }
        const newLogs = [...state.activityLogs, { id: generateId(), type: 'deleted', taskId: id, timestamp: Date.now(), points: 0 }];
        return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, ui: { ...state.ui, editingNodeId: state.ui.editingNodeId === id ? null : state.ui.editingNodeId } };
      }),

      toggleDone: (id) => set((state) => {
        const task = state.byId[id];
        if (!task) return state;

        const isNowDone = !task.done;
        let nextDate = task.date;
        let newDoneState = isNowDone;
        let deltaMs = 0;

        if (isNowDone && task.repeatType !== 'none') {
          nextDate = calculateNextDate(task.date, task.repeatType, task.repeatDays, task.repeatMonthDay);
          newDoneState = false;
          if (task.date && nextDate) {
            deltaMs = new Date(nextDate).getTime() - new Date(task.date).getTime();
          }
        }

        const newLog = isNowDone ? {
          id: generateId(), type: 'completed', taskId: id, timestamp: Date.now(), points: calculatePoints(task.estimate)
        } : null;

        const newById = { ...state.byId };
        newById[id] = { ...task, done: newDoneState, date: nextDate, completedAt: isNowDone ? Date.now() : null };

        if (isNowDone && task.repeatType !== 'none') {
          const descendantIds = getAllDescendantIds(id, state.byId);
          descendantIds.forEach(childId => {
            const child = newById[childId];
            if (child) {
              let cDate = child.date;
              let cDeadline = child.deadline;
              if (deltaMs > 0) {
                if (cDate) { const d = new Date(cDate); d.setTime(d.getTime() + deltaMs); cDate = d.toISOString().split('T')[0]; }
                if (cDeadline) { const d = new Date(cDeadline); d.setTime(d.getTime() + deltaMs); cDeadline = d.toISOString().split('T')[0]; }
              }
              newById[childId] = { ...child, done: false, date: cDate, deadline: cDeadline, completedAt: null };
            }
          });
        }

        return { byId: newById, activityLogs: newLog ? [...state.activityLogs, newLog] : state.activityLogs };
      }),

      handleRepeatNext: (id) => set((state) => {
        const task = state.byId[id];
        if (!task || task.repeatType === 'none') return state;

        const nextDate = calculateNextDate(task.date, task.repeatType, task.repeatDays, task.repeatMonthDay);
        let deltaMs = 0;
        if (task.date && nextDate) {
          deltaMs = new Date(nextDate).getTime() - new Date(task.date).getTime();
        }
        
        let newById = { ...state.byId, [id]: { ...task, date: nextDate, done: false, completedAt: null } };
        
        const descendantIds = getAllDescendantIds(id, state.byId);
        descendantIds.forEach(childId => {
          const child = newById[childId];
          if (child) {
            let cDate = child.date;
            let cDeadline = child.deadline;
            if (deltaMs > 0) {
              if (cDate) { const d = new Date(cDate); d.setTime(d.getTime() + deltaMs); cDate = d.toISOString().split('T')[0]; }
              if (cDeadline) { const d = new Date(cDeadline); d.setTime(d.getTime() + deltaMs); cDeadline = d.toISOString().split('T')[0]; }
            }
            newById[childId] = { ...child, done: false, date: cDate, deadline: cDeadline, completedAt: null };
          }
        });

        return {
          byId: newById,
          activityLogs: [...state.activityLogs, { id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 }]
        };
      }),

      triageTask: (id, action) => {
        const state = get();
        if (action === 'today') {
          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          state.updateTask(id, { date: today, status: 'active' });
        } else if (action === 'backlog') {
          state.updateTask(id, { date: null, status: 'backlog' });
        } else if (action === 'delete') {
          state.deleteTask(id);
        }
      },

      toggleTaskSelection: (id) => set((state) => {
        const selected = new Set(state.ui.selectedTaskIds || []);
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        return { ui: { ...state.ui, selectedTaskIds: Array.from(selected) } };
      }),

      clearTaskSelection: () => set((state) => ({ ui: { ...state.ui, selectedTaskIds: [] } })),

      updateMultipleTasks: (ids, payload) => set((state) => {
        const newById = { ...state.byId };
        const newLogs = [...state.activityLogs];
        ids.forEach(id => {
          const task = newById[id];
          if (!task) return;
          if (payload.date !== undefined && payload.date !== task.date) {
            newLogs.push({ id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 });
          }
          newById[id] = { ...task, ...payload };
        });
        return { byId: newById, activityLogs: newLogs, ui: { ...state.ui, selectedTaskIds: [] } };
      }),

      updateUI: (payload) => set((state) => ({ ui: { ...state.ui, ...payload } })),
      toggleExpand: (id) => set((state) => {
        const expanded = new Set(state.ui.expandedNodes);
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        return { ui: { ...state.ui, expandedNodes: Array.from(expanded) } };
      }),
      updateSettings: (payload) => set((state) => ({ settings: { ...state.settings, ...payload } })),
      addCategory: (name) => set((state) => ({ categories: [...state.categories, name] })),
      deleteCategory: (name) => set((state) => {
        const newById = { ...state.byId };
        Object.values(newById).forEach(t => { if (t.category === name) newById[t.id].category = null; });
        return { categories: state.categories.filter(c => c !== name), byId: newById };
      }),
      updateCategory: (oldName, newName) => set((state) => {
        const newById = { ...state.byId };
        Object.values(newById).forEach(t => { if (t.category === oldName) newById[t.id].category = newName; });
        return { categories: state.categories.map(c => c === oldName ? newName : c), byId: newById };
      })
    }),
    { 
      name: 'focus-app-v4', 
      storage: customStorage,
      merge: (persistedState, currentState) => {
        return {
          ...currentState,
          ...persistedState,
          ui: {
            ...currentState.ui, 
            ...(persistedState.ui || {}), 
            
            // Защита от зависания состояния сессии
            selectedDate: currentState.ui.selectedDate, 
            activeTab: 'daily', 
            editingNodeId: null, 
            showSettings: false, 
            showOverdue: false, 
            expandedNodes: [],
            selectedTaskIds: []
          }
        };
      }
    }
  )
);