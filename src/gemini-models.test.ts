import { describe, expect, it } from 'vitest';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from './gemini-models';

describe('Gemini model selection', () => {
  it('uses Gemini 3.1 Flash-Lite as the default selectable model', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.1-flash-lite');
    expect(GEMINI_MODELS.some((model) => model.id === DEFAULT_GEMINI_MODEL)).toBe(true);
  });
});
