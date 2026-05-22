// src/store/useStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId, calculatePoints, calculateNextDate } from '../utils/helpers.js';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import { getDescendantIds, insertNode, removeNode, moveNode, cloneSubgraph } from '../utils/graphUtils.js';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

// ---------------------------------------------------------------------------
const actionTimers = new Map();

// ---------------------------------------------------------------------------
// Cycle-detection helper for bulk parentId updates.
// Returns true if assigning `newParentId` to `taskId` would create a cycle.
// ---------------------------------------------------------------------------
const wouldCreateCycle = (taskId, newParentId, byId) => {
  if (!newParentId) return false;
  if (newParentId === taskId) return true;
  // If newParentId is a descendant of taskId → cycle
  const descendants = getDescendantIds(taskId, byId);
  return descendants.includes(newParentId);
};





// ---------------------------------------------------------------------------
// Secure key storage helpers (Keychain / Keystore via @capacitor/preferences)
// Falls back to sessionStorage on the web so dev server works out-of-the-box.
// ---------------------------------------------------------------------------
const SECURE_KEY_NAME = 'focus_app_api_key';

export const getSecureApiKey = async () => {
  try {
    const { value } = await SecureStoragePlugin.get({ key: SECURE_KEY_NAME });
    return value ?? null;
  } catch {
    return sessionStorage.getItem(SECURE_KEY_NAME);
  }
};

const secureWrite = async (value) => {
  try {
    if (value) {
      await SecureStoragePlugin.set({ key: SECURE_KEY_NAME, value });
    } else {
      await SecureStoragePlugin.remove({ key: SECURE_KEY_NAME });
    }
  } catch {
    if (value) sessionStorage.setItem(SECURE_KEY_NAME, value);
    else sessionStorage.removeItem(SECURE_KEY_NAME);
  }
};

const idbStorage = createJSONStorage(() => ({
  getItem: async (name) => (await idbGet(name)) || null,
  setItem: async (name, value) => await idbSet(name, value),
  removeItem: async (name) => await idbDel(name),
}));


