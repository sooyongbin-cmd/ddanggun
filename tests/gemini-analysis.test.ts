import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import handler from '../api/gemini-analysis';
import { GEMINI_MODELS } from '../src/gemini-models';

describe('Gemini analysis API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends listings with a JSON schema and merges trusted listing fields', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 'listing-1', cpu: 'i5-10400', cpuPerformanceScore: 58, cpuPerformanceSummary: '10세대 중급형 데스크톱 CPU로 사무와 일반 작업에 적합', cpuCores: 6, cpuThreads: 12, cpuBaseClockGhz: 2.9, cpuMaxClockGhz: 4.3, ram: '16GB', storage: 'SSD 512GB', gpu: 'GTX 1660', score: 88, recommendation: '추천', summary: '균형 잡힌 구성', strengths: '메모리와 저장공간', cautions: '파워 확인 필요' }]) }] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = {
      method: 'POST',
      body: { listings: [{ id: 'listing-1', title: '게이밍 PC', price: 250000, url: 'https://example.com/original', location: '우동', body: 'i5-10400 RAM 16GB' }] },
    };
    const response = createResponse();
    await handler(req as never, response.res as never);

    expect(response.statusCode()).toBe(200);
    expect(response.json().analyses[0]).toMatchObject({ id: 'listing-1', title: '게이밍 PC', url: 'https://example.com/original', cpuPerformanceScore: 58, cpuPerformanceSummary: '10세대 중급형 데스크톱 CPU로 사무와 일반 작업에 적합', cpuCores: 6, cpuThreads: 12, cpuBaseClockGhz: 2.9, cpuMaxClockGhz: 4.3, score: 88, recommendation: '추천' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gemini-3.1-flash-lite:generateContent');
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    const requestBody = JSON.parse(options.body);
    expect(requestBody.generationConfig.responseMimeType).toBe('application/json');
    expect(requestBody.generationConfig.responseSchema.type).toBe('ARRAY');
    expect(requestBody.generationConfig.responseSchema.items.required).toContain('cpuPerformanceScore');
    expect(requestBody.generationConfig.responseSchema.items.required).toContain('cpuPerformanceSummary');
    expect(requestBody.generationConfig.responseSchema.items.required).toEqual(expect.arrayContaining(['cpuCores', 'cpuThreads', 'cpuBaseClockGhz', 'cpuMaxClockGhz']));
    const prompt = requestBody.contents[0].parts[0].text as string;
    const promptListings = JSON.parse(prompt.slice(prompt.indexOf('[')));
    expect(promptListings).toEqual([{ id: 'listing-1', title: '게이밍 PC', price: 250000, body: 'i5-10400 RAM 16GB' }]);
    expect(prompt).not.toContain('"location"');
    expect(prompt).not.toContain('우동');
  });

  it('reports a missing server API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const response = createResponse();
    await handler({ method: 'POST', body: { listings: [] } } as never, response.res as never);
    expect(response.statusCode()).toBe(503);
    expect(response.json().error).toMatchObject({ code: 'GEMINI_API_KEY_MISSING', stage: 'request-validation' });
  });

  it('normalizes out-of-range CPU specification values returned by Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 'listing-1', cpu: 'i9-14900K', cpuPerformanceScore: 95, cpuPerformanceSummary: '최상급 CPU', cpuCores: 999, cpuThreads: -4, cpuBaseClockGhz: 3.456, cpuMaxClockGhz: null, ram: '32GB', storage: 'SSD 1TB', gpu: '확인 불가', score: 80, recommendation: '추천', summary: '고성능 구성', strengths: 'CPU', cautions: '발열' }]) }] } }] }),
    }));
    const response = createResponse();

    await handler({ method: 'POST', body: { listings: [{ id: 'listing-1', title: '고성능 PC', price: 1000000, url: 'https://example.com/1' }] } } as never, response.res as never);

    expect(response.json().analyses[0]).toMatchObject({ cpuCores: 256, cpuThreads: 0, cpuBaseClockGhz: 3.46, cpuMaxClockGhz: 0 });
  });

  it.each(GEMINI_MODELS)('accepts $id', async ({ id }) => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 'listing-1', cpu: '확인 불가', cpuPerformanceScore: 0, cpuPerformanceSummary: '확인 불가', cpuCores: 0, cpuThreads: 0, cpuBaseClockGhz: 0, cpuMaxClockGhz: 0, ram: '확인 불가', storage: '확인 불가', gpu: '확인 불가', score: 20, recommendation: '주의', summary: '정보 부족', strengths: '확인 불가', cautions: '상세 사양 확인 필요' }]) }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();
    await handler({ method: 'POST', body: { model: id, listings: [{ id: 'listing-1', title: 'PC', price: 100000, url: 'https://example.com/1' }] } } as never, response.res as never);
    expect(response.statusCode()).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain(`${id}:generateContent`);
  });

  it('rejects a model outside the selectable list', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = createResponse();
    await handler({ method: 'POST', body: { model: 'gemini-unknown', listings: [{}] } } as never, response.res as never);
    expect(response.statusCode()).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not use unresolved local runtime imports in the Vercel function', () => {
    const source = readFileSync(new URL('../api/gemini-analysis.ts', import.meta.url), 'utf8');
    const localRuntimeImports = [...source.matchAll(/^import\s+(?!type\b).*?from\s+['"](\.{1,2}\/[^'"]+)['"]/gm)].map((match) => match[1]);
    expect(localRuntimeImports).toEqual([]);
  });

  it('returns a structured error when Gemini does not return JSON', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'content-type': 'text/plain', 'x-request-id': 'gemini-request-1' }),
      text: async () => 'upstream unavailable',
    }));
    const response = createResponse();
    await handler({ method: 'POST', headers: { 'x-vercel-id': 'vercel-request-1' }, body: { listings: [{ id: 'listing-1', title: 'PC', price: 100000, url: 'https://example.com/1' }] } } as never, response.res as never);
    expect(response.statusCode()).toBe(502);
    expect(response.json().error).toMatchObject({ code: 'GEMINI_RESPONSE_INVALID_JSON', stage: 'gemini-response', requestId: 'vercel-request-1' });
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
