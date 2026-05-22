// src/utils/helpers.js
import { v4 as uuidv4 } from 'uuid';

export const generateId = () => uuidv4();

export const calculatePoints = (estimateHours) => {
  if (!estimateHours || estimateHours <= 0) return 0;
  const mins = Math.round(estimateHours * 60);
  if (mins <= 10) return 0.5;
  if (mins <= 60) return Number((0.5 + ((mins - 10) * 0.59)).toFixed(1));
  const fullHours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return Number((30 + ((fullHours - 1) * 5) + (Math.floor(remMins / 5) * 0.2)).toFixed(1));
};

export const calculateNextDate = (taskDateStr, repeatType, repeatDays, repeatMonthDay) => {
  if (repeatType === 'none') return null;

  // Берем текущее время телефона как абсолютный базис
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  
  // Парсим дату задачи
  let baseDate;
  if (taskDateStr) {
    const parts = taskDateStr.split('-');
    baseDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 12, 0, 0);
  } else {
    baseDate = today;
  }

  // Если дата задачи в прошлом, начинаем отсчет от "сегодня"
  let startDate = baseDate < today ? today : baseDate;
  let d = new Date(startDate.getTime());

  if (repeatType === 'daily') {
    d.setDate(d.getDate() + 1);
  } 
  else if (repeatType === 'weekly') {
    if (repeatDays?.length > 0) {
      let currentDay = d.getDay() === 0 ? 7 : d.getDay();
      let sortedDays = [...repeatDays].sort((a, b) => a - b);
      let nextDay = sortedDays.find(day => day > currentDay);
      let daysToAdd = nextDay ? (nextDay - currentDay) : ((7 - currentDay) + sortedDays[0]);
      d.setDate(d.getDate() + daysToAdd);
    } else {
      d.setDate(d.getDate() + 7);
    }
  } 
  else if (repeatType === 'monthly') {
    if (repeatMonthDay) {
      d.setMonth(d.getMonth() + 1);
      let maxDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(repeatMonthDay, maxDays));
    } else {
      d.setMonth(d.getMonth() + 1);
    }
  }

  return d.toISOString().split('T')[0];
};

export const formatHeaderDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  return `${d.getDate()} ${months[d.getMonth()]}, ${days[d.getDay()]}`;
};