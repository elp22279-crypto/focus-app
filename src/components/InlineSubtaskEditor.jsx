// src/components/InlineSubtaskEditor.jsx
/**
 * Компактный inline-редактор для создания подзадачи прямо под родительским
 * элементом списка. Не использует глобальный editingNodeId — всё локально.
 *
 * Props:
 *   parentTask  — объект родительской задачи (для наследования date/status/priority)
 *   onSave      — () => void  — вызывается после успешного сохранения
 *   onCancel    — () => void  — вызывается при отмене
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, CalendarDays, Target, Clock } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { PRIORITIES } from '../utils/constants.js';
import { triggerLightImpact, triggerSuccess, triggerWarning } from '../utils/haptics.js';

export const InlineSubtaskEditor = ({ parentTask, onSave, onCancel }) => {
  const addTask = useStore(state => state.addTask);

  const [title,    setTitle]    = useState('');
  const [priority, setPriority] = useState(parentTask?.priority || 'nn');
  const [date,     setDate]     = useState(parentTask?.date || '');
  const [time,     setTime]     = useState('');
  const [showMeta, setShowMeta] = useState(false);

  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // ── Скролл + автофокус при монтировании ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      // Небольшая задержка — ждём открытия системной клавиатуры
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    // Даём React смонтировать DOM, затем фокусируем поле
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Обработчики ─────────────────────────────────────────────────────────
  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) { triggerWarning(); inputRef.current?.focus(); return; }

    addTask({
      title: trimmed,
      parentId: parentTask.id,
      status:   parentTask.status   || 'backlog',
      date:     date                || parentTask.date  || null,
      priority: priority            || parentTask.priority || 'nn',
      time:     time                || null,
      skipEdit: true,
    });

    triggerSuccess();
    onSave?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { triggerLightImpact(); onCancel?.(); }
  };

  const prio = PRIORITIES[priority] || PRIORITIES['nn'];

  return (
    <div
      ref={containerRef}
      className="ml-5 mt-2 animate-in slide-in-from-left-2 fade-in duration-200"
    >
      {/* ── Линия-соединитель ────────────────────────────────────────────── */}
      <div className="absolute left-[1.35rem] w-px bg-stone-700" style={{ top: 0, bottom: 0 }} aria-hidden />

      <div className="bg-stone-800/90 border border-stone-600 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden">

        {/* ── Поле названия ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${prio.bg} ${prio.border} border`} />
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Название подзадачи..."
            className="flex-1 bg-transparent text-sm font-bold text-stone-200 outline-none placeholder-stone-600"
          />
          {/* Кнопка закрытия */}
          <button
            onClick={() => { triggerLightImpact(); onCancel?.(); }}
            className="p-1 rounded-full bg-stone-700 hover:bg-stone-600 transition-colors flex-shrink-0"
            aria-label="Отмена"
          >
            <X className="w-3 h-3 text-stone-400" />
          </button>
        </div>

        {/* ── Мета-строка (опциональная) ───────────────────────────────── */}
        {showMeta && (
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
            {/* Приоритет */}
            <select
              value={priority}
              onChange={e => { setPriority(e.target.value); triggerLightImpact(); }}
              className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-[10px] font-black text-stone-300 outline-none flex-shrink-0"
            >
              {Object.entries(PRIORITIES).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>

            {/* Дата */}
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 flex-shrink-0">
              <CalendarDays className="w-3 h-3 text-stone-500 flex-shrink-0" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-stone-300 outline-none w-[90px]"
              />
            </div>

            {/* Время */}
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 flex-shrink-0">
              <Clock className="w-3 h-3 text-stone-500 flex-shrink-0" />
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-amber-400 outline-none w-[60px]"
              />
            </div>
          </div>
        )}

        {/* ── Нижняя панель кнопок ─────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-stone-700/60 bg-stone-900/40">
          {/* Кнопка раскрытия мета-полей */}
          <button
            onClick={() => { setShowMeta(v => !v); triggerLightImpact(); }}
            className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${
              showMeta
                ? 'bg-stone-700 text-stone-300 border border-stone-600'
                : 'text-stone-500 hover:text-stone-400'
            }`}
          >
            <Target className="w-3 h-3" />
            {showMeta ? prio.label : 'Детали'}
          </button>

          {/* Унаследовано от родителя — бейдж */}
          {parentTask?.date && !showMeta && (
            <span className="text-[9px] text-stone-600 font-bold flex items-center gap-1">
              <CalendarDays className="w-2.5 h-2.5" />
              {parentTask.date}
            </span>
          )}

          {/* Сохранить */}
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
};
