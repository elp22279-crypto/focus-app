// src/store/useStore.js
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId, calculatePoints, calculateNextDate } from '../utils/helpers.js';
import { Preferences } from '@capacitor/preferences';
import { getDescendantIds } from '../utils/graphUtils.js';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

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
// Deep-clone a task subtree with fresh IDs.
// Iterative BFS — no recursion, no stack overflow on deep trees.
//
// @param {string}  rootId         — ID of the root task to clone
// @param {Object}  byId           — current flat task dictionary
// @param {string}  overrideDate   — if provided, set all cloned nodes to this date
// @param {number}  deltaMs        — if non-zero, shift dates by this delta instead
// @returns {{ clonedById: Object, newRootId: string }}
// ---------------------------------------------------------------------------
const cloneTaskSubtree = (rootId, byId, overrideDate, deltaMs = 0) => {
  const clonedById = {};
  const idMap = {}; // oldId → newId

  // BFS to collect all nodes in the subtree
  const queue = [rootId];
  const visited = [];
  while (queue.length > 0) {
    const curId = queue.shift();
    if (visited.includes(curId)) continue;
    visited.push(curId);
    idMap[curId] = generateId();
    const task = byId[curId];
    if (task?.childrenIds?.length) {
      for (const cId of task.childrenIds) queue.push(cId);
    }
  }

  // Build cloned nodes
  for (const oldId of visited) {
    const original = byId[oldId];
    if (!original) continue;
    const newId = idMap[oldId];

    // Date shifting logic
    let newDate = original.date;
    let newDeadline = original.deadline;
    if (overrideDate !== undefined && oldId === rootId) {
      newDate = overrideDate;
    } else if (deltaMs > 0) {
      if (original.date) {
        const d = new Date(original.date);
        d.setTime(d.getTime() + deltaMs);
        newDate = d.toISOString().split('T')[0];
      }
      if (original.deadline) {
        const d = new Date(original.deadline);
        d.setTime(d.getTime() + deltaMs);
        newDeadline = d.toISOString().split('T')[0];
      }
    }

    clonedById[newId] = {
      ...original,
      id: newId,
      done: false,
      completedAt: null,
      isHidden: false,
      date: newDate,
      deadline: newDeadline,
      parentId: original.parentId && idMap[original.parentId]
        ? idMap[original.parentId]
        : (oldId === rootId ? original.parentId : original.parentId), // root keeps original parentId
      childrenIds: (original.childrenIds || []).map(cId => idMap[cId] || cId),
    };
  }

  // Fix root's parentId — it stays as the original parent (not remapped)
  const newRootId = idMap[rootId];
  const originalRoot = byId[rootId];
  if (clonedById[newRootId]) {
    clonedById[newRootId].parentId = originalRoot.parentId ?? null;
  }

  return { clonedById, newRootId };
};



// ---------------------------------------------------------------------------
// Secure key storage helpers (Keychain / Keystore via @capacitor/preferences)
// Falls back to sessionStorage on the web so dev server works out-of-the-box.
// ---------------------------------------------------------------------------
const SECURE_KEY_NAME = 'focus_app_api_key';

const secureRead = async () => {
  try {
    const { value } = await Preferences.get({ key: SECURE_KEY_NAME });
    return value ?? null;
  } catch {
    return sessionStorage.getItem(SECURE_KEY_NAME);
  }
};

const secureWrite = async (value) => {
  try {
    if (value) {
      await Preferences.set({ key: SECURE_KEY_NAME, value });
    } else {
      await Preferences.remove({ key: SECURE_KEY_NAME });
    }
  } catch {
    if (value) sessionStorage.setItem(SECURE_KEY_NAME, value);
    else sessionStorage.removeItem(SECURE_KEY_NAME);
  }
};

// ── Optimistic UI: last committed IDB snapshot for rollback ──────────────────
let _lastPersistedSnapshot = null;

const idbStorage = createJSONStorage(() => ({
  getItem: async (name) => {
    return (await idbGet(name)) || null;
  },
  setItem: async (name, value) => {
    // Snapshot the previous persisted value for rollback
    const previousSnapshot = _lastPersistedSnapshot;
    _lastPersistedSnapshot = value;
    try {
      await idbSet(name, value);
    } catch (err) {
      console.error('[focus-app] IDB persist failed — rolling back state', err);
      // Rollback: restore previous state from snapshot
      if (previousSnapshot) {
        try {
          const parsed = JSON.parse(previousSnapshot);
          if (parsed?.state) {
            // Restore core data slices only (avoid resetting UI/ephemeral)
            useStore.setState({
              byId: parsed.state.byId ?? {},
              rootIds: parsed.state.rootIds ?? [],
              activityLogs: parsed.state.activityLogs ?? [],
            });
          }
        } catch (parseErr) {
          console.error('[focus-app] Rollback parse failed', parseErr);
        }
      }
      // Signal the UI via a custom event (UndoSnackbar listens via pendingActions)
      window.dispatchEvent(new CustomEvent('focus-app:persist-error', { detail: { err } }));
    }
  },
  removeItem: async (name) => {
    await idbDel(name);
  },
}));


