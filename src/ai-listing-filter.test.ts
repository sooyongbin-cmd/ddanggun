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
    expect(result).toMatchObject({ applied: true, excludedMissingCpu: 1 });
  });

  it('keeps all listings for other search terms', () => {
    const result = filterListingsForAi(listings, '노트북');
    expect(result.listings).toHaveLength(2);
    expect(result).toMatchObject({ applied: false, excludedMissingCpu: 0 });
  });
});
