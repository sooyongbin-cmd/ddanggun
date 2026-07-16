export type Listing = { id: string; title: string; price: number | null; url: string; location?: string; postedAt?: string; imageUrl?: string; body?: string };
export type StorageType = 'NVMe' | 'SSD' | 'HDD' | 'eMMC';
export type ParsedSpecs = { cpu?: string; ramGb?: number; storageGb?: number; storageType?: StorageType; gpu?: string; kind?: 'desktop' | 'laptop'; evidence: string[] };
export type Analysis = Listing & { specs: ParsedSpecs; valueScore: number | null; confidence: 'high' | 'medium' | 'low'; flags: string[]; reasons: string[]; savedAt: number };
export type AiListingAttribute = { name: string; value: string; unit: string; confidence: 'high' | 'medium' | 'low' };
export type AiListingAnalysis = {
  id: string;
  title: string;
  price: number | null;
  url: string;
  location?: string;
  category: string;
  attributes: AiListingAttribute[];
  score: number;
  recommendation: '추천' | '보통' | '주의';
  summary: string;
  strengths: string;
  cautions: string;
};

export type CpuSpec = {
  id: number;
  cpu_name: string;
  manufacturer: 'Intel' | 'AMD';
  architecture: string | null;
  cores: number;
  threads: number;
  base_clock_ghz: number | null;
  boost_clock_ghz: number | null;
  cache_mb: number | null;
  tdp_watts: number | null;
  source_url: string;
};
