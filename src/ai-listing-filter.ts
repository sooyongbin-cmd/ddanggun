import { parseSpecs } from './analyzer';
import type { CpuSpec, Listing } from './types';

export const MAX_AI_LISTINGS = 40;

export type AiCpuCandidate = { id: string; cpu: string };
export type AiListingPreparation = {
  uniqueListings: Listing[];
  cpuCandidates: AiCpuCandidate[];
  applied: boolean;
  excludedDuplicates: number;
  excludedMissingCpuText: number;
};
export type AiListingFilterResult = {
  listings: Listing[];
  cpuSpecsByListingId: Record<string, CpuSpec>;
  selectionDecisions: AiSelectionDecision[];
  applied: boolean;
  excludedDuplicates: number;
  excludedMissingCpu: number;
  excludedByLimit: number;
  eligibleBeforeLimit: number;
};
export type AiSelectionDecision = {
  listing: Listing;
  detectedCpu?: string;
  cpuSpec?: CpuSpec;
  selected: boolean;
  reason: 'selected' | 'cpu-missing' | 'db-unmatched' | 'limit-exceeded';
};

export function prepareListingsForAi(listings: Listing[], keyword: string): AiListingPreparation {
  const uniqueListings = keepFirstListingByContent(listings);
  const applied = keyword.trim().toLocaleUpperCase() === 'PC';
  const cpuCandidates = applied
    ? uniqueListings.flatMap((listing) => {
      const cpu = parseSpecs(`${listing.body ?? ''} ${listing.title}`).cpu;
      return cpu ? [{ id: listing.id, cpu }] : [];
    })
    : [];
  return {
    uniqueListings,
    cpuCandidates,
    applied,
    excludedDuplicates: listings.length - uniqueListings.length,
    excludedMissingCpuText: applied ? uniqueListings.length - cpuCandidates.length : 0,
  };
}

export function selectListingsForAi(
  preparation: AiListingPreparation,
  cpuMatches: Record<string, CpuSpec> = {},
): AiListingFilterResult {
  const candidates = preparation.applied
    ? preparation.uniqueListings
      .flatMap((listing, index) => {
        const cpuSpec = cpuMatches[listing.id];
        return cpuSpec ? [{ listing, index, cpuSpec }] : [];
      })
      .sort((a, b) => a.cpuSpec.performance_rank - b.cpuSpec.performance_rank || a.index - b.index)
    : preparation.uniqueListings.map((listing, index) => ({ listing, index, cpuSpec: undefined }));
  const selected = candidates.slice(0, MAX_AI_LISTINGS);
  const selectedIds = new Set(selected.map((item) => item.listing.id));
  const cpuByListingId = new Map(preparation.cpuCandidates.map((item) => [item.id, item.cpu]));
  const selectionDecisions: AiSelectionDecision[] = preparation.applied
    ? [
      ...candidates.map((item) => ({
        listing: item.listing,
        detectedCpu: cpuByListingId.get(item.listing.id),
        cpuSpec: item.cpuSpec,
        selected: selectedIds.has(item.listing.id),
        reason: selectedIds.has(item.listing.id) ? 'selected' as const : 'limit-exceeded' as const,
      })),
      ...preparation.uniqueListings
        .filter((listing) => !cpuMatches[listing.id])
        .map((listing) => ({
          listing,
          detectedCpu: cpuByListingId.get(listing.id),
          selected: false,
          reason: cpuByListingId.has(listing.id) ? 'db-unmatched' as const : 'cpu-missing' as const,
        })),
    ]
    : [];
  return {
    listings: selected.map((item) => item.listing),
    cpuSpecsByListingId: Object.fromEntries(selected.flatMap((item) => item.cpuSpec ? [[item.listing.id, item.cpuSpec]] : [])),
    selectionDecisions,
    applied: preparation.applied,
    excludedDuplicates: preparation.excludedDuplicates,
    excludedMissingCpu: preparation.applied ? preparation.uniqueListings.length - candidates.length : 0,
    excludedByLimit: Math.max(0, candidates.length - MAX_AI_LISTINGS),
    eligibleBeforeLimit: candidates.length,
  };
}

export function filterListingsForAi(listings: Listing[], keyword: string, cpuMatches: Record<string, CpuSpec> = {}) {
  return selectListingsForAi(prepareListingsForAi(listings, keyword), cpuMatches);
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
