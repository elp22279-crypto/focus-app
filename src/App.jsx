// src/App.jsx
// ── Тонкий корневой компонент. Только layout + маршрутизация вьюх + глобальные модалки.
// ── Вся бизнес-логика и подписки на стор — в дочерних компонентах.
import React, { memo, useCallback, useMemo, useEffect } from 'react';
import { Plus, CheckSquare, Layers, PieChart } from 'lucide-react';

import { useStore }          from './store/useStore.js';
import { useShallow }        from 'zustand/react/shallow';
import { syncNotifications } from './utils/notifications.js';

import { ErrorBoundary }   from './components/ErrorBoundary.jsx';
import { AppHeader }       from './components/AppHeader.jsx';
import { DailyView }       from './components/DailyView.jsx';
import { BacklogView }     from './components/BacklogView.jsx';
import { AnalyticsView }   from './components/AnalyticsView.jsx';
import { OverdueModal }    from './components/OverdueModal.jsx';
import { BottomActionBar } from './components/BottomActionBar.jsx';
import { UndoSnackbar }    from './components/UndoSnackbar.jsx';
import { TaskEditor }      from './components/TaskEditor.jsx';
import { SettingsModal }   from './components/SettingsModal.jsx';

// ── Синхронизация уведомлений (не рендерит ничего) ───────────────────────────
const NotificationSync = memo(() => {
  const byId = useStore(state => state.byId);
  useEffect(() => { syncNotifications(byId); }, [byId]);
  return null;
});
NotificationSync.displayName = 'NotificationSync';

// ── Нижняя навигация ─────────────────────────────────────────────────────────
const AppNav = memo(() => {
  const activeTab = useStore(state => state.ui.activeTab);
  const updateUI  = useStore(state => state.updateUI);

  const toDaily    = useCallback(() => updateUI({ activeTab: 'daily' }),     [updateUI]);
  const toBacklog  = useCallback(() => updateUI({ activeTab: 'backlog' }),   [updateUI]);
  const toAnalytics = useCallback(() => updateUI({ activeTab: 'analytics' }), [updateUI]);

  return (
    <nav className="h-20 bg-stone-900 border-t-2 border-stone-800 flex justify-around items-center px-6 sticky bottom-0 z-30">
      <button onClick={toDaily}    className={`flex flex-col items-center gap-1.5 ${activeTab === 'daily'     ? 'text-amber-500' : 'text-stone-600'}`}>
        <CheckSquare className="w-6 h-6" />
        <span className="text-[8px] font-black uppercase tracking-widest">Фокус</span>
      </button>
      <button onClick={toBacklog}  className={`flex flex-col items-center gap-1.5 ${activeTab === 'backlog'   ? 'text-amber-500' : 'text-stone-600'}`}>
        <Layers className="w-6 h-6" />
        <span className="text-[8px] font-black uppercase tracking-widest">База</span>
      </button>
      <button onClick={toAnalytics} className={`flex flex-col items-center gap-1.5 ${activeTab === 'analytics' ? 'text-amber-500' : 'text-stone-600'}`}>
        <PieChart className="w-6 h-6" />
        <span className="text-[8px] font-black uppercase tracking-widest">Радар</span>
      </button>
    </nav>
  );
});
AppNav.displayName = 'AppNav';

// ── FAB — кнопка добавления задачи ───────────────────────────────────────────
const AddTaskFab = memo(() => {
  const activeTab    = useStore(state => state.ui.activeTab);
  const selectedDate = useStore(state => state.ui.selectedDate);
  const isSelecting  = useStore(state => (state.ui.selectedTaskIds?.length ?? 0) > 0);
  const addTask      = useStore(state => state.addTask);

  const handleAdd = useCallback(() => {
    addTask({
      status: activeTab === 'daily' ? 'active' : 'backlog',
      date:   activeTab === 'daily' ? selectedDate : null,
    });
  }, [addTask, activeTab, selectedDate]);

  if (isSelecting) return null;

  return (
    <button
      id="add-task-fab"
      onClick={handleAdd}
      className="fixed bottom-24 right-6 w-16 h-16 bg-gradient-to-b from-amber-400 to-amber-700 text-stone-950 rounded-full border-2 border-amber-900 flex items-center justify-center active:scale-90 transition-all z-40"
    >
      <Plus className="w-8 h-8" />
    </button>
  );
});
AddTaskFab.displayName = 'AddTaskFab';

// ── Главный контейнер ────────────────────────────────────────────────────────
const FocusApp = memo(() => {
  const activeTab    = useStore(state => state.ui.activeTab);
  const editingNodeId = useStore(state => state.ui.editingNodeId);
  const showSettings = useStore(state => state.ui.showSettings);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="flex flex-col h-screen bg-stone-950 text-stone-300 max-w-md mx-auto overflow-hidden font-sans border-x border-stone-800 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative">

      <AppHeader today={today} />

      <main className="flex-1 overflow-y-auto p-4 pb-28 relative">
        {activeTab === 'daily'     && <DailyView />}
        {activeTab === 'backlog'   && <BacklogView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>

      {/* ── Глобальные оверлеи ────────────────────────────────────────── */}
      <OverdueModal today={today} />
      {editingNodeId && <TaskEditor />}
      <BottomActionBar />
      <UndoSnackbar />
      {showSettings && <SettingsModal />}

      {/* ── Плавающие элементы ────────────────────────────────────────── */}
      <AddTaskFab />
      <AppNav />
    </div>
  );
});
FocusApp.displayName = 'FocusApp';

// ── Корень ───────────────────────────────────────────────────────────────────
export default function App() {
  const _hasHydrated = useStore(state => state._hasHydrated);

  if (!_hasHydrated) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-950">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <NotificationSync />
      <FocusApp />
    </ErrorBoundary>
  );
}