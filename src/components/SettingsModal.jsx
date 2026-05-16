// src/components/SettingsModal.jsx
import React, { useState } from 'react';
import {
  X, Hash, CheckCircle2, Edit2, Trash2, Database, Plus,
  Key, Eye, EyeOff, ShieldCheck, ShieldOff,
  Download, Upload, AlertTriangle
} from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { exportTasks, importTasks, BackupValidationError } from '../utils/backup.js';
import { triggerSuccess, triggerWarning, triggerLightImpact } from '../utils/haptics.js';

export const SettingsModal = () => {
  const { activeTab, baseViewMode } = useStore(state => state.ui);
  const updateUI        = useStore(state => state.updateUI);
  const settings        = useStore(state => state.settings);
  const updateSettings  = useStore(state => state.updateSettings);
  const categories      = useStore(state => state.categories);
  const addCategory     = useStore(state => state.addCategory);
  const deleteCategory  = useStore(state => state.deleteCategory);
  const updateCategory  = useStore(state => state.updateCategory);
  const apiKey          = useStore(state => state.apiKey);
  const setApiKey       = useStore(state => state.setApiKey);
  const restoreBackup   = useStore(state => state.restoreBackup);

  const [newCatName, setNewCatName] = useState('');
  const [editCat, setEditCat]       = useState(null);
  const [editCatName, setEditCatName] = useState('');

  // API-ключ
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey]   = useState(false);
  const [keyStatus, setKeyStatus] = useState(null); // 'saved' | 'removed' | null

  // Backup UI state
  const [backupStatus, setBackupStatus] = useState(null); // 'exporting'|'success'|'error'|'importing'|null
  const [backupError,  setBackupError]  = useState('');
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState(null);

  // ── Category handlers ────────────────────────────────────────────────────
  const handleSaveCat = (oldName) => {
    const trimmed = editCatName.trim();
    if (trimmed && trimmed !== oldName && !categories.includes(trimmed)) updateCategory(oldName, trimmed);
    setEditCat(null);
  };
  const handleAddCat = () => {
    const trimmed = newCatName.trim();
    if (trimmed && !categories.includes(trimmed)) { addCategory(trimmed); setNewCatName(''); }
  };

  // ── API key handlers ─────────────────────────────────────────────────────
  const handleApplyKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    setKeyInput('');
    setShowKey(false);
    setKeyStatus('saved');
    triggerSuccess();
    setTimeout(() => setKeyStatus(null), 2500);
  };
  const handleRemoveKey = () => {
    setApiKey(null);
    setKeyInput('');
    setKeyStatus('removed');
    triggerWarning();
    setTimeout(() => setKeyStatus(null), 2500);
  };

  // ── Backup handlers ──────────────────────────────────────────────────────
  const handleExport = async () => {
    triggerLightImpact();
    setBackupStatus('exporting');
    setBackupError('');
    try {
      await exportTasks();
      setBackupStatus('success');
      triggerSuccess();
      setTimeout(() => setBackupStatus(null), 2500);
    } catch (err) {
      console.error('Export failed:', err);
      setBackupError(err.message || 'Неизвестная ошибка');
      setBackupStatus('error');
      triggerWarning();
      setTimeout(() => setBackupStatus(null), 4000);
    }
  };

  const handleImportPick = async () => {
    triggerLightImpact();
    setBackupError('');
    setBackupStatus('importing');
    try {
      const data = await importTasks();
      // Показываем предупреждающий диалог перед записью
      setPendingImportData(data);
      setShowImportConfirm(true);
      setBackupStatus(null);
    } catch (err) {
      if (err.message === 'Файл не выбран') {
        setBackupStatus(null);
        return;
      }
      const msg = err instanceof BackupValidationError
        ? `Ошибка валидации: ${err.message}`
        : `Ошибка чтения: ${err.message}`;
      setBackupError(msg);
      setBackupStatus('error');
      triggerWarning();
      setTimeout(() => setBackupStatus(null), 5000);
    }
  };

  const handleImportConfirm = () => {
    if (!pendingImportData) return;
    restoreBackup(pendingImportData);
    triggerSuccess();
    setPendingImportData(null);
    setShowImportConfirm(false);
    setBackupStatus('success');
    setTimeout(() => setBackupStatus(null), 2500);
  };

  const handleImportCancel = () => {
    triggerLightImpact();
    setPendingImportData(null);
    setShowImportConfirm(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Предупреждающий диалог импорта ──────────────────────────────── */}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center px-6">
          <div className="bg-stone-800 border-2 border-amber-700 rounded-2xl p-6 shadow-[0_10px_40px_rgba(0,0,0,0.9)] max-w-sm w-full animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest">Подтверждение импорта</h3>
            </div>
            <p className="text-xs text-stone-300 mb-2 leading-relaxed">
              Все текущие задачи будут <span className="text-red-400 font-black">полностью перезаписаны</span> данными из файла резервной копии.
            </p>
            <p className="text-[10px] text-stone-500 mb-6">
              Найдено задач: <span className="text-amber-400 font-black">{Object.keys(pendingImportData?.byId || {}).length}</span>
            </p>
            <div className="flex gap-3">
              <button
                id="import-cancel-btn"
                onClick={handleImportCancel}
                className="flex-1 py-3 bg-stone-900 border border-stone-700 text-stone-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-stone-800 transition-all"
              >
                Отмена
              </button>
              <button
                id="import-confirm-btn"
                onClick={handleImportConfirm}
                className="flex-1 py-3 bg-red-900/60 border border-red-700 text-red-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-red-800/60 transition-all"
              >
                Перезаписать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Основная панель настроек ─────────────────────────────────────── */}
      <div className="absolute top-20 left-4 right-4 bg-stone-800 flex flex-col rounded-3xl border-2 border-stone-700 shadow-[0_10px_30px_rgba(0,0,0,0.8)] z-50 animate-in fade-in zoom-in duration-200 max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-5 pb-3 relative z-20 bg-stone-800 shrink-0">
          <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
            {activeTab === 'daily'     && 'Калибровка фокуса'}
            {activeTab === 'analytics' && 'Параметры симуляции'}
            {activeTab === 'backlog'   && 'Настройки архива'}
          </label>
          <button onClick={() => updateUI({ showSettings: false })} className="p-1.5 bg-stone-900 border border-stone-700 hover:bg-stone-700 rounded-full shadow-inner">
            <X className="w-3 h-3 text-stone-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 pt-2">
          {/* ── Gemini API-ключ & Резервные копии ───────────────────────── */}
          <div className="bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner mb-4">
              <label className="text-[9px] font-black text-violet-400 uppercase tracking-widest flex items-center gap-1 mb-3">
                <Key className="w-3 h-3" /> Gemini API-ключ
              </label>
              <div className="flex items-center gap-2 mb-3">
                {apiKey
                  ? <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> Ключ активен</span>
                  : <span className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500"><ShieldOff className="w-3.5 h-3.5" /> Ключ не задан</span>
                }
                {keyStatus === 'saved'   && <span className="ml-auto text-[10px] font-bold text-emerald-400 animate-pulse">✓ Сохранено</span>}
                {keyStatus === 'removed' && <span className="ml-auto text-[10px] font-bold text-red-400 animate-pulse">✕ Удалён</span>}
              </div>
              <div className="flex gap-2 mb-2">
                <div className="relative flex-1">
                  <input
                    id="api-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleApplyKey()}
                    placeholder={apiKey ? '••••••••  (введите новый для замены)' : 'AIzaSy...'}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs font-mono text-stone-200 placeholder-stone-600 outline-none focus:border-violet-700 transition-colors shadow-inner pr-9"
                    autoComplete="off" spellCheck={false}
                  />
                  <button type="button" onClick={() => setShowKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 transition-colors">
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <button id="api-key-apply-btn" onClick={handleApplyKey} disabled={!keyInput.trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-violet-900/50 border border-violet-700 text-violet-300 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-violet-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <CheckCircle2 className="w-3 h-3" /> Применить
                </button>
                <button id="api-key-remove-btn" onClick={handleRemoveKey} disabled={!apiKey}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-950/30 border border-red-900 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-red-900/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <p className="mt-2 text-[9px] text-stone-600 leading-relaxed">Ключ хранится в защищённом хранилище устройства.</p>
            </div>

            <div className="bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner mb-4">
              <label className="text-[9px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-1 mb-3">
                <Database className="w-3 h-3" /> Управление данными
              </label>

              <div className="flex gap-2 mb-2">
                {/* Экспорт */}
                <button
                  id="backup-export-btn"
                  onClick={handleExport}
                  disabled={backupStatus === 'exporting'}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-sky-900/40 border border-sky-700 text-sky-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-sky-800/50 disabled:opacity-50 transition-all"
                >
                  <Download className={`w-3.5 h-3.5 ${backupStatus === 'exporting' ? 'animate-bounce' : ''}`} />
                  {backupStatus === 'exporting' ? 'Экспорт...' : 'Экспорт / Поделиться'}
                </button>

                {/* Импорт */}
                <button
                  id="backup-import-btn"
                  onClick={handleImportPick}
                  disabled={backupStatus === 'importing'}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-900/30 border border-emerald-700 text-emerald-300 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-800/40 disabled:opacity-50 transition-all"
                >
                  <Upload className={`w-3.5 h-3.5 ${backupStatus === 'importing' ? 'animate-pulse' : ''}`} />
                  {backupStatus === 'importing' ? 'Выбор файла...' : 'Восстановить'}
                </button>
              </div>

              {/* Статус операции */}
              {backupStatus === 'success' && (
                <p className="text-[10px] font-bold text-emerald-400 text-center animate-pulse">✓ Операция выполнена успешно</p>
              )}
              {backupStatus === 'error' && backupError && (
                <p className="text-[10px] font-bold text-red-400 leading-relaxed">{backupError}</p>
              )}

              <p className="mt-2 text-[9px] text-stone-600 leading-relaxed">
                Экспорт сохраняет все задачи в JSON-файл и открывает меню «Поделиться». Импорт полностью заменяет текущие данные.
              </p>
            </div>


        {/* ── Вкладко-специфичные настройки ────────────────────────────── */}
        {activeTab === 'daily' && (
          <div className="flex items-center gap-4 bg-stone-900 p-4 rounded-xl border border-stone-700 shadow-inner">
            <input type="range" min="1" max="16" step="0.5" value={settings.dailyLimit}
              onChange={e => updateSettings({ dailyLimit: parseFloat(e.target.value) })}
              className="flex-1 accent-amber-500 h-1.5 bg-stone-800 rounded-full appearance-none outline-none" />
            <span className="font-mono font-black text-amber-500 text-lg">{settings.dailyLimit}ч</span>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Дневная норма:</span>
              <input type="number" value={settings.goals.daily} onChange={e => updateSettings({ goals: { ...settings.goals, daily: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" />
            </div>
            <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Недельный цикл:</span>
              <input type="number" value={settings.goals.weekly} onChange={e => updateSettings({ goals: { ...settings.goals, weekly: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" />
            </div>
            <div className="flex justify-between items-center bg-stone-900 p-3 rounded-xl border border-stone-700 shadow-inner">
              <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Месячный объем:</span>
              <input type="number" value={settings.goals.monthly} onChange={e => updateSettings({ goals: { ...settings.goals, monthly: parseInt(e.target.value) || 0 } })} className="w-20 bg-stone-950 border border-stone-800 rounded p-1.5 text-center font-black text-emerald-500 text-sm outline-none" />
            </div>
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
                    {editCat === cat
                      ? <input autoFocus className="bg-stone-900 border border-stone-700 rounded px-2 py-1 text-xs font-bold text-stone-200 outline-none w-full mr-2 shadow-inner" value={editCatName} onChange={e => setEditCatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveCat(cat); if (e.key === 'Escape') setEditCat(null); }} />
                      : <span className="text-xs font-bold text-stone-300 truncate pr-2 flex-1">{cat}</span>
                    }
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
      </div>
    </>
  );
};