// src/components/AppHeader.jsx
/**
 * Шапка приложения. Подписывается только на поля, которые ей нужны.
 * При activeTab !== 'daily' вся нижняя часть (навигация по датам + load bar) не рендерится.
 */
import React, { memo, useCallback, useMemo } from 'react';
import {
  Settings, CalendarDays, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { useStore }          from '../store/useStore.js';
import { useShallow }        from 'zustand/react/shallow';
import { useDailyLoad }      from '../store/selectors.js';
import { formatHeaderDate }  from '../utils/helpers.js';

// ── Контекстный хедер (режим мультивыбора) ──────────────────────────────────
const ContextualHeader = memo(({ count, onClear }) => (
  <div className="flex items-center gap-3 animate-in fade-in duration-150">
    <button
      id="multiselect-clear-btn"
      onClick={onClear}
      className="p-2 bg-stone-800 border border-stone-700 rounded-full hover:bg-stone-700 transition-all"
    >
      <X className="w-4 h-4 text-stone-300" />
    </button>
    <span className="text-sm font-black text-blue-400 uppercase tracking-widest">
      Выбрано: <span className="text-white">{count}</span>
    </span>
  </div>
));
ContextualHeader.displayName = 'ContextualHeader';

// ── Полоса нагрузки ──────────────────────────────────────────────────────────
const LoadBar = memo(() => {
  const dailyLimit = useStore(state => state.settings.dailyLimit);
  const { load, percentage } = useDailyLoad();

  const diff = dailyLimit - load;
  const isOverload = diff < 0;
  const absDiff = Math.abs(diff);

  const formatTime = (hours) => {
    if (hours < 1 && hours > 0) return `${Math.round(hours * 60)}м`;
    return `${Number(hours.toFixed(2))}ч`;
  };

  return (
    <div className="bg-stone-950 p-2 rounded-xl border-2 border-stone-800">
      <div className="flex justify-between text-[9px] font-black text-stone-500 mb-2 uppercase tracking-widest px-1">
        {isOverload ? (
          <span className="text-red-500">ПЕРЕГРУЗ: {formatTime(absDiff)}</span>
        ) : (
          <span className="text-purple-400">ОСТАТОК: {formatTime(absDiff)}</span>
        )}
        <span className="text-amber-600">ПЛАН: {dailyLimit}ч</span>
      </div>
      <div className="h-3 w-full bg-stone-900 rounded-full overflow-hidden border border-stone-800 relative">
        <div
          className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ${
            isOverload
              ? 'bg-gradient-to-r from-red-800 to-red-500'
              : 'bg-gradient-to-r from-purple-800 to-purple-400'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
});
LoadBar.displayName = 'LoadBar';

// ── Главный компонент шапки ──────────────────────────────────────────────────
export const AppHeader = memo(({ today }) => {
  const activeTab        = useStore(state => state.ui.activeTab);
  const selectedDate     = useStore(state => state.ui.selectedDate);
  const sortMode         = useStore(state => state.ui.sortMode);
  const showSettings     = useStore(state => state.ui.showSettings);
  const selectedTaskIds  = useStore(useShallow(state => state.ui.selectedTaskIds));
  const updateUI         = useStore(state => state.updateUI);
  const clearTaskSelection = useStore(state => state.clearTaskSelection);

  // Количество долгов — только id-список (не объекты), чтобы минимизировать пересчёт
  const overdueCount = useStore(useShallow(state =>
    Object.keys(state.byId).filter(id => {
      const t = state.byId[id];
      return t && t.status === 'active' && t.date && t.date < today && !t.done && !t.isHidden;
    }).length
  ));

  const isSelecting = (selectedTaskIds?.length ?? 0) > 0;

  const handlePrevDay = useCallback(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    updateUI({ selectedDate: d.toISOString().split('T')[0] });
  }, [selectedDate, updateUI]);

  const handleNextDay = useCallback(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    updateUI({ selectedDate: d.toISOString().split('T')[0] });
  }, [selectedDate, updateUI]);

  const handleShowOverdue    = useCallback(() => updateUI({ showOverdue: true }),            [updateUI]);
  const handleToggleSettings = useCallback(() => updateUI({ showSettings: !showSettings }), [updateUI, showSettings]);
  const handleSortChange     = useCallback((e) => updateUI({ sortMode: e.target.value }),   [updateUI]);

  return (
    <header className="bg-stone-900 p-4 border-b-2 border-stone-800 shadow-md relative z-20">
      {/* ── Верхняя строка ──────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-4 relative z-10">
        {isSelecting ? (
          <ContextualHeader count={selectedTaskIds.length} onClear={clearTaskSelection} />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-stone-800 p-2 rounded-lg border border-stone-700 shadow-inner relative">
                <CalendarDays className="w-4 h-4 text-stone-400" />
                {overdueCount > 0 && (
                  <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                    {overdueCount}
                  </div>
                )}
              </div>
              <h1 className="text-xl font-serif font-medium text-stone-300 uppercase tracking-[0.2em]">Фокус</h1>
            </div>

            <div className="flex gap-2 items-center">
              {overdueCount > 0 && (
                <button
                  onClick={handleShowOverdue}
                  className="bg-red-950 border border-red-800 text-red-500 text-[9px] font-black px-2 py-2 rounded-lg uppercase"
                >
                  Долги
                </button>
              )}
              {activeTab === 'daily' && (
                <select
                  value={sortMode}
                  onChange={handleSortChange}
                  className="bg-stone-800 text-amber-500 border border-stone-700 text-[9px] font-black uppercase tracking-widest px-2 py-2 rounded-lg outline-none cursor-pointer"
                >
                  <option value="none">Порядок</option>
                  <option value="time">Время</option>
                  <option value="priority">Приоритет</option>
                </select>
              )}
              <button
                onClick={handleToggleSettings}
                className="p-2 bg-stone-800 border border-stone-700 rounded-full"
              >
                <Settings className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Блок навигации по датам (только в режиме Фокус) ────────────── */}
      {activeTab === 'daily' && (
        <>
          <div className="flex justify-between items-center bg-stone-800 rounded-lg p-1.5 mb-4 border border-stone-700">
            <button onClick={handlePrevDay} className="p-1">
              <ChevronLeft className="w-5 h-5 text-stone-500" />
            </button>
            <div className="text-[11px] font-black text-stone-300 uppercase tracking-widest leading-6">
              {selectedDate === today ? 'СЕГОДНЯ' : formatHeaderDate(selectedDate)}
            </div>
            <button onClick={handleNextDay} className="p-1">
              <ChevronRight className="w-5 h-5 text-stone-500" />
            </button>
          </div>
          <LoadBar />
        </>
      )}
    </header>
  );
});

AppHeader.displayName = 'AppHeader';
