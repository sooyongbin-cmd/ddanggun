export const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
] as const;

export type GeminiModel = typeof GEMINI_MODELS[number]['id'];
export const DEFAULT_GEMINI_MODEL: GeminiModel = 'gemini-3.1-flash-lite';

export function isGeminiModel(value: unknown): value is GeminiModel {
  return typeof value === 'string' && GEMINI_MODELS.some((model) => model.id === value);
}
