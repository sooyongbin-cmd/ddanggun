import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SEARCH_PAGE = 'https://www.daangn.com/kr/buy-sell/s/?in=%EC%9A%B0%EB%8F%99-6026&only_on_sale=true&price=100000__300000&search=pc';
const SEARCH_REGIONS = [
  { id:'6026', name:'우동' }, { id:'6028', name:'좌동' }, { id:'6029', name:'중동' }, { id:'6027', name:'재송동' },
  { id:'6024', name:'반여동' }, { id:'6023', name:'반송동' }, { id:'579', name:'송정동' }, { id:'6025', name:'석대동' },
  { id:'5956', name:'광안동' }, { id:'655', name:'민락동' }, { id:'5957', name:'남천동' }, { id:'5958', name:'망미동' }, { id:'648', name:'수영동' },
];
const DISTRICT_REGION_IDS = {
  haeundae: new Set(['6026', '6028', '6029', '6027', '6024', '6023', '579', '6025']),
  suyeong: new Set(['5956', '655', '5957', '5958', '648']),
};
const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36', accept: 'application/json' };

async function searchDanggun(req: IncomingMessage, res: ServerResponse) {
  try {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const search = params.get('search')?.trim() || 'PC';
    const minPrice = params.get('minPrice')?.replace(/\D/g, '') || '0';
    const maxPrice = params.get('maxPrice')?.replace(/\D/g, '') || '999999999';
    const selectedDistricts = new Set((params.get('regions') || 'haeundae,suyeong').split(','));
    const regions = SEARCH_REGIONS.filter((region) => [...selectedDistricts].some((district) => DISTRICT_REGION_IDS[district as keyof typeof DISTRICT_REGION_IDS]?.has(region.id)));
    const onlyOnSale = params.get('onlyOnSale') !== 'false';
    if (!regions.length) throw new Error('At least one region must be selected.');
    const loaderResponse = await fetch(`${SEARCH_PAGE}&_data=routes%2Fkr.buy-sell.s`, { headers });
    if (!loaderResponse.ok) throw new Error(`검색 준비 요청 실패 (${loaderResponse.status})`);
    const loader = await loaderResponse.json() as { pow?: { challenge: string; difficulty: number; expiresAt: number; uri: string } };
    if (!loader.pow) throw new Error('검색 인증 정보를 받지 못했습니다.');
    const { challenge, difficulty, expiresAt, uri } = loader.pow;
    const prefix = '0'.repeat(difficulty); let nonce = 0;
    while (!createHash('sha256').update(`${challenge}:${nonce}`).digest('hex').startsWith(prefix)) nonce += 1;
    const responses = await Promise.allSettled(regions.map(async region => {
      const query = new URLSearchParams({ region_id:region.id, search, price:`${minPrice}__${maxPrice}`, only_on_sale:String(onlyOnSale), uri, nonce:String(nonce), expires_at:String(expiresAt) });
      const response = await fetch(`https://www.daangn.com/kr/api/v1/fleamarket/search?${query}`, { headers });
      if (!response.ok) throw new Error(`${region.name} 검색 실패 (${response.status})`);
      return response.json() as Promise<{ fleamarketArticles?: Array<Record<string, any>> }>;
    }));
    const successful = responses.filter((result): result is PromiseFulfilledResult<{ fleamarketArticles?: Array<Record<string, any>> }> => result.status === 'fulfilled');
    if (!successful.length) throw new Error('해운대구·수영구 검색 요청이 모두 실패했습니다.');
    const uniqueArticles = new Map<string, Record<string, any>>();
    successful.flatMap(result => result.value.fleamarketArticles ?? []).forEach(article => uniqueArticles.set(String(article.id), article));
    const listings = [...uniqueArticles.values()].map(article => ({
      id: String(article.id), title: String(article.title ?? ''), price: article.price ? Number(article.price) : null,
      url: String(article.href ?? article.id), location: article.region?.name, postedAt: article.createdAt,
      imageUrl: article.thumbnail, body: article.content
    }));
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ listings, searchedRegions:regions.length, failedRegions:responses.length - successful.length }));
  } catch (error) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : '당근 검색에 실패했습니다.' }));
  }
}
function danggunApi() { return { name:'danggun-local-api', configureServer(server: any) { server.middlewares.use('/api/danggun-search', searchDanggun); }, configurePreviewServer(server: any) { server.middlewares.use('/api/danggun-search', searchDanggun); } }; }
export default defineConfig({ plugins: [react(), danggunApi()] });
