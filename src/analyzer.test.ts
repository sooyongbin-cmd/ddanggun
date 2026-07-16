import { describe, expect, it } from 'vitest';
import { analyze, getCpuPerformanceScore, getCpuSpecification, parseSpecs } from './analyzer';
describe('PC analyzer', () => {
  it('extracts common PC specifications and scores a complete listing', () => { const x = analyze({ id:'1', title:'i5-10400 RAM 16GB SSD 512GB 본체', price:300000, url:'https://x' }); expect(x.specs.ramGb).toBe(16); expect(x.specs.storageGb).toBe(512); expect(x.valueScore).not.toBeNull(); expect(x.confidence).toBe('high'); });
  it('flags missing or negotiable prices', () => { const x = analyze({ id:'2', title:'i3 8GB PC', price:null, url:'https://x' }); expect(x.flags).toContain('가격 확인 필요'); expect(x.valueScore).toBeNull(); });
  it('recognizes Ryzen notation', () => expect(parseSpecs('라이젠 5 5600 ram: 16g ssd 1tb').cpu).toMatch(/라이젠/i));
  it('recognizes catalog Core Ultra and Athlon models', () => {
    expect(parseSpecs('Intel Core Ultra 5 245K 데스크톱').cpu).toMatch(/Ultra/i);
    expect(parseSpecs('AMD Athlon 3000G 본체').cpu).toMatch(/Athlon/i);
  });
  it('extracts capacity and type when capacity comes before the storage type', () => { const specs = parseSpecs('DDR4 8GB RAM\n240GB SSD가 탑재되어 있어요'); expect(specs.storageGb).toBe(240); expect(specs.storageType).toBe('SSD'); });
  it('does not mistake SSD capacity for RAM in a compact specification title', () => { const x = analyze({ id:'tablet', title:'삼성 태블릿 PC i5-3337U 4GB RAM 512GB SSD', body:'인텔 코어 i5-3337U CPU, 4GB RAM, 512GB SSD', price:180000, url:'https://x' }); expect(x.specs.ramGb).toBe(4); expect(x.specs.storageGb).toBe(512); expect(x.specs.storageType).toBe('SSD'); });
  it('orders newer and higher-tier CPUs above older mobile CPUs', () => { expect(getCpuPerformanceScore('i5-10400')).toBeGreaterThan(getCpuPerformanceScore('i5-6500')); expect(getCpuPerformanceScore('i5-6500')).toBeGreaterThan(getCpuPerformanceScore('i5-3337U')); expect(getCpuPerformanceScore('Ryzen 5 5600')).toBeGreaterThan(getCpuPerformanceScore('i5-10400')); });
  it('returns exact clock, core and thread specifications for catalog CPUs', () => { expect(getCpuSpecification('Intel Core i3-6100')).toEqual({cores:2,threads:4,baseGhz:3.7}); expect(getCpuSpecification('i5-3337U')).toEqual({cores:2,threads:4,baseGhz:1.8,maxGhz:2.7}); expect(getCpuSpecification('라이젠 7600')).toEqual({cores:6,threads:12,baseGhz:3.8,maxGhz:5.1}); });
  it('includes exact specifications for the comparison computer', () => { expect(getCpuSpecification('Intel(R) Core(TM) i5-6600K CPU @ 3.50GHz')).toEqual({cores:4,threads:4,baseGhz:3.5,maxGhz:3.9}); expect(getCpuPerformanceScore('i5-6600K')).toBeGreaterThan(getCpuPerformanceScore('i5-6500')); });
  it('extracts Korean RAM labels and storage without spacing from listing content', () => { const x = analyze({ id:'m710q', title:'미니PC 레노버 M710q I7-6700t 16G 240G', body:'사양\ni7-6700T CPU\n16GB 램\nssd240GB\n윈도우10프로', price:300000, url:'https://x' }); expect(x.specs.ramGb).toBe(16); expect(x.specs.storageGb).toBe(240); expect(x.specs.storageType).toBe('SSD'); });
});
