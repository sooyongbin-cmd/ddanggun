import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/cpu-specs';

describe('CPU specifications API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('queries Supabase with sanitized filters and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-range': '30-59/242' }),
      text: async () => JSON.stringify([{ id: 1, performance_rank: 92, cpu_name: 'Intel Core i5-12400' }]),
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/cpu-specs?search=i5-(12400)&manufacturer=Intel&page=1' } as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json()).toMatchObject({ total: 242, page: 1, pageSize: 30, hasNext: true });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.hostname).toBe('hinrycozuqkprxvkjval.supabase.co');
    expect(requestUrl.searchParams.get('cpu_name')).toBe('ilike.*i5-12400*');
    expect(requestUrl.searchParams.get('manufacturer')).toBe('eq.Intel');
    expect(requestUrl.searchParams.get('offset')).toBe('30');
    expect(requestUrl.searchParams.get('select')).toContain('performance_rank');
    expect(requestUrl.searchParams.get('order')).toBe('performance_rank.asc,cpu_name.asc');
    expect(fetchMock.mock.calls[0][1].headers.Prefer).toBe('count=exact');
    expect(response.json().cpuSpecs[0]).toMatchObject({ performance_rank: 92, cpu_name: 'Intel Core i5-12400' });
  });

  it('returns a specific upstream error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => JSON.stringify({ message: 'permission denied for table cpu_specs' }),
    }));
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/cpu-specs' } as never, response.res as never);

    expect(response.statusCode()).toBe(502);
    expect(response.json()).toEqual({
      error: { code: 'SUPABASE_QUERY_FAILED', message: 'permission denied for table cpu_specs', status: 403 },
    });
  });

  it('rejects methods other than GET', async () => {
    const response = createResponse();
    await handler({ method: 'POST', url: '/api/cpu-specs' } as never, response.res as never);
    expect(response.statusCode()).toBe(405);
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
