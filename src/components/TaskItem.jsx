// src/components/TaskItem.jsx
import React, { memo } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, Circle, Clock, FastForward } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useNodeProgress } from '../store/selectors.js';
import { PRIORITIES } from '../utils/constants.js';

export const TaskItem = memo(({ id, level = 0, forceExpanded = false, flatMode = false }) => {
  const task = useStore(state => state.byId[id]);
  const expanded = useStore(state => state.ui.expandedNodes.includes(id));
  const activeTab = useStore(state => state.ui.activeTab);
  const baseViewMode = useStore(state => state.ui.baseViewMode);
  const isSelected = useStore(state => state.ui.selectedTaskIds?.includes(id));
  
  const toggleDone = useStore(state => state.toggleDone);
  const toggleExpand = useStore(state => state.toggleExpand);
  const handleRepeatNext = useStore(state => state.handleRepeatNext);
  const updateUI = useStore(state => state.updateUI);
  
  const prog = useNodeProgress(id);

  if (!task) return null;

  let displayChildrenIds = task.childrenIds || [];
  if (activeTab === 'daily' || (activeTab === 'backlog' && baseViewMode === 'active')) {
    // Безопасное чтение глобального стейта без подписки, чтобы не вызывать лишний ререндер
    displayChildrenIds = displayChildrenIds.filter(cId => {
      const state = useStore.getState();
      const c = state.byId[cId];
      if (!c || c.done) return false;
      
      if (activeTab === 'daily') {
        const selectedDate = state.ui.selectedDate;
        if (c.date && c.date !== selectedDate) return false;
      }
      
      return true;
    });
  }

  const hasChildren = displayChildrenIds.length > 0;
  const isExpanded = forceExpanded || expanded;
  const prio = PRIORITIES[task.priority] || PRIORITIES['nn'];

  const handleTouchStart = (e) => {
    e.currentTarget.dataset.touchStartX = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    e.currentTarget.dataset.touchEndX = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    const startX = parseFloat(e.currentTarget.dataset.touchStartX);
    const endX = parseFloat(e.currentTarget.dataset.touchEndX);
    if (!isNaN(startX) && !isNaN(endX)) {
      const diff = endX - startX;
      if (diff > 50) { // Swipe right
        useStore.getState().toggleTaskSelection(id);
      }
    }
    e.currentTarget.dataset.touchStartX = '';
    e.currentTarget.dataset.touchEndX = '';
  };

  return (
    <div 
      className="mt-2 relative" 
      onTouchStart={handleTouchStart} 
      onTouchMove={handleTouchMove} 
      onTouchEnd={handleTouchEnd}
    >
      <div onClick={() => updateUI({ editingNodeId: id })} className={`flex items-center gap-2 p-3 bg-stone-800 rounded-xl border shadow-md active:scale-[0.99] transition-all cursor-pointer ${level > 0 ? 'ml-4 border-l-4 border-l-stone-600' : ''} ${task.done ? 'opacity-50 grayscale border-stone-700' : isSelected ? 'border-amber-500 bg-stone-700' : 'border-stone-700'}`}>
        {hasChildren && !forceExpanded && !flatMode ? (
          <button onClick={(e) => { e.stopPropagation(); toggleExpand(id); }} className="p-1">
            {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-amber-600" />}
          </button>
        ) : <div className="w-6" />}
        
        <button onClick={(e) => { e.stopPropagation(); toggleDone(id); }}>
          {task.done ? <CheckCircle2 className="w-5 h-5 text-emerald-600 drop-shadow-[0_0_5px_rgba(5,150,105,0.8)]" /> : <Circle className="w-5 h-5 text-stone-600" />}
        </button>
        
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold truncate ${task.done ? 'line-through text-stone-500' : 'text-stone-200'}`}>{task.title || 'Новая задача...'}</div>
          <div className="flex gap-2 mt-1.5 items-center flex-wrap">
            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border flex items-center shadow-inner ${prio.color} ${prio.bg} ${prio.border}`}>{prio.label}</span>
            {task.time && !task.done && <span className="text-[10px] font-black text-amber-500 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded flex items-center shadow-inner">{task.time}</span>}
            {!task.done && <span className="text-[10px] font-bold text-purple-400 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded flex items-center shadow-inner"><Clock className="w-3 h-3 mr-1" /> {Number(prog.total.toFixed(2))}ч</span>}
            {task.repeatType && task.repeatType !== 'none' && !task.parentId && !task.done && (
              <button onClick={(e) => { e.stopPropagation(); handleRepeatNext(id); }} className="text-[10px] font-bold text-amber-800 bg-amber-500 px-1.5 py-0.5 rounded flex items-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-all"><FastForward className="w-3 h-3 mr-1" /> Повтор</button>
            )}
          </div>
        </div>
      </div>
      {hasChildren && isExpanded && !flatMode && (
        <div className="border-l border-stone-700 ml-5 pl-2">
          {displayChildrenIds.map(childId => <TaskItem key={childId} id={childId} level={level + 1} forceExpanded={forceExpanded} />)}
        </div>
      )}
    </div>
  );
});