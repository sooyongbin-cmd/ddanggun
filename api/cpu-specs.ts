import type { IncomingMessage, ServerResponse } from 'node:http';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || 'https://hinrycozuqkprxvkjval.supabase.co';
// Publishable keys are intentionally safe to use in public applications. RLS remains the authorization boundary.
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_XdcVALt3pUS4JOU6pI8sEQ_u0CRiT9E';
const PAGE_SIZE = 30;
const MAX_PAGE = 100;
const ALLOWED_MANUFACTURERS = new Set(['Intel', 'AMD']);
const SELECT_COLUMNS = [
  'id',
  'performance_rank',
  'performance_score',
  'single_core_score',
  'multi_core_score',
  'cpu_name',
  'manufacturer',
  'architecture',
  'cores',
  'threads',
  'base_clock_ghz',
  'boost_clock_ghz',
  'cache_mb',
  'tdp_watts',
  'benchmark_name',
  'benchmark_version',
  'source_url',
].join(',');

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method && req.method !== 'GET') {
    return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET 요청만 지원합니다.' } });
  }

  try {
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const search = normalizeSearch(requestUrl.searchParams.get('search'));
    const manufacturerValue = requestUrl.searchParams.get('manufacturer')?.trim() ?? '';
    const manufacturer = ALLOWED_MANUFACTURERS.has(manufacturerValue) ? manufacturerValue : '';
    const page = clampInteger(requestUrl.searchParams.get('page'), 0, MAX_PAGE);

    const query = new URLSearchParams({
      select: SELECT_COLUMNS,
      order: 'performance_rank.asc,cpu_name.asc',
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (search) query.set('cpu_name', `ilike.*${search}*`);
    if (manufacturer) query.set('manufacturer', `eq.${manufacturer}`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/cpu_specs?${query}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
    });
    const raw = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`Supabase가 JSON이 아닌 응답을 반환했습니다 (${response.status}).`);
    }
    if (!response.ok) {
      const upstream = body as Record<string, unknown>;
      const message = typeof upstream.message === 'string' ? upstream.message : `Supabase 조회 실패 (${response.status})`;
      return sendJson(res, 502, { error: { code: 'SUPABASE_QUERY_FAILED', message, status: response.status } });
    }

    const total = parseTotal(response.headers.get('content-range'));
    return sendJson(res, 200, {
      cpuSpecs: Array.isArray(body) ? body : [],
      total,
      page,
      pageSize: PAGE_SIZE,
      hasNext: total === null ? Array.isArray(body) && body.length === PAGE_SIZE : (page + 1) * PAGE_SIZE < total,
    });
  } catch (error) {
    return sendJson(res, 500, {
      error: { code: 'CPU_SPECS_INTERNAL_ERROR', message: getErrorMessage(error) },
    });
  }
}

function normalizeSearch(value: string | null) {
  return (value ?? '').trim().replace(/[^0-9a-zA-Z가-힣\-+ ]/g, '').replace(/\s+/g, ' ').slice(0, 60);
}

function clampInteger(value: string | null, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

function parseTotal(contentRange: string | null) {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'CPU 정보를 조회하지 못했습니다.';
}
