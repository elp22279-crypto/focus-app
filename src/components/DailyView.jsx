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
  const viewMode = useStore(state => state.ui.viewMode || 'list');
  const byId = useStore(state => state.byId);
  const tags = useStore(state => state.tags || []);

  // useAutoAnimate on the outermost list container
  const [listRef] = useAutoAnimate();

  if (viewMode === 'board') {
    let columns = [];
    if (sortMode === 'time') {
      columns = TIME_BLOCKS.map(block => {
        const bIds = dailyIds.filter(id => block.check(byId[id]?.time));
        return {
          id: block.id,
          label: block.label,
          icon: Clock,
          color: 'text-amber-600',
          taskIds: bIds
        };
      }).filter(col => col.taskIds.length > 0);
    } else if (sortMode === 'priority') {
      columns = Object.entries(PRIORITIES).map(([pKey, pVal]) => {
        const pIds = dailyIds.filter(id => byId[id]?.priority === pKey);
        return {
          id: pKey,
          label: pVal.label,
          icon: Target,
          color: pVal.color,
          taskIds: pIds
        };
      }).filter(col => col.taskIds.length > 0);
    } else if (sortMode === 'tags') {
      columns = tags.map(tag => {
        const tIds = dailyIds.filter(id => byId[id]?.tags?.includes(tag));
        return {
          id: tag,
          label: tag,
          icon: Hash,
          color: 'text-amber-500',
          taskIds: tIds
        };
      }).filter(col => col.taskIds.length > 0);

      const noTagIds = dailyIds.filter(id => !byId[id]?.tags?.length);
      if (noTagIds.length > 0) {
        columns.push({
          id: 'no-tags',
          label: 'Без тегов',
          icon: Hash,
          color: 'text-stone-500',
          taskIds: noTagIds
        });
      }
    } else {
      columns = [{
        id: 'all',
        label: 'Все задачи',
        icon: Target,
        color: 'text-amber-500',
        taskIds: dailyIds
      }];
    }

    return (
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory w-full max-h-[calc(100vh-220px)] h-full scrollbar-hide">
        {columns.map(col => {
          const Icon = col.icon;
          return (
            <div
              key={col.id}
              className="flex-shrink-0 w-[285px] bg-stone-900/30 border border-stone-800/80 rounded-2xl p-3 flex flex-col snap-align-start max-h-[calc(100vh-230px)] shadow-xl backdrop-blur-sm"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-800/60 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${col.color}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${col.color}`}>{col.label}</span>
                </div>
                <span className="text-[9px] font-black text-stone-400 bg-stone-900 border border-stone-850 px-2 py-0.5 rounded-full">
                  {col.taskIds.length}
                </span>
              </div>
              {/* Tasks List */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
                {col.taskIds.map(id => (
                  <TaskItem key={`${col.id}-${id}`} id={id} flatMode={true} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

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
