// src/components/BacklogView.jsx
import React, { memo } from 'react';
import { Hash, CheckCircle2, Inbox } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useBacklogIds } from '../store/selectors.js';
import { useShallow } from 'zustand/react/shallow';
import { TaskItem } from './TaskItem.jsx';

export const BacklogView = memo(() => {
  const viewIds      = useBacklogIds();
  const baseViewMode = useStore(state => state.ui.baseViewMode);
  const categories   = useStore(useShallow(state => state.categories));
  const byId         = useStore(state => state.byId);
  const baseFilterDate     = useStore(state => state.ui.baseFilterDate);
  const baseFilterDeadline = useStore(state => state.ui.baseFilterDeadline);

  if (baseViewMode === 'completed') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-emerald-500 uppercase px-2 mb-4">
          <CheckCircle2 className="inline w-4 h-4 mr-1" /> Выполненные ({viewIds.length})
        </div>
        {viewIds.map(id => <TaskItem key={id} id={id} flatMode forceExpanded={false} />)}
      </div>
    );
  }

  if (baseViewMode === 'unallocated') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-blue-500 uppercase px-2 mb-4">
          <Inbox className="inline w-4 h-4 mr-1" /> Без дат ({viewIds.length})
        </div>
        {viewIds.map(id => <TaskItem key={id} id={id} />)}
      </div>
    );
  }

  if (baseFilterDate || baseFilterDeadline) {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-amber-500 uppercase px-2 mb-4">
          Результаты поиска ({viewIds.length})
        </div>
        {viewIds.map(id => <TaskItem key={id} id={id} flatMode />)}
      </div>
    );
  }

  const uncategorizedIds = viewIds.filter(id => !byId[id]?.category);

  return (
    <div className="space-y-6 mt-4">
      {uncategorizedIds.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1">
            <Hash className="inline w-3 h-3 text-stone-600 mr-1" /> Общее
          </h3>
          {uncategorizedIds.map(id => <TaskItem key={id} id={id} />)}
        </div>
      )}
      {categories.map(cat => {
        const catIds = viewIds.filter(id => byId[id]?.category === cat);
        if (!catIds.length) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1">
              <Hash className="inline w-3 h-3 text-amber-600 mr-1" /> {cat}
            </h3>
            {catIds.map(id => <TaskItem key={id} id={id} />)}
          </div>
        );
      })}
    </div>
  );
});

BacklogView.displayName = 'BacklogView';
