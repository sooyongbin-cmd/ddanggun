export async function readJsonResponse<T>(response: Response, serverName: string): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  const responseText = await response.text();
  if (!contentType.includes('application/json')) {
    const requestId = response.headers.get('x-vercel-id') ?? response.headers.get('x-request-id') ?? '확인 불가';
    const context = `HTTP ${response.status} · 요청 ID ${requestId}`;
    if (/^A server error has occurred\.?$/i.test(responseText.trim())) {
      throw new Error(`[SERVER_FUNCTION_CRASH] ${serverName} 함수가 응답을 만들기 전에 중단되었습니다. ${context} · 운영 로그에서 해당 요청 ID를 조회하세요.`);
    }
    throw new Error(`[NON_JSON_RESPONSE] ${serverName}가 JSON이 아닌 응답을 반환했습니다. ${context} · 응답: ${safeExcerpt(responseText)}`);
  }
  try {
    return JSON.parse(responseText) as T;
  } catch {
    const requestId = response.headers.get('x-vercel-id') ?? response.headers.get('x-request-id') ?? '확인 불가';
    throw new Error(`[INVALID_JSON_RESPONSE] ${serverName} 응답 JSON을 해석할 수 없습니다. HTTP ${response.status} · 요청 ID ${requestId} · 응답: ${safeExcerpt(responseText)}`);
  }
}

export function getErrorMessage(value: unknown, fallback = '당근 검색에 실패했습니다.'): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    const code = typeof record.code === 'string' ? record.code : '';
    const stage = typeof record.stage === 'string' ? record.stage : '';
    const requestId = typeof record.requestId === 'string' ? record.requestId : '';
    if (message && code) {
      const location = stage ? `${code} · ${stage}` : code;
      return `[${location}] ${message}${requestId ? ` · 요청 ID ${requestId}` : ''}`;
    }
    for (const key of ['message', 'error', 'detail', 'statusText']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) return nested;
      if (nested && nested !== value) {
        const nestedMessage = getErrorMessage(nested, '');
        if (nestedMessage) return nestedMessage;
      }
    }
  }
  return fallback;
}

function safeExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 300) || '(빈 응답)';
}
