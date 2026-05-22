import React, { memo, useMemo } from 'react';
import { Hash, CheckCircle2, Inbox } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useStore } from '../store/useStore.js';
import { useBacklogIds } from '../store/selectors.js';
import { useShallow } from 'zustand/react/shallow';
import { TaskItem } from './TaskItem.jsx';

const buildFlatBranch = (rootIds, byId, expandedSet) => {
  const result = [];
  const stack = [...rootIds].reverse().map(id => ({ type: 'task', id, depth: 0 }));

  while (stack.length > 0) {
    const node = stack.pop();
    const task = byId[node.id];
    if (!task || task.isHidden || task.done) continue;

    result.push(node);

    if (expandedSet.has(node.id) && task.childrenIds?.length > 0) {
      const children = task.childrenIds
        .filter(cId => byId[cId] && !byId[cId].isHidden && !byId[cId].done)
        .map(cId => ({ type: 'task', id: cId, depth: node.depth + 1 }))
        .reverse();
      stack.push(...children);
    }
  }
  return result;
};

const CategoryHeader = memo(({ title }) => (
  <div className="flex items-center gap-2 px-3 pt-6 pb-2 mb-2 border-b border-stone-800/60">
    <Hash className="w-3.5 h-3.5 text-stone-500" />
    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">
      {title}
    </span>
  </div>
));
CategoryHeader.displayName = 'CategoryHeader';

const FlatRow = memo(({ id, depth }) => {
  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
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

  const [completedRef]   = useAutoAnimate();
  const [unallocatedRef] = useAutoAnimate();
  const [searchRef]      = useAutoAnimate();

  const expandedSet = useMemo(() => new Set(expandedNodes), [expandedNodes]);

  const flatNodes = useMemo(() => {
    if (baseViewMode !== 'active' || baseFilterDate || baseFilterDeadline) return [];

    const rootsByCategory = { 'Общее': [] };
    categories.forEach(cat => { rootsByCategory[cat] = []; });

    viewIds.forEach(id => {
      const task = byId[id];
      if (!task || task.isHidden || task.done) return;
      const cat = task.category && categories.includes(task.category) ? task.category : 'Общее';
      rootsByCategory[cat].push(id);
    });

    const result = [];
    [...categories, 'Общее'].forEach(catName => {
      const roots = rootsByCategory[catName];
      if (roots.length > 0) {
        result.push({ type: 'header', id: `header-${catName}`, title: catName });
        result.push(...buildFlatBranch(roots, byId, expandedSet));
      }
    });

    return result;
  }, [viewIds, byId, expandedSet, baseViewMode, baseFilterDate, baseFilterDeadline, categories]);

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
        itemContent={(index, node) => {
          if (node.type === 'header') {
            return <CategoryHeader title={node.title} />;
          }
          return <FlatRow key={node.id} id={node.id} depth={node.depth} />;
        }}
        overscan={200}
      />
    </div>
  );
});

BacklogView.displayName = 'BacklogView';
