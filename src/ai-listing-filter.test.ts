import { describe, expect, it } from 'vitest';
import { filterListingsForAi, prepareListingsForAi } from './ai-listing-filter';
import type { CpuSpec, Listing } from './types';

const listings: Listing[] = [
  { id: 'known', title: 'i5-10400 RAM 16GB PC', price: 250000, url: 'https://example.com/known' },
  { id: 'unknown', title: '고성능 조립 컴퓨터', price: 200000, url: 'https://example.com/unknown' },
];

describe('filterListingsForAi', () => {
  it('prepares only CPU-bearing unique listings for a PC search', () => {
    const prepared = prepareListingsForAi(listings, ' PC ');
    expect(prepared.cpuCandidates).toEqual([{ id: 'known', cpu: 'i5-10400' }]);
    expect(prepared).toMatchObject({ applied: true, excludedDuplicates: 0, excludedMissingCpuText: 1 });
  });

  it('excludes a CPU that was not matched in the database', () => {
    const result = filterListingsForAi(listings, 'PC', {});
    expect(result.listings).toEqual([]);
    expect(result.excludedMissingCpu).toBe(2);
  });

  it('keeps all listings for other search terms', () => {
    const result = filterListingsForAi(listings, '노트북');
    expect(result.listings).toHaveLength(2);
    expect(result).toMatchObject({ applied: false, excludedDuplicates: 0, excludedMissingCpu: 0, excludedByLimit: 0 });
  });

  it('keeps only the first id when title and body are identical', () => {
    const duplicateListings: Listing[] = [
      { id: 'first', title: 'i5-10400 PC', body: 'RAM 16GB', price: 200000, url: 'https://example.com/first' },
      { id: 'second', title: 'i5-10400 PC', body: 'RAM 16GB', price: 210000, url: 'https://example.com/second' },
      { id: 'different-body', title: 'i5-10400 PC', body: 'RAM 32GB', price: 220000, url: 'https://example.com/different' },
    ];
    const matches = {
      first: cpuSpec('Intel Core i5-10400', 150),
      'different-body': cpuSpec('Intel Core i5-10400', 150),
    };
    const result = filterListingsForAi(duplicateListings, 'PC', matches);
    expect(result.listings.map((item) => item.id)).toEqual(['first', 'different-body']);
    expect(result.excludedDuplicates).toBe(1);
  });

  it('selects at most 40 PC listings ordered by database performance rank', () => {
    const pcListings: Listing[] = Array.from({ length: 42 }, (_, index) => ({
      id: `old-${index}`,
      title: `i5-6500 PC ${index}`,
      body: `매물 ${index}`,
      price: 100000 + index,
      url: `https://example.com/old-${index}`,
    }));
    pcListings.push({ id: 'fastest', title: 'Ryzen 5 7600 PC', body: '최신 매물', price: 500000, url: 'https://example.com/fastest' });
    const matches = Object.fromEntries(pcListings.map((item, index) => [
      item.id,
      cpuSpec(item.id === 'fastest' ? 'AMD Ryzen 5 7600' : 'Intel Core i5-6500', item.id === 'fastest' ? 50 : 200 + index),
    ]));
    const result = filterListingsForAi(pcListings, 'PC', matches);
    expect(result.listings).toHaveLength(40);
    expect(result.listings[0].id).toBe('fastest');
    expect(result.cpuSpecsByListingId.fastest.performance_rank).toBe(50);
    expect(result.excludedByLimit).toBe(3);
    expect(result.eligibleBeforeLimit).toBe(43);
  });
});

function cpuSpec(cpuName: string, rank: number): CpuSpec {
  return {
    id: rank,
    performance_rank: rank,
    performance_score: 50,
    single_core_score: 1000,
    multi_core_score: 5000,
    cpu_name: cpuName,
    manufacturer: cpuName.startsWith('AMD') ? 'AMD' : 'Intel',
    architecture: 'test',
    cores: 6,
    threads: 12,
    base_clock_ghz: 3.5,
    boost_clock_ghz: 4.4,
    cache_mb: 18,
    tdp_watts: 65,
    benchmark_name: 'Geekbench 6',
    benchmark_version: 'test',
    source_url: 'https://example.com/cpu',
  };
}
