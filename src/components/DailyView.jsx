// src/components/DailyView.jsx
import React, { memo } from 'react';
import { Clock, Target, Hash } from 'lucide-react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useStore } from '../store/useStore.js';
import { useDailyIds } from '../store/selectors.js';
import { PRIORITIES, TIME_BLOCKS } from '../utils/constants.js';
import { TaskItem } from './TaskItem.jsx';

export const DailyView = memo(() => {
  const dailyIds = useDailyIds();
  const sortMode = useStore(state => state.ui.sortMode);
  const byId = useStore(state => state.byId);
  const tags = useStore(state => state.tags || []);

  // useAutoAnimate on the outermost list container
  const [listRef] = useAutoAnimate();

  if (sortMode === 'time') {
    return (
      <div ref={listRef}>
        {TIME_BLOCKS.map(block => {
          const bIds = dailyIds.filter(id => block.check(byId[id]?.time));
          if (!bIds.length) return null;
          return (
            <div key={block.id} className="mb-6">
              <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {block.label}
              </h3>
              {bIds.map(id => <TaskItem key={id} id={id} />)}
            </div>
          );
        })}
      </div>
    );
  }

  if (sortMode === 'priority') {
    return (
      <div ref={listRef}>
        {Object.entries(PRIORITIES).map(([pKey, pVal]) => {
          const pIds = dailyIds.filter(id => byId[id]?.priority === pKey);
          if (!pIds.length) return null;
          return (
            <div key={pKey} className="mb-6">
              <h3 className={`text-[10px] font-black uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1 ${pVal.color}`}>
                <Target className="w-3 h-3" /> {pVal.label}
              </h3>
              {pIds.map(id => <TaskItem key={id} id={id} />)}
            </div>
          );
        })}
      </div>
    );
  }

  if (sortMode === 'tags') {
    return (
      <div ref={listRef}>
        {tags.map(tag => {
          const tIds = dailyIds.filter(id => byId[id]?.tags?.includes(tag));
          if (!tIds.length) return null;
          return (
            <div key={tag} className="mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1 text-amber-500">
                <Hash className="w-3 h-3" /> {tag}
              </h3>
              {tIds.map(id => <TaskItem key={`${tag}-${id}`} id={id} />)}
            </div>
          );
        })}
        {(() => {
          const noTagIds = dailyIds.filter(id => !byId[id]?.tags?.length);
          if (!noTagIds.length) return null;
          return (
            <div key="no-tags" className="mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1 text-stone-500">
                <Hash className="w-3 h-3" /> Без тегов
              </h3>
              {noTagIds.map(id => <TaskItem key={`notag-${id}`} id={id} />)}
            </div>
          );
        })()}
      </div>
    );
  }

  return (
    <div ref={listRef}>
      {dailyIds.map(id => <TaskItem key={id} id={id} />)}
    </div>
  );
});

DailyView.displayName = 'DailyView';