export const useStore = create(
  persist(
    (set, get) => ({
      byId: {},
      rootIds: [],
      categories: ['Работа', 'Личное', 'Учеба', 'Здоровье'],
      activityLogs: [],
      settings: { dailyLimit: 6, retentionMonths: 3, goals: { daily: 100, weekly: 500, monthly: 2000 } },

      aiAnalyticsCache: {},
      setAiAnalyticsCache: (period, data) => set(s => ({ 
        aiAnalyticsCache: { ...s.aiAnalyticsCache, [period]: { timestamp: Date.now(), data } } 
      })),

      _hasHydrated: false,
      setHasHydrated: (status) => set({ _hasHydrated: status }),

      // API-ключ хранится в памяти; персистентность — через secureWrite/secureRead,
      // НЕ через основной localStorage-бандл.
      apiKey: null,

      /** Сохранить API-ключ в защищённом хранилище и в памяти стора. */
      setApiKey: (key) => {
        const trimmed = key ? key.trim() : null;
        secureWrite(trimmed || null);
        set({ apiKey: trimmed || null });
      },

      /** Загрузить ключ из защищённого хранилища при старте приложения. */
      loadApiKey: async () => {
        const stored = await secureRead();
        if (stored) set({ apiKey: stored });
      },

      // ── Undo/Snackbar ──────────────────────────────────────────────────
      // Record<taskId, { type: 'delete'|'complete', taskSnapshot, timeoutId, startedAt }>
      // НЕ персистируется (timeoutId не сериализуем).
      pendingActions: {},

      /** @private — зафиксировать отложенное действие немедленно */
      _commitPending: (id) => {
        const action = get().pendingActions[id];
        if (!action) return;
        clearTimeout(action.timeoutId);

        if (action.type === 'delete') {
          const { taskSnapshot } = action;
          set((state) => {
            const idsToDelete = [taskSnapshot.id, ...getDescendantIds(taskSnapshot.id, state.byId)];
            const newById = { ...state.byId };
            idsToDelete.forEach(delId => delete newById[delId]);
            const newRootIds = state.rootIds.filter(rId => !idsToDelete.includes(rId));
            if (taskSnapshot.parentId && newById[taskSnapshot.parentId]) {
              newById[taskSnapshot.parentId] = {
                ...newById[taskSnapshot.parentId],
                childrenIds: newById[taskSnapshot.parentId].childrenIds.filter(cId => cId !== taskSnapshot.id)
              };
            }
            const newLogs = [...state.activityLogs, { id: generateId(), type: 'deleted', taskId: taskSnapshot.id, timestamp: Date.now(), points: 0 }];
            const newPending = { ...state.pendingActions };
            delete newPending[id];
            return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, pendingActions: newPending };
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
        clearTimeout(action.timeoutId);
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
          description: payload.description || '', status: payload.status || 'active', date: payload.date || null, deadline: payload.deadline || null,
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

        // Запланировать реальное удаление через 3 сек
        const timeoutId = setTimeout(() => get()._commitPending(id), 3000);
        set(s => ({
          pendingActions: {
            ...s.pendingActions,
            [id]: { type: 'delete', taskSnapshot: task, timeoutId, startedAt: Date.now() }
          }
        }));
      },

      duplicateTask: (id) => set((state) => {
        const original = state.byId[id];
        if (!original) return state;

        const newById = { ...state.byId };
        let newRootIds = [...state.rootIds];
        const newLogs = [...state.activityLogs];

        const descendants = getDescendantIds(id, state.byId);
        const allOriginalIds = [id, ...descendants];

        const idMap = {};
        allOriginalIds.forEach(oldId => { idMap[oldId] = generateId(); });

        const newRootCloneId = idMap[id];

        allOriginalIds.forEach(oldId => {
          const oldTask = state.byId[oldId];
          const newId = idMap[oldId];
          
          const clonedTask = {
            ...oldTask,
            id: newId,
            done: false,
            isHidden: false,
            completedAt: null,
            createdAt: Date.now()
          };

          if (oldId === id) {
            clonedTask.parentId = oldTask.parentId;
          } else {
            if (oldTask.parentId && idMap[oldTask.parentId]) {
              clonedTask.parentId = idMap[oldTask.parentId];
            }
          }

          if (oldTask.childrenIds && oldTask.childrenIds.length > 0) {
            clonedTask.childrenIds = oldTask.childrenIds.map(cId => idMap[cId] || cId);
          } else {
            clonedTask.childrenIds = [];
          }

          newById[newId] = clonedTask;
        });

        if (original.parentId && newById[original.parentId]) {
          newById[original.parentId] = {
            ...newById[original.parentId],
            childrenIds: [...newById[original.parentId].childrenIds, newRootCloneId]
          };
        } else {
          newRootIds.push(newRootCloneId);
        }

        return { byId: newById, rootIds: newRootIds, activityLogs: newLogs };
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
            const { clonedById, newRootId } = cloneTaskSubtree(id, s.byId, task.date, 0);

            // 2. Продвигаем шаблон на следующую дату (не трогаем его подзадачи)
            const updatedTemplate = { ...task, done: false, date: nextDate, completedAt: null };
            // Также продвигаем даты потомков шаблона
            const newById = { ...s.byId, [id]: updatedTemplate, ...clonedById };
            if (deltaMs > 0) {
              getDescendantIds(id, s.byId).forEach(childId => {
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

            // 3. Регистрируем новый инстанс в rootIds (если шаблон — корневой)
            let newRootIds = [...s.rootIds];
            if (!task.parentId) {
              newRootIds.push(newRootId);
            } else if (newById[task.parentId]) {
              // Добавляем инстанс в childrenIds родителя
              newById[task.parentId] = {
                ...newById[task.parentId],
                childrenIds: [...(newById[task.parentId].childrenIds || []), newRootId],
              };
            }

            return { byId: newById, rootIds: newRootIds, activityLogs: [...s.activityLogs, newLog] };
          });
          return;
        }


        // ── Обычное завершение: soft-скрытие + undo-окно 3 сек ────────
        set((s) => ({
          byId: { ...s.byId, [id]: { ...task, done: true, completedAt: Date.now(), isHidden: true } }
        }));

        const timeoutId = setTimeout(() => get()._commitPending(id), 3000);
        set(s => ({
          pendingActions: {
            ...s.pendingActions,
            [id]: { type: 'complete', taskSnapshot: task, timeoutId, startedAt: Date.now() }
          }
        }));
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
          const newById = { ...s.byId };
          let newRootIds = [...s.rootIds];
          const newLogs = [...s.activityLogs];

          for (const id of ids) {
            const task = newById[id];
            if (!task) continue;

            // Log reschedules
            if (payload.date !== undefined && payload.date !== task.date) {
              newLogs.push({ id: generateId(), type: 'rescheduled', taskId: id, timestamp: Date.now(), points: 0 });
            }

            // Handle parentId graph edge rewiring
            if (payload.parentId !== undefined && payload.parentId !== task.parentId) {
              // Remove from old parent / rootIds
              if (task.parentId && newById[task.parentId]) {
                newById[task.parentId] = {
                  ...newById[task.parentId],
                  childrenIds: newById[task.parentId].childrenIds.filter(cId => cId !== id),
                };
              } else {
                newRootIds = newRootIds.filter(rId => rId !== id);
              }
              // Add to new parent / rootIds
              if (payload.parentId && newById[payload.parentId]) {
                newById[payload.parentId] = {
                  ...newById[payload.parentId],
                  childrenIds: [...newById[payload.parentId].childrenIds, id],
                };
              } else {
                newRootIds.push(id);
              }
            }

            newById[id] = { ...task, ...payload };
          }

          return { byId: newById, rootIds: newRootIds, activityLogs: newLogs, ui: { ...s.ui, selectedTaskIds: [] } };
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

      /**
       * Восстановить данные из резервной копии.
       * @param {{ byId: object, rootIds: string[], activityLogs: any[] }} backup
       */
      restoreBackup: ({ byId, rootIds, activityLogs }) => {
        const { pendingActions } = get();
        Object.values(pendingActions).forEach(action => clearTimeout(action.timeoutId));

        set((state) => ({
          byId,
          rootIds,
          activityLogs: activityLogs || [],
          pendingActions: {},
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
            try {
              await state.loadApiKey();
            } catch (err) {
              console.error('Error loading API key:', err);
            }
            state.setHasHydrated(true);
          } else {
            useStore.setState({ _hasHydrated: true });
          }
        };
      },
      // Явно исключаем apiKey и undo-состояние из персистентности.
      partialize: (state) => {
        // eslint-disable-next-line no-unused-vars
        const { _hasHydrated, setHasHydrated, apiKey, loadApiKey, setApiKey, pendingActions, _commitPending, undoAction, ...rest } = state;
        return rest;
      },
      merge: (persistedState, currentState) => {
        // Снять isHidden со всех задач при гидрации (защита от краша)
        const cleanById = {};
        const srcById = persistedState.byId || {};
        Object.keys(srcById).forEach(id => {
          const { isHidden, ...task } = srcById[id]; // eslint-disable-line no-unused-vars
          cleanById[id] = task;
        });
        return {
          ...currentState,
          ...persistedState,
          byId: cleanById,
          // apiKey и pendingActions никогда не берём из persistedState
          apiKey: null,
          pendingActions: {},
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