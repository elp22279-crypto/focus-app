// src/App.jsx
import { SettingsModal } from './components/SettingsModal.jsx';
import React, { useMemo } from 'react';
import { 
  Plus, ChevronRight, ChevronLeft, Settings, Clock, CalendarDays, X, Hash, 
  CheckSquare, Layers, PieChart, Target, AlertTriangle, Inbox, CheckCircle2
} from 'lucide-react';

import { useStore } from './store/useStore.js';
import { useDailyIds, useBacklogIds, useAnalyticsData } from './store/selectors.js';
import { formatHeaderDate } from './utils/helpers.js';
import { PRIORITIES, TIME_BLOCKS } from './utils/constants.js';
import { useShallow } from 'zustand/react/shallow';
import { syncNotifications } from './utils/notifications.js';

import { TaskItem } from './components/TaskItem.jsx';
import { TaskEditor } from './components/TaskEditor.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

// --- ИЗОЛИРОВАННЫЕ ВЬЮШКИ ---

const DailyView = () => {
  const dailyIds = useDailyIds();
  const sortMode = useStore(state => state.ui.sortMode);
  const byId = useStore(state => state.byId);

  if (sortMode === 'time') {
    return TIME_BLOCKS.map(block => {
      const bIds = dailyIds.filter(id => block.check(byId[id]?.time));
      if (!bIds.length) return null;
      return (
        <div key={block.id} className="mb-6">
          <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {block.label}</h3>
          {bIds.map(id => <TaskItem key={id} id={id} />)}
        </div>
      );
    });
  }

  if (sortMode === 'priority') {
    return Object.entries(PRIORITIES).map(([pKey, pVal]) => {
      const pIds = dailyIds.filter(id => byId[id]?.priority === pKey);
      if (!pIds.length) return null;
      return (
        <div key={pKey} className="mb-6">
          <h3 className={`text-[10px] font-black uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1 flex items-center gap-1 ${pVal.color}`}><Target className="w-3 h-3" /> {pVal.label}</h3>
          {pIds.map(id => <TaskItem key={id} id={id} />)}
        </div>
      );
    });
  }

  return dailyIds.map(id => <TaskItem key={id} id={id} />);
};

const BacklogView = () => {
  const viewIds = useBacklogIds();
  const baseViewMode = useStore(state => state.ui.baseViewMode);
  const categories = useStore(state => state.categories);
  const byId = useStore(state => state.byId);
  const { baseFilterDate, baseFilterDeadline } = useStore(state => state.ui);

  if (baseViewMode === 'completed') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-emerald-500 uppercase px-2 mb-4"><CheckCircle2 className="inline w-4 h-4 mr-1"/> Выполненные ({viewIds.length})</div>
        {viewIds.map(id => <TaskItem key={id} id={id} flatMode forceExpanded={false} />)}
      </div>
    );
  }

  if (baseViewMode === 'unallocated') {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-blue-500 uppercase px-2 mb-4"><Inbox className="inline w-4 h-4 mr-1"/> Без дат ({viewIds.length})</div>
        {viewIds.map(id => <TaskItem key={id} id={id} />)}
      </div>
    );
  }

  if (baseFilterDate || baseFilterDeadline) {
    return (
      <div className="space-y-2 mt-4">
        <div className="text-[10px] font-black text-amber-500 uppercase px-2 mb-4">Результаты поиска ({viewIds.length})</div>
        {viewIds.map(id => <TaskItem key={id} id={id} flatMode />)}
      </div>
    );
  }

  // Изолируем задачи без категории (Общее)
  const uncategorizedIds = viewIds.filter(id => !byId[id]?.category);

  return (
    <div className="space-y-6 mt-4">
      {uncategorizedIds.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1"><Hash className="inline w-3 h-3 text-stone-600 mr-1"/> Общее</h3>
          {uncategorizedIds.map(id => <TaskItem key={id} id={id} />)}
        </div>
      )}
      {categories.map(cat => {
        const catIds = viewIds.filter(id => byId[id]?.category === cat);
        if (!catIds.length) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="text-[10px] font-black text-stone-400 uppercase tracking-widest px-2 mb-2 border-b border-stone-800 pb-1"><Hash className="inline w-3 h-3 text-amber-600 mr-1"/> {cat}</h3>
            {catIds.map(id => <TaskItem key={id} id={id} />)}
          </div>
        );
      })}
    </div>
  );
};

