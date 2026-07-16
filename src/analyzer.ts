import type { Analysis, Listing, ParsedSpecs, StorageType } from './types';

const cpuScores: [RegExp, number][] = [
  [/i[3579][ -]?(1[012345]|[6-9])\d{3}/i, 90], [/ryzen\s?[3579]\s?(5|7)?\d{3}/i, 88],
  [/i[357][ -]?(4|5)\d{3}/i, 62], [/ryzen\s?[357]\s?[234]\d{2,3}/i, 60],
  [/i[357][ -]?[23]\d{3}/i, 42], [/i[357][ -]?\d{3}/i, 26], [/pentium|celeron|atom/i, 12]
];
function findCpu(text: string) { const m = text.match(/(?:intel\s*)?core\s*ultra\s*(?:[579]\s*)?\d{3}[a-z]*(?:\s*plus)?|(?:intel\s*)?(?:core\s*)?i[3579][ -]?\d{3,5}[a-z]*|(?:(?:amd\s*)?ryzen|라이젠)\s?[3579]\s?\d{3,4}[a-z]*|(?:amd\s*)?athlon(?:\s+pro)?\s*\d{3,4}[a-z]*/i); return m?.[0]; }
function parseRam(text: string) {
  const sizeFirst = text.match(/(\d{1,3})\s*(?:gb|g)\s*(?:ram|램|메모리)(?![a-z0-9])/i);
  if (sizeFirst) return Number(sizeFirst[1]);
  const labelFirst = text.match(/(?:ram|램|메모리|ddr[345]?)\s*[:\-]?\s*(\d{1,3})\s*(?:gb|g)(?![a-z0-9])/i);
  return labelFirst ? Number(labelFirst[1]) : undefined;
}
function normalizeStorageType(value?: string): StorageType | undefined { if (!value) return undefined; const type = value.toLowerCase(); return type === 'nvme' ? 'NVMe' : type === 'ssd' ? 'SSD' : type === 'hdd' ? 'HDD' : type === 'emmc' ? 'eMMC' : undefined; }
function parseStorage(text: string) {
  const typeFirst = text.match(/(?:^|\s)(nvme|ssd|hdd|emmc)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(tb|gb|g)(?![a-z0-9])/i);
  if (typeFirst) return { storageGb: Math.round(Number(typeFirst[2]) * (typeFirst[3].toLowerCase() === 'tb' ? 1024 : 1)), storageType: normalizeStorageType(typeFirst[1]) };
  const sizeFirst = text.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(tb|gb|g)\s*(nvme|ssd|hdd|emmc)(?![a-z0-9])/i);
  if (sizeFirst) return { storageGb: Math.round(Number(sizeFirst[1]) * (sizeFirst[2].toLowerCase() === 'tb' ? 1024 : 1)), storageType: normalizeStorageType(sizeFirst[3]) };
  const generic = text.match(/저장장치\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(tb|gb|g)/i);
  return generic ? { storageGb: Math.round(Number(generic[1]) * (generic[2].toLowerCase() === 'tb' ? 1024 : 1)), storageType: undefined } : {};
}
export function parseSpecs(text: string): ParsedSpecs {
  const cpu = findCpu(text); const ramGb = parseRam(text); const { storageGb, storageType } = parseStorage(text);
  const gpu = text.match(/(?:rtx|gtx|rx)\s?\d{3,4}(?:\s?(?:ti|super))?/i)?.[0];
  const kind = /노트북|laptop/i.test(text) ? 'laptop' : /본체|데스크탑|desktop|pc/i.test(text) ? 'desktop' : undefined;
  return { cpu, ramGb, storageGb, storageType, gpu, kind, evidence: [cpu, ramGb && `RAM ${ramGb}GB`, storageGb && `${storageType ?? '저장장치'} ${storageGb}GB`, gpu].filter(Boolean) as string[] };
}
function cpuScore(cpu?: string) { if (!cpu) return 0; return cpuScores.find(([re]) => re.test(cpu))?.[1] ?? 45; }
export type CpuSpecification = { cores: number; threads: number; baseGhz: number; maxGhz?: number };
const cpuSpecifications: Record<string, CpuSpecification> = {
  'i3-10105':{cores:4,threads:8,baseGhz:3.7,maxGhz:4.4}, 'i3-4130':{cores:2,threads:4,baseGhz:3.4},
  'i3-4160':{cores:2,threads:4,baseGhz:3.6}, 'i3-4360t':{cores:2,threads:4,baseGhz:3.2},
  'i3-6100':{cores:2,threads:4,baseGhz:3.7}, 'i3-8100':{cores:4,threads:4,baseGhz:3.6},
  'i3-8100t':{cores:4,threads:4,baseGhz:3.1}, 'i3-9100f':{cores:4,threads:4,baseGhz:3.6,maxGhz:4.2},
  'i5-2500':{cores:4,threads:4,baseGhz:3.3,maxGhz:3.7}, 'i5-3337u':{cores:2,threads:4,baseGhz:1.8,maxGhz:2.7},
  'i5-3570':{cores:4,threads:4,baseGhz:3.4,maxGhz:3.8}, 'i5-4570':{cores:4,threads:4,baseGhz:3.2,maxGhz:3.6},
  'i5-4590':{cores:4,threads:4,baseGhz:3.3,maxGhz:3.7}, 'i5-4690':{cores:4,threads:4,baseGhz:3.5,maxGhz:3.9},
  'i5-6500':{cores:4,threads:4,baseGhz:3.2,maxGhz:3.6}, 'i5-6600k':{cores:4,threads:4,baseGhz:3.5,maxGhz:3.9}, 'i5-7400':{cores:4,threads:4,baseGhz:3,maxGhz:3.5},
  'i5-7500':{cores:4,threads:4,baseGhz:3.4,maxGhz:3.8}, 'i5-7600':{cores:4,threads:4,baseGhz:3.5,maxGhz:4.1},
  'i7-6700t':{cores:4,threads:8,baseGhz:2.8,maxGhz:3.6}, 'i7-10700':{cores:8,threads:16,baseGhz:2.9,maxGhz:4.8},
  'ryzen3-2200g':{cores:4,threads:4,baseGhz:3.5,maxGhz:3.7}, 'ryzen5-7600':{cores:6,threads:12,baseGhz:3.8,maxGhz:5.1},
};
function normalizeCpuKey(cpu?: string) {
  if (!cpu) return '';
  if (/(?:ryzen|라이젠)\s*7600/i.test(cpu)) return 'ryzen5-7600';
  const intel = cpu.match(/i([3579])[ -]?(\d{3,5})([a-z]*)/i);
  if (intel) return `i${intel[1]}-${intel[2]}${intel[3]}`.toLowerCase();
  const ryzen = cpu.match(/(?:ryzen|라이젠)\s*([3579])\s*(\d{3,4})([a-z]*)/i);
  return ryzen ? `ryzen${ryzen[1]}-${ryzen[2]}${ryzen[3]}`.toLowerCase() : '';
}
export function getCpuSpecification(cpu?: string) { return cpuSpecifications[normalizeCpuKey(cpu)]; }
export function getCpuPerformanceScore(cpu?: string) {
  if (!cpu) return 0;
  if (normalizeCpuKey(cpu) === 'i5-6600k') return 58;
  if (normalizeCpuKey(cpu) === 'ryzen5-7600') return 140;
  const intel = cpu.match(/i([3579])[ -]?(\d{3,5})([a-z]*)/i);
  if (intel) {
    const tier = Number(intel[1]); const model = Number(intel[2]); const suffix = intel[3].toUpperCase();
    const generation = Math.floor(model / 1000);
    const tierBonus: Record<number, number> = { 3:-10, 5:0, 7:15, 9:28 };
    const suffixPenalty = suffix.includes('U') ? 15 : suffix.includes('T') ? 8 : 0;
    return Math.max(1, generation * 10 - 10 + (tierBonus[tier] ?? 0) - suffixPenalty);
  }
  const ryzen = cpu.match(/(?:ryzen|라이젠)\s*([3579])\s*(\d{3,4})([a-z]*)/i);
  if (ryzen) {
    const tier = Number(ryzen[1]); const model = Number(ryzen[2]); const suffix = ryzen[3].toUpperCase();
    const generation = Math.floor(model / 1000);
    const tierBonus: Record<number, number> = { 3:-12, 5:0, 7:15, 9:28 };
    const suffixPenalty = suffix.includes('U') ? 12 : suffix.includes('H') ? 5 : 0;
    return Math.max(1, generation * 20 + (tierBonus[tier] ?? 0) - suffixPenalty);
  }
  return cpuScore(cpu);
}
export function analyze(listing: Listing, overrides: Partial<ParsedSpecs> = {}): Analysis {
  const specs = { ...parseSpecs(`${listing.body ?? ''} ${listing.title}`), ...overrides };
  const flags: string[] = []; const reasons: string[] = [];
  if (listing.price == null || listing.price <= 0) flags.push('가격 확인 필요');
  if (!specs.cpu) flags.push('CPU 확인 필요'); if (!specs.ramGb) flags.push('RAM 확인 필요'); if (!specs.storageGb) flags.push('저장장치 확인 필요');
  const raw = cpuScore(specs.cpu) + Math.min((specs.ramGb ?? 0) * 2.2, 42) + Math.min((specs.storageGb ?? 0) / 32, 32) + (specs.gpu ? 6 : 0);
  const completeness = [specs.cpu, specs.ramGb, specs.storageGb].filter(Boolean).length;
  const confidence = completeness === 3 && listing.price ? 'high' : completeness >= 2 ? 'medium' : 'low';
  const valueScore = listing.price && completeness >= 2 ? Math.round((raw / listing.price) * 100000 * (completeness === 3 ? 1 : .7) * 10) / 10 : null;
  if ((specs.ramGb ?? 0) >= 16) reasons.push('멀티태스킹에 충분한 메모리'); else reasons.push('메모리 용량을 확인하세요');
  if ((specs.storageGb ?? 0) >= 256) reasons.push('일반 문서·웹 작업에 적절한 저장공간'); else reasons.push('저장공간이 부족할 수 있습니다');
  if (cpuScore(specs.cpu) >= 60) reasons.push('사무·개발용 CPU 성능이 양호합니다'); else reasons.push('CPU 세대·모델을 확인하세요');
  return { ...listing, specs, valueScore, confidence, flags, reasons, savedAt: Date.now() };
}
