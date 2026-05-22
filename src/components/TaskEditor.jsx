// src/components/TaskEditor.jsx
import React, { useState, useEffect } from 'react';
import {
  X, ArrowLeft, BarChart3, Repeat, Plus, Edit2, Trash2, Bot,
  CalendarDays, Target, FolderOpen, Clock, ChevronRight, Search, Copy, Hash
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useNodeProgress } from '../store/selectors.js';
import { PRIORITIES } from '../utils/constants.js';
import { calculatePoints } from '../utils/helpers.js';
import { generateSubtasksWithAI, MissingApiKeyError } from '../utils/ai.js';
import { triggerLightImpact, triggerMediumImpact, triggerSuccess, triggerWarning } from '../utils/haptics.js';
import { Toast } from '@capacitor/toast';
import { getTaskPath } from '../utils/graphUtils.js';

const getDescendants = (id, byId) => {
  const t = byId[id];
  if (!t || !t.childrenIds?.length) return [];
  let res = [...t.childrenIds];
  t.childrenIds.forEach(c => res.push(...getDescendants(c, byId)));
  return res;
};

// ── Вспомогательный компонент: кнопка-пилюля тулбара ──────────────────────
const ToolPill = ({ icon: Icon, label, value, active, onClick, accent = 'amber' }) => {
  const colors = {
    amber: active ? 'bg-amber-900/60 border-amber-700 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600',
    red:   active ? 'bg-red-900/50  border-red-700   text-red-300'   : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600',
    blue:  active ? 'bg-blue-900/50 border-blue-700  text-blue-300'  : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600',
    violet:active ? 'bg-violet-900/50 border-violet-700 text-violet-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wide whitespace-nowrap flex-shrink-0 transition-all ${colors[accent]}`}
    >
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="max-w-[80px] truncate">{value || label}</span>
      <ChevronRight className="w-2.5 h-2.5 opacity-40 flex-shrink-0" />
    </button>
  );
};

// ── Заголовок inline-меню с крестиком ─────────────────────────────────────
const MenuHeader = ({ title, onClose }) => (
  <div className="flex items-center justify-between flex-shrink-0 pr-1">
    <span className="text-[9px] font-black text-stone-500 uppercase tracking-widest">{title}</span>
    <button
      onClick={onClose}
      className="p-1 rounded-full bg-stone-700 hover:bg-stone-600 transition-colors flex-shrink-0"
    >
      <X className="w-3 h-3 text-stone-400" />
    </button>
  </div>
);

