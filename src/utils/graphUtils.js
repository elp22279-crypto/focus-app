// src/utils/graphUtils.js
/**
 * Утилиты для работы с графом задач. Все алгоритмы — итеративные (BFS/DFS),
 * без рекурсии, чтобы исключить переполнение стека при глубокой вложенности.
 */

/**
 * Итеративный BFS для сбора всех ID потомков задачи.
 * Сложность: O(N) по числу потомков, O(1) по глубине стека.
 *
 * @param {string}  rootId  — ID корневой задачи
 * @param {Object}  byId    — плоский словарь { [id]: task }
 * @returns {string[]}       — массив ID потомков (не включает rootId)
 */
export const getDescendantIds = (rootId, byId) => {
  const result = [];
  const queue  = [rootId]; // стек/очередь; используем как стек (DFS) для лучшей локальности

  while (queue.length > 0) {
    const current = queue.pop();
    const task = byId[current];
    if (!task?.childrenIds?.length) continue;

    for (const childId of task.childrenIds) {
      result.push(childId);
      queue.push(childId);
    }
  }

  return result;
};

/**
 * Строит плоский индекс нагрузки для набора задач.
 * Итеративный DFS-постпорядок (leaf → root), чтобы каждый узел
 * суммировал уже посчитанных детей.
 *
 * @param {string[]} rootIds  — ID корневых узлов (видимых в конкретном виде)
 * @param {Object}   byId     — плоский словарь задач
 * @param {boolean}  includeDone — включать ли завершённые задачи
 * @returns {Map<string, number>}  — { taskId → суммарная нагрузка ветки }
 */
export const buildBranchLoadMap = (rootIds, byId, includeDone = false) => {
  const loadMap = new Map();

  for (const rootId of rootIds) {
    // Итеративный DFS с постпорядком через two-stack trick
    const order = [];
    const stack = [rootId];

    while (stack.length > 0) {
      const id = stack.pop();
      order.push(id);
      const task = byId[id];
      if (task?.childrenIds?.length) {
        for (const childId of task.childrenIds) {
          stack.push(childId);
        }
      }
    }

    // Идём в обратном порядке (листья первыми)
    for (let i = order.length - 1; i >= 0; i--) {
      const id   = order[i];
      const task = byId[id];
      if (!task || (!includeDone && task.done)) { loadMap.set(id, 0); continue; }

      const selfLoad = task.estimate || 0;
      const childrenLoad = task.childrenIds?.reduce(
        (acc, cId) => acc + (loadMap.get(cId) ?? 0), 0
      ) ?? 0;

      loadMap.set(id, selfLoad + childrenLoad);
    }
  }

  return loadMap;
};

/**
 * Итеративный расчёт прогресса (total/completed) для одного узла.
 * Заменяет рекурсивный calcChildren в selectors.js.
 *
 * @param {string} rootId
 * @param {Object} byId
 * @returns {{ total: number, completed: number, isParent: boolean }}
 */
export const calcNodeProgress = (rootId, byId) => {
  const task = byId[rootId];
  if (!task) return { total: 0, completed: 0, isParent: false };

  if (!task.childrenIds?.length) {
    const t = task.estimate || 0;
    return { total: t, completed: task.done ? t : 0, isParent: false };
  }

  let total = task.estimate || 0;
  let completed = 0;

  // Iterative DFS
  const stack = [...task.childrenIds];
  while (stack.length > 0) {
    const id = stack.pop();
    const t  = byId[id];
    if (!t) continue;

    total    += t.estimate || 0;
    completed += t.done ? (t.estimate || 0) : 0;

    if (t.childrenIds?.length) {
      for (const cId of t.childrenIds) stack.push(cId);
    }
  }

  if (task.done) completed = total;

  return { total, completed, isParent: true };
};

/**
 * Возвращает полный путь к задаче от корня.
 * @param {string} taskId
 * @param {Object} byId
 * @returns {string[]} массив названий задач от корневой до родительской
 */
