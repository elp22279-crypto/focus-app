import { z } from 'zod';

export const VoiceTaskSchema = z.object({
  title: z.string().min(1).max(150),
  priority: z.enum(['ui', 'in', 'un', 'nn']).default('nn'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
  estimate: z.number().min(0).max(100).default(0)
});

export const parseVoiceInput = async (rawText) => {
  if (!rawText || typeof rawText !== 'string') return null;
  
  const sanitizedText = rawText.replace(/[^\w\sа-яА-ЯёЁ.,!?-]/gi, '').substring(0, 300);
  if (!sanitizedText.trim()) return null;

  return {
    title: sanitizedText.trim(),
    priority: 'nn',
    date: null,
    estimate: 0
  };
};
