// src/utils/constants.js
export const PRIORITIES = {
  'ui': { label: 'Важно & Срочно', color: 'text-red-400', bg: 'bg-red-950', border: 'border-red-900' },
  'in': { label: 'Важно, Не срочно', color: 'text-amber-400', bg: 'bg-amber-950', border: 'border-amber-900' },
  'un': { label: 'Срочно, Не важно', color: 'text-blue-400', bg: 'bg-blue-950', border: 'border-blue-900' },
  'nn': { label: 'Не важно, Не срочно', color: 'text-stone-400', bg: 'bg-stone-900', border: 'border-stone-700' }
};

export const TIME_BLOCKS = [
  { id: 'early', label: 'До 09:00', check: (t) => t && t < '09:00' },
  { id: 'morning', label: '09:00 - 12:00', check: (t) => t >= '09:00' && t < '12:00' },
  { id: 'day', label: '12:00 - 15:00', check: (t) => t >= '12:00' && t < '15:00' },
  { id: 'afternoon', label: '15:00 - 18:00', check: (t) => t >= '15:00' && t < '18:00' },
  { id: 'evening', label: '18:00 - 21:00', check: (t) => t >= '18:00' && t < '21:00' },
  { id: 'night', label: 'После 21:00', check: (t) => t >= '21:00' },
  { id: 'none', label: 'Без времени', check: (t) => !t }
];