export const getTaskPath = (taskId, byId) => {
  const path = [];
  let currentId = taskId;
  while (currentId) {
    const t = byId[currentId];
    if (!t) break;
    // Вставляем в начало, чтобы путь был от корня к листу
    path.unshift(t.title);
    currentId = t.parentId;
  }
  return path;
};

/**
 * Pure function: Insert a new node into the graph.
 * @returns {{ newById: Object, newRootIds: string[] }}
 */
export const insertNode = (byId, rootIds, task) => {
  const newById = { ...byId, [task.id]: task };
  let newRootIds = [...rootIds];

  if (task.parentId && newById[task.parentId]) {
    newById[task.parentId] = {
      ...newById[task.parentId],
      childrenIds: [...(newById[task.parentId].childrenIds || []), task.id]
    };
  } else {
    newRootIds = [...newRootIds, task.id];
  }

  return { newById, newRootIds };
};

/**
 * Pure function: Remove a node from the graph.
 * @returns {{ newById: Object, newRootIds: string[] }}
 */
export const removeNode = (byId, rootIds, taskId) => {
  const task = byId[taskId];
  if (!task) return { newById: byId, newRootIds: rootIds };

  const idsToDelete = [taskId, ...getDescendantIds(taskId, byId)];
  const newById = { ...byId };
  
  idsToDelete.forEach(id => delete newById[id]);
  
  const newRootIds = rootIds.filter(rId => !idsToDelete.includes(rId));
  
  if (task.parentId && newById[task.parentId]) {
    newById[task.parentId] = {
      ...newById[task.parentId],
      childrenIds: (newById[task.parentId].childrenIds || []).filter(cId => cId !== taskId)
    };
  }
  
  return { newById, newRootIds };
};

/**
 * Pure function: Move a node to a new parent in the graph.
 * @returns {{ newById: Object, newRootIds: string[] }}
 */
export const moveNode = (byId, rootIds, taskId, newParentId) => {
  const task = byId[taskId];
  if (!task || task.parentId === newParentId) return { newById: byId, newRootIds: rootIds };

  const newById = { ...byId };
  let newRootIds = [...rootIds];

  // Remove from old parent
  if (task.parentId && newById[task.parentId]) {
    newById[task.parentId] = {
      ...newById[task.parentId],
      childrenIds: (newById[task.parentId].childrenIds || []).filter(cId => cId !== taskId)
    };
  } else {
    newRootIds = newRootIds.filter(rId => rId !== taskId);
  }

  // Add to new parent
  if (newParentId && newById[newParentId]) {
    newById[newParentId] = {
      ...newById[newParentId],
      childrenIds: [...(newById[newParentId].childrenIds || []), taskId]
    };
  } else {
    newRootIds = [...newRootIds, taskId];
  }
  
  newById[taskId] = { ...task, parentId: newParentId };

  return { newById, newRootIds };
};

/**
 * Pure function: Clone a subgraph (deep copy) with newly generated IDs.
 * @returns {{ newById: Object, newRootIds: string[], newRootCloneId: string }}
 */
export const cloneSubgraph = (byId, targetId, generateId) => {
  const task = byId[targetId];
  if (!task) return { clonedById: {}, newRootId: null, idMapping: {} };

  const descendants = getDescendantIds(targetId, byId);
  const allIds = [targetId, ...descendants];
  
  const idMapping = {};
  allIds.forEach(id => idMapping[id] = generateId());
  
  const newRootId = idMapping[targetId];
  const clonedById = {};
  
  allIds.forEach(oldId => {
    const original = byId[oldId];
    const newId = idMapping[oldId];
    
    const clonedTask = {
      ...original,
      id: newId,
      done: false,
      completedAt: null,
      isHidden: false,
      createdAt: Date.now()
    };
    
    if (oldId === targetId) {
      clonedTask.parentId = original.parentId;
    } else {
      clonedTask.parentId = original.parentId && idMapping[original.parentId] ? idMapping[original.parentId] : original.parentId;
    }
    
    clonedTask.childrenIds = (original.childrenIds || []).map(cId => idMapping[cId] || cId);
    
    clonedById[newId] = clonedTask;
  });
  
  return { clonedById, newRootId, idMapping };
};

