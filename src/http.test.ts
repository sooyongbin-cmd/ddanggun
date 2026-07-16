import { describe, expect, it } from 'vitest';
import { getErrorMessage, readJsonResponse } from './http';

describe('readJsonResponse', () => {
  it('includes the platform request ID and a useful cause for a generic server error', async () => {
    const response = new Response('A server error has occurred', {
      status: 500,
      headers: { 'content-type': 'text/plain', 'x-vercel-id': 'icn1::request-123' },
    });
    await expect(readJsonResponse(response, 'AI 분석 서버')).rejects.toThrow('[SERVER_FUNCTION_CRASH] AI 분석 서버 함수가 응답을 만들기 전에 중단되었습니다. HTTP 500 · 요청 ID icn1::request-123');
  });

  it('shows a safe response excerpt for other non-JSON errors', async () => {
    const response = new Response('Gateway temporarily unavailable', {
      status: 502,
      headers: { 'content-type': 'text/plain', 'x-vercel-id': 'request-456' },
    });
    await expect(readJsonResponse(response, 'AI 분석 서버')).rejects.toThrow('응답: Gateway temporarily unavailable');
  });

  it('formats structured API errors with code, stage, and request ID', () => {
    expect(getErrorMessage({ code: 'GEMINI_API_ERROR', stage: 'gemini-response', message: '요청 한도를 초과했습니다.', requestId: 'request-789' }))
      .toBe('[GEMINI_API_ERROR · gemini-response] 요청 한도를 초과했습니다. · 요청 ID request-789');
  });
});
