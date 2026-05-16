// src/utils/ai.js
import { useStore } from '../store/useStore.js';

/**
 * Кастомная ошибка — выбрасывается когда API-ключ не задан пользователем.
 * Позволяет вызывающему коду отличить «нет ключа» от сетевой ошибки.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super('API-ключ не задан. Укажите ключ в настройках приложения.');
    this.name = 'MissingApiKeyError';
  }
}

export const generateSubtasksWithAI = async (parentTaskTitle) => {
  const apiKey = useStore.getState().apiKey;

  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const prompt = `
    Разбей задачу "${parentTaskTitle}" на 3-5 конкретных подзадач.
    Верни СТРОГО валидный JSON в формате:
    {
      "subtasks": [
        { "title": "Название шага", "estimate": 0.5, "priority": "in" }
      ]
    }
    Поле estimate - число (часы). Поле priority - строго одно из: "ui", "in", "un", "nn".
    Выведи ТОЛЬКО JSON. Никакого текста до или после. Не используй маркдаун-теги.
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.json();
      console.error('Google API Error Details:', errorBody);
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    let content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) throw new Error('Empty AI response');

    // Бронебойная зачистка мусора на случай галлюцинаций парсера
    content = content.replace(/```json/gi, '').replace(/```/gi, '').trim();

    const parsed = JSON.parse(content);
    return parsed.subtasks || [];
  } catch (error) {
    // Пробрасываем MissingApiKeyError без перехвата
    if (error instanceof MissingApiKeyError) throw error;
    console.error('Сбой генерации ИИ:', error);
    return [];
  }
};