import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CpuSpec } from '../src/types';

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || 'https://hinrycozuqkprxvkjval.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_XdcVALt3pUS4JOU6pI8sEQ_u0CRiT9E';
const MAX_ITEMS = 1_000;
const SELECT_COLUMNS = [
  'id', 'performance_rank', 'performance_score', 'single_core_score', 'multi_core_score',
  'cpu_name', 'manufacturer', 'architecture', 'cores', 'threads', 'base_clock_ghz',
  'boost_clock_ghz', 'cache_mb', 'tdp_watts', 'benchmark_name', 'benchmark_version', 'source_url',
].join(',');

type CpuMatchRequest = { id: string; cpu: string };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST 요청만 지원합니다.' } });
  }

  try {
    const body = await readJsonBody(req) as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return sendJson(res, 400, { error: { code: 'EMPTY_CPU_ITEMS', message: 'CPU 순위를 조회할 매물 정보가 없습니다.' } });
    }
    if (body.items.length > MAX_ITEMS) {
      return sendJson(res, 400, { error: { code: 'TOO_MANY_CPU_ITEMS', message: `한 번에 최대 ${MAX_ITEMS}건까지 조회할 수 있습니다.` } });
    }
    const items = body.items.flatMap(normalizeRequestItem);
    if (!items.length) {
      return sendJson(res, 400, { error: { code: 'INVALID_CPU_ITEMS', message: '유효한 CPU 모델 정보가 없습니다.' } });
    }

    const query = new URLSearchParams({
      select: SELECT_COLUMNS,
      order: 'performance_rank.asc',
      limit: '1000',
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cpu_specs?${query}`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        Accept: 'application/json',
      },
    });
    const raw = await response.text();
    let rows: unknown;
    try {
      rows = JSON.parse(raw);
    } catch {
      throw new Error(`Supabase가 JSON이 아닌 응답을 반환했습니다 (${response.status}).`);
    }
    if (!response.ok) {
      const upstream = rows as Record<string, unknown>;
      const message = typeof upstream.message === 'string' ? upstream.message : `Supabase CPU 순위 조회 실패 (${response.status})`;
      return sendJson(res, 502, { error: { code: 'SUPABASE_CPU_MATCH_FAILED', message, status: response.status } });
    }

    const cpuByModel = new Map<string, CpuSpec>();
    if (Array.isArray(rows)) {
      rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const cpuSpec = row as CpuSpec;
        const key = normalizeCpuModel(cpuSpec.cpu_name);
        if (key && !cpuByModel.has(key)) cpuByModel.set(key, cpuSpec);
      });
    }
    const matches = Object.fromEntries(items.flatMap((item) => {
      const cpuSpec = cpuByModel.get(normalizeCpuModel(item.cpu));
      return cpuSpec ? [[item.id, cpuSpec]] : [];
    }));
    return sendJson(res, 200, {
      matches,
      matchedCount: Object.keys(matches).length,
      unmatchedCount: items.length - Object.keys(matches).length,
    });
  } catch (error) {
    return sendJson(res, 500, { error: { code: 'CPU_MATCH_INTERNAL_ERROR', message: getErrorMessage(error) } });
  }
}

function normalizeRequestItem(value: unknown): CpuMatchRequest[] {
  if (!value || typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.cpu !== 'string') return [];
  const id = item.id.trim().slice(0, 120);
  const cpu = item.cpu.trim().slice(0, 100);
  return id && normalizeCpuModel(cpu) ? [{ id, cpu }] : [];
}

async function readJsonBody(req: IncomingMessage) {
  const existingBody = (req as IncomingMessage & { body?: unknown }).body;
  if (existingBody !== undefined) return typeof existingBody === 'string' ? JSON.parse(existingBody) : existingBody;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('요청 데이터가 너무 큽니다.');
  }
  return JSON.parse(raw || '{}');
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'CPU 순위를 조회하지 못했습니다.';
}

export function normalizeCpuModel(value?: string | null) {
  if (!value) return '';
  const coreUltra = value.match(/core\s*ultra\s*(?:[579]\s*)?(\d{3})\s*(kf|k|f)?(?:\s*(plus))?\b/i);
  if (coreUltra) return `core-ultra-${coreUltra[1]}${coreUltra[2] ?? ''}${coreUltra[3] ? '-plus' : ''}`.toLowerCase();

  const intel = value.match(/\bi\s*([3579])\s*[- ]?\s*(\d{4,5})\s*([a-z]{0,3})\b/i);
  if (intel) return `i${intel[1]}-${intel[2]}${intel[3]}`.toLowerCase();

  const ryzen = value.match(/(?:ryzen|라이젠)\s*([3579])\s*[- ]?\s*(\d{3,4})\s*(x3d|xt|x|g|f|gt|t)?\b/i);
  if (ryzen) return `ryzen${ryzen[1]}-${ryzen[2]}${ryzen[3] ?? ''}`.toLowerCase();

  const athlon = value.match(/athlon(?:\s+pro)?\s*(\d{3,4}[a-z]{0,2})\b/i);
  return athlon ? `athlon-${athlon[1]}`.toLowerCase() : '';
}
