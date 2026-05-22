import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

const subtasksSchema = z.object({
  subtasks: z.array(z.object({
    title: z.string().min(1),
    estimate: z.number().min(0),
    priority: z.enum(['ui', 'in', 'un', 'nn'])
  }))
});

const analyticsSchema = z.object({
  success: z.string(),
  bottleneck: z.string(),
  action: z.string()
});

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

export const generateSubtasksWithAI = async (parentTaskTitle, apiKey, signal) => {
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          subtasks: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                title: { type: SchemaType.STRING },
                estimate: { type: SchemaType.NUMBER },
                priority: { type: SchemaType.STRING, description: "Одно из: ui, in, un, nn" }
              },
              required: ["title", "estimate", "priority"]
            }
          }
        },
        required: ["subtasks"]
      }
    }
  });

  const prompt = `
    Разбей задачу "${parentTaskTitle}" на 3-5 конкретных подзадач.
    Верни СТРОГО валидный JSON в формате:
    {
      "subtasks": [
        { "title": "Название шага", "estimate": 0.5, "priority": "in" }
      ]
    }
    Поле estimate - число (часы). Поле priority - строго одно из: "ui", "in", "un", "nn".
  `;

  let attempts = 0;
  while (attempts < 3) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {

      const result = await model.generateContent(prompt, { requestOptions: { signal } });
      const content = result.response.text();

      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      const validation = subtasksSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error('Данные ИИ не соответствуют бизнес-правилам');
      }
      return validation.data.subtasks;
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) throw error;
      if (error instanceof MissingApiKeyError) throw error;
      
      attempts++;
      if (attempts >= 3) {
        throw new Error(`Сбой ИИ после 3 попыток: ${error.message}`);
      }
      console.warn(`[AI Retry] Попытка ${attempts} провалена, повторяем через ${1000 * Math.pow(2, attempts - 1)}мс...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
    }
  }
};

export const generateAnalyticsWithAI = async (payload, periodDays, apiKey, signal) => {
  if (!apiKey) {
    throw new MissingApiKeyError();
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          success: { type: SchemaType.STRING, description: "Главный успех" },
          bottleneck: { type: SchemaType.STRING, description: "Узкое горлышко" },
          action: { type: SchemaType.STRING, description: "Директивное действие" }
        },
        required: ["success", "bottleneck", "action"]
      }
    }
  });

  const prompt = `
Ты — жесткий аналитик продуктивности. Проанализируй этот минималистичный список завершенных и "зависших" (переносимых) задач за последние ${periodDays} дней:
${JSON.stringify(payload)}

Сформируй вывод:
1. success: Главный успех (1-2 коротких предложения о завершенных задачах)
2. bottleneck: Узкое горлышко (укажи задачу или паттерн, который саботируется; обрати внимание на times - это количество переносов)
3. action: Директивное действие (что нужно сделать завтра, чтобы пробить затор)

Никаких приветствий. Строго по сути.
  `;

  let attempts = 0;
  while (attempts < 3) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {

      const result = await model.generateContent(prompt, { requestOptions: { signal } });
      const content = result.response.text();

      if (!content) throw new Error('Empty AI response');

      const parsed = JSON.parse(content);
      const validation = analyticsSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error('Данные ИИ не соответствуют бизнес-правилам');
      }
      return validation.data;
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) throw error;
      if (error instanceof MissingApiKeyError) throw error;
      
      attempts++;
      if (attempts >= 3) {
        throw new Error(`Сбой ИИ после 3 попыток: ${error.message}`);
      }
      console.warn(`[AI Retry] Попытка ${attempts} провалена, повторяем через ${1000 * Math.pow(2, attempts - 1)}мс...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
    }
  }
};