// src/components/BacklogView.jsx
/**
 * Архитектурное решение для виртуализации:
 * Дерево задач нельзя виртуализировать напрямую (рекурсивные компоненты).
 * buildFlatNodes() разворачивает дерево в плоский массив [{ id, depth }]
 * с учётом уровня вложенности и состояния expandedNodes.
 * Только этот массив передаётся в <Virtuoso> через проп data.
 *
 * ВАЖНО: useAutoAnimate НЕ применяется на контейнере Virtuoso —
 * это вызывает конфликт рендеринга. auto-animate только на статических списках.
 */
import React, { memo, useMemo } from 'react';
import { Hash, CheckCircle2, Inbox } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useStore } from '../store/useStore.js';
import { useBacklogIds } from '../store/selectors.js';
import { useShallow } from 'zustand/react/shallow';
import { TaskItem } from './TaskItem.jsx';

/**
 * Итеративный DFS: строит плоский массив видимых узлов для виртуализации.
 * @param {string[]} rootIds
 * @param {Object}   byId
 * @param {Set<string>} expandedSet
 * @returns {{ id: string, depth: number }[]}
 */
const buildFlatNodes = (rootIds, byId, expandedSet) => {
  const result = [];
  const stack = rootIds.map(id => ({ id, depth: 0 })).reverse();

  while (stack.length > 0) {
    const { id, depth } = stack.pop();
    const task = byId[id];
    if (!task || task.isHidden || task.done) continue;

    result.push({ id, depth });

    if (expandedSet.has(id) && task.childrenIds?.length > 0) {
      const children = task.childrenIds
        .filter(cId => byId[cId] && !byId[cId].isHidden && !byId[cId].done)
        .map(cId => ({ id: cId, depth: depth + 1 }))
        .reverse();
      stack.push(...children);
    }
  }

  return result;
};

/**
 * Строка виртуализированного списка.
 * depth используется ТОЛЬКО для padding-left — никакого рекурсивного рендера childrenIds.
 */
const FlatRow = memo(({ id, depth }) => {
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      {/* flatMode=true блокирует рендер SubtaskList внутри TaskItem */}
      <TaskItem id={id} level={depth} flatMode={true} forceExpanded={false} />
    </div>
  );
});
FlatRow.displayName = 'FlatRow';

export const BacklogView = memo(() => {
  const viewIds        = useBacklogIds();
  const baseViewMode   = useStore(state => state.ui.baseViewMode);
  const categories     = useStore(useShallow(state => state.categories));
  const byId           = useStore(state => state.byId);
  const expandedNodes  = useStore(useShallow(state => state.ui.expandedNodes));
  const baseFilterDate     = useStore(state => state.ui.baseFilterDate);
  const baseFilterDeadline = useStore(state => state.ui.baseFilterDeadline);

  // useAutoAnimate только на статических невиртуализированных списках
  const [completedRef]   = useAutoAnimate();
  const [unallocatedRef] = useAutoAnimate();
  const [searchRef]      = useAutoAnimate();

  const expandedSet = useMemo(() => new Set(expandedNodes), [expandedNodes]);

  // Плоский массив для Virtuoso (только в режиме active без фильтров)
  const flatNodes = useMemo(() => {
    if (baseViewMode !== 'active' || baseFilterDate || baseFilterDeadline) return [];
    return buildFlatNodes(viewIds, byId, expandedSet);
  }, [viewIds, byId, expandedSet, baseViewMode, baseFilterDate, baseFilterDeadline]);

  // ── Completed view (статический список + auto-animate) ───────────────────
  if (baseViewMode === 'completed') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-emerald-500 uppercase px-2 mb-4">
          <CheckCircle2 className="inline w-4 h-4 mr-1" /> Выполненные ({viewIds.length})
        </div>
        <div ref={completedRef}>
          {viewIds.map(id => <TaskItem key={id} id={id} flatMode forceExpanded={false} />)}
        </div>
      </div>
    );
  }

  // ── Unallocated view (статический список + auto-animate) ─────────────────
  if (baseViewMode === 'unallocated') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-blue-500 uppercase px-2 mb-4">
          <Inbox className="inline w-4 h-4 mr-1" /> Без дат ({viewIds.length})
        </div>
        <div ref={unallocatedRef}>
          {viewIds.map(id => <TaskItem key={id} id={id} />)}
        </div>
      </div>
    );
  }

  // ── Filter/search view (статический список + auto-animate) ───────────────
  if (baseFilterDate || baseFilterDeadline) {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-amber-500 uppercase px-2 mb-4">
          Результаты поиска ({viewIds.length})
        </div>
        <div ref={searchRef}>
          {viewIds.map(id => <TaskItem key={id} id={id} flatMode />)}
        </div>
      </div>
    );
  }

  // ── Active backlog: виртуализированный плоский список ────────────────────
  // useAutoAnimate здесь НЕ используется — конфликт с Virtuoso
  if (flatNodes.length === 0) {
    return (
      <div className="mt-4 py-12 text-center text-stone-600 text-sm">
        Нет задач
      </div>
    );
  }

  return (
    <div className="mt-4" style={{ height: 'calc(100vh - 200px)' }}>
      <Virtuoso
        style={{ height: '100%' }}
        data={flatNodes}
        itemContent={(index, { id, depth }) => (
          <FlatRow key={id} id={id} depth={depth} />
        )}
        overscan={200}
      />
    </div>
  );
});

BacklogView.displayName = 'BacklogView';
