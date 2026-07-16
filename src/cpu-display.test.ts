import { describe, expect, it } from 'vitest';
import { getCpuDisplayInfo } from './cpu-display';

describe('getCpuDisplayInfo', () => {
  it('returns performance and registered CPU specifications', () => {
    expect(getCpuDisplayInfo('Intel Core i5-6600K')).toEqual({
      performance: 58,
      specification: '4코어 · 4스레드 · 기본 3.5GHz · 최대 3.9GHz',
    });
  });

  it('returns a performance index even when detailed specifications are unavailable', () => {
    const result = getCpuDisplayInfo('i9-10900');
    expect(result.performance).toBeGreaterThan(0);
    expect(result.specification).toBe('코어·클럭 상세 정보 확인 불가');
  });

  it.each(['확인 불가', '확인불가', 'unknown', 'N/A'])('does not calculate unavailable CPU text: %s', (cpu) => {
    expect(getCpuDisplayInfo(cpu)).toEqual({ performance: null, specification: '성능 정보 확인 불가' });
  });
});
