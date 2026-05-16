// src/components/TaskItem.jsx
import React, { memo, useRef, useCallback, useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, Circle, Clock, FastForward, Plus } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useNodeProgress } from '../store/selectors.js';
import { PRIORITIES } from '../utils/constants.js';
import { triggerLightImpact, triggerSuccess } from '../utils/haptics.js';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { InlineSubtaskEditor } from './InlineSubtaskEditor.jsx';

const LONG_PRESS_MS = 400;

/** Тяжёлый отклик — вход в режим мультивыбора */
const triggerHeavyImpact = async () => {
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* web noop */ }
};

export const TaskItem = memo(({ id, level = 0, forceExpanded = false, flatMode = false }) => {
  const task         = useStore(state => state.byId[id]);
  const expanded     = useStore(state => state.ui.expandedNodes.includes(id));
  const activeTab    = useStore(state => state.ui.activeTab);
  const baseViewMode = useStore(state => state.ui.baseViewMode);
  const isSelected   = useStore(state => state.ui.selectedTaskIds?.includes(id));
  const isSelecting  = useStore(state => (state.ui.selectedTaskIds?.length ?? 0) > 0);

  const toggleDone       = useStore(state => state.toggleDone);
  const toggleExpand     = useStore(state => state.toggleExpand);
  const handleRepeatNext = useStore(state => state.handleRepeatNext);
  const updateUI         = useStore(state => state.updateUI);

  const prog = useNodeProgress(id);

  // ── Inline subtask editor state ──────────────────────────────────────────
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);

  // ── Long-press refs ──────────────────────────────────────────────────────
  const lpTimer  = useRef(null);
  const lpFired  = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const cancelLP = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }, []);

  const onTouchStart = useCallback((e) => {
    lpFired.current = false;
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lpTimer.current = setTimeout(async () => {
      lpFired.current = true;
      await triggerHeavyImpact();
      useStore.getState().toggleTaskSelection(id);
    }, LONG_PRESS_MS);
  }, [id]);

  const onTouchMove = useCallback((e) => {
    const dx = Math.abs(e.touches[0].clientX - startPos.current.x);
    const dy = Math.abs(e.touches[0].clientY - startPos.current.y);
    if (dx > 8 || dy > 8) cancelLP();
  }, [cancelLP]);

  const onTouchEnd = useCallback(() => { cancelLP(); }, [cancelLP]);

  // В режиме выделения тап = тоггл выбора
  const handleCardClick = useCallback(() => {
    if (isSelecting) {
      triggerLightImpact();
      useStore.getState().toggleTaskSelection(id);
    } else {
      updateUI({ editingNodeId: id });
    }
  }, [isSelecting, id, updateUI]);

  const handleAddSubtask = useCallback((e) => {
    e.stopPropagation();
    triggerLightImpact();
    setIsAddingSubtask(true);
  }, []);

  if (!task) return null;

  let displayChildrenIds = task.childrenIds || [];
  if (activeTab === 'daily' || (activeTab === 'backlog' && baseViewMode === 'active')) {
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
  const isExpanded  = forceExpanded || expanded;
  const prio        = PRIORITIES[task.priority] || PRIORITIES['nn'];

  // ── Стили карточки ───────────────────────────────────────────────────────
  const cardBase  = 'flex items-center gap-2 p-3 rounded-xl border shadow-md transition-all cursor-pointer select-none';
  const cardLevel = level > 0 ? 'ml-4 border-l-4 border-l-stone-600' : '';
  const cardState = task.done
    ? 'opacity-50 grayscale bg-stone-800 border-stone-700'
    : isSelected
      ? 'bg-blue-950/70 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
      : isSelecting
        ? 'bg-stone-800 border-stone-700 opacity-70'
        : 'bg-stone-800 border-stone-700 active:scale-[0.99]';

  return (
    <div
      className="mt-2 relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        onClick={handleCardClick}
        className={`${cardBase} ${cardLevel} ${cardState}`}
      >
        {/* ── Чекбокс-маркер мультивыбора / раскрытие дерева ─────────── */}
        {isSelecting ? (
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isSelected
              ? 'bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
              : 'border-stone-500 bg-stone-900'
          }`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        ) : (
          hasChildren && !forceExpanded && !flatMode ? (
            <button onClick={(e) => { e.stopPropagation(); triggerLightImpact(); toggleExpand(id); }} className="p-1 flex-shrink-0">
              {isExpanded
                ? <ChevronDown  className="w-4 h-4 text-stone-500" />
                : <ChevronRight className="w-4 h-4 text-amber-600" />}
            </button>
          ) : <div className="w-6 flex-shrink-0" />
        )}

        {/* ── Чекбокс выполнения (скрыт в режиме выбора) ─────────────── */}
        {!isSelecting && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!task.done) triggerSuccess(); else triggerLightImpact();
              toggleDone(id);
            }}
            className="flex-shrink-0"
          >
            {task.done
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 drop-shadow-[0_0_5px_rgba(5,150,105,0.8)]" />
              : <Circle className="w-5 h-5 text-stone-600" />}
          </button>
        )}

        {/* ── Контент задачи ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold truncate ${
            task.done    ? 'line-through text-stone-500'
            : isSelected ? 'text-blue-200'
            : 'text-stone-200'
          }`}>
            {task.title || 'Новая задача...'}
          </div>
          <div className="flex gap-2 mt-1.5 items-center flex-wrap">
            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border flex items-center shadow-inner ${prio.color} ${prio.bg} ${prio.border}`}>
              {prio.label}
            </span>
            {task.time && !task.done && (
              <span className="text-[10px] font-black text-amber-500 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded flex items-center shadow-inner">
                {task.time}
              </span>
            )}
            {!task.done && (
              <span className="text-[10px] font-bold text-purple-400 bg-stone-900 border border-stone-700 px-1.5 py-0.5 rounded flex items-center shadow-inner">
                <Clock className="w-3 h-3 mr-1" /> {Number(prog.total.toFixed(2))}ч
              </span>
            )}
            {task.repeatType && task.repeatType !== 'none' && !task.parentId && !task.done && (
              <button
                onClick={(e) => { e.stopPropagation(); triggerLightImpact(); handleRepeatNext(id); }}
                className="text-[10px] font-bold text-amber-800 bg-amber-500 px-1.5 py-0.5 rounded flex items-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-all"
              >
                <FastForward className="w-3 h-3 mr-1" /> Повтор
              </button>
            )}
          </div>
        </div>

        {/* ── Кнопка «+» добавить подзадачу ──────────────────────────── */}
        {!task.done && !isSelecting && (
          <button
            onClick={handleAddSubtask}
            className="flex-shrink-0 p-1.5 rounded-lg bg-stone-700/50 hover:bg-stone-600/70 border border-stone-600/50 transition-all active:scale-95"
            aria-label="Добавить подзадачу"
          >
            <Plus className="w-3.5 h-3.5 text-stone-400 hover:text-amber-400" />
          </button>
        )}
      </div>

      {/* ── Дочерние задачи ─────────────────────────────────────────────── */}
      {hasChildren && isExpanded && !flatMode && (
        <div className="border-l border-stone-700 ml-5 pl-2">
          {displayChildrenIds.map(childId =>
            <TaskItem key={childId} id={childId} level={level + 1} forceExpanded={forceExpanded} />
          )}
        </div>
      )}

      {/* ── Inline-редактор создания подзадачи ──────────────────────────── */}
      {isAddingSubtask && (
        <InlineSubtaskEditor
          parentTask={task}
          onSave={() => {
            setIsAddingSubtask(false);
            // Раскрываем дерево, чтобы была видна новая подзадача
            if (!expanded && !forceExpanded) {
              useStore.getState().toggleExpand(id);
            }
          }}
          onCancel={() => setIsAddingSubtask(false)}
        />
      )}
    </div>
  );
});