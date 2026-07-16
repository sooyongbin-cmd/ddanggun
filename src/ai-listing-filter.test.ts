import { describe, expect, it } from 'vitest';
import { filterListingsForAi } from './ai-listing-filter';
import type { Listing } from './types';

const listings: Listing[] = [
  { id: 'known', title: 'i5-10400 RAM 16GB PC', price: 250000, url: 'https://example.com/known' },
  { id: 'unknown', title: '고성능 조립 컴퓨터', price: 200000, url: 'https://example.com/unknown' },
];

describe('filterListingsForAi', () => {
  it('excludes listings with an unknown CPU when the search term is PC', () => {
    const result = filterListingsForAi(listings, ' PC ');
    expect(result.listings.map((item) => item.id)).toEqual(['known']);
    expect(result).toMatchObject({ applied: true, excludedDuplicates: 0, excludedMissingCpu: 1, excludedByLimit: 0 });
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

    const result = filterListingsForAi(duplicateListings, 'PC');

    expect(result.listings.map((item) => item.id)).toEqual(['first', 'different-body']);
    expect(result.excludedDuplicates).toBe(1);
  });

  it('selects at most 40 PC listings ordered by CPU performance', () => {
    const pcListings: Listing[] = Array.from({ length: 42 }, (_, index) => ({
      id: `old-${index}`,
      title: `i5-6500 PC ${index}`,
      body: `매물 ${index}`,
      price: 100000 + index,
      url: `https://example.com/old-${index}`,
    }));
    pcListings.push({ id: 'fastest', title: 'Ryzen 5 7600 PC', body: '최신 매물', price: 500000, url: 'https://example.com/fastest' });

    const result = filterListingsForAi(pcListings, 'PC');

    expect(result.listings).toHaveLength(40);
    expect(result.listings[0].id).toBe('fastest');
    expect(result.excludedByLimit).toBe(3);
    expect(result.eligibleBeforeLimit).toBe(43);
  });
});
