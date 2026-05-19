import React, { useEffect, useState } from 'react';
import { RotateCcw, X, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { triggerLightImpact } from '../utils/haptics.js';

const DURATION = 3000; // должно совпадать с таймером в store

const UndoItem = ({ id, action }) => {
  const undoAction = useStore(state => state.undoAction);
  const _commitPending = useStore(state => state._commitPending);

  const [progress, setProgress] = useState(1);

  useEffect(() => {
    const raf = setInterval(() => {
      const elapsed = Date.now() - action.startedAt;
      const remaining = Math.max(0, 1 - elapsed / DURATION);
      setProgress(remaining);
      if (remaining === 0) clearInterval(raf);
    }, 50);

    return () => clearInterval(raf);
  }, [action.startedAt]);

  const label = action.type === 'delete'
    ? `Удалено: «${action.taskSnapshot.title || 'задача'}»`
    : `Выполнено: «${action.taskSnapshot.title || 'задача'}»`;

  const handleUndo = () => {
    triggerLightImpact();
    undoAction(id);
  };

  const handleDismiss = () => {
    triggerLightImpact();
    _commitPending(id);
  };

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-200">
      <div className="h-0.5 bg-slate-700 relative">
        <div
          className="absolute left-0 top-0 bottom-0 bg-amber-500 transition-none"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-xs font-bold text-slate-300 truncate flex-1">{label}</span>

        <button
          onClick={handleUndo}
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 border border-amber-700 bg-amber-950/60 px-3 py-1.5 rounded-xl hover:bg-amber-900/60 active:scale-95 transition-all flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          Отменить
        </button>

        <button
          onClick={handleDismiss}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
          aria-label="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const UndoSnackbar = () => {
  const pendingActions = useStore(state => state.pendingActions);
  const actionsEntries = Object.entries(pendingActions || {});
  const [persistError, setPersistError] = useState(false);

  // Listen for IDB persist errors (from optimistic UI rollback mechanism)
  useEffect(() => {
    const handler = () => {
      setPersistError(true);
      setTimeout(() => setPersistError(false), 4000);
    };
    window.addEventListener('focus-app:persist-error', handler);
    return () => window.removeEventListener('focus-app:persist-error', handler);
  }, []);

  if (actionsEntries.length === 0 && !persistError) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none"
    >
      {persistError && (
        <div className="pointer-events-auto bg-red-950 border border-red-700 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.7)] overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs font-bold text-red-300 flex-1">
              Ошибка сохранения. Состояние восстановлено.
            </span>
            <button
              onClick={() => setPersistError(false)}
              className="p-1 text-red-500 hover:text-red-300 transition-colors flex-shrink-0"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {actionsEntries.map(([id, action]) => (
        <div key={id} className="pointer-events-auto">
          <UndoItem id={id} action={action} />
        </div>
      ))}
    </div>
  );
};
