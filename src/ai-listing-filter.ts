import { parseSpecs } from './analyzer';
import type { Listing } from './types';

export type AiListingFilterResult = {
  listings: Listing[];
  applied: boolean;
  excludedMissingCpu: number;
};

export function filterListingsForAi(listings: Listing[], keyword: string): AiListingFilterResult {
  const applied = keyword.trim().toLocaleUpperCase() === 'PC';
  if (!applied) return { listings, applied: false, excludedMissingCpu: 0 };
  const filtered = listings.filter((listing) => parseSpecs(`${listing.body ?? ''} ${listing.title}`).cpu);
  return { listings: filtered, applied: true, excludedMissingCpu: listings.length - filtered.length };
}
