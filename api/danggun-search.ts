import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SEARCH_PAGE = 'https://www.daangn.com/kr/buy-sell/s/?in=%EC%9A%B0%EB%8F%99-6026&only_on_sale=true&price=100000__300000&search=pc';
const SEARCH_REGIONS = [
  { id: '6026', name: '우동', district: 'haeundae' },
  { id: '6028', name: '좌동', district: 'haeundae' },
  { id: '6029', name: '중동', district: 'haeundae' },
  { id: '6027', name: '재송동', district: 'haeundae' },
  { id: '6024', name: '반여동', district: 'haeundae' },
  { id: '6023', name: '반송동', district: 'haeundae' },
  { id: '579', name: '석대동', district: 'haeundae' },
  { id: '6025', name: '송정동', district: 'haeundae' },
  { id: '5956', name: '광안동', district: 'suyeong' },
  { id: '655', name: '민락동', district: 'suyeong' },
  { id: '5957', name: '남천동', district: 'suyeong' },
  { id: '5958', name: '망미동', district: 'suyeong' },
  { id: '648', name: '수영동', district: 'suyeong' },
] as const;
const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
  accept: 'application/json',
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    return sendJson(res, 405, { error: 'GET 요청만 지원합니다.' });
  }

  try {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const search = params.get('search')?.trim() || 'PC';
    const minPrice = params.get('minPrice')?.replace(/\D/g, '') || '0';
    const maxPrice = params.get('maxPrice')?.replace(/\D/g, '') || '999999999';
    const selectedDistricts = new Set((params.get('regions') || 'haeundae,suyeong').split(','));
    const regions = SEARCH_REGIONS.filter((region) => selectedDistricts.has(region.district));
    const onlyOnSale = params.get('onlyOnSale') !== 'false';
    if (!regions.length) return sendJson(res, 400, { error: '조회할 지역을 하나 이상 선택해 주세요.' });

    const loaderResponse = await fetch(`${SEARCH_PAGE}&_data=routes%2Fkr.buy-sell.s`, { headers });
    if (!loaderResponse.ok) throw new Error(`검색 준비 요청 실패 (${loaderResponse.status})`);
    const loader = await loaderResponse.json() as { pow?: { challenge: string; difficulty: number; expiresAt: number; uri: string } };
    if (!loader.pow) throw new Error('검색 인증 정보를 받지 못했습니다.');

    const { challenge, difficulty, expiresAt, uri } = loader.pow;
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    while (!createHash('sha256').update(`${challenge}:${nonce}`).digest('hex').startsWith(prefix)) nonce += 1;

    const responses = await Promise.allSettled(regions.map(async (region) => {
      const query = new URLSearchParams({
        region_id: region.id,
        search,
        price: `${minPrice}__${maxPrice}`,
        only_on_sale: String(onlyOnSale),
        uri,
        nonce: String(nonce),
        expires_at: String(expiresAt),
      });
      const response = await fetch(`https://www.daangn.com/kr/api/v1/fleamarket/search?${query}`, { headers });
      if (!response.ok) throw new Error(`${region.name} 검색 실패 (${response.status})`);
      return response.json() as Promise<{ fleamarketArticles?: Array<Record<string, any>> }>;
    }));

    const successful = responses.filter((result): result is PromiseFulfilledResult<{ fleamarketArticles?: Array<Record<string, any>> }> => result.status === 'fulfilled');
    if (!successful.length) throw new Error('선택한 지역의 검색 요청이 모두 실패했습니다.');

    const uniqueArticles = new Map<string, Record<string, any>>();
    successful.flatMap((result) => result.value.fleamarketArticles ?? []).forEach((article) => uniqueArticles.set(String(article.id), article));
    const listings = [...uniqueArticles.values()].map((article) => ({
      id: String(article.id),
      title: String(article.title ?? ''),
      price: article.price ? Number(article.price) : null,
      url: String(article.href ?? article.id),
      location: article.region?.name,
      postedAt: article.createdAt,
      imageUrl: article.thumbnail,
      body: article.content,
    }));

    return sendJson(res, 200, { listings, searchedRegions: regions.length, failedRegions: responses.length - successful.length });
  } catch (error) {
    return sendJson(res, 502, { error: getErrorMessage(error) });
  }
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '당근 검색에 실패했습니다.';
}