const AnalyticsBlock = ({ title, data, goal }) => {
  const pct = Math.min((data.points / goal) * 100, 100) || 0;
  return (
    <div className="bg-stone-800 p-5 rounded-xl border border-stone-700 shadow-md mb-4 relative overflow-hidden">
      <div className="flex justify-between items-end mb-4 relative z-10"><h3 className="text-xs font-black text-amber-500 uppercase tracking-widest">{title}</h3><span className="text-[10px] font-bold text-stone-400">Цель: {goal} Б</span></div>
      <div className="flex items-center gap-4 mb-2 relative z-10">
        <div className="relative w-16 h-16 flex-shrink-0 drop-shadow-[0_0_8px_rgba(217,119,6,0.3)]">
          <svg className="w-full h-full transform -rotate-90"><circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-stone-700" /><circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray="175" strokeDashoffset={175 - (175 * pct) / 100} className="text-amber-500 transition-all duration-1000" /></svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col"><span className="text-sm font-black text-amber-500 drop-shadow-md">{data.points}</span></div>
        </div>
        <div className="flex-1 grid grid-cols-3 gap-2">
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner"><div className="text-xs font-black text-emerald-500">{data.completed}</div><div className="text-[8px] font-bold text-stone-500 uppercase">Сделано</div></div>
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner"><div className="text-xs font-black text-amber-500">{data.rescheduled}</div><div className="text-[8px] font-bold text-stone-500 uppercase">Перенос</div></div>
          <div className="bg-stone-900 p-2 rounded-lg border border-stone-700 text-center shadow-inner"><div className="text-xs font-black text-red-500">{data.deleted}</div><div className="text-[8px] font-bold text-stone-500 uppercase">Удалено</div></div>
        </div>
      </div>
    </div>
  );
};

const AnalyticsView = () => {
  const goals = useStore(state => state.settings.goals);
  const day = useAnalyticsData(1); 
  const week = useAnalyticsData(7); 
  const month = useAnalyticsData(30);

  return <div className="space-y-4"><AnalyticsBlock title="Сегодня" data={day} goal={goals.daily}/><AnalyticsBlock title="Эта неделя" data={week} goal={goals.weekly}/><AnalyticsBlock title="Этот месяц" data={month} goal={goals.monthly}/></div>;
};

// --- ГЛАВНЫЙ КОНТЕЙНЕР ---

