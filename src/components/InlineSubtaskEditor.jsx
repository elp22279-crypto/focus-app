// src/components/InlineSubtaskEditor.jsx
/**
 * Компактный inline-редактор для создания подзадачи прямо под родительским
 * элементом списка. Не использует глобальный editingNodeId — всё локально.
 *
 * Props:
 *   parentTask   — объект родительской задачи
 *   onSave       — () => void — вызывается после успешного сохранения
 *   onCancel     — () => void — вызывается при отмене
 *   prevInputRef — React.RefObject — ref предыдущего элемента (Backspace-фокус)
 *   savedTaskId  — string | null — ID только что сохранённой задачи (для Tab indent/outdent)
 */
import React, { useState, useRef, useEffect } from 'react';
import { X, Check, CalendarDays, Target, Clock } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { PRIORITIES } from '../utils/constants.js';
import { triggerLightImpact, triggerSuccess, triggerWarning } from '../utils/haptics.js';

export const InlineSubtaskEditor = ({ parentTask, onSave, onCancel, prevInputRef }) => {
  const addTask    = useStore(state => state.addTask);
  const updateTask = useStore(state => state.updateTask);

  const [title,    setTitle]    = useState('');
  const [priority, setPriority] = useState(parentTask?.priority || 'nn');
  const [date,     setDate]     = useState(parentTask?.date || '');
  const [time,     setTime]     = useState('');
  const [showMeta, setShowMeta] = useState(false);

  // ID последней сохранённой задачи — нужен для Tab/Shift+Tab indent/outdent
  const lastSavedIdRef = useRef(null);

  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // ── Скролл + автофокус при монтировании ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Сохранение ───────────────────────────────────────────────────────────
  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) { triggerWarning(); inputRef.current?.focus(); return null; }

    // addTask возвращает void, но нам нужен ID — читаем из стора после вызова
    const prevKeys = new Set(Object.keys(useStore.getState().byId));

    addTask({
      title: trimmed,
      parentId: parentTask.id,
      status:   parentTask.status   || 'backlog',
      date:     date                || parentTask.date  || null,
      priority: priority            || parentTask.priority || 'nn',
      time:     time                || null,
      skipEdit: true,
    });

    // Новый ID = ключ в byId, которого не было до addTask
    const newId = Object.keys(useStore.getState().byId).find(k => !prevKeys.has(k)) || null;
    lastSavedIdRef.current = newId;

    triggerSuccess();
    onSave?.();
    return newId;
  };

  // ── Indent: Tab — сделать текущую задачу ребёнком предыдущего сиблинга ──
  const indentLastSaved = () => {
    const savedId = lastSavedIdRef.current;
    if (!savedId) return;

    const byId = useStore.getState().byId;
    const savedTask = byId[savedId];
    if (!savedTask) return;

    const currentParent = byId[savedTask.parentId];
    if (!currentParent) return;

    const siblings = currentParent.childrenIds || [];
    const myIndex  = siblings.indexOf(savedId);
    if (myIndex <= 0) return; // нет предыдущего сиблинга — нельзя вложить

    const prevSiblingId = siblings[myIndex - 1];
    if (!prevSiblingId || !byId[prevSiblingId]) return;

    triggerLightImpact();
    // Меняем parentId → предыдущий сиблинг
    updateTask(savedId, { parentId: prevSiblingId });
  };

  // ── Outdent: Shift+Tab — поднять задачу на уровень деда ─────────────────
  const outdentLastSaved = () => {
    const savedId = lastSavedIdRef.current;
    if (!savedId) return;

    const byId = useStore.getState().byId;
    const savedTask = byId[savedId];
    if (!savedTask) return;

    const currentParent = byId[savedTask.parentId];
    if (!currentParent || !currentParent.parentId) return; // уже корневой уровень

    const grandParentId = currentParent.parentId;
    if (!byId[grandParentId]) return;

    triggerLightImpact();
    // Находим позицию текущего родителя в childrenIds деда и вставляем сразу после него
    const grandChildren = byId[grandParentId].childrenIds || [];
    const parentIndexInGrand = grandChildren.indexOf(currentParent.id);

    // updateTask сделает rewiring graph: удалит из старого parent, добавит в нового
    updateTask(savedId, { parentId: grandParentId });

    // Дополнительно: переставить в правильную позицию (сразу после старого родителя)
    // Делаем через прямое set в store, т.к. updateTask всегда добавляет в конец
    const storeState = useStore.getState();
    const updatedGrand = storeState.byId[grandParentId];
    if (updatedGrand) {
      // Убираем savedId из конца и вставляем после parentIndexInGrand
      const children = updatedGrand.childrenIds.filter(cId => cId !== savedId);
      const insertAt = parentIndexInGrand + 1;
      children.splice(insertAt, 0, savedId);
      useStore.setState(s => ({
        byId: {
          ...s.byId,
          [grandParentId]: { ...s.byId[grandParentId], childrenIds: children }
        }
      }));
    }
  };

  // ── Keyboard handler ─────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    // Enter: сохранить и создать следующий сиблинг
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
      return;
    }

    // Escape: отмена
    if (e.key === 'Escape') {
      e.preventDefault();
      triggerLightImpact();
      onCancel?.();
      return;
    }

    // Backspace на пустом поле: удалить редактор, вернуть фокус вверх
    if (e.key === 'Backspace' && title === '') {
      e.preventDefault();
      triggerLightImpact();
      onCancel?.();
      if (prevInputRef?.current) {
        prevInputRef.current.focus();
      }
      return;
    }

    // Tab / Shift+Tab: indent / outdent последней сохранённой задачи
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentLastSaved();
      } else {
        // Если ещё не сохраняли — сначала сохранить, потом indent
        if (!lastSavedIdRef.current && title.trim()) {
          handleSave();
        }
        indentLastSaved();
      }
    }
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
            <select
              value={priority}
              onChange={e => { setPriority(e.target.value); triggerLightImpact(); }}
              className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-[10px] font-black text-stone-300 outline-none flex-shrink-0"
            >
              {Object.entries(PRIORITIES).map(([k, p]) => (
                <option key={k} value={k}>{p.label}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 flex-shrink-0">
              <CalendarDays className="w-3 h-3 text-stone-500 flex-shrink-0" />
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-transparent text-[10px] font-bold text-stone-300 outline-none w-[90px]"
              />
            </div>

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

        {/* ── Нижняя панель ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-stone-700/60 bg-stone-900/40">
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

          <span className="text-[8px] text-stone-700 font-mono hidden sm:flex gap-2">
            <kbd>Tab</kbd>→вглубь <kbd>⇧Tab</kbd>→наверх
          </span>

          {parentTask?.date && !showMeta && (
            <span className="text-[9px] text-stone-600 font-bold flex items-center gap-1">
              <CalendarDays className="w-2.5 h-2.5" />
              {parentTask.date}
            </span>
          )}

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
