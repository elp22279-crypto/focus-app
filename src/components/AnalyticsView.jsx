import React, { memo, useState } from 'react';
import { useStore } from '../store/useStore.js';
import { useAnalyticsData } from '../store/selectors.js';
import { useShallow } from 'zustand/react/shallow';
import { generateAnalyticsWithAI, MissingApiKeyError } from '../utils/ai.js';
import { Bot, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';
import { triggerLightImpact, triggerWarning, triggerSuccess } from '../utils/haptics.js';

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
  const aiAnalyticsCache = useStore(state => state.aiAnalyticsCache);
  const setAiAnalyticsCache = useStore(state => state.setAiAnalyticsCache);
  const updateUI = useStore(state => state.updateUI);
  const apiKey = useStore(state => state.apiKey);
  
  const day   = useAnalyticsData(1);
  const week  = useAnalyticsData(7);
  const month = useAnalyticsData(30);

  const [aiPeriod, setAiPeriod] = useState(1);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  
  const abortControllerRef = React.useRef(null);
  
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Checks if the cache for the current period is from today
  const getCachedData = (period) => {
    const cached = aiAnalyticsCache[period];
    if (!cached) return null;
    const isToday = new Date(cached.timestamp).toDateString() === new Date().toDateString();
    return isToday ? cached.data : null;
  };

  const handleGenerateAI = async () => {
    if (!apiKey) {
      triggerWarning();
      updateUI({ showSettings: true });
      return;
    }
    
    // Check cache
    if (getCachedData(aiPeriod)) return;
    
    triggerLightImpact();
    setIsAiLoading(true);
    setAiError(null);
    
    abortControllerRef.current = new AbortController();

    try {
      const state = useStore.getState();
      const cutoff = Date.now() - aiPeriod * 24 * 60 * 60 * 1000;
      
      const rescheduleCounts = {};
      state.activityLogs.forEach(log => {
        if (log.timestamp >= cutoff && log.type === 'rescheduled') {
          rescheduleCounts[log.taskId] = (rescheduleCounts[log.taskId] || 0) + 1;
        }
      });

      const payload = { completed: [], stuck: [] };
      Object.values(state.byId).forEach(task => {
        if (task.done && task.completedAt >= cutoff) {
          payload.completed.push({ title: task.title });
        } else if (!task.done && task.status === 'active' && rescheduleCounts[task.id]) {
          payload.stuck.push({ title: task.title, times: rescheduleCounts[task.id] });
        }
      });

      const responseData = await generateAnalyticsWithAI(payload, aiPeriod, apiKey, abortControllerRef.current.signal);
      setAiAnalyticsCache(aiPeriod, responseData);
      triggerSuccess();
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
      triggerWarning();
      if (err instanceof MissingApiKeyError) {
        updateUI({ showSettings: true });
      } else {
        setAiError(err.message || 'Не удалось сгенерировать аналитику');
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const currentAiData = getCachedData(aiPeriod);
  const hasValidData = currentAiData?.success || currentAiData?.bottleneck || currentAiData?.action;

  return (
    <div className="space-y-4">
      {/* ── Блок AI-Аналитики ───────────────────────── */}
      <div className="bg-stone-900 border-2 border-violet-900/50 rounded-2xl p-4 shadow-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xs font-black text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
            <Bot className="w-4 h-4" /> AI-Радар
          </h2>
          <div className="flex bg-stone-950 border border-stone-800 rounded-lg overflow-hidden">
            {[1, 3, 7].map(p => (
              <button
                key={p}
                onClick={() => { triggerLightImpact(); setAiPeriod(p); }}
                className={`px-3 py-1 text-[9px] font-black uppercase transition-colors ${aiPeriod === p ? 'bg-violet-900/50 text-violet-300' : 'text-stone-500 hover:text-stone-300'}`}
              >
                {p} дн
              </button>
            ))}
          </div>
        </div>

        {/* Контент или заглушка */}
        <div className="min-h-[120px] flex flex-col justify-center">
          {isAiLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-16 bg-stone-800 rounded-xl"></div>
              <div className="h-16 bg-stone-800 rounded-xl"></div>
              <div className="h-16 bg-stone-800 rounded-xl"></div>
            </div>
          ) : aiError ? (
            <div className="text-center py-6 bg-red-950/20 border border-red-900/50 rounded-xl px-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
              <p className="text-[10px] text-red-400 font-bold mb-4">{aiError}</p>
              <button
                onClick={handleGenerateAI}
                className="bg-red-900/40 border border-red-700 text-red-300 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-800/60 transition-all"
              >
                Повторить
              </button>
            </div>
          ) : (!currentAiData || !hasValidData) ? (
            <div className="text-center py-6">
              <button
                onClick={handleGenerateAI}
                className="bg-violet-900/50 border border-violet-700 text-violet-300 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-800/60 transition-all shadow-[0_0_15px_rgba(139,92,246,0.2)]"
              >
                Запросить анализ ({aiPeriod} дн)
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {currentAiData?.success && (
                <div className="bg-emerald-950/20 border border-emerald-900/50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Главный успех</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed font-medium">{currentAiData.success}</p>
                </div>
              )}
              {currentAiData?.bottleneck && (
                <div className="bg-red-950/20 border border-red-900/50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Узкое горлышко</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed font-medium">{currentAiData.bottleneck}</p>
                </div>
              )}
              {currentAiData?.action && (
                <div className="bg-amber-950/20 border border-amber-900/50 p-3 rounded-xl">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Директивное действие</span>
                  </div>
                  <p className="text-xs text-stone-300 leading-relaxed font-black">{currentAiData.action}</p>
                </div>
              )}
              
              <div className="flex justify-end pt-2">
                 <button
                   onClick={handleGenerateAI}
                   className="text-[9px] font-black text-stone-500 hover:text-stone-300 uppercase tracking-widest transition-colors flex items-center gap-1"
                 >
                   <Bot className="w-3 h-3" /> Перестроить
                 </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AnalyticsBlock title="Сегодня"    data={day}   goal={goals.daily}   />
      <AnalyticsBlock title="Эта неделя" data={week}  goal={goals.weekly}  />
      <AnalyticsBlock title="Этот месяц" data={month} goal={goals.monthly} />
    </div>
  );
});

AnalyticsView.displayName = 'AnalyticsView';
