import { describe, expect, it } from 'vitest';
import { normalizeCpuModel } from './cpu-model';

describe('normalizeCpuModel', () => {
  it.each([
    ['Intel Core i5-10400F', 'i5-10400f'],
    ['i5 10400f', 'i5-10400f'],
    ['AMD Ryzen 7 5800X3D', 'ryzen7-5800x3d'],
    ['라이젠 5 7600', 'ryzen5-7600'],
    ['AMD Athlon 3000G', 'athlon-3000g'],
    ['Intel Core Ultra 5 245K', 'core-ultra-245k'],
    ['Intel Core Ultra 250KF Plus', 'core-ultra-250kf-plus'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCpuModel(input)).toBe(expected);
  });
});
