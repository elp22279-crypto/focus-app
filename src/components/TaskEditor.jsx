// src/components/TaskEditor.jsx
import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, BarChart3, Target, Repeat, Plus, Edit2, Trash2, Bot } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { useNodeProgress } from '../store/selectors.js';
import { PRIORITIES } from '../utils/constants.js';
import { calculatePoints } from '../utils/helpers.js';
import { generateSubtasksWithAI } from '../utils/ai.js'; 

// Вспомогательная функция для изоляции логики
const getDescendants = (id, byId) => {
  const t = byId[id];
  if (!t || !t.childrenIds?.length) return [];
  let res = [...t.childrenIds];
  t.childrenIds.forEach(c => res.push(...getDescendants(c, byId)));
  return res;
};

export const TaskEditor = () => {
  const { editingNodeId } = useStore(state => state.ui);
  const task = useStore(state => state.byId[editingNodeId]);
  const updateTask = useStore(state => state.updateTask);
  const updateUI = useStore(state => state.updateUI);
  const deleteTask = useStore(state => state.deleteTask);
  const addTask = useStore(state => state.addTask);
  const categories = useStore(state => state.categories);
  
  const prog = useNodeProgress(editingNodeId);
  
  // Локальное состояние
  const [draft, setDraft] = useState(task || {});
  const [newSubTitle, setNewSubTitle] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Синхронизация при смене редактируемого узла
  useEffect(() => { 
    if (task) setDraft(task); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  const saveCurrentTask = () => {
    if (!draft.title?.trim()) { 
      deleteTask(task.id); 
      return false;
    } else { 
      const { childrenIds, ...payload } = draft;
      updateTask(task.id, payload); 
      return true;
    }
  };

  const navigateToNode = (id) => {
    saveCurrentTask();
    updateUI({ editingNodeId: id });
  };

  const saveAndClose = () => {
    saveCurrentTask();
    updateUI({ editingNodeId: null });
  };

  const handleSubtaskAdd = () => {
    if (!newSubTitle.trim()) return;
    if (draft.title?.trim()) {
      const { childrenIds, ...payload } = draft;
      updateTask(task.id, payload);
    }
    addTask({ 
      title: newSubTitle.trim(), 
      parentId: task.id, 
      status: draft.status || task.status, 
      date: draft.date || task.date, 
      priority: draft.priority || task.priority,
      skipEdit: true
    });
    setNewSubTitle('');
  };

  const handleAIGeneration = async () => {
    if (!draft.title?.trim() || isAiLoading) return;
    
    setIsAiLoading(true);
    const { childrenIds, ...payload } = draft;
    updateTask(task.id, payload);
    const generatedTasks = await generateSubtasksWithAI(draft.title);
    
    if (generatedTasks && generatedTasks.length > 0) {
      generatedTasks.forEach(st => {
        addTask({ 
          title: st.title, 
          estimate: st.estimate || 0,
          priority: st.priority || 'nn',
          parentId: task.id, 
          status: draft.status || task.status, 
          date: draft.date || task.date,
          skipEdit: true
        });
      });
    } else {
      alert('Сбой ИИ: Проверьте консоль или VPN');
    }
    setIsAiLoading(false);
  };

  const descendants = getDescendants(task.id, useStore.getState().byId);
  const validParents = Object.values(useStore.getState().byId).filter(n => n.id !== task.id && !descendants.includes(n.id));

  const totalMins = Math.round((draft.estimate || 0) * 60);
  const estHours = Math.floor(totalMins / 60);
  const estMins = totalMins % 60;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="bg-stone-900 w-full max-w-md rounded-t-[2.5rem] p-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] border-t border-x border-stone-700 animate-in slide-in-from-bottom duration-300 relative before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b before:from-white/5 before:to-transparent before:pointer-events-none before:rounded-t-[2.5rem]">
        <div className="flex justify-between items-center mb-6 relative z-10">
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
        
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pb-10 pr-2 relative z-10 custom-scrollbar">
          {prog.isParent && (
            <div className="bg-stone-950 p-5 rounded-2xl border-2 border-stone-800 shadow-[inset_0_5px_15px_rgba(0,0,0,0.8)] relative">
              <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart3 className="w-20 h-20 text-purple-500" /></div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-2 relative z-10">Общий прогресс</h3>
              <div className="flex items-end gap-2 mb-4 relative z-10">
                <span className="text-3xl font-black text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]">{prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0}%</span>
                <span className="text-[10px] font-bold pb-1.5 text-stone-400 italic">{Number(prog.completed.toFixed(2))}ч / {Number(prog.total.toFixed(2))}ч</span>
              </div>
            </div>
          )}

          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
            <label className="text-[9px] font-black text-amber-700 uppercase block mb-2 tracking-widest">Идентификатор</label>
            <input autoFocus className="bg-transparent w-full font-bold text-stone-200 outline-none text-lg border-b border-stone-700 focus:border-amber-500 pb-1" value={draft.title || ''} onChange={(e) => setDraft({...draft, title: e.target.value})} placeholder="Что нужно сделать?" />
          </div>

          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
             <label className="text-[9px] font-black text-amber-700 uppercase block mb-3 tracking-widest flex items-center gap-1"><Target className="w-3 h-3"/> Вектор приоритета</label>
             <div className="grid grid-cols-2 gap-2">
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <button key={key} onClick={() => setDraft({...draft, priority: key})} className={`text-[9px] font-black uppercase tracking-widest p-2 rounded-lg border transition-all ${draft.priority === key ? `${p.bg} ${p.border} ${p.color}` : 'bg-stone-900 border-stone-700 text-stone-500'}`}>{p.label}</button>
                ))}
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700 shadow-inner">
                <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest mb-2 block">{task.childrenIds?.length ? 'Буфер' : 'Оценка'}</label>
                <div className="flex items-center gap-2">
                   <div className="flex items-center gap-1 flex-1 bg-stone-900 rounded p-1 border border-stone-700"><input type="number" min="0" className="bg-transparent w-full font-black text-amber-500 outline-none text-lg text-center" value={estHours || ''} onChange={(e) => { const h = Math.max(0, parseInt(e.target.value) || 0); setDraft({...draft, estimate: h + (estMins / 60)}); }} /><span className="text-[9px] text-stone-500">Ч</span></div>
                   <div className="flex items-center gap-1 flex-1 bg-stone-900 rounded p-1 border border-stone-700"><input type="number" step="5" className="bg-transparent w-full font-black text-amber-500 outline-none text-lg text-center" value={estMins || ''} onChange={(e) => { const m = parseInt(e.target.value) || 0; setDraft({...draft, estimate: estHours + (m / 60)}); }} /><span className="text-[9px] text-stone-500">М</span></div>
                </div>
             </div>
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700 flex flex-col justify-center items-center">
                <label className="text-[9px] font-black text-amber-700 uppercase block mb-1">Профит</label>
                <span className="font-black text-emerald-500 text-2xl">+{calculatePoints(draft.estimate)} <span className="text-sm">Б</span></span>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
                <label className="text-[9px] font-black text-amber-700 uppercase block mb-2">Категория</label>
                <select className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 font-bold text-stone-300 text-xs" value={draft.category || ''} onChange={(e) => setDraft({...draft, category: e.target.value})}><option value="">Общее</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
             </div>
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
                <label className="text-[9px] font-black text-amber-700 uppercase block mb-2">Родитель</label>
                <select className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 font-bold text-stone-300 text-xs" value={draft.parentId || ''} onChange={(e) => setDraft({...draft, parentId: e.target.value || null})}><option value="">Отсутствует</option>{validParents.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select>
             </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700"><label className="text-[9px] font-black text-amber-700 block mb-2">Время</label><input type="time" className="bg-stone-900 border border-stone-700 rounded-lg p-1.5 w-full font-bold text-amber-500 text-xs text-center" value={draft.time || ''} onChange={(e) => setDraft({...draft, time: e.target.value})} /></div>
             <div className="bg-stone-800 p-4 rounded-xl border border-stone-700 col-span-2 flex gap-2">
                <div className="flex-1"><label className="text-[9px] font-black text-amber-700 block mb-2">План</label><input type="date" className="bg-stone-900 border border-stone-700 rounded-lg p-1.5 w-full font-bold text-stone-300 text-[10px]" value={draft.date || ''} onChange={(e) => setDraft({...draft, date: e.target.value, status: e.target.value ? 'active' : 'backlog'})} /></div>
                <div className="flex-1"><label className="text-[9px] font-black text-red-600 block mb-2">Дедлайн</label><input type="date" className="bg-stone-900 border border-stone-700 rounded-lg p-1.5 w-full font-bold text-red-400 text-[10px]" value={draft.deadline || ''} onChange={(e) => setDraft({...draft, deadline: e.target.value})} /></div>
             </div>
          </div>

          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
             <label className="text-[9px] font-black text-amber-700 uppercase block mb-3 flex items-center gap-1"><Repeat className="w-3 h-3"/> Цикличность</label>
             <select className="w-full bg-stone-900 border border-stone-700 rounded-lg p-2 font-bold text-stone-300 text-xs mb-3" value={draft.repeatType || 'none'} onChange={(e) => setDraft({...draft, repeatType: e.target.value})}><option value="none">Отключено</option><option value="daily">Ежедневно</option><option value="weekly">Еженедельно</option><option value="monthly">Ежемесячно</option></select>
             {draft.repeatType === 'weekly' && (
               <div className="flex justify-between gap-1">
                 {[{id:1, l:'Пн'}, {id:2, l:'Вт'}, {id:3, l:'Ср'}, {id:4, l:'Чт'}, {id:5, l:'Пт'}, {id:6, l:'Сб'}, {id:7, l:'Вс'}].map(day => (
                   <button key={day.id} onClick={() => { const days = draft.repeatDays || []; setDraft({...draft, repeatDays: days.includes(day.id) ? days.filter(d => d !== day.id) : [...days, day.id]}); }} className={`w-8 h-8 rounded-full text-[10px] font-bold ${draft.repeatDays?.includes(day.id) ? 'bg-amber-600 text-stone-900' : 'bg-stone-900 text-stone-500'}`}>{day.l}</button>
                 ))}
               </div>
             )}
          </div>

          <div className="bg-stone-800 p-4 rounded-xl border border-stone-700">
             <div className="flex justify-between items-center mb-4">
                <label className="text-[9px] font-black text-amber-700 uppercase block">Модули</label>
                <button 
                  onClick={handleAIGeneration} 
                  disabled={isAiLoading || !draft.title?.trim()} 
                  className="flex items-center gap-1 text-[9px] font-black bg-purple-950/50 text-purple-400 border border-purple-900 px-2 py-1 rounded disabled:opacity-30 transition-all hover:bg-purple-900"
                >
                  <Bot className={`w-3 h-3 ${isAiLoading ? 'animate-bounce' : ''}`} />
                  {isAiLoading ? 'Анализ...' : 'AI-Декомпозиция'}
                </button>
             </div>
             
             <div className="space-y-2 mb-4">
                {task.childrenIds?.map(childId => {
                  const child = useStore.getState().byId[childId];
                  if (!child) return null;
                  return (
                    <div key={childId} onClick={() => navigateToNode(childId)} className="text-xs font-bold text-stone-300 flex justify-between items-center bg-stone-900 p-2.5 rounded-lg border border-stone-700 cursor-pointer">
                      <span className="truncate">{child.title}</span><Edit2 className="w-3 h-3 text-stone-600" />
                    </div>
                  );
                })}
             </div>
             <div className="flex gap-2">
                <input className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs flex-1 font-bold text-stone-200 outline-none" placeholder="Монтировать модуль..." value={newSubTitle} onChange={e => setNewSubTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubtaskAdd()} />
                <button onClick={handleSubtaskAdd} className="bg-stone-800 border border-stone-600 text-amber-500 p-2 rounded-lg hover:bg-stone-700"><Plus className="w-5 h-5" /></button>
             </div>
          </div>

          <div className="flex gap-3 mt-6 pt-4 border-t border-stone-800">
             <button onClick={() => { deleteTask(task.id); updateUI({ editingNodeId: null }); }} className="bg-red-950/50 border border-red-900 text-red-500 p-4 rounded-xl hover:bg-red-900 w-16 flex items-center justify-center"><Trash2 className="w-5 h-5" /></button>
             <button onClick={saveAndClose} disabled={!draft.title?.trim()} className={`flex-1 p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all ${!draft.title?.trim() ? 'bg-stone-800 text-stone-600' : 'bg-gradient-to-b from-amber-400 to-amber-700 text-stone-950 active:scale-95'}`}>Активировать</button>
          </div>
        </div>
      </div>
    </div>
  );
};