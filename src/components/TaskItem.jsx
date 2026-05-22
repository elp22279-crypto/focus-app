import React, { memo, useRef, useCallback, useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, Circle, Clock, FastForward, Plus } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useStore } from '../store/useStore.js';
import { useNodeProgress } from '../store/selectors.js';
import { PRIORITIES } from '../utils/constants.js';
import { triggerLightImpact, triggerSuccess } from '../utils/haptics.js';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { InlineSubtaskEditor } from './InlineSubtaskEditor.jsx';

const LONG_PRESS_MS = 400;
const BASE_TOLERANCE_PX = 6;
const SWIPE_THRESHOLD = 80; // px — порог срабатывания свайпа

const triggerHeavyImpact = async () => {
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch { /* web noop */ }
};

// ── Выделенный компонент для дочерних задач ────────────────────────────
const SubtaskList = memo(({ childrenIds, level, forceExpanded }) => {
  return (
    <div className="border-l border-stone-700 ml-5 pl-2">
      {childrenIds.map(childId => (
        <TaskItem key={childId} id={childId} level={level + 1} forceExpanded={forceExpanded} />
      ))}
    </div>
  );
});
SubtaskList.displayName = 'SubtaskList';

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
  const deleteTask       = useStore(state => state.deleteTask);

  const prog = useNodeProgress(id);

  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  // ref for keyboard focus chain
  const cardRef = useRef(null);

  // ── framer-motion drag value ─────────────────────────────────────────────
  const dragX = useMotionValue(0);

  // Reveal backgrounds opacity derived from drag position
  const completeOpacity = useTransform(dragX, [0, SWIPE_THRESHOLD], [0, 1]);
  const deleteOpacity   = useTransform(dragX, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Background color interpolation while dragging
  const cardBackground = useTransform(
    dragX,
    [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    ['rgba(120,20,20,0.6)', 'transparent', 'rgba(16,85,50,0.6)']
  );

  // ── Long-press refs ──────────────────────────────────────────────────────
  const lpTimer  = useRef(null);
  const lpFired  = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const cancelLP = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('[data-no-longpress="true"]')) return;

    lpFired.current = false;
    startPos.current = { x: e.clientX, y: e.clientY };
    lpTimer.current = setTimeout(async () => {
      lpFired.current = true;
      await triggerHeavyImpact();
      useStore.getState().toggleTaskSelection(id);
    }, LONG_PRESS_MS);
  }, [id]);

  const onPointerMove = useCallback((e) => {
    if (!lpTimer.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    const tolerance = BASE_TOLERANCE_PX * (window.devicePixelRatio || 1);
    if (dx > tolerance || dy > tolerance) cancelLP();
  }, [cancelLP]);

  const onPointerUp   = useCallback(() => { cancelLP(); }, [cancelLP]);
  const onPointerCancel = useCallback(() => { cancelLP(); }, [cancelLP]);

  // ── Drag end: check threshold and fire action ────────────────────────────
  const onDragEnd = useCallback((_, info) => {
    const { offset } = info;
    if (isSelecting) {
      // Spring back without action in multi-select mode
      animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 40 });
      return;
    }

    if (offset.x > SWIPE_THRESHOLD && !task?.done) {
      // Swipe right → COMPLETE
      triggerLightImpact();
      toggleDone(id);
    } else if (offset.x < -SWIPE_THRESHOLD) {
      // Swipe left → DELETE
      triggerHeavyImpact();
      deleteTask(id);
    }

    // GPU spring return to origin
    animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 40 });
  }, [id, isSelecting, task?.done, toggleDone, deleteTask, dragX]);

  // ── Click handlers ───────────────────────────────────────────────────────
  const handleCardClick = useCallback(() => {
    if (lpFired.current) return; // long-press fired → ignore click
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

  const handleToggleExpand = useCallback((e) => {
    e.stopPropagation();
    triggerLightImpact();
    toggleExpand(id);
  }, [id, toggleExpand]);

  const handleToggleDone = useCallback((e) => {
    e.stopPropagation();
    // Spec 2.5: Успех/Чекбокс = ImpactStyle.Light
    triggerLightImpact();
    toggleDone(id);
  }, [id, toggleDone]);

  const handleRepeatClick = useCallback((e) => {
    e.stopPropagation();
    triggerLightImpact();
    handleRepeatNext(id);
  }, [id, handleRepeatNext]);

  const handleSubtaskSave = useCallback(() => {
    setIsAddingSubtask(false);
    if (!expanded && !forceExpanded) {
      useStore.getState().toggleExpand(id);
    }
  }, [id, expanded, forceExpanded]);

  const handleSubtaskCancel = useCallback(() => {
    setIsAddingSubtask(false);
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

  const cardBase  = 'flex items-center gap-2 p-3 rounded-xl border shadow-md cursor-pointer select-none';
  const cardLevel = level > 0 ? 'ml-4 border-l-4 border-l-stone-600' : '';
  const cardState = task.done
    ? 'opacity-50 grayscale bg-stone-800 border-stone-700'
    : isSelected
      ? 'bg-blue-950/70 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]'
      : isSelecting
        ? 'bg-stone-800 border-stone-700 opacity-70'
        : 'bg-stone-800 border-stone-700';

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className="mt-2 relative overflow-hidden rounded-xl"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* ── Swipe reveal: RIGHT → Complete ───────────────────────────────── */}
      {!isSelecting && !task.done && (
        <>
          <motion.div
            className="absolute inset-0 flex items-center pl-4 text-emerald-400 pointer-events-none rounded-xl"
            style={{ opacity: completeOpacity, background: 'linear-gradient(to right, rgba(16,85,50,0.85), transparent)' }}
          >
            <CheckCircle2 className="w-6 h-6" />
            <span className="ml-2 text-xs font-black uppercase tracking-widest">Готово</span>
          </motion.div>
          {/* ── Swipe reveal: LEFT → Delete ────────────────────────────── */}
          <motion.div
            className="absolute inset-0 flex items-center justify-end pr-4 text-red-400 pointer-events-none rounded-xl"
            style={{ opacity: deleteOpacity, background: 'linear-gradient(to left, rgba(120,20,20,0.85), transparent)' }}
          >
            <span className="mr-2 text-xs font-black uppercase tracking-widest">Удалить</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </motion.div>
        </>
      )}

      {/* ── GPU-accelerated draggable card ───────────────────────────────── */}
      <motion.div
        drag={isSelecting || task.done ? false : 'x'}
        dragConstraints={{ left: -150, right: 150 }}
        dragElastic={0.15}
        style={{ x: dragX, backgroundColor: cardBackground }}
        onDragEnd={onDragEnd}
        whileTap={{ scale: isSelecting ? 1 : 0.99 }}
        className="rounded-xl"
      >
        <div onClick={handleCardClick} className={`${cardBase} ${cardLevel} ${cardState}`}>
          {isSelecting ? (
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
              isSelected ? 'bg-blue-500 border-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'border-stone-500 bg-stone-900'
            }`}>
              {isSelected && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                  <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ) : (
            hasChildren && !forceExpanded && !flatMode ? (
              <button
                onClick={handleToggleExpand}
                className="p-1 flex-shrink-0"
                data-no-longpress="true"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-stone-500" /> : <ChevronRight className="w-4 h-4 text-amber-600" />}
              </button>
            ) : <div className="w-6 flex-shrink-0" />
          )}

          {!isSelecting && (
            <button
              onClick={handleToggleDone}
              className="flex-shrink-0"
              data-no-longpress="true"
            >
              {task.done
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 drop-shadow-[0_0_5px_rgba(5,150,105,0.8)]" />
                : <Circle className="w-5 h-5 text-stone-600" />
              }
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className={`text-sm font-bold truncate ${task.done ? 'line-through text-stone-500' : isSelected ? 'text-blue-200' : 'text-stone-200'}`}>
              {task.title || 'Новая задача...'}
            </div>
            <div className="flex gap-2 mt-1.5 items-center flex-wrap">
              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border flex items-center shadow-inner ${prio.color} ${prio.bg} ${prio.border}`}>
                {prio.label}
              </span>
              {task.tags && task.tags.map(tag => (
                <span key={tag} className="text-[9px] font-black text-amber-500 bg-amber-950/40 border border-amber-800 px-1.5 py-0.5 rounded flex items-center shadow-inner">
                  {tag}
                </span>
              ))}
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
                  onClick={handleRepeatClick}
                  className="text-[10px] font-bold text-amber-800 bg-amber-500 px-1.5 py-0.5 rounded flex items-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] active:scale-95 transition-all"
                  data-no-longpress="true"
                >
                  <FastForward className="w-3 h-3 mr-1" /> Повтор
                </button>
              )}
            </div>
          </div>

          {!task.done && !isSelecting && (
            <button
              onClick={handleAddSubtask}
              className="flex-shrink-0 p-1.5 rounded-lg bg-stone-700/50 hover:bg-stone-600/70 border border-stone-600/50 transition-all active:scale-95"
              aria-label="Добавить подзадачу"
              data-no-longpress="true"
            >
              <Plus className="w-3.5 h-3.5 text-stone-400 hover:text-amber-400" />
            </button>
          )}
        </div>
      </motion.div>

      {hasChildren && isExpanded && !flatMode && (
        <SubtaskList childrenIds={displayChildrenIds} level={level} forceExpanded={forceExpanded} />
      )}

      {isAddingSubtask && (
        <InlineSubtaskEditor
          parentTask={task}
          onSave={handleSubtaskSave}
          onCancel={handleSubtaskCancel}
          prevInputRef={cardRef}
        />
      )}
    </div>
  );
});
TaskItem.displayName = 'TaskItem';