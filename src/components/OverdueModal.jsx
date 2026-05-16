// src/components/OverdueModal.jsx
import React, { memo, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useShallow } from 'zustand/react/shallow';

export const OverdueModal = memo(({ today }) => {
  const showOverdue = useStore(state => state.ui.showOverdue);
  const updateUI    = useStore(state => state.updateUI);
  const triageTask  = useStore(state => state.triageTask);

  // Вычисляем список долгов прямо здесь — рендеримся только когда showOverdue=true
  const overdueIds = useStore(useShallow(state =>
    Object.keys(state.byId).filter(id => {
      const t = state.byId[id];
      return t && t.status === 'active' && t.date && t.date < today && !t.done && !t.isHidden;
    })
  ));

  const handleClose  = useCallback(() => updateUI({ showOverdue: false }), [updateUI]);
  const handleToday  = useCallback((id) => triageTask(id, 'today'),   [triageTask]);
  const handleBacklog = useCallback((id) => triageTask(id, 'backlog'), [triageTask]);
  const handleDelete = useCallback((id) => triageTask(id, 'delete'),  [triageTask]);

  if (!showOverdue) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-end justify-center">
      <div className="bg-stone-900 w-full max-w-md h-[80vh] rounded-t-[2.5rem] border-t-2 border-red-900 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-red-500 font-black uppercase text-sm flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Триаж долгов
          </h2>
          <button onClick={handleClose} className="p-2 bg-stone-800 border border-stone-700 rounded-full">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>
        <div className="space-y-3 pb-10">
          {overdueIds.map(id => {
            const node = useStore.getState().byId[id];
            if (!node) return null;
            return (
              <div key={id} className="bg-stone-800 p-4 rounded-xl border border-red-900/50 flex flex-col gap-3">
                <div className="text-sm font-bold text-stone-200">{node.title}</div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleToday(id)}   className="text-[9px] font-black bg-stone-950 p-3 rounded-lg uppercase text-amber-500 border border-stone-800">Сегодня</button>
                  <button onClick={() => handleBacklog(id)} className="text-[9px] font-black bg-stone-950 p-3 rounded-lg uppercase text-stone-400 border border-stone-800">В базу</button>
                  <button onClick={() => handleDelete(id)}  className="text-[9px] font-black bg-red-950 p-3 rounded-lg uppercase text-red-500 border border-red-900">Списать</button>
                </div>
              </div>
            );
          })}
          {overdueIds.length === 0 && (
            <div className="text-center text-stone-500 py-20 italic font-bold">Все долги закрыты.</div>
          )}
        </div>
      </div>
    </div>
  );
});

OverdueModal.displayName = 'OverdueModal';
