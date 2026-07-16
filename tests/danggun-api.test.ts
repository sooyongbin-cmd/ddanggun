import { describe, expect, it, vi } from 'vitest';
import handler from '../api/danggun-search';

describe('Vercel danggun search API', () => {
  it('exposes a serverless handler and forwards search conditions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pow: { challenge: 'test', difficulty: 0, expiresAt: 123, uri: '/search' } }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ fleamarketArticles: [] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const req = { method: 'GET', url: '/api/danggun-search?search=gaming&minPrice=120000&maxPrice=250000&onlyOnSale=true' };
    const response = createResponse();
    await handler(req as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json()).toMatchObject({ listings: [], searchedDistricts: 16, failedDistricts: 0 });
    const searchRequests = fetchMock.mock.calls.slice(1).map(([url]) => new URL(String(url)));
    expect(searchRequests).toHaveLength(16);
    expect(searchRequests.map((url) => url.searchParams.get('region_id'))).toEqual(['452', '462', '476', '490', '502', '524', '538', '556', '570', '589', '606', '624', '632', '645', '656', '669']);
    expect(searchRequests[0].searchParams.get('search')).toBe('gaming');
    expect(searchRequests[0].searchParams.get('price')).toBe('120000__250000');
    expect(searchRequests[0].searchParams.get('only_on_sale')).toBe('true');
  });

  it('queries Busan districts sequentially', async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ pow: { challenge: 'test', difficulty: 0, expiresAt: 123, uri: '/search' } }) })
      .mockImplementation(async () => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeRequests -= 1;
        return { ok: true, json: async () => ({ fleamarketArticles: [] }) };
      });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();
    await handler({ method: 'GET', url: '/api/danggun-search?search=PC' } as never, response.res as never);
    expect(response.statusCode()).toBe(200);
    expect(maxActiveRequests).toBe(1);
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
