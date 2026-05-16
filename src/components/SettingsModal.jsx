// src/components/SettingsModal.jsx
import React, { useState } from 'react';
import { X, Hash, CheckCircle2, Edit2, Trash2, Database, Plus } from 'lucide-react';
import { useStore } from '../store/useStore.js';

export const SettingsModal = () => {
  const { activeTab, baseViewMode } = useStore(state => state.ui);
  const updateUI = useStore(state => state.updateUI);
  const settings = useStore(state => state.settings);
  const updateSettings = useStore(state => state.updateSettings);
  const categories = useStore(state => state.categories);
  const addCategory = useStore(state => state.addCategory);
  const deleteCategory = useStore(state => state.deleteCategory);
  const updateCategory = useStore(state => state.updateCategory);

  const [newCatName, setNewCatName] = useState('');
  const [editCat, setEditCat] = useState(null);
  const [editCatName, setEditCatName] = useState('');

  const handleSaveCat = (oldName) => {
    const trimmed = editCatName.trim();
    if (trimmed && trimmed !== oldName && !categories.includes(trimmed)) {
      updateCategory(oldName, trimmed);
    }
    setEditCat(null);
  };

  const handleAddCat = () => {
    const trimmed = newCatName.trim();
    if (trimmed && !categories.includes(trimmed)) {
      addCategory(trimmed);
      setNewCatName('');
    }
  };

  return (
    <div className="absolute top-20 left-4 right-4 bg-stone-800 p-5 rounded-3xl border-2 border-stone-700 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 animate-in fade-in zoom-in duration-200">
      <div className="flex justify-between items-center mb-6 relative z-10">
        <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
          {activeTab === 'daily' && 'Калибровка фокуса'}
          {activeTab === 'analytics' && 'Параметры симуляции'}
          {activeTab === 'backlog' && 'Настройки архива'}
        </label>
        <button onClick={() => updateUI({ showSettings: false })} className="p-1.5 bg-stone-900 border border-stone-700 hover:bg-stone-700 rounded-full shadow-inner"><X className="w-3 h-3 text-stone-400" /></button>
      </div>

      {activeTab === 'daily' && (
        <div className="flex items-center gap-4 bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner">
          <input type="range" min="1" max="16" step="0.5" value={settings.dailyLimit} onChange={e => updateSettings({ dailyLimit: parseFloat(e.target.value) })} className="flex-1 accent-amber-500 h-1.5 bg-stone-800 rounded-full appearance-none outline-none" />
          <span className="font-mono font-black text-amber-500 text-lg">{settings.dailyLimit}ч</span>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner"><span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Дневная норма:</span> <input type="number" value={settings.goals.daily} onChange={e => updateSettings({ goals: { ...settings.goals, daily: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" /></div>
          <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner"><span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Недельный цикл:</span> <input type="number" value={settings.goals.weekly} onChange={e => updateSettings({ goals: { ...settings.goals, weekly: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" /></div>
          <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner"><span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Месячный объем:</span> <input type="number" value={settings.goals.monthly} onChange={e => updateSettings({ goals: { ...settings.goals, monthly: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" /></div>
        </div>
      )}

      {activeTab === 'backlog' && (
        <div className="space-y-6">
          <div className="flex gap-2 bg-stone-900 p-1.5 rounded-xl border border-stone-700 shadow-inner">
            <button onClick={() => { updateUI({ baseViewMode: 'active', showSettings: false }); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${baseViewMode === 'active' ? 'bg-stone-800 shadow-md border border-stone-600 text-amber-500' : 'text-stone-500 hover:text-stone-400'}`}>В процессе</button>
            <button onClick={() => { updateUI({ baseViewMode: 'unallocated', showSettings: false }); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${baseViewMode === 'unallocated' ? 'bg-stone-800 shadow-md border border-stone-600 text-blue-500' : 'text-stone-500 hover:text-stone-400'}`}>Без дат</button>
            <button onClick={() => { updateUI({ baseViewMode: 'completed', showSettings: false }); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${baseViewMode === 'completed' ? 'bg-stone-800 shadow-md border border-stone-600 text-emerald-500' : 'text-stone-500 hover:text-stone-400'}`}>Завершено</button>
          </div>

          <div className="bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner">
            <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1 mb-3"><Hash className="w-3 h-3" /> Категории задач</label>
            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar pr-1">
              {categories.map(cat => (
                <div key={cat} className="flex justify-between items-center bg-stone-950 p-2 rounded-lg border border-stone-800">
                  {editCat === cat ? (
                    <input autoFocus className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-bold text-stone-200 outline-none w-full mr-2 shadow-inner" value={editCatName} onChange={e => setEditCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveCat(cat); if (e.key === 'Escape') setEditCat(null); }} />
                  ) : (
                    <span className="text-xs font-bold text-stone-300 truncate pr-2 flex-1">{cat}</span>
                  )}
                  <div className="flex gap-1 flex-shrink-0">
                    {editCat === cat ? (
                      <>
                        <button onClick={() => handleSaveCat(cat)} className="p-1.5 bg-emerald-950/50 border border-emerald-900 rounded"><CheckCircle2 className="w-3 h-3 text-emerald-500" /></button>
                        <button onClick={() => setEditCat(null)} className="p-1.5 bg-stone-800 border border-stone-700 rounded"><X className="w-3 h-3 text-stone-400" /></button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditCat(cat); setEditCatName(cat); }} className="p-1.5 bg-stone-800 border border-stone-700 rounded"><Edit2 className="w-3 h-3 text-stone-400" /></button>
                        <button onClick={() => deleteCategory(cat)} className="p-1.5 bg-red-950/30 border border-red-900 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-xs flex-1 font-bold outline-none text-stone-200 placeholder-stone-600 focus:border-amber-900 transition-colors shadow-inner" placeholder="Новая категория..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCat()} />
              <button onClick={handleAddCat} disabled={!newCatName.trim()} className="bg-stone-800 border border-stone-600 text-amber-500 px-3 rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-all"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner">
            <label className="text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1 mb-3"><Database className="w-3 h-3" /> Очистка памяти</label>
            <select className="w-full bg-stone-950 border border-stone-800 font-bold text-stone-400 text-xs outline-none cursor-pointer rounded p-2" value={settings.retentionMonths} onChange={e => updateSettings({ retentionMonths: parseInt(e.target.value) })}>
              <option value={0}>Хранить бессрочно</option>
              <option value={1}>Удалять старше 30 дней</option>
              <option value={3}>Удалять старше 90 дней</option>
              <option value={6}>Удалять старше 180 дней</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};