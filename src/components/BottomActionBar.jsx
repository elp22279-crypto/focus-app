// src/components/BottomActionBar.jsx
import React, { memo, useState, useCallback, useMemo } from 'react';
import { X, CalendarClock, CheckCheck, Trash2, Copy, FolderOpen, Hash, Search, ArrowLeft } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useShallow } from 'zustand/react/shallow';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Toast } from '@capacitor/toast';

const safeHaptic = (fn) => { try { fn(); } catch { /* noop */ } };

export const BottomActionBar = memo(() => {
  const selectedTaskIds     = useStore(useShallow(state => state.ui.selectedTaskIds));
  const clearTaskSelection  = useStore(state => state.clearTaskSelection);
  const updateMultipleTasks = useStore(state => state.updateMultipleTasks);
  const deleteTask          = useStore(state => state.deleteTask);
  const duplicateTask       = useStore(state => state.duplicateTask);
  const categories          = useStore(useShallow(state => state.categories));
  const byId                = useStore(state => state.byId);

  const [showDatePicker,   setShowDatePicker]   = useState(false);
  const [rescheduleDate,   setRescheduleDate]   = useState('');
  const [showCatPicker,    setShowCatPicker]    = useState(false);
  const [showParentPicker, setShowParentPicker] = useState(false);
  const [parentQuery,      setParentQuery]      = useState('');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // All tasks that are NOT in the current selection (valid parent candidates)
  const validParents = useMemo(() => {
    const selSet = new Set(selectedTaskIds || []);
    return Object.values(byId).filter(t => !selSet.has(t.id) && !t.isHidden);
  }, [byId, selectedTaskIds]);

  const filteredParents = useMemo(() => {
    if (!parentQuery.trim()) return validParents;
    const q = parentQuery.toLowerCase();
    return validParents.filter(t => t.title?.toLowerCase().includes(q));
  }, [validParents, parentQuery]);

  const closeAll = useCallback(() => {
    setShowDatePicker(false);
    setRescheduleDate('');
    setShowCatPicker(false);
    setShowParentPicker(false);
    setParentQuery('');
  }, []);

  const handleComplete = useCallback(() => {
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
    selectedTaskIds.forEach(id => useStore.getState().toggleDone(id));
    clearTaskSelection();
  }, [selectedTaskIds, clearTaskSelection]);

  const handleReschedule = useCallback(() => {
    if (!rescheduleDate) { setShowDatePicker(true); return; }
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
    updateMultipleTasks(selectedTaskIds, { date: rescheduleDate, status: 'active' });
    setRescheduleDate('');
    setShowDatePicker(false);
    clearTaskSelection();
  }, [rescheduleDate, selectedTaskIds, updateMultipleTasks, clearTaskSelection]);

  const handleDelete = useCallback(() => {
    // Spec: массовое удаление → ImpactStyle.Heavy
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Heavy }));
    selectedTaskIds.forEach(id => deleteTask(id));
    clearTaskSelection();
  }, [selectedTaskIds, deleteTask, clearTaskSelection]);

  const handleDuplicate = useCallback(() => {
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
    selectedTaskIds.forEach(id => duplicateTask(id));
    clearTaskSelection();
  }, [selectedTaskIds, duplicateTask, clearTaskSelection]);

  const handleCategorySet = useCallback((category) => {
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
    updateMultipleTasks(selectedTaskIds, { category });
    closeAll();
    clearTaskSelection();
  }, [selectedTaskIds, updateMultipleTasks, clearTaskSelection, closeAll]);

  const handleParentSet = useCallback(async (parentId) => {
    safeHaptic(() => Haptics.impact({ style: ImpactStyle.Light }));
    const result = updateMultipleTasks(selectedTaskIds, { parentId });
    // updateMultipleTasks returns { _lastBulkError: 'cycle' } on cycle detection
    if (result && result._lastBulkError === 'cycle') {
      try { await Haptics.notification({ type: NotificationType.Error }); } catch { /* noop */ }
      await Toast.show({ text: '⚠ Ошибка: обнаружен циклический граф. Операция отменена.', duration: 'long' });
      closeAll();
      return;
    }
    closeAll();
    clearTaskSelection();
  }, [selectedTaskIds, updateMultipleTasks, clearTaskSelection, closeAll]);

  const toggleDatePicker = useCallback(() => { setShowDatePicker(v => !v); setShowCatPicker(false); setShowParentPicker(false); }, []);
  const toggleCatPicker  = useCallback(() => { setShowCatPicker(v => !v); setShowDatePicker(false); setShowParentPicker(false); }, []);
  const toggleParentPicker = useCallback(() => { setShowParentPicker(v => !v); setShowDatePicker(false); setShowCatPicker(false); setParentQuery(''); }, []);

  if (!selectedTaskIds || selectedTaskIds.length === 0) return null;

  // ── Full-screen parent picker ────────────────────────────────────────────
  if (showParentPicker) {
    return (
      <div className="fixed inset-0 z-[50] bg-stone-950 flex flex-col animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center gap-3 p-4 border-b border-stone-800 bg-stone-900 flex-shrink-0">
          <button
            onClick={() => { setShowParentPicker(false); setParentQuery(''); }}
            className="p-2 bg-stone-800 rounded-full hover:bg-stone-700 text-stone-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              autoFocus
              type="search"
              className="w-full bg-stone-800 border border-stone-700 rounded-xl py-2 pl-9 pr-4 text-sm text-stone-200 outline-none focus:border-amber-700"
              placeholder="Поиск родительской задачи..."
              value={parentQuery}
              onChange={e => setParentQuery(e.target.value)}
            />
          </div>
          <span className="text-[10px] font-black text-blue-400 bg-blue-950/50 border border-blue-800 rounded-lg px-2 py-1">
            {selectedTaskIds.length}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-10">
          <button
            onClick={() => handleParentSet(null)}
            className="w-full text-left p-3 rounded-xl border bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800/80 transition-all"
          >
            <div className="text-sm font-bold">— Без родителя (корневая задача)</div>
          </button>
          {filteredParents.map(p => (
            <button
              key={p.id}
              onClick={() => handleParentSet(p.id)}
              className="w-full text-left p-3 rounded-xl border bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800/80 transition-all"
            >
              <div className="text-sm font-bold text-stone-200 truncate">{p.title || 'Без названия'}</div>
              {p.parentId && byId[p.parentId] && (
                <div className="text-[10px] text-stone-500 mt-0.5 truncate">↳ {byId[p.parentId].title}</div>
              )}
            </button>
          ))}
          {filteredParents.length === 0 && parentQuery && (
            <div className="text-center py-8 text-stone-500 text-sm">Ничего не найдено</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto px-4 z-[45] animate-in slide-in-from-bottom-3 duration-200">

      {/* ── Date picker popover ─────────────────────────────────────────── */}
      {showDatePicker && (
        <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 mb-2 shadow-xl flex gap-2 items-center">
          <input
            type="date"
            min={today}
            value={rescheduleDate}
            onClick={e => e.target.showPicker && e.target.showPicker()}
            onChange={e => setRescheduleDate(e.target.value)}
            className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm font-bold text-stone-200 outline-none focus:border-blue-600 cursor-pointer"
          />
          <button
            onClick={handleReschedule}
            disabled={!rescheduleDate}
            className="px-4 py-2 bg-blue-900/60 border border-blue-700 text-blue-300 text-[10px] font-black uppercase rounded-xl disabled:opacity-40 hover:bg-blue-800/60 transition-all"
          >
            OK
          </button>
          <button onClick={() => { setShowDatePicker(false); setRescheduleDate(''); }} className="p-2 text-stone-500 hover:text-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Category picker popover ─────────────────────────────────────── */}
      {showCatPicker && (
        <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 mb-2 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Категория</span>
            <button onClick={() => setShowCatPicker(false)} className="p-1"><X className="w-3.5 h-3.5 text-stone-500" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleCategorySet(null)}
              className="px-3 py-1.5 rounded-xl border text-[10px] font-black bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500 transition-all"
            >
              Общее
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategorySet(cat)}
                className="px-3 py-1.5 rounded-xl border text-[10px] font-black bg-amber-950/40 border-amber-800 text-amber-300 hover:bg-amber-900/40 transition-all"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main action bar ─────────────────────────────────────────────── */}
      <div className="bg-stone-900/95 backdrop-blur-sm border-2 border-blue-800/60 rounded-2xl shadow-[0_8px_32px_rgba(59,130,246,0.2)] overflow-hidden">
        {/* Selection count header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800/60 bg-stone-950/40">
          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
            Выбрано: {selectedTaskIds.length}
          </span>
          <button onClick={clearTaskSelection} className="p-1 text-stone-500 hover:text-stone-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex">
          <button
            id="multiselect-complete-btn"
            onClick={handleComplete}
            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 text-emerald-400 hover:bg-emerald-950/40 transition-all border-r border-stone-700"
          >
            <CheckCheck className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Готово</span>
          </button>

          <button
            id="multiselect-reschedule-btn"
            onClick={toggleDatePicker}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 transition-all border-r border-stone-700 ${
              showDatePicker ? 'bg-blue-950/50 text-blue-300' : 'text-blue-400 hover:bg-blue-950/30'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Дата</span>
          </button>

          <button
            id="multiselect-category-btn"
            onClick={toggleCatPicker}
            className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 transition-all border-r border-stone-700 ${
              showCatPicker ? 'bg-amber-950/50 text-amber-300' : 'text-amber-400 hover:bg-amber-950/30'
            }`}
          >
            <Hash className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Кат.</span>
          </button>

          <button
            id="multiselect-parent-btn"
            onClick={toggleParentPicker}
            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 text-violet-400 hover:bg-violet-950/30 transition-all border-r border-stone-700"
          >
            <FolderOpen className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Родит.</span>
          </button>

          <button
            id="multiselect-duplicate-btn"
            onClick={handleDuplicate}
            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 text-purple-400 hover:bg-purple-950/40 transition-all border-r border-stone-700"
          >
            <Copy className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Копия</span>
          </button>

          <button
            id="multiselect-delete-btn"
            onClick={handleDelete}
            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 text-red-400 hover:bg-red-950/40 transition-all"
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Удалить</span>
          </button>
        </div>
      </div>
    </div>
  );
});

BottomActionBar.displayName = 'BottomActionBar';
