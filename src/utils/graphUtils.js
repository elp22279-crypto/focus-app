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