export const useStore = create(
  persist(
    (set, get) => ({
      byId: {},
      rootIds: [],
      graphVersion: 0,
      categories: ['Работа', 'Личное', 'Учеба', 'Здоровье'],
      tags: ['#дома', '#выезд'],
      activityLogs: [],
      settings: { dailyLimit: 6, retentionMonths: 3, goals: { daily: 100, weekly: 500, monthly: 2000 } },

      aiAnalyticsCache: {},
      setAiAnalyticsCache: (period, data) => set(s => ({ 
        aiAnalyticsCache: { ...s.aiAnalyticsCache, [period]: { timestamp: Date.now(), data } } 
      })),

      _hasHydrated: false,
      setHasHydrated: (status) => set({ _hasHydrated: status }),

      // API-ключ не хранится в памяти; персистентность — через Secure Storage,
      // В сторе только флаг наличия для UI.
      hasApiKey: false,

      /** Сохранить API-ключ в защищённом хранилище. */
      setApiKey: async (key) => {
        const trimmed = key ? key.trim() : null;
        await secureWrite(trimmed || null);
        set({ hasApiKey: !!trimmed });
      },

      /** Мигрировать ключ из Preferences и загрузить статус из защищённого хранилища. */
      checkAndMigrateApiKey: async () => {
        let oldKey = null;
        try {
          const { value } = await Preferences.get({ key: SECURE_KEY_NAME });
          oldKey = value;
        } catch { /* noop */ }
        
        if (oldKey) {
          await secureWrite(oldKey);
          try { await Preferences.remove({ key: SECURE_KEY_NAME }); } catch {}
          set({ hasApiKey: true });
          return;
        }

        const currentKey = await getSecureApiKey();
        set({ hasApiKey: !!currentKey });
      },

      /** Загрузить API-ключ из защищённого хранилища. */
      loadApiKey: async () => {
        await get().checkAndMigrateApiKey();
      },

      // ── Undo/Snackbar ──────────────────────────────────────────────────
      // Record<taskId, { type: 'delete'|'complete', taskSnapshot, timeoutId, startedAt }>
      // НЕ персистируется (timeoutId не сериализуем).
      pendingActions: {},

      /** @private — зафиксировать отложенное действие немедленно */
      _commitPending: (id) => {
        const action = get().pendingActions[id];
        
        // Defensive cleanup
        const cleanupTimer = () => {
          if (actionTimers.has(id)) {
            clearTimeout(actionTimers.get(id));
            actionTimers.delete(id);
          }
        };

        if (!action) {
          cleanupTimer();
          return;
        }
        
        const state = get();
        if (!state.byId[action.taskSnapshot.id]) {
          cleanupTimer();
          set(s => {
            const newPending = { ...s.pendingActions };
            delete newPending[id];
            return { pendingActions: newPending };
          });
          return;
        }

        cleanupTimer();

        if (action.type === 'delete') {
          const { taskSnapshot } = action;
          set((state) => {
            const { newById, newRootIds } = removeNode(state.byId, state.rootIds, taskSnapshot.id);
            const newLogs = [...state.activityLogs, { id: generateId(), type: 'deleted', taskId: taskSnapshot.id, timestamp: Date.now(), points: 0 }];
            const newPending = { ...state.pendingActions };
            delete newPending[id];
            return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, pendingActions: newPending, graphVersion: state.graphVersion + 1 };
          });
        } else if (action.type === 'complete') {
          const { taskSnapshot } = action;
          set((state) => {
            const newById = { ...state.byId };
            // Удаляем флаг isHidden, оставляем done: true
            if (newById[taskSnapshot.id]) {
              newById[taskSnapshot.id] = { ...newById[taskSnapshot.id], isHidden: false };
            }
            const newLog = { id: generateId(), type: 'completed', taskId: taskSnapshot.id, timestamp: Date.now(), points: calculatePoints(taskSnapshot.estimate) };
            const newPending = { ...state.pendingActions };
            delete newPending[id];
            return { byId: newById, activityLogs: [...state.activityLogs, newLog], pendingActions: newPending };
          });
        }
      },

      /** Отменить последнее деструктивное действие */
      undoAction: (id) => {
        const action = get().pendingActions[id];
        if (!action) return;

        if (actionTimers.has(id)) {
          clearTimeout(actionTimers.get(id));
          actionTimers.delete(id);
        }
        
        const { taskSnapshot } = action;
        set((state) => {
          const newById = { ...state.byId };
          if (newById[taskSnapshot.id]) {
            // Снять скрытие и (если complete) вернуть done: false
            if (action.type === 'complete') {
              newById[taskSnapshot.id] = { ...taskSnapshot, isHidden: false };
            } else {
              // delete: восстановить видимость
              newById[taskSnapshot.id] = { ...newById[taskSnapshot.id], isHidden: false };
              // Потомки тоже
              getDescendantIds(taskSnapshot.id, newById).forEach(dId => {
                if (newById[dId]) newById[dId] = { ...newById[dId], isHidden: false };
              });
            }
          }
          const newPending = { ...state.pendingActions };
          delete newPending[id];
          return { byId: newById, pendingActions: newPending };
        });
      },

      ui: {
        activeTab: 'daily',
        selectedDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
        sortMode: 'none',
        viewMode: 'list',
        expandedNodes: [],
        editingNodeId: null,
        showSettings: false,
        showOverdue: false,
        baseViewMode: 'active',
        baseFilterDate: '',
        baseFilterDeadline: '',
        selectedTaskIds: [],
        isRecording: false
      },

      addTask: (payload) => set((state) => {
        const id = generateId();
        const newTask = {
          id, title: payload.title || '', estimate: payload.estimate || 0, done: false,
          description: payload.description || '', status: payload.status || 'active', date: payload.date || null, deadline: payload.deadline || null,
          time: payload.time || null, category: payload.category || null, tags: payload.tags || [], priority: payload.priority || 'nn',
          repeatType: payload.repeatType || 'none', repeatDays: payload.repeatDays || [],
          repeatMonthDay: payload.repeatMonthDay || null, completedAt: null, parentId: payload.parentId || null, childrenIds: []
        };
        
        const { newById, newRootIds } = insertNode(state.byId, state.rootIds, newTask);

        return { 
          byId: newById, 
          rootIds: newRootIds, 
          graphVersion: state.graphVersion + 1,
          ui: payload.skipEdit ? state.ui : { ...state.ui, editingNodeId: id } 
        };
      }),

      addTasksBatch: (payloadArray, parentId) => set((state) => {
        let newById = { ...state.byId };
        let newRootIds = [...state.rootIds];
        let newChildrenIds = [];
        
        payloadArray.forEach(payload => {
          const id = generateId();
          const newTask = {
            id, title: payload.title || '', estimate: payload.estimate || 0, done: false,
            description: payload.description || '', status: payload.status || 'active', date: payload.date || null, deadline: payload.deadline || null,
            time: payload.time || null, category: payload.category || null, tags: payload.tags || [], priority: payload.priority || 'nn',
            repeatType: payload.repeatType || 'none', repeatDays: payload.repeatDays || [],
            repeatMonthDay: payload.repeatMonthDay || null, completedAt: null, parentId: parentId || null, childrenIds: []
          };
          newById[id] = newTask;
          newChildrenIds = [...newChildrenIds, id];
          
          if (!parentId) {
            newRootIds = [...newRootIds, id];
          }
        });

        if (parentId && newById[parentId]) {
          newById[parentId] = {
            ...newById[parentId],
            childrenIds: [...(newById[parentId].childrenIds || []), ...newChildrenIds]
          };
        }

        return { byId: newById, rootIds: newRootIds, graphVersion: state.graphVersion + 1 };
      }),

      updateTask: (id, payload) => set((state) => {
        const task = state.byId[id];
        if (!task) return state;
        const newLogs = [...state.activityLogs];
        if (payload.date !== undefined && payload.date !== task.date) {
          newLogs.push({ id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 });
        }
        
        let newById = state.byId;
        let newRootIds = state.rootIds;
        let versionDelta = 0;

        if (payload.parentId !== undefined && payload.parentId !== task.parentId) {
          const moveRes = moveNode(newById, newRootIds, id, payload.parentId);
          newById = moveRes.newById;
          newRootIds = moveRes.newRootIds;
          versionDelta = 1;
        }

        newById = { ...newById, [id]: { ...newById[id], ...payload } };
        return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, graphVersion: state.graphVersion + versionDelta };
      }),

      deleteTask: (id) => {
        const state = get();
        const task = state.byId[id];
        if (!task) return;

        // Пометить задачу и всех потомков как скрытые (soft-delete)
        const idsToHide = [id, ...getDescendantIds(id, get().byId)];
        set((s) => {
          const newById = { ...s.byId };
          idsToHide.forEach(hId => { if (newById[hId]) newById[hId] = { ...newById[hId], isHidden: true }; });
          return {
            byId: newById,
            ui: { ...s.ui, editingNodeId: s.ui.editingNodeId === id ? null : s.ui.editingNodeId }
          };
        });

        // Запланировать реальное удаление (таймер в UndoSnackbar)
        set(s => ({
          pendingActions: {
            ...s.pendingActions,
            [id]: { type: 'delete', taskSnapshot: task, startedAt: Date.now() }
          }
        }));
        
        const timerId = setTimeout(() => {
          get()._commitPending(id);
        }, 3000);
        actionTimers.set(id, timerId);
      },

      duplicateTask: (id) => set((state) => {
        const original = state.byId[id];
        if (!original) return state;

        const newLogs = [...state.activityLogs];
        const { clonedById, newRootId } = cloneSubgraph(state.byId, id, generateId);

        let newById = { ...state.byId, ...clonedById };
        let newRootIds = [...state.rootIds];
        
        if (original.parentId && newById[original.parentId]) {
          newById[original.parentId] = {
            ...newById[original.parentId],
            childrenIds: [...(newById[original.parentId].childrenIds || []), newRootId]
          };
        } else {
          newRootIds = [...newRootIds, newRootId];
        }

        return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, graphVersion: state.graphVersion + 1 };
      }),

      toggleDone: (id) => {
        const state = get();
        const task = state.byId[id];
        if (!task) return;

        const isNowDone = !task.done;

        // ── Un-completing: мгновенно, undo не нужен ────────────────────
        if (!isNowDone) {
          set((s) => ({
            byId: { ...s.byId, [id]: { ...task, done: false, completedAt: null, isHidden: false } }
          }));
          return;
        }

        // ── Repeating tasks: создаём инстанс сегодняшнего дня, ─────────
        // шаблон переводим на следующую дату.
        if (task.repeatType !== 'none') {
          const nextDate = calculateNextDate(task.date, task.repeatType, task.repeatDays, task.repeatMonthDay);
          const deltaMs = (task.date && nextDate)
            ? new Date(nextDate).getTime() - new Date(task.date).getTime()
            : 0;
          const newLog = { id: generateId(), type: 'completed', taskId: id, timestamp: Date.now(), points: calculatePoints(task.estimate) };

          set((s) => {
            // 1. Клонируем поддерево с новыми ID (инстанс текущего дня)
            const { clonedById, newRootId, idMapping } = cloneSubgraph(s.byId, id, generateId);

            // 2. Продвигаем шаблон на следующую дату
            let newById = { ...s.byId, ...clonedById };
            newById[id] = { ...newById[id], done: false, date: nextDate, completedAt: null };
            
            // Помечаем клон корневой задачи как выполненный и скрытый
            if (newById[newRootId]) {
              newById[newRootId] = {
                ...newById[newRootId],
                done: true,
                completedAt: Date.now(),
                isHidden: true,
                repeatType: 'none'
              };
            }
            
            // Также продвигаем даты потомков шаблона (используя idMapping для O(1) доступа)
            if (deltaMs > 0) {
              Object.keys(idMapping).forEach(childId => {
                if (childId === id) return;
                const child = newById[childId];
                if (child) {
                  const cDate = child.date
                    ? (() => { const d = new Date(child.date); d.setTime(d.getTime() + deltaMs); return d.toISOString().split('T')[0]; })()
                    : child.date;
                  const cDeadline = child.deadline
                    ? (() => { const d = new Date(child.deadline); d.setTime(d.getTime() + deltaMs); return d.toISOString().split('T')[0]; })()
                    : child.deadline;
                  newById[childId] = { ...child, done: false, date: cDate, deadline: cDeadline, completedAt: null };
                }
              });
            }

            // 3. Регистрируем новый инстанс (клон)
            let newRootIds = [...s.rootIds];
            if (task.parentId && newById[task.parentId]) {
              newById[task.parentId] = {
                ...newById[task.parentId],
                childrenIds: [...(newById[task.parentId].childrenIds || []), newRootId]
              };
            } else {
              newRootIds = [...newRootIds, newRootId];
            }

            return { byId: newById, rootIds: newRootIds, activityLogs: [...s.activityLogs, newLog], graphVersion: s.graphVersion + 1 };
          });
          return;
        }


        // ── Обычное завершение: soft-скрытие + undo-окно 3 сек ────────
        set((s) => ({
          byId: { ...s.byId, [id]: { ...task, done: true, completedAt: Date.now(), isHidden: true } }
        }));

        set(s => ({
          pendingActions: {
            ...s.pendingActions,
            [id]: { type: 'complete', taskSnapshot: task, startedAt: Date.now() }
          }
        }));

        const timerId = setTimeout(() => {
          get()._commitPending(id);
        }, 3000);
        actionTimers.set(id, timerId);
      },

      completePermanently: (id) => {
        const state = get();
        const task = state.byId[id];
        if (!task) return;

        const updatedTask = { ...task, repeatType: 'none' };

        set((s) => ({
          byId: { ...s.byId, [id]: { ...updatedTask, done: true, completedAt: Date.now(), isHidden: true } }
        }));

        set(s => ({
          pendingActions: {
            ...s.pendingActions,
            [id]: { type: 'complete', taskSnapshot: task, startedAt: Date.now() }
          }
        }));

        const timerId = setTimeout(() => {
          get()._commitPending(id);
        }, 3000);
        actionTimers.set(id, timerId);
      },

      handleRepeatNext: (id) => set((state) => {
        const task = state.byId[id];
        if (!task || task.repeatType === 'none') return state;

        const nextDate = calculateNextDate(task.date, task.repeatType, task.repeatDays, task.repeatMonthDay);
        let deltaMs = 0;
        if (task.date && nextDate) {
          deltaMs = new Date(nextDate).getTime() - new Date(task.date).getTime();
        }
        
        let newById = { ...state.byId, [id]: { ...task, date: nextDate, done: false, completedAt: null } };
        
        const descendantIds = getDescendantIds(id, state.byId);
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
          activityLogs: [...state.activityLogs, { id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 }],
          graphVersion: state.graphVersion + 1
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

      updateMultipleTasks: (ids, payload) => {
        const state = get();

        // ── Cycle detection (must run before any mutation) ─────────────────
        if (payload.parentId !== undefined) {
          for (const id of ids) {
            if (wouldCreateCycle(id, payload.parentId, state.byId)) {
              // Reject the entire transaction — return a special signal
              return { _lastBulkError: 'cycle' };
            }
          }
        }

        // ── Optimistic synchronous mutation ────────────────────────────────
        set((s) => {
          let newById = { ...s.byId };
          let newRootIds = [...s.rootIds];
          const newLogs = [...s.activityLogs];
          let versionDelta = 0;

          for (const id of ids) {
            const task = newById[id];
            if (!task) continue;

            // Log reschedules
            if (payload.date !== undefined && payload.date !== task.date) {
              newLogs.push({ id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 });
            }

            // Handle parentId graph edge rewiring
            if (payload.parentId !== undefined && payload.parentId !== task.parentId) {
              const moveRes = moveNode(newById, newRootIds, id, payload.parentId);
              newById = moveRes.newById;
              newRootIds = moveRes.newRootIds;
              versionDelta = 1;
            }

            newById[id] = { ...newById[id], ...payload };
          }

          return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, ui: { ...s.ui, selectedTaskIds: [] }, graphVersion: s.graphVersion + versionDelta };
        });
      },

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
      }),
      addTag: (name) => set((state) => ({ tags: [...(state.tags || []), name] })),
      deleteTag: (name) => set((state) => {
        const newById = { ...state.byId };
        Object.values(newById).forEach(t => {
          if (t.tags && t.tags.includes(name)) {
            newById[t.id] = { ...t, tags: t.tags.filter(tag => tag !== name) };
          }
        });
        return { tags: (state.tags || []).filter(t => t !== name), byId: newById };
      }),
      updateTag: (oldName, newName) => set((state) => {
        const newById = { ...state.byId };
        Object.values(newById).forEach(t => {
          if (t.tags && t.tags.includes(oldName)) {
            newById[t.id] = { ...t, tags: t.tags.map(tag => tag === oldName ? newName : tag) };
          }
        });
        return { tags: (state.tags || []).map(t => t === oldName ? newName : t), byId: newById };
      }),

      /**
       * Восстановить данные из резервной копии.
       * @param {{ byId: object, rootIds: string[], activityLogs: any[] }} backup
       */
      restoreBackup: ({ byId, rootIds, activityLogs }) => {
        const { pendingActions } = get();

        set((state) => ({
          byId,
          rootIds,
          activityLogs: activityLogs || [],
          pendingActions: {},
          graphVersion: state.graphVersion + 1,
          ui: {
            ...state.ui,
            editingNodeId: null,
            showSettings: false,
            selectedTaskIds: [],
          },
        }));
      },
    }),
    { 
      name: 'focus-app-v4', 
      storage: idbStorage,
      onRehydrateStorage: () => {
        return async (state, error) => {
          if (error) {
            console.error('Store hydration error:', error);
          }
          if (state) {
            const idsToRemove = Object.keys(state.byId).filter(id => state.byId[id].isHidden);
            if (idsToRemove.length > 0) {
              let newById = { ...state.byId };
              let newRootIds = [...state.rootIds];
              idsToRemove.forEach(id => {
                const res = removeNode(newById, newRootIds, id);
                newById = res.newById;
                newRootIds = res.newRootIds;
              });
              useStore.setState({ byId: newById, rootIds: newRootIds, graphVersion: state.graphVersion + 1 });
            }

            try {
              await state.checkAndMigrateApiKey();
            } catch (err) {
              console.error('Error loading API key:', err);
            }
            state.setHasHydrated(true);
          } else {
            useStore.setState({ _hasHydrated: true });
          }
        };
      },
      // Явно исключаем hasApiKey и undo-состояние из персистентности.
      partialize: (state) => {
        // eslint-disable-next-line no-unused-vars
        const { _hasHydrated, setHasHydrated, hasApiKey, checkAndMigrateApiKey, setApiKey, pendingActions, _commitPending, undoAction, ...rest } = state;
        return rest;
      },
      // Декларативная миграция данных
      version: 1,
      migrate: (persistedState, version) => {
        if (!persistedState || !persistedState.byId) return persistedState;

        const { byId, ...rest } = persistedState;
        
        const cleanedById = Object.entries(byId).reduce((acc, [id, task]) => {
          const { isHidden, ...taskData } = task; // eslint-disable-line no-unused-vars
          acc[id] = { ...taskData, isHidden: false, tags: taskData.tags || [] };
          return acc;
        }, {});

        return { ...rest, tags: rest.tags || ['#дома', '#выезд'], byId: cleanedById };
      },
      merge: (persistedState, currentState) => {
        const state = currentState || {};
        const stateUi = state.ui || {
          activeTab: 'daily',
          selectedDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
          sortMode: 'none',
          viewMode: 'list',
          expandedNodes: [],
          editingNodeId: null,
          showSettings: false,
          showOverdue: false,
          baseViewMode: 'active',
          baseFilterDate: '',
          baseFilterDeadline: '',
          selectedTaskIds: [],
          isRecording: false
        };
        const persisted = persistedState || {};
        return {
          ...state,
          ...persisted,
          // hasApiKey и pendingActions никогда не берём из persistedState
          hasApiKey: false,
          pendingActions: {},
          ui: {
            ...stateUi,
            ...(persisted.ui || {}),
            // Защита от зависания состояния сессии
            selectedDate: stateUi.selectedDate,
            activeTab: 'daily',
            editingNodeId: null,
            showSettings: false,
            showOverdue: false,
            expandedNodes: [],
            selectedTaskIds: [],
            isRecording: false
          }
        };
      }
    }
  )
);

// ── App Lifecycle (Zombie Tasks Cleanup) ──────────────────────────────────
App.addListener('appStateChange', ({ isActive }) => {
  if (!isActive) {
    const state = useStore.getState();
    const pendingIds = Object.keys(state.pendingActions);
    if (pendingIds.length > 0) {
      pendingIds.forEach(id => state._commitPending(id));
    }
  }
});