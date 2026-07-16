import type { Analysis } from './types';
const KEY = 'danggun-pc-analyses-v1';
export const loadAnalyses = (): Analysis[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
export const saveAnalyses = (items: Analysis[]) => localStorage.setItem(KEY, JSON.stringify(items));