// ══════════════════════════════════════════════════════════════════════════════
export const TaskEditor = () => {
  const { editingNodeId } = useStore(state => state.ui);
  const task = useStore(state => state.byId[editingNodeId]);
  const updateTask  = useStore(state => state.updateTask);
  const updateUI    = useStore(state => state.updateUI);
  const deleteTask  = useStore(state => state.deleteTask);
  const addTask     = useStore(state => state.addTask);
  const addTasksBatch = useStore(state => state.addTasksBatch);
  const categories  = useStore(state => state.categories);
  const tags        = useStore(state => state.tags || []);
  const graphVersion = useStore(state => state.graphVersion);
  
  const abortControllerRef = React.useRef(null);
  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const prog = useNodeProgress(editingNodeId);

  const [draft, setDraft] = useState(() => {
    if (task) {
      if (!task.description) {
        return { ...task, description: "Зачем:\n\nРезультат:\n\nДоп. инфо:\n" };
      }
      return task;
    }
    return {};
  });
  const [newSubTitle, setNewSubTitle] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isParentModalOpen, setIsParentModalOpen] = useState(false);
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false);
  const [parentSearchQuery, setParentSearchQuery] = useState('');
  // 'none' | 'date' | 'priority' | 'project'
  const [activeMenu, setActiveMenu] = useState('none');

  useEffect(() => {
    if (task) {
      if (!task.description) {
        setDraft({ ...task, description: "Зачем:\n\nРезультат:\n\nДоп. инфо:\n" });
      } else {
        setDraft(task);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId]);

  // Сбрасываем меню при смене задачи
  useEffect(() => { setActiveMenu('none'); }, [task?.id]);

  if (!task) return null;

  const toggleMenu = (name) => { triggerLightImpact(); setActiveMenu(prev => prev === name ? 'none' : name); };
  const closeMenu  = () => { triggerLightImpact(); setActiveMenu('none'); };

  const saveCurrentTask = () => {
    if (!draft.title?.trim()) { triggerWarning(); deleteTask(task.id); return false; }
    const { childrenIds, ...payload } = draft;
    updateTask(task.id, payload);
    return true;
  };

  const navigateToNode = (id) => { saveCurrentTask(); triggerLightImpact(); updateUI({ editingNodeId: id }); };
  const saveAndClose   = () => { const ok = saveCurrentTask(); if (ok) triggerSuccess(); updateUI({ editingNodeId: null }); };

  const handleSubtaskAdd = () => {
    if (!newSubTitle.trim()) { triggerWarning(); return; }
    if (draft.title?.trim()) { const { childrenIds, ...p } = draft; updateTask(task.id, p); }
    addTask({ title: newSubTitle.trim(), parentId: task.id,
      status: draft.status || task.status, date: draft.date || task.date,
      priority: draft.priority || task.priority, skipEdit: true });
    triggerLightImpact();
    setNewSubTitle('');
  };

  const handleAIGeneration = async () => {
    if (!draft.title?.trim() || isAiLoading) return;
    triggerLightImpact();
    setIsAiLoading(true);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const apiKey = useStore.getState().apiKey;
      const generatedTasks = await generateSubtasksWithAI(draft.title, apiKey, abortControllerRef.current.signal);
      
      if (generatedTasks?.length > 0) {
        triggerSuccess();
        const tasksPayload = generatedTasks.map(st => ({
          title: st.title, estimate: st.estimate || 0, priority: st.priority || 'nn',
          status: draft.status || task.status,
          date: draft.date || task.date
        }));
        addTasksBatch(tasksPayload, task.id);
      } else { 
        triggerWarning(); 
        await Toast.show({ text: 'Не удалось сгенерировать подзадачи. Повторите попытку.', duration: 'long' }); 
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        // Тихо игнорируем, допуская выполнение блока finally
      } else if (err instanceof MissingApiKeyError) {
        triggerWarning(); saveCurrentTask(); updateUI({ editingNodeId: null, showSettings: true });
      } else { 
        triggerWarning(); 
        await Toast.show({ text: err.message || 'Сбой генерации ИИ', duration: 'long' }); 
      }
    } finally { setIsAiLoading(false); }
  };

  const filteredParents = React.useMemo(() => {
    if (!isParentModalOpen) return [];
    const state = useStore.getState();
    const descendants = getDescendants(task.id, state.byId);
    const valid = Object.values(state.byId).filter(n => n.id !== task.id && !descendants.includes(n.id));
    if (parentSearchQuery.trim()) {
      return valid.filter(p => p.title.toLowerCase().includes(parentSearchQuery.toLowerCase()));
    }
    return valid;
  }, [task.id, parentSearchQuery, isParentModalOpen, graphVersion]);

  const totalMins = Math.round((draft.estimate || 0) * 60);
  const estHours  = Math.floor(totalMins / 60);
  const estMins   = totalMins % 60;

  const PRIORITY_LABELS = { ui: 'Важно+Срочно', in: 'Важно', un: 'Срочно', nn: 'Обычное' };
  const PRIORITY_ACCENT = { ui: 'red', in: 'amber', un: 'blue', nn: 'amber' };
  const currentPriority = PRIORITIES[draft.priority];

  // ── Рендер-функции inline-меню ───────────────────────────────────────────

  const renderDateMenu = () => (
    <div className="flex flex-col gap-2 w-full">
      <MenuHeader title="Дата и время" onClose={closeMenu} />
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {/* Быстрые даты */}
        {[
          { label: 'Сегодня', days: 0 },
          { label: 'Завтра',  days: 1 },
          { label: 'Сброс',   days: null },
        ].map(({ label, days }) => {
          let target = null;
          if (days !== null) {
            const d = new Date(); d.setDate(d.getDate() + days);
            target = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          }
          const isActive = draft.date === target && target !== null;
          return (
            <button
              key={label}
              onClick={() => { triggerLightImpact(); setDraft({ ...draft, date: target, status: target ? 'active' : 'backlog' }); closeMenu(); }}
              className={`px-3 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap flex-shrink-0 transition-all ${
                isActive ? 'bg-amber-900/60 border-amber-700 text-amber-300'
                         : days === null ? 'bg-stone-900 border-red-900/50 text-red-400'
                         : 'bg-stone-900 border-stone-700 text-stone-300 hover:border-stone-600'
              }`}
            >{label}</button>
          );
        })}
        {/* Произвольная дата */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="date"
            className="bg-stone-900 border border-stone-700 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-300 outline-none focus:border-amber-700 cursor-pointer"
            value={draft.date || ''}
            onClick={e => e.target.showPicker && e.target.showPicker()}
            onChange={e => { setDraft({ ...draft, date: e.target.value, status: e.target.value ? 'active' : 'backlog' }); }}
          />
        </div>
        {/* Дедлайн */}
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
          <span className="text-[9px] text-red-500 font-black whitespace-nowrap">Дедлайн:</span>
          <input
            type="date"
            className="bg-stone-900 border border-red-900 rounded-xl px-2 py-1.5 text-[10px] font-bold text-red-400 outline-none focus:border-red-600 cursor-pointer"
            value={draft.deadline || ''}
            onClick={e => e.target.showPicker && e.target.showPicker()}
            onChange={e => setDraft({ ...draft, deadline: e.target.value })}
          />
        </div>
        {/* Время */}
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
          <Clock className="w-3 h-3 text-stone-500 flex-shrink-0" />
          <input
            type="time"
            className="bg-stone-900 border border-stone-700 rounded-xl px-2 py-1.5 text-[10px] font-bold text-amber-400 outline-none focus:border-amber-700 cursor-pointer"
            value={draft.time || ''}
            onClick={e => e.target.showPicker && e.target.showPicker()}
            onChange={e => setDraft({ ...draft, time: e.target.value })}
          />
        </div>
      </div>
    </div>
  );

  const renderPriorityMenu = () => (
    <div className="flex flex-col gap-2 w-full">
      <MenuHeader title="Приоритет" onClose={closeMenu} />
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {Object.entries(PRIORITIES).map(([key, p]) => (
          <button
            key={key}
            onClick={() => { triggerLightImpact(); setDraft({ ...draft, priority: key }); closeMenu(); }}
            className={`px-3 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap flex-shrink-0 transition-all ${
              draft.priority === key
                ? `${p.bg} ${p.border} ${p.color}`
                : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-600'
            }`}
          >{p.label}</button>
        ))}
      </div>
    </div>
  );

  const renderProjectMenu = () => (
    <div className="flex flex-col gap-2 w-full">
      <MenuHeader title="Проект / Родитель" onClose={closeMenu} />
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => { triggerLightImpact(); setIsParentModalOpen(true); }}
          className={`px-3 py-2 rounded-xl border text-[10px] font-black whitespace-nowrap flex-shrink-0 max-w-[140px] truncate transition-all ${
            draft.parentId ? 'bg-violet-900/50 border-violet-700 text-violet-300' : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-600'
          }`}
        >
          {draft.parentId ? useStore.getState().byId[draft.parentId]?.title : '— Без родителя'}
        </button>
        {/* Теги */}
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
          <Hash className="w-3 h-3 text-stone-500 flex-shrink-0" />
          <button
            onClick={() => { triggerLightImpact(); setIsTagsModalOpen(true); }}
            className={`px-3 py-1.5 rounded-xl border text-[10px] font-bold ${
              draft.tags?.length ? 'bg-amber-900/50 border-amber-700 text-amber-300' : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-600'
            }`}
          >
            {draft.tags?.length ? `Теги: ${draft.tags.length}` : 'Без тегов'}
          </button>
        </div>
        {/* Категория */}
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
          <span className="text-[9px] text-stone-500 font-black whitespace-nowrap">Кат.:</span>
          <select
            className="bg-stone-900 border border-stone-700 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-300 outline-none"
            value={draft.category || ''}
            onChange={e => setDraft({ ...draft, category: e.target.value })}
          >
            <option value="">Общее</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {/* Повтор */}
        <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
          <Repeat className="w-3 h-3 text-stone-500 flex-shrink-0" />
          <select
            className="bg-stone-900 border border-stone-700 rounded-xl px-2 py-1.5 text-[10px] font-bold text-stone-300 outline-none"
            value={draft.repeatType || 'none'}
            onChange={e => setDraft({ ...draft, repeatType: e.target.value })}
          >
            <option value="none">Не повторять</option>
            <option value="daily">Ежедневно</option>
            <option value="weekly">Еженедельно</option>
            <option value="monthly">Ежемесячно</option>
          </select>
        </div>
        {/* Дни недели для weekly */}
        {draft.repeatType === 'weekly' && (
          <div className="flex items-center gap-1 flex-shrink-0 border-l border-stone-700 pl-2">
            {[{id:1,l:'Пн'},{id:2,l:'Вт'},{id:3,l:'Ср'},{id:4,l:'Чт'},{id:5,l:'Пт'},{id:6,l:'Сб'},{id:7,l:'Вс'}].map(day => (
              <button
                key={day.id}
                onClick={() => {
                  const days = draft.repeatDays || [];
                  setDraft({ ...draft, repeatDays: days.includes(day.id) ? days.filter(d => d !== day.id) : [...days, day.id] });
                }}
                className={`w-7 h-7 rounded-full text-[9px] font-bold flex-shrink-0 transition-all ${draft.repeatDays?.includes(day.id) ? 'bg-amber-600 text-stone-900' : 'bg-stone-800 text-stone-500'}`}
              >{day.l}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Главный тулбар-пилюли ────────────────────────────────────────────────
  const renderMainToolbar = () => (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {/* Дата */}
      <ToolPill
        icon={CalendarDays}
        label="Дата"
        value={draft.date || null}
        active={activeMenu === 'date'}
        accent="amber"
        onClick={() => toggleMenu('date')}
      />
      {/* Приоритет */}
      <ToolPill
        icon={Target}
        label="Приоритет"
        value={draft.priority ? PRIORITY_LABELS[draft.priority] : null}
        active={activeMenu === 'priority'}
        accent={PRIORITY_ACCENT[draft.priority] || 'amber'}
        onClick={() => toggleMenu('priority')}
      />
      {/* Проект */}
      <ToolPill
        icon={FolderOpen}
        label="Проект"
        value={draft.parentId ? (useStore.getState().byId[draft.parentId]?.title || '…') : draft.category || null}
        active={activeMenu === 'project'}
        accent="violet"
        onClick={() => toggleMenu('project')}
      />
      {/* Оценка — inline, не открывает меню */}
      <div className="flex items-center gap-1 bg-stone-800 border border-stone-700 rounded-xl px-2 flex-shrink-0">
        <input
          type="number" min="0"
          className="bg-transparent w-8 font-black text-amber-500 outline-none text-xs text-center"
          value={estHours || ''}
          onChange={e => { const h = Math.max(0, parseInt(e.target.value) || 0); setDraft({ ...draft, estimate: h + estMins / 60 }); }}
          placeholder="0"
        />
        <span className="text-[9px] text-stone-600">ч</span>
        <input
          type="number" step="5"
          className="bg-transparent w-8 font-black text-amber-500 outline-none text-xs text-center"
          value={estMins || ''}
          onChange={e => { const m = parseInt(e.target.value) || 0; setDraft({ ...draft, estimate: estHours + m / 60 }); }}
          placeholder="0"
        />
        <span className="text-[9px] text-stone-600">м</span>
        <span className="text-[9px] text-emerald-500 font-black pl-1 border-l border-stone-700">+{calculatePoints(draft.estimate)}Б</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-stone-900 w-full max-w-md rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.8)] border-t border-x border-stone-700 animate-in slide-in-from-bottom duration-300 relative before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none before:rounded-t-[2.5rem] flex flex-col max-h-[88vh]">

        {/* ── Шапка ─────────────────────────────────────────────────────── */}
        <div className="flex justify-between items-center px-6 pt-6 pb-3 relative z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {task.parentId && (
              <button onClick={() => navigateToNode(task.parentId)} className="p-2 bg-stone-800 border border-stone-700 rounded-full hover:bg-stone-700">
                <ArrowLeft className="w-4 h-4 text-amber-500" />
              </button>
            )}
            <h2 className="text-xs font-black text-amber-600 uppercase tracking-widest">Терминал задачи</h2>
          </div>
          <button onClick={saveAndClose} className="p-2 bg-stone-800 border border-stone-700 rounded-full hover:bg-stone-700">
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        {/* ── Тулбар (фиксированная высота 48px min, меняет содержимое) ── */}
        <div
          className="px-4 relative z-10 flex-shrink-0 flex items-center"
          style={{ minHeight: 48 }}
        >
          {activeMenu === 'date'     && renderDateMenu()}
          {activeMenu === 'priority' && renderPriorityMenu()}
          {activeMenu === 'project'  && renderProjectMenu()}
          {activeMenu === 'none'     && renderMainToolbar()}
        </div>

        {/* ── Скроллируемое тело ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 pt-3 space-y-3 custom-scrollbar relative z-10">

          {/* Прогресс (только для родительских задач) */}
          {prog.isParent && (
            <div className="bg-stone-950 p-4 rounded-2xl border-2 border-stone-800 shadow-[inset_0_5px_15px_rgba(0,0,0,0.8)] relative">
              <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart3 className="w-16 h-16 text-purple-500" /></div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">Прогресс</h3>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-black text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]">
                  {prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0}%
                </span>
                <span className="text-[10px] font-bold pb-1 text-stone-400 italic">
                  {Number(prog.completed.toFixed(2))}ч / {Number(prog.total.toFixed(2))}ч
                </span>
              </div>
            </div>
          )}

          {/* Название и Описание */}
          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
            <label className="text-[9px] font-black text-amber-700 uppercase block mb-2 tracking-widest">Идентификатор</label>
            <input
              autoFocus
              className="bg-transparent w-full font-bold text-stone-200 outline-none text-lg border-b border-stone-700 focus:border-amber-500 pb-1 mb-4"
              value={draft.title || ''}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="Что нужно сделать?"
            />
            <label className="text-[9px] font-black text-amber-700 uppercase block mb-2 tracking-widest">Описание</label>
            <textarea
              className="bg-stone-900 w-full rounded-lg border border-stone-700 p-3 text-xs text-stone-300 font-medium outline-none focus:border-amber-500 min-h-[120px] resize-none"
              value={draft.description || ''}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="Детали задачи..."
            />
          </div>

          {/* Подзадачи / модули */}
          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
            <div className="flex justify-between items-center mb-3">
              <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Модули</label>
              <button
                onClick={handleAIGeneration}
                disabled={isAiLoading || !draft.title?.trim()}
                className="flex items-center gap-1 text-[9px] font-black bg-purple-950/50 text-purple-400 border border-purple-900 px-2 py-1 rounded-lg disabled:opacity-30 transition-all hover:bg-purple-900"
              >
                <Bot className={`w-3 h-3 ${isAiLoading ? 'animate-bounce' : ''}`} />
                {isAiLoading ? 'Анализ...' : 'AI-Декомпозиция'}
              </button>
            </div>

            <div className="space-y-2 mb-3">
              {task.childrenIds?.map(childId => {
                const child = useStore.getState().byId[childId];
                if (!child) return null;
                return (
                  <div
                    key={childId}
                    onClick={() => navigateToNode(childId)}
                    className="text-xs font-bold text-stone-300 flex justify-between items-center bg-stone-900 p-2.5 rounded-lg border border-stone-700 cursor-pointer hover:border-stone-600"
                  >
                    <span className="truncate">{child.title}</span>
                    <Edit2 className="w-3 h-3 text-stone-600 flex-shrink-0" />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs flex-1 font-bold text-stone-200 outline-none placeholder-stone-600 focus:border-amber-800"
                placeholder="Монтировать модуль..."
                value={newSubTitle}
                onChange={e => setNewSubTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubtaskAdd()}
              />
              <button onClick={handleSubtaskAdd} className="bg-stone-800 border border-stone-600 text-amber-500 p-2 rounded-lg hover:bg-stone-700">
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Нижняя панель действий ────────────────────────────────────── */}
        <div className="flex gap-3 px-6 py-4 border-t border-stone-800 flex-shrink-0">
          <button
            onClick={() => { triggerWarning(); deleteTask(task.id); updateUI({ editingNodeId: null }); }}
            className="bg-red-950/50 border border-red-900 text-red-500 p-4 rounded-xl hover:bg-red-900 w-14 flex items-center justify-center flex-shrink-0"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              triggerLightImpact();
              useStore.getState().duplicateTask(task.id);
              updateUI({ editingNodeId: null });
            }}
            className="bg-purple-950/50 border border-purple-900 text-purple-500 p-4 rounded-xl hover:bg-purple-900 w-14 flex items-center justify-center flex-shrink-0"
          >
            <Copy className="w-5 h-5" />
          </button>
          <button
            onClick={saveAndClose}
            disabled={!draft.title?.trim()}
            className={`flex-1 p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all ${
              !draft.title?.trim()
                ? 'bg-stone-800 text-stone-600 cursor-not-allowed'
                : 'bg-gradient-to-b from-amber-400 to-amber-700 text-stone-950 active:scale-95'
            }`}
          >
            Активировать
          </button>
        </div>

      </div>

      {/* ── Модальное окно поиска родителя ───────────────────────────── */}
      {isParentModalOpen && (
        <div className="fixed inset-0 z-[60] bg-stone-950 flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-3 p-4 border-b border-stone-800 bg-stone-900 flex-shrink-0">
            <button
              onClick={() => { triggerLightImpact(); setIsParentModalOpen(false); setParentSearchQuery(''); }}
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
                value={parentSearchQuery}
                onChange={e => setParentSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-10">
            <button
              onClick={() => {
                triggerLightImpact();
                setDraft({ ...draft, parentId: null });
                setIsParentModalOpen(false);
                setParentSearchQuery('');
              }}
              className={`w-full text-left p-3 rounded-xl border transition-all ${
                !draft.parentId ? 'bg-violet-900/30 border-violet-800 text-violet-300' : 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800/80'
              }`}
            >
              <div className="text-sm font-bold">— Без родителя</div>
            </button>

            {filteredParents.map(p => {
              const path = getTaskPath(p.id, useStore.getState().byId);
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    triggerLightImpact();
                    setDraft({ ...draft, parentId: p.id });
                    setIsParentModalOpen(false);
                    setParentSearchQuery('');
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    draft.parentId === p.id ? 'bg-violet-900/30 border-violet-800' : 'bg-stone-900 border-stone-800 hover:bg-stone-800/80'
                  }`}
                >
                  <div className="text-sm font-bold text-stone-200">{p.title}</div>
                  {path.length > 0 && (
                    <div className="text-[10px] font-medium text-stone-500 mt-1 truncate">
                      {path.join(' > ')}
                    </div>
                  )}
                </button>
              );
            })}
            
            {filteredParents.length === 0 && parentSearchQuery && (
              <div className="text-center py-8 text-stone-500 text-sm">
                Ничего не найдено
              </div>
            )}
          </div>
        </div>
      )}
    </div>

      {/* ── Модалка выбора тегов (полноэкранная) ────────────────────────── */}
      {isTagsModalOpen && (
        <div className="fixed inset-0 z-[60] bg-stone-950 flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-3 p-4 border-b border-stone-800 bg-stone-900 flex-shrink-0">
            <button
              onClick={() => { triggerLightImpact(); setIsTagsModalOpen(false); }}
              className="p-2 bg-stone-800 rounded-full hover:bg-stone-700 text-stone-400"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-sm font-black text-amber-500 uppercase tracking-widest flex-1">Теги задачи</h2>
            <span className="text-[10px] font-black text-amber-400 bg-amber-950/50 border border-amber-800 rounded-lg px-2 py-1">
              {draft.tags?.length || 0}
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-10">
            {tags.map(tag => {
              const isSelected = draft.tags?.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => {
                    triggerLightImpact();
                    const currentTags = draft.tags || [];
                    if (isSelected) {
                      setDraft({ ...draft, tags: currentTags.filter(t => t !== tag) });
                    } else {
                      setDraft({ ...draft, tags: [...currentTags, tag] });
                    }
                  }}
                  className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                    isSelected ? 'bg-amber-900/30 border-amber-800 text-amber-300' : 'bg-stone-900 border-stone-800 text-stone-300 hover:bg-stone-800/80'
                  }`}
                >
                  <div className="text-sm font-bold truncate">{tag}</div>
                  {isSelected && <Target className="w-4 h-4 text-amber-500" />}
                </button>
              );
            })}
            
            {tags.length === 0 && (
              <div className="text-center py-8 text-stone-500 text-sm">
                Нет доступных тегов. Добавьте их в Базе Данных.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};