const MultiSelectPanel = () => {
  const { selectedTaskIds } = useStore(state => state.ui);
  const clearTaskSelection = useStore(state => state.clearTaskSelection);
  const updateMultipleTasks = useStore(state => state.updateMultipleTasks);
  
  const [payload, setPayload] = React.useState({ priority: '', estimateHours: '', estimateMins: '', date: '' });

  if (!selectedTaskIds || selectedTaskIds.length === 0) return null;

  const handleApply = () => {
    const updatePayload = {};
    if (payload.priority) updatePayload.priority = payload.priority;
    if (payload.date) {
      updatePayload.date = payload.date;
      updatePayload.status = 'active'; // Если ставим дату, переносим в активные
    }
    if (payload.estimateHours !== '' || payload.estimateMins !== '') {
      const h = parseInt(payload.estimateHours || 0);
      const m = parseInt(payload.estimateMins || 0);
      updatePayload.estimate = h + (m / 60);
    }
    
    if (Object.keys(updatePayload).length > 0) {
      updateMultipleTasks(selectedTaskIds, updatePayload);
    }
    setPayload({ priority: '', estimateHours: '', estimateMins: '', date: '' });
  };

  return (
    <div className="fixed bottom-24 left-4 right-4 bg-stone-900 border-2 border-amber-600 rounded-2xl shadow-[0_10px_40px_rgba(217,119,6,0.3)] z-50 overflow-hidden animate-in slide-in-from-bottom-5">
      <div className="flex justify-between items-center p-3 bg-stone-800 border-b border-stone-700">
        <span className="text-xs font-black text-amber-500 uppercase tracking-widest flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Выбрано: {selectedTaskIds.length}</span>
        <button onClick={clearTaskSelection} className="p-1 text-stone-400 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
           <select className="bg-stone-950 border border-stone-700 rounded-lg p-2 text-[10px] font-bold text-stone-300 outline-none" value={payload.priority} onChange={e => setPayload({...payload, priority: e.target.value})}>
             <option value="">Без приоритета</option>
             {Object.entries(PRIORITIES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
           </select>
           <input type="date" className="bg-stone-950 border border-stone-700 rounded-lg p-2 text-[10px] font-bold text-stone-300 outline-none" value={payload.date} onChange={e => setPayload({...payload, date: e.target.value})} />
        </div>
        
        <div className="flex gap-2">
           <input type="number" placeholder="Часы" className="flex-1 bg-stone-950 border border-stone-700 rounded-lg p-2 text-[10px] font-bold text-stone-300 text-center outline-none" value={payload.estimateHours} onChange={e => setPayload({...payload, estimateHours: e.target.value})} />
           <input type="number" placeholder="Мин" className="flex-1 bg-stone-950 border border-stone-700 rounded-lg p-2 text-[10px] font-bold text-stone-300 text-center outline-none" step="5" value={payload.estimateMins} onChange={e => setPayload({...payload, estimateMins: e.target.value})} />
        </div>
        
        <button onClick={handleApply} className="w-full bg-gradient-to-r from-amber-600 to-amber-500 text-stone-950 font-black uppercase tracking-widest text-xs p-3 rounded-lg mt-2 active:scale-95 transition-transform">
          Применить ко всем
        </button>
      </div>
    </div>
  );
};

const FocusApp = () => {
  const { activeTab, selectedDate, showSettings, showOverdue, editingNodeId, sortMode } = useStore(state => state.ui);
  const updateUI = useStore(state => state.updateUI);
  const dailyLimit = useStore(state => state.settings.dailyLimit);
  const addTask = useStore(state => state.addTask);
  const triageTask = useStore(state => state.triageTask);
  
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  
  // ИСПРАВЛЕНИЕ: Проверка долгов по всей базе задач
  const overdueIds = useStore(useShallow(state => 
    Object.keys(state.byId).filter(id => {
      const t = state.byId[id];
      return t && t.status === 'active' && t.date && t.date < today && !t.done;
    })
  ));

  const loadMetrics = useStore(useShallow(state => {
    let totalLoad = 0;
    // Используем ту же логику, что в useDailyIds, чтобы не считать часы дважды
    const visibleIds = Object.keys(state.byId).filter(id => {
      const t = state.byId[id];
      if (!t || t.done || t.status !== 'active' || t.date !== selectedDate) return false;
      if (t.parentId && state.byId[t.parentId]?.date === selectedDate) return false;
      return true;
    });

    visibleIds.forEach(id => {
      const task = state.byId[id];
      // Считаем нагрузку всей ветки (включая подзадачи)
      const calcBranchLoad = (nodeId) => {
        const node = state.byId[nodeId];
        if (!node || node.done) return 0;
        if (!node.childrenIds?.length) return node.estimate || 0;
        return (node.estimate || 0) + node.childrenIds.reduce((acc, cId) => acc + calcBranchLoad(cId), 0);
      };
      totalLoad += calcBranchLoad(id);
    });

    return { load: totalLoad, percentage: Math.min((totalLoad / dailyLimit) * 100, 100) };
  }));

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-300 max-w-md mx-auto overflow-hidden font-sans border-x border-stone-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">
      <header className="bg-stone-900 p-4 border-b-2 border-stone-800 shadow-md relative z-20">
        <div className="flex justify-between items-center mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="bg-stone-800 p-2 rounded-lg border border-stone-700 shadow-inner relative">
              <CalendarDays className="w-4 h-4 text-stone-400" />
              {overdueIds.length > 0 && <div className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{overdueIds.length}</div>}
            </div>
            <h1 className="text-xl font-serif font-medium text-stone-300 uppercase tracking-[0.2em]">Фокус</h1>
          </div>
          <div className="flex gap-2 items-center">
            {overdueIds.length > 0 && <button onClick={() => updateUI({showOverdue: true})} className="bg-red-950 border border-red-800 text-red-500 text-[9px] font-black px-2 py-2 rounded-lg uppercase">Долги</button>}
            {activeTab === 'daily' && (
              <select value={sortMode} onChange={e => updateUI({sortMode: e.target.value})} className="bg-stone-800 text-amber-500 border border-stone-700 text-[9px] font-black uppercase tracking-widest px-2 py-2 rounded-lg outline-none cursor-pointer">
                <option value="none">Порядок</option><option value="time">Время</option><option value="priority">Приоритет</option>
              </select>
            )}
            <button onClick={() => updateUI({showSettings: !showSettings})} className="p-2 bg-stone-800 border border-stone-700 rounded-full"><Settings className="w-4 h-4 text-stone-400" /></button>
          </div>
        </div>

        {activeTab === 'daily' && (
          <>
            <div className="flex justify-between items-center bg-stone-800 rounded-lg p-1.5 mb-4 border border-stone-700">
              <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); updateUI({selectedDate: d.toISOString().split('T')[0]}); }} className="p-1"><ChevronLeft className="w-5 h-5 text-stone-500" /></button>
              <div className="text-[11px] font-black text-stone-300 uppercase tracking-widest leading-6">{selectedDate === today ? 'СЕГОДНЯ' : formatHeaderDate(selectedDate)}</div>
              <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); updateUI({selectedDate: d.toISOString().split('T')[0]}); }} className="p-1"><ChevronRight className="w-5 h-5 text-stone-500" /></button>
            </div>
            <div className="bg-stone-950 p-2 rounded-xl border-2 border-stone-800">
              <div className="flex justify-between text-[9px] font-black text-stone-500 mb-2 uppercase tracking-widest px-1">
                <span className={loadMetrics.load > dailyLimit ? 'text-red-500' : 'text-purple-400'}>ОСТАТОК: {Number(loadMetrics.load.toFixed(2))}ч</span>
                <span className="text-amber-600">ПЛАН: {dailyLimit}ч</span>
              </div>
              <div className="h-3 w-full bg-stone-900 rounded-full overflow-hidden border border-stone-800 relative">
                <div className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ${loadMetrics.load > dailyLimit ? 'bg-gradient-to-r from-red-800 to-red-500' : 'bg-gradient-to-r from-purple-800 to-purple-400'}`} style={{ width: `${loadMetrics.percentage}%` }} />
              </div>
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 pb-28 relative">
        {activeTab === 'daily' && <DailyView />}
        {activeTab === 'backlog' && <BacklogView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>

      {showOverdue && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-end justify-center">
          <div className="bg-stone-900 w-full max-w-md h-[80vh] rounded-t-[2.5rem] border-t-2 border-red-900 p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-6"><h2 className="text-red-500 font-black uppercase text-sm flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> Триаж долгов</h2><button onClick={() => updateUI({showOverdue: false})} className="p-2 bg-stone-800 border border-stone-700 rounded-full"><X className="w-5 h-5 text-stone-400"/></button></div>
            <div className="space-y-3 pb-10">
              {overdueIds.map(id => {
                const node = useStore.getState().byId[id];
                return (
                  <div key={id} className="bg-stone-800 p-4 rounded-xl border border-red-900/50 flex flex-col gap-3">
                    <div className="text-sm font-bold text-stone-200">{node.title}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => triageTask(id, 'today')} className="text-[9px] font-black bg-stone-950 p-3 rounded-lg uppercase text-amber-500 border border-stone-800">Сегодня</button>
                      <button onClick={() => triageTask(id, 'backlog')} className="text-[9px] font-black bg-stone-950 p-3 rounded-lg uppercase text-stone-400 border border-stone-800">В базу</button>
                      <button onClick={() => triageTask(id, 'delete')} className="text-[9px] font-black bg-red-950 p-3 rounded-lg uppercase text-red-500 border border-red-900">Списать</button>
                    </div>
                  </div>
                );
              })}
              {overdueIds.length === 0 && <div className="text-center text-stone-500 py-20 italic font-bold">Все долги закрыты.</div>}
            </div>
          </div>
        </div>
      )}

      {editingNodeId && <TaskEditor />}
      <MultiSelectPanel />


   {showSettings && <SettingsModal />}

      <button onClick={() => addTask({ status: activeTab === 'daily' ? 'active' : 'backlog', date: activeTab === 'daily' ? selectedDate : null })} className="fixed bottom-24 right-6 w-16 h-16 bg-gradient-to-b from-amber-400 to-amber-700 text-stone-950 rounded-full border-2 border-amber-900 flex items-center justify-center active:scale-90 transition-all z-40"><Plus className="w-8 h-8" /></button>
      
      <nav className="h-20 bg-stone-900 border-t-2 border-stone-800 flex justify-around items-center px-6 sticky bottom-0 z-30">
        <button onClick={() => updateUI({activeTab: 'daily'})} className={`flex flex-col items-center gap-1.5 ${activeTab === 'daily' ? 'text-amber-500' : 'text-stone-600'}`}><CheckSquare className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-widest">Фокус</span></button>
        <button onClick={() => updateUI({activeTab: 'backlog'})} className={`flex flex-col items-center gap-1.5 ${activeTab === 'backlog' ? 'text-amber-500' : 'text-stone-600'}`}><Layers className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-widest">База</span></button>
        <button onClick={() => updateUI({activeTab: 'analytics'})} className={`flex flex-col items-center gap-1.5 ${activeTab === 'analytics' ? 'text-amber-500' : 'text-stone-600'}`}><PieChart className="w-6 h-6" /><span className="text-[8px] font-black uppercase tracking-widest">Радар</span></button>
      </nav>
    </div>
  );
};

const NotificationSync = () => {
  const byId = useStore(state => state.byId);
  
  React.useEffect(() => {
    syncNotifications(byId);
  }, [byId]);

  return null;
};

export default function App() {
  return (
    <ErrorBoundary>
      <NotificationSync />
      <FocusApp />
    </ErrorBoundary>
  );
}