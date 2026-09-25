import type { IncomingMessage, ServerResponse } from 'node:http';

const SEARCH_PAGE = 'https://www.daangn.com/kr/buy-sell/';
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
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

type SearchListing = {
  id?: string;
  href?: string;
  title?: string;
  content?: string;
  price?: string | number;
  createdAt?: string;
  thumbnail?: string | null;
  region?: { name?: string };
  status?: string;
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    return sendJson(res, 405, { error: 'GET 요청만 지원합니다.' });
  }

  try {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    const search = params.get('search')?.trim() || 'PC';
    const minPrice = Number(params.get('minPrice')?.replace(/\D/g, '') || '0');
    const maxPrice = Number(params.get('maxPrice')?.replace(/\D/g, '') || '999999999');
    const onlyOnSale = params.get('onlyOnSale') !== 'false';

    const results: PromiseSettledResult<SearchListing[]>[] = [];
    for (const district of BUSAN_DISTRICTS) {
      const query = new URLSearchParams({
        in: `${district.name}-${district.id}`,
        search,
        price: `${minPrice}__${maxPrice}`,
        only_on_sale: String(onlyOnSale),
      });
      try {
        const response = await fetch(`${SEARCH_PAGE}?${query}`, { headers });
        const html = await response.text();
        if (!response.ok) throw new Error(`${district.name} 검색 실패 (HTTP ${response.status})${html ? `: ${safeExcerpt(html)}` : ''}`);
        results.push({ status: 'fulfilled', value: parseListings(html) });
      } catch (reason) {
        results.push({ status: 'rejected', reason });
      }
    }

    const successful = results.filter((result): result is PromiseFulfilledResult<SearchListing[]> => result.status === 'fulfilled');
    if (!successful.length) {
      const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      throw new Error(`선택한 지역의 검색 요청이 모두 실패했습니다.${failure ? ` ${getErrorMessage(failure.reason)}` : ''}`);
    }

    const uniqueArticles = new Map<string, SearchListing>();
    successful.flatMap((result) => result.value).forEach((article) => {
      const id = article.id ?? article.href;
      if (id) uniqueArticles.set(id, article);
    });
    const listings = [...uniqueArticles.values()]
      .filter((article) => {
        const price = Number(article.price);
        return Number.isFinite(price) && price >= minPrice && price <= maxPrice && (!onlyOnSale || article.status !== 'Closed');
      })
      .map((article) => ({
      id: extractArticleId(article.href ?? article.id ?? ''),
      title: String(article.title ?? ''),
      price: article.price === undefined ? null : Number(article.price),
      url: article.href?.startsWith('http') ? article.href : `https://www.daangn.com${article.href ?? ''}`,
      location: article.region?.name,
      postedAt: article.createdAt,
      imageUrl: article.thumbnail ?? undefined,
      body: article.content,
      }));

    const districtResults = BUSAN_DISTRICTS.map((district, index) => ({
      id: district.id,
      name: district.name,
      status: results[index].status,
      count: results[index].status === 'fulfilled' ? results[index].value.length : 0,
    }));
    return sendJson(res, 200, { listings, searchedDistricts: BUSAN_DISTRICTS.length, failedDistricts: results.length - successful.length, districtResults });
  } catch (error) {
    return sendJson(res, 502, { error: getErrorMessage(error) });
  }
}

export function parseListings(html: string): SearchListing[] {
  const marker = '"fleamarketArticles":';
  const markerIndex = html.indexOf(marker);
  if (markerIndex >= 0) {
    const json = extractBalancedJson(html, html.indexOf('[', markerIndex + marker.length), '[', ']');
    if (json) {
      try { return JSON.parse(json) as SearchListing[]; } catch { /* try JSON-LD */ }
    }
  }

  const products: SearchListing[] = [];
  const productPattern = /"@type":"Product","name":"/g;
  for (const match of html.matchAll(productPattern)) {
    try {
      const start = html.lastIndexOf('{', match.index!);
      const end = html.indexOf('}}}', start);
      if (end < 0) continue;
      const product = JSON.parse(html.slice(start, end + 2)) as {
        name?: string; description?: string; image?: string; url?: string;
        offers?: { price?: string; availability?: string };
      };
      const href = product.url?.startsWith('http') ? new URL(product.url).pathname : product.url;
      if (!href) continue;
      products.push({
        id: href,
        href,
        title: product.name,
        content: product.description,
        price: product.offers?.price,
        thumbnail: product.image,
        status: product.offers?.availability?.endsWith('InStock') ? 'Ongoing' : 'Closed',
      });
    } catch { /* Ignore malformed JSON-LD entries. */ }
  }
  if (!products.length && !html.includes('"currentFilters"')) {
    throw new Error(`검색 페이지에 매물 데이터가 없습니다: ${safeExcerpt(html)}`);
  }
  return products;
}

function extractBalancedJson(input: string, startIndex: number, openChar: '[' | '{', closeChar: ']' | '}') {
  if (startIndex < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === openChar) depth += 1;
    else if (char === closeChar && --depth === 0) return input.slice(startIndex, index + 1);
  }
  return null;
}

function extractArticleId(value: string) {
  const match = value.match(/\/kr\/buy-sell\/([^/?#]+)\/?$/);
  return match?.[1] ?? value;
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

function safeExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}
