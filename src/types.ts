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
