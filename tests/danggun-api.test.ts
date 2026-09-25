import { describe, expect, it, vi } from 'vitest';
import handler from '../api/danggun-search';

describe('Vercel danggun search API', () => {
  it('exposes a serverless handler and forwards search conditions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => createSearchHtml([{ id: '/kr/buy-sell/test-listing/', title: 'Gaming PC', price: '120000', content: 'Test', region: { name: '우동' }, status: 'Ongoing' }]),
      })
      .mockResolvedValue({ ok: true, text: async () => createSearchHtml([]) });
    vi.stubGlobal('fetch', fetchMock);

    const req = { method: 'GET', url: '/api/danggun-search?search=gaming&minPrice=120000&maxPrice=250000&onlyOnSale=true' };
    const response = createResponse();
    await handler(req as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json()).toMatchObject({ listings: [{ id: 'test-listing', title: 'Gaming PC', price: 120000, location: '우동' }], searchedDistricts: 16, failedDistricts: 0 });
    const searchRequests = fetchMock.mock.calls.slice(1).map(([url]) => new URL(String(url)));
    expect(searchRequests).toHaveLength(15);
    expect(searchRequests.map((url) => url.searchParams.get('in'))).toEqual(['서구-462', '동구-476', '영도구-490', '부산진구-502', '동래구-524', '남구-538', '북구-556', '해운대구-570', '사하구-589', '금정구-606', '강서구-624', '연제구-632', '수영구-645', '사상구-656', '기장군-669']);
    expect(searchRequests[0].searchParams.get('search')).toBe('gaming');
    expect(searchRequests[0].searchParams.get('price')).toBe('120000__250000');
    expect(searchRequests[0].searchParams.get('only_on_sale')).toBe('true');
  });

  it('queries Busan districts sequentially', async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => createSearchHtml([]) })
      .mockImplementation(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeRequests -= 1;
        return { ok: true, text: async () => createSearchHtml([]) };
      });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();
    await handler({ method: 'GET', url: '/api/danggun-search?search=PC' } as never, response.res as never);
    expect(response.statusCode()).toBe(200);
    expect(maxActiveRequests).toBe(1);
  });

  it('returns a useful error when an upstream search response is empty or invalid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/danggun-search?search=PC' } as never, response.res as never);

    expect(response.statusCode()).toBe(502);
    expect(response.json().error).toContain('검색 페이지에 매물 데이터가 없습니다');
  });

  it('reports a non-JSON loader response instead of a JSON parse exception', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 204, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/danggun-search?search=PC' } as never, response.res as never);

    expect(response.statusCode()).toBe(502);
    expect(response.json().error).toContain('HTTP 204');
  });

  it('parses listings embedded in the current Daangn JSON-LD search page', async () => {
    const html = '<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"Product","name":"Gaming PC","description":"i5 PC","url":"https://www.daangn.com/kr/buy-sell/gaming-pc-123/","image":"https://example.com/pc.jpg","offers":{"price":"200000","availability":"https://schema.org/InStock"}}}]}</script>';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/danggun-search?search=PC&minPrice=100000&maxPrice=300000' } as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json().listings).toMatchObject([{ id: 'gaming-pc-123', title: 'Gaming PC', price: 200000, body: 'i5 PC', url: 'https://www.daangn.com/kr/buy-sell/gaming-pc-123/' }]);
  });
});

function createResponse() {
  let code = 200;
  let body = '';
  return {
    res: {
      set statusCode(value: number) { code = value; },
      get statusCode() { return code; },
      setHeader: vi.fn(),
      end(value = '') { body = String(value); },
    },
    statusCode: () => code,
    json: () => JSON.parse(body),
  };
}

function createSearchHtml(articles: Array<Record<string, unknown>>) {
  const encoded = JSON.stringify(articles).replace(/</g, '\\u003c');
  return `window.__remixContext={"state":{"loaderData":{"route":{"fleamarketArticles":${encoded}}}}};`;
}
