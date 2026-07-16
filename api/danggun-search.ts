import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const SEARCH_PAGE = 'https://www.daangn.com/kr/buy-sell/s/?in=%EC%9A%B0%EB%8F%99-6026&only_on_sale=true&price=100000__300000&search=pc';
const BUSAN_DISTRICTS = [
  { id: '452', name: '중구' },
  { id: '462', name: '서구' },
  { id: '476', name: '동구' },
  { id: '490', name: '영도구' },
  { id: '502', name: '부산진구' },
  { id: '524', name: '동래구' },
  { id: '538', name: '남구' },
  { id: '556', name: '북구' },
  { id: '570', name: '해운대구' },
  { id: '589', name: '사하구' },
  { id: '606', name: '금정구' },
  { id: '624', name: '강서구' },
  { id: '632', name: '연제구' },
  { id: '645', name: '수영구' },
  { id: '656', name: '사상구' },
  { id: '669', name: '기장군' },
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
    const onlyOnSale = params.get('onlyOnSale') !== 'false';

    const loaderResponse = await fetch(`${SEARCH_PAGE}&_data=routes%2Fkr.buy-sell.s`, { headers });
    if (!loaderResponse.ok) throw new Error(`검색 준비 요청 실패 (${loaderResponse.status})`);
    const loader = await loaderResponse.json() as { pow?: { challenge: string; difficulty: number; expiresAt: number; uri: string } };
    if (!loader.pow) throw new Error('검색 인증 정보를 받지 못했습니다.');

    const { challenge, difficulty, expiresAt, uri } = loader.pow;
    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    while (!createHash('sha256').update(`${challenge}:${nonce}`).digest('hex').startsWith(prefix)) nonce += 1;

    const responses: PromiseSettledResult<{ fleamarketArticles?: Array<Record<string, any>> }>[] = [];
    for (const district of BUSAN_DISTRICTS) {
      const query = new URLSearchParams({
        region_id: district.id,
        search,
        price: `${minPrice}__${maxPrice}`,
        only_on_sale: String(onlyOnSale),
        uri,
        nonce: String(nonce),
        expires_at: String(expiresAt),
      });
      try {
        const response = await fetch(`https://www.daangn.com/kr/api/v1/fleamarket/search?${query}`, { headers });
        if (!response.ok) throw new Error(`${district.name} 검색 실패 (${response.status})`);
        responses.push({ status: 'fulfilled', value: await response.json() as { fleamarketArticles?: Array<Record<string, any>> } });
      } catch (reason) {
        responses.push({ status: 'rejected', reason });
      }
    }

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

    const districtResults = BUSAN_DISTRICTS.map((district, index) => ({
      id: district.id,
      name: district.name,
      status: responses[index].status,
      count: responses[index].status === 'fulfilled' ? responses[index].value.fleamarketArticles?.length ?? 0 : 0,
    }));
    return sendJson(res, 200, { listings, searchedDistricts: BUSAN_DISTRICTS.length, failedDistricts: responses.length - successful.length, districtResults });
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
