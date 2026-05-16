// src/components/AnalyticsView.jsx
import React, { memo } from 'react';
import { useStore } from '../store/useStore.js';
import { useAnalyticsData } from '../store/selectors.js';
import { useShallow } from 'zustand/react/shallow';

const AnalyticsBlock = memo(({ title, data, goal }) => {
  const pct = Math.min((data.points / goal) * 100, 100) || 0;
  return (
    <div className="bg-stone-800 p-5 rounded-xl border border-stone-700 shadow-md mb-4 relative overflow-hidden">
      <div className="flex justify-between items-end mb-4 relative z-10">
        <h3 className="text-xs font-black text-amber-500 uppercase tracking-widest">{title}</h3>
        <span className="text-[10px] font-bold text-stone-400">Цель: {goal} Б</span>
      </div>
      <div className="flex items-center gap-4 mb-2 relative z-10">
        <div className="relative w-16 h-16 flex-shrink-0 drop-shadow-[0_0_8px_rgba(217,119,6,0.3)]">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-stone-700" />
            <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent"
              strokeDasharray="175"
              strokeDashoffset={175 - (175 * pct) / 100}
              className="text-amber-500 transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-sm font-black text-amber-500 drop-shadow-md">{data.points}</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner">
            <div className="text-xs font-black text-emerald-500">{data.completed}</div>
            <div className="text-[8px] font-bold text-stone-500 uppercase">Сделано</div>
          </div>
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner">
            <div className="text-xs font-black text-amber-500">{data.rescheduled}</div>
            <div className="text-[8px] font-bold text-stone-500 uppercase">Перенос</div>
          </div>
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner">
            <div className="text-xs font-black text-red-500">{data.deleted}</div>
            <div className="text-[8px] font-bold text-stone-500 uppercase">Удалено</div>
          </div>
        </div>
      </div>
    </div>
  );
});

AnalyticsBlock.displayName = 'AnalyticsBlock';

export const AnalyticsView = memo(() => {
  const goals = useStore(useShallow(state => state.settings.goals));
  const day   = useAnalyticsData(1);
  const week  = useAnalyticsData(7);
  const month = useAnalyticsData(30);

  return (
    <div className="space-y-4">
      <AnalyticsBlock title="Сегодня"    data={day}   goal={goals.daily}   />
      <AnalyticsBlock title="Эта неделя" data={week}  goal={goals.weekly}  />
      <AnalyticsBlock title="Этот месяц" data={month} goal={goals.monthly} />
    </div>
  );
});

AnalyticsView.displayName = 'AnalyticsView';
