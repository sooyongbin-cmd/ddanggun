import { afterEach, describe, expect, it, vi } from 'vitest';
import handler, { normalizeCpuModel } from '../api/cpu-match';

describe('CPU listing match API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('matches extracted CPU names to database specifications', async () => {
    const rows = [cpuRow('Intel Core i5-10400', 150), cpuRow('AMD Ryzen 5 7600', 50)];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(rows) });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();

    await handler({
      method: 'POST',
      body: { items: [{ id: 'old', cpu: 'i5 10400' }, { id: 'fast', cpu: '라이젠 5 7600' }, { id: 'missing', cpu: 'i7-99999' }] },
    } as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json()).toMatchObject({ matchedCount: 2, unmatchedCount: 1 });
    expect(response.json().matches.old.performance_rank).toBe(150);
    expect(response.json().matches.fast.performance_rank).toBe(50);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('select')).toContain('performance_rank');
    expect(requestUrl.searchParams.get('order')).toBe('performance_rank.asc');
  });

  it('returns a specific Supabase error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: 'permission denied' }),
    }));
    const response = createResponse();
    await handler({ method: 'POST', body: { items: [{ id: '1', cpu: 'i5-10400' }] } } as never, response.res as never);
    expect(response.statusCode()).toBe(502);
    expect(response.json().error).toEqual({ code: 'SUPABASE_CPU_MATCH_FAILED', message: 'permission denied', status: 403 });
  });

  it('rejects an empty request', async () => {
    const response = createResponse();
    await handler({ method: 'POST', body: { items: [] } } as never, response.res as never);
    expect(response.statusCode()).toBe(400);
    expect(response.json().error.code).toBe('EMPTY_CPU_ITEMS');
  });
});

describe('CPU model normalization', () => {
  it.each([
    ['Intel Core i5-10400F', 'i5-10400f'],
    ['i5 10400f', 'i5-10400f'],
    ['AMD Ryzen 7 5800X3D', 'ryzen7-5800x3d'],
    ['라이젠 5 7600', 'ryzen5-7600'],
    ['AMD Athlon 3000G', 'athlon-3000g'],
    ['Intel Core Ultra 5 245K', 'core-ultra-245k'],
    ['Intel Core Ultra 250KF Plus', 'core-ultra-250kf-plus'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCpuModel(input)).toBe(expected);
  });
});

function cpuRow(cpu_name: string, performance_rank: number) {
  return {
    id: performance_rank,
    performance_rank,
    performance_score: 50,
    single_core_score: 1000,
    multi_core_score: 5000,
    cpu_name,
    manufacturer: cpu_name.startsWith('AMD') ? 'AMD' : 'Intel',
    architecture: 'test',
    cores: 6,
    threads: 12,
    base_clock_ghz: 3.5,
    boost_clock_ghz: 4.4,
    cache_mb: 18,
    tdp_watts: 65,
    benchmark_name: 'Geekbench 6',
    benchmark_version: 'test',
    source_url: 'https://example.com/cpu',
  };
}

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
