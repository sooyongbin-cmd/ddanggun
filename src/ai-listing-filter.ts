import { getCpuPerformanceScore, parseSpecs } from './analyzer';
import type { Listing } from './types';

export const MAX_AI_LISTINGS = 40;

export type AiListingFilterResult = {
  listings: Listing[];
  applied: boolean;
  excludedDuplicates: number;
  excludedMissingCpu: number;
  excludedByLimit: number;
  eligibleBeforeLimit: number;
};

export function filterListingsForAi(listings: Listing[], keyword: string): AiListingFilterResult {
  const uniqueListings = keepFirstListingByContent(listings);
  const applied = keyword.trim().toLocaleUpperCase() === 'PC';
  const candidates = applied
    ? uniqueListings
      .map((listing, index) => {
        const cpu = parseSpecs(`${listing.body ?? ''} ${listing.title}`).cpu;
        return { listing, index, cpu, performance: getCpuPerformanceScore(cpu) };
      })
      .filter((item) => item.cpu)
      .sort((a, b) => b.performance - a.performance || a.index - b.index)
      .map((item) => item.listing)
    : uniqueListings;

  return {
    listings: candidates.slice(0, MAX_AI_LISTINGS),
    applied,
    excludedDuplicates: listings.length - uniqueListings.length,
    excludedMissingCpu: applied ? uniqueListings.length - candidates.length : 0,
    excludedByLimit: Math.max(0, candidates.length - MAX_AI_LISTINGS),
    eligibleBeforeLimit: candidates.length,
  };
}

function keepFirstListingByContent(listings: Listing[]) {
  const seen = new Set<string>();
  return listings.filter((listing) => {
    const contentKey = JSON.stringify([listing.title, listing.body ?? '']);
    if (seen.has(contentKey)) return false;
    seen.add(contentKey);
    return true;
  });
}
