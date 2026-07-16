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
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 'listing-1', cpu: 'i5-10400', ram: '16GB', storage: 'SSD 512GB', gpu: 'GTX 1660', score: 88, recommendation: '추천', summary: '균형 잡힌 구성', strengths: '메모리와 저장공간', cautions: '파워 확인 필요' }]) }] } }],
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
    expect(response.json().analyses[0]).toMatchObject({ id: 'listing-1', title: '게이밍 PC', url: 'https://example.com/original', score: 88, recommendation: '추천' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gemini-3.5-flash:generateContent');
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    const requestBody = JSON.parse(options.body);
    expect(requestBody.generationConfig.responseMimeType).toBe('application/json');
    expect(requestBody.generationConfig.responseSchema.type).toBe('ARRAY');
  });

  it('reports a missing server API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const response = createResponse();
    await handler({ method: 'POST', body: { listings: [] } } as never, response.res as never);
    expect(response.statusCode()).toBe(503);
    expect(response.json().error).toMatchObject({ code: 'GEMINI_API_KEY_MISSING', stage: 'request-validation' });
  });

  it.each(GEMINI_MODELS)('accepts $id', async ({ id }) => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ id: 'listing-1', cpu: '확인 불가', ram: '확인 불가', storage: '확인 불가', gpu: '확인 불가', score: 20, recommendation: '주의', summary: '정보 부족', strengths: '확인 불가', cautions: '상세 사양 확인 필요' }]) }] } }] }),
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
