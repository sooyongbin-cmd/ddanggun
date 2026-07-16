import { getCpuPerformanceScore, getCpuSpecification } from './analyzer';

export type CpuDisplayInfo = {
  performance: number | null;
  specification: string;
};

export function getCpuDisplayInfo(cpu: string): CpuDisplayInfo {
  if (!cpu.trim() || /확인\s*불가|unknown|n\/a/i.test(cpu)) {
    return { performance: null, specification: '성능 정보 확인 불가' };
  }

  const specification = getCpuSpecification(cpu);
  return {
    performance: getCpuPerformanceScore(cpu),
    specification: specification
      ? `${specification.cores}코어 · ${specification.threads}스레드 · 기본 ${specification.baseGhz}GHz${specification.maxGhz ? ` · 최대 ${specification.maxGhz}GHz` : ''}`
      : '코어·클럭 상세 정보 확인 불가',
  };
}
