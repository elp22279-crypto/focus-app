// src/components/UndoSnackbar.jsx
import React, { useEffect, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { triggerLightImpact } from '../utils/haptics.js';

const DURATION = 3000; // должно совпадать с таймером в store

export const UndoSnackbar = () => {
  const pendingAction = useStore(state => state.pendingAction);
  const undoAction    = useStore(state => state.undoAction);
  const _commitPending = useStore(state => state._commitPending);

  // Прогресс [0..1] убывает за DURATION мс
  const [progress, setProgress] = useState(1);

  useEffect(() => {
    if (!pendingAction) { setProgress(1); return; }

    // Перезапускаем анимацию прогресс-бара при каждом новом pendingAction
    setProgress(1);
    const start = Date.now();
    const raf = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1 - elapsed / DURATION);
      setProgress(remaining);
      if (remaining === 0) clearInterval(raf);
    }, 50);

    return () => clearInterval(raf);
  }, [pendingAction]);

  if (!pendingAction) return null;

  const label = pendingAction.type === 'delete'
    ? `Удалено: «${pendingAction.taskSnapshot.title || 'задача'}»`
    : `Выполнено: «${pendingAction.taskSnapshot.title || 'задача'}»`;

  const handleUndo = () => {
    triggerLightImpact();
    undoAction();
  };

  const handleDismiss = () => {
    triggerLightImpact();
    _commitPending();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-4 right-4 z-[60] animate-in slide-in-from-bottom-3 fade-in duration-200"
    >
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] overflow-hidden">
        {/* Прогресс-бар */}
        <div className="h-0.5 bg-slate-700 relative">
          <div
            className="absolute left-0 top-0 bottom-0 bg-amber-500 transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        {/* Содержимое */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-xs font-bold text-slate-300 truncate flex-1">{label}</span>

          <button
            id="undo-action-btn"
            onClick={handleUndo}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 border border-amber-700 bg-amber-950/60 px-3 py-1.5 rounded-xl hover:bg-amber-900/60 active:scale-95 transition-all flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Отменить
          </button>

          <button
            id="undo-dismiss-btn"
            onClick={handleDismiss}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
            aria-label="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
