// src/components/BottomActionBar.jsx
import React, { memo, useState, useCallback, useMemo } from 'react';
import { X, CalendarClock, CheckCheck, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useShallow } from 'zustand/react/shallow';

export const BottomActionBar = memo(() => {
  const selectedTaskIds     = useStore(useShallow(state => state.ui.selectedTaskIds));
  const clearTaskSelection  = useStore(state => state.clearTaskSelection);
  const updateMultipleTasks = useStore(state => state.updateMultipleTasks);
  const deleteTask          = useStore(state => state.deleteTask);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const handleComplete = useCallback(() => {
    selectedTaskIds.forEach(id => useStore.getState().toggleDone(id));
    clearTaskSelection();
  }, [selectedTaskIds, clearTaskSelection]);

  const handleReschedule = useCallback(() => {
    if (!rescheduleDate) { setShowDatePicker(true); return; }
    updateMultipleTasks(selectedTaskIds, { date: rescheduleDate, status: 'active' });
    setRescheduleDate('');
    setShowDatePicker(false);
    clearTaskSelection();
  }, [rescheduleDate, selectedTaskIds, updateMultipleTasks, clearTaskSelection]);

  const handleDelete = useCallback(() => {
    selectedTaskIds.forEach(id => deleteTask(id));
    clearTaskSelection();
  }, [selectedTaskIds, deleteTask, clearTaskSelection]);

  const toggleDatePicker = useCallback(() => setShowDatePicker(v => !v), []);
  const closeDatePicker  = useCallback(() => { setShowDatePicker(false); setRescheduleDate(''); }, []);

  if (!selectedTaskIds || selectedTaskIds.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 max-w-md mx-auto px-4 z-[45] animate-in slide-in-from-bottom-3 duration-200">
      {showDatePicker && (
        <div className="bg-stone-900 border border-stone-700 rounded-2xl p-4 mb-2 shadow-xl flex gap-2 items-center">
          <input
            type="date"
            min={today}
            value={rescheduleDate}
            onChange={e => setRescheduleDate(e.target.value)}
            className="flex-1 bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm font-bold text-stone-200 outline-none focus:border-blue-600"
          />
          <button
            onClick={handleReschedule}
            disabled={!rescheduleDate}
            className="px-4 py-2 bg-blue-900/60 border border-blue-700 text-blue-300 text-[10px] font-black uppercase rounded-xl disabled:opacity-40 hover:bg-blue-800/60 transition-all"
          >
            OK
          </button>
          <button onClick={closeDatePicker} className="p-2 text-stone-500 hover:text-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-stone-900/95 backdrop-blur-sm border-2 border-blue-800/60 rounded-2xl shadow-[0_8px_32px_rgba(59,130,246,0.2)] overflow-hidden">
        <div className="flex">
          <button
            id="multiselect-complete-btn"
            onClick={handleComplete}
            className="flex-1 flex flex-col items-center gap-1.5 py-4 text-emerald-400 hover:bg-emerald-950/40 transition-all border-r border-stone-700"
          >
            <CheckCheck className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Завершить</span>
          </button>

          <button
            id="multiselect-reschedule-btn"
            onClick={toggleDatePicker}
            className={`flex-1 flex flex-col items-center gap-1.5 py-4 transition-all border-r border-stone-700 ${
              showDatePicker ? 'bg-blue-950/50 text-blue-300' : 'text-blue-400 hover:bg-blue-950/30'
            }`}
          >
            <CalendarClock className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-widest">Перенести</span>
          </button>

          <button
            id="multiselect-delete-btn"
            onClick={handleDelete}
            className="flex-1 flex flex-col items-center gap-1.5 py-4 text-red-400 hover:bg-red-950/40 transition-all"
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
