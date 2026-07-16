export type Listing = { id: string; title: string; price: number | null; url: string; location?: string; postedAt?: string; imageUrl?: string; body?: string };
export type StorageType = 'NVMe' | 'SSD' | 'HDD' | 'eMMC';
export type ParsedSpecs = { cpu?: string; ramGb?: number; storageGb?: number; storageType?: StorageType; gpu?: string; kind?: 'desktop' | 'laptop'; evidence: string[] };
export type Analysis = Listing & { specs: ParsedSpecs; valueScore: number | null; confidence: 'high' | 'medium' | 'low'; flags: string[]; reasons: string[]; savedAt: number };
