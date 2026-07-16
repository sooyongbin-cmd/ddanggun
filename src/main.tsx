import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MAX_AI_LISTINGS, prepareListingsForAi, selectListingsForAi } from './ai-listing-filter';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, type GeminiModel } from './gemini-models';
import { getErrorMessage, readJsonResponse } from './http';
import type { AiListingAnalysis, CpuSpec, Listing } from './types';
import './style.css';

const AI_STEPS = ['입력 조건 검증', '검색 API 요청', '부산 구·군 순차 조회', '동일 내용 중복 제거', 'AI 분석 대상 선정', 'Gemini AI 분석', 'JSON 응답 검증', '결과 표 표시'] as const;
type AiProgress = { state: 'idle' | 'running' | 'success' | 'error'; activeStep: number; detail: string };

function App() {
  const [keyword, setKeyword] = useState('PC');
  const [minPrice, setMinPrice] = useState('100000');
  const [maxPrice, setMaxPrice] = useState('300000');
  const [onlyOnSale, setOnlyOnSale] = useState(true);
  const [aiModel, setAiModel] = useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [isAiFetching, setIsAiFetching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [aiResults, setAiResults] = useState<AiListingAnalysis[]>([]);
  const [aiProgress, setAiProgress] = useState<AiProgress>({ state: 'idle', activeStep: -1, detail: '' });
  const [searchResultCount, setSearchResultCount] = useState<number | null>(null);
  const [removedDuplicateCount, setRemovedDuplicateCount] = useState<number | null>(null);
  const [selectedAnalysisCount, setSelectedAnalysisCount] = useState<number | null>(null);
  const [validatedResponseCount, setValidatedResponseCount] = useState<number | null>(null);
  const [cpuSearch, setCpuSearch] = useState('');
  const [cpuManufacturer, setCpuManufacturer] = useState('');
  const [cpuSpecs, setCpuSpecs] = useState<CpuSpec[]>([]);
  const [cpuTotal, setCpuTotal] = useState<number | null>(null);
  const [cpuPage, setCpuPage] = useState(0);
  const [cpuHasNext, setCpuHasNext] = useState(false);
  const [isCpuFetching, setIsCpuFetching] = useState(false);
  const [cpuError, setCpuError] = useState('');

  useEffect(() => {
    void fetchCpuSpecs(0);
  }, []);

  async function fetchCpuSpecs(page: number) {
    setIsCpuFetching(true);
    setCpuError('');
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (cpuSearch.trim()) query.set('search', cpuSearch.trim());
      if (cpuManufacturer) query.set('manufacturer', cpuManufacturer);
      const response = await fetch(`/api/cpu-specs?${query}`, { headers: { Accept: 'application/json' } });
      const data = await readJsonResponse<{
        cpuSpecs?: CpuSpec[];
        total?: number | null;
        page?: number;
        hasNext?: boolean;
        error?: unknown;
      }>(response, 'CPU 정보 서버');
      if (!response.ok) throw new Error(getErrorMessage(data.error, 'CPU 정보를 조회하지 못했습니다.'));
      setCpuSpecs(data.cpuSpecs ?? []);
      setCpuTotal(data.total ?? null);
      setCpuPage(data.page ?? page);
      setCpuHasNext(Boolean(data.hasNext));
    } catch (error) {
      setCpuSpecs([]);
      setCpuError(getErrorMessage(error, 'CPU 정보를 조회하지 못했습니다.'));
    } finally {
      setIsCpuFetching(false);
    }
  }

  async function fetchWithAi() {
    setAiResults([]);
    setLoadError('');
    setSearchResultCount(null);
    setRemovedDuplicateCount(null);
    setSelectedAnalysisCount(null);
    setValidatedResponseCount(null);
    setAiProgress({ state: 'running', activeStep: 0, detail: '부산광역시 전체 조회 조건을 확인하고 있습니다.' });

    setIsAiFetching(true);
    try {
      await nextPaint();
      const searchKeyword = keyword.trim() || 'PC';
      const query = new URLSearchParams({
        search: searchKeyword,
        minPrice: minPrice.replace(/[^\d]/g, '') || '0',
        maxPrice: maxPrice.replace(/[^\d]/g, '') || '999999999',
        onlyOnSale: String(onlyOnSale),
      });
      setAiProgress({ state: 'running', activeStep: 1, detail: '조회 조건을 검색 서버에 전달했습니다.' });
      await nextPaint();
      setAiProgress({ state: 'running', activeStep: 2, detail: '부산 16개 구·군의 매물을 차례로 조회하고 있습니다.' });
      const searchResponse = await fetch(`/api/danggun-search?${query}`, { headers: { Accept: 'application/json' } });
      const searchData = await readJsonResponse<{ listings?: Listing[]; searchedDistricts?: number; failedDistricts?: number; error?: unknown }>(searchResponse, '조회 서버');
      if (!searchResponse.ok) throw new Error(getErrorMessage(searchData.error, '당근 검색에 실패했습니다.'));

      const listings = searchData.listings ?? [];
      setSearchResultCount(listings.length);
      setAiProgress({ state: 'running', activeStep: 3, detail: `부산 ${searchData.searchedDistricts ?? 16}개 구·군 조회 후 ${listings.length}개 고유 매물을 정리했습니다.${searchData.failedDistricts ? ` 실패 ${searchData.failedDistricts}개 구·군` : ''}` });
      if (!listings.length) throw new Error('조건에 맞는 판매중 매물이 없습니다.');

      await nextPaint();
      const prepared = prepareListingsForAi(listings, searchKeyword);
      const uniqueContentCount = prepared.uniqueListings.length;
      setRemovedDuplicateCount(prepared.excludedDuplicates);
      setAiProgress({ state: 'running', activeStep: 3, detail: `제목·본문이 동일한 중복 ${prepared.excludedDuplicates}건을 제거한 후 ${uniqueContentCount}건이 남았습니다.` });
      await nextPaint();
      let cpuMatches: Record<string, CpuSpec> = {};
      if (prepared.applied && prepared.cpuCandidates.length > 0) {
        setAiProgress({ state: 'running', activeStep: 4, detail: `CPU 정보가 확인된 ${prepared.cpuCandidates.length}건을 DB의 CPU 성능 순위와 매칭하고 있습니다.` });
        const cpuResponse = await fetch('/api/cpu-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: prepared.cpuCandidates }),
        });
        const cpuData = await readJsonResponse<{ matches?: Record<string, CpuSpec>; error?: unknown }>(cpuResponse, 'CPU 순위 서버');
        if (!cpuResponse.ok) throw new Error(getErrorMessage(cpuData.error, 'DB에서 CPU 성능 순위를 조회하지 못했습니다.'));
        cpuMatches = cpuData.matches ?? {};
      }
      const filtered = selectListingsForAi(prepared, cpuMatches);
      setSelectedAnalysisCount(filtered.listings.length);
      setAiProgress({
        state: 'running',
        activeStep: 4,
        detail: filtered.applied
          ? `중복 제거 후 CPU 정보가 없거나 DB 순위와 매칭되지 않은 ${filtered.excludedMissingCpu}건을 제외하고, DB CPU 성능 순위가 높은 순서로 ${filtered.eligibleBeforeLimit}건 중 최대 ${MAX_AI_LISTINGS}건을 선정했습니다. AI 전달 대상은 ${filtered.listings.length}건입니다.`
          : `제목·본문이 동일한 중복 ${filtered.excludedDuplicates}건을 제외하고 조회 순서대로 최대 ${MAX_AI_LISTINGS}건을 선정했습니다. AI 전달 대상은 ${filtered.listings.length}건입니다.`,
      });
      if (!filtered.listings.length) throw new Error('PC 검색 결과에서 DB CPU 순위와 매칭되는 매물이 없어 AI 분석을 진행할 수 없습니다.');

      await nextPaint();
      setAiProgress({ state: 'running', activeStep: 5, detail: `${filtered.listings.length}개 매물의 id·제목·가격·본문을 하나의 JSON 배열로 Gemini에 전달했습니다. location은 전달하지 않습니다.` });
      const aiResponse = await fetch('/api/gemini-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ listings: filtered.listings, model: aiModel }),
      });
      const aiData = await readJsonResponse<{ analyses?: AiListingAnalysis[]; model?: string; limited?: boolean; error?: unknown }>(aiResponse, 'AI 분석 서버');
      if (!aiResponse.ok) throw new Error(getErrorMessage(aiData.error, 'AI 분석에 실패했습니다.'));

      setAiProgress({ state: 'running', activeStep: 6, detail: 'Gemini JSON 응답의 필드와 매물 ID를 검증하고 있습니다.' });
      if (!Array.isArray(aiData.analyses) || !aiData.analyses.length) throw new Error('AI 분석 결과가 비어 있습니다.');
      setValidatedResponseCount(aiData.analyses.length);
      setAiProgress({ state: 'running', activeStep: 6, detail: `Gemini JSON 응답 ${aiData.analyses.length}건의 필드와 매물 ID를 검증했습니다.` });
      const analysesWithCpuSpecs = aiData.analyses.map((analysis) => ({
        ...analysis,
        ...(filtered.cpuSpecsByListingId[analysis.id] ? { cpuSpec: filtered.cpuSpecsByListingId[analysis.id] } : {}),
      }));
      setAiResults(analysesWithCpuSpecs);
      await nextPaint();
      setAiProgress({ state: 'success', activeStep: 7, detail: `${aiData.model ?? 'Gemini'} 분석 결과 ${analysesWithCpuSpecs.length}건과 DB CPU 정보를 표시했습니다.${aiData.limited ? ' 최대 40건만 분석했습니다.' : ''}` });
    } catch (error) {
      const message = getErrorMessage(error, 'AI 조회에 실패했습니다.');
      setLoadError(message);
      setAiProgress((previous) => ({ ...previous, state: 'error', detail: message }));
    } finally {
      setIsAiFetching(false);
    }
  }

  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="주요 메뉴">
        <a className="wordmark" href="#top" aria-label="PC Value 홈">
          <span className="wordmark-dot" /> ddanggun
        </a>
      </nav>

      <main id="top">
        <section className="search-band" aria-label="조회 조건">
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); fetchWithAi(); }}>
            <label className="search-field field-keyword">검색어<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="PC" /></label>
            <label className="search-field">최소 금액<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="100000" /></label>
            <label className="search-field">최대 금액<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="300000" /></label>
            <label className="sale-field"><input type="checkbox" checked={onlyOnSale} onChange={(event) => setOnlyOnSale(event.target.checked)} /> 판매중만</label>
            <label className="search-field model-field">AI 모델<select value={aiModel} disabled={isAiFetching} onChange={(event) => setAiModel(event.target.value as GeminiModel)}>{GEMINI_MODELS.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
            <button className="button button-ai" type="submit" disabled={isAiFetching}>{isAiFetching ? 'AI 분석 중…' : 'AI조회'}</button>
          </form>
          <p className="search-condition-note"><strong>조회 범위</strong> 부산광역시 전체 16개 구·군을 차례로 조회합니다. <strong>AI 전달 조건</strong> 제목과 본문이 동일하면 최초 id 한 건만 사용합니다. 검색어가 PC이면 CPU 모델을 DB와 매칭하고, DB 순위가 확인되지 않는 매물을 제외한 뒤 CPU 성능 순위가 높은 순서로 최대 {MAX_AI_LISTINGS}건을 선정합니다. 지역 정보는 Gemini에 전달하지 않습니다.</p>
          {loadError && <p className="alert" role="alert">{loadError}</p>}
        </section>

        {aiProgress.state !== 'idle' && (
          <section className="ai-progress-panel" aria-live="polite" aria-label="AI 조회 진행상황">
            <div className="ai-progress-heading">
              <div><p className="eyebrow">AI PROCESS</p><h2>AI 조회 진행상황</h2></div>
              <span className={`progress-state progress-${aiProgress.state}`}>{aiProgress.state === 'success' ? '완료' : aiProgress.state === 'error' ? '오류' : '진행중'}</span>
            </div>
            <ol className="progress-steps">
              {AI_STEPS.map((step, index) => {
                const status = index < aiProgress.activeStep || aiProgress.state === 'success' ? 'done' : index === aiProgress.activeStep ? aiProgress.state : 'pending';
                const label = index === 2 && searchResultCount !== null
                  ? `${step} (총 ${searchResultCount}건)`
                  : index === 3 && removedDuplicateCount !== null
                    ? `${step} (${removedDuplicateCount}건 제거)`
                    : index === 4 && selectedAnalysisCount !== null
                      ? `${step} (${selectedAnalysisCount}건)`
                      : index === 6 && validatedResponseCount !== null
                        ? `${step} (${validatedResponseCount}건)`
                    : step;
                return <li className={`progress-step step-${status}`} key={step}><span>{status === 'done' ? '✓' : index + 1}</span><strong>{label}</strong></li>;
              })}
            </ol>
            <p className="progress-detail">{aiProgress.detail}</p>
          </section>
        )}

        {aiResults.length > 0 && (
          <section className="workspace table-workspace ai-results-workspace">
            <div className="results-panel">
              <div className="section-heading">
                <div><p className="eyebrow">GEMINI ANALYSIS</p><h2>AI 매물 분석</h2></div>
                <span className="count-pill">{aiResults.length}개 매물</span>
              </div>
              <div className="comparison-table-wrap">
                <table className="comparison-table ai-comparison-table">
                  <thead><tr><th>순위</th><th>매물</th><th>금액</th><th>물품 종류</th><th>주요 정보</th><th>DB CPU 정보</th><th>AI 점수</th><th>평가</th><th>요약</th><th>장점</th><th>주의사항</th></tr></thead>
                  <tbody>{aiResults.map((item, index) => (
                    <tr key={item.id}>
                      <td><span className="table-rank">{String(index + 1).padStart(2, '0')}</span></td>
                      <td><div className="ai-product"><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><span>{item.location ?? '지역 미상'}</span></div></td>
                      <td className="price-cell">{item.price ? `${item.price.toLocaleString()}원` : '미상'}</td>
                      <td><span className="ai-category">{item.category}</span></td>
                      <td><AiAttributes attributes={item.attributes} /></td>
                      <td><DbCpuDetails cpuSpec={item.cpuSpec} /></td>
                      <td><span className="ai-score">{item.score}</span></td>
                      <td><span className={`grade grade-${item.recommendation}`}>{item.recommendation}</span></td>
                      <td className="ai-text-cell">{item.summary}</td><td className="ai-text-cell">{item.strengths}</td><td className="ai-text-cell">{item.cautions}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        <section className="cpu-catalog-section" aria-labelledby="cpu-catalog-title">
          <div className="section-heading cpu-catalog-heading">
            <div>
              <p className="eyebrow">CPU SPECIFICATIONS</p>
              <h2 id="cpu-catalog-title">CPU 사양 조회</h2>
              <p>공식 제조사 자료를 기준으로 등록된 데스크톱 CPU 정보를 조회합니다.</p>
            </div>
            <span className="count-pill">{cpuTotal === null ? '조회 중' : `${cpuTotal.toLocaleString()}개 CPU`}</span>
          </div>

          <form className="cpu-catalog-filters" onSubmit={(event) => { event.preventDefault(); void fetchCpuSpecs(0); }}>
            <label className="search-field">CPU 이름<input value={cpuSearch} onChange={(event) => setCpuSearch(event.target.value)} placeholder="예: Ryzen 5 5600, i5-12400" /></label>
            <label className="search-field">제조사<select value={cpuManufacturer} onChange={(event) => setCpuManufacturer(event.target.value)}><option value="">전체</option><option value="Intel">Intel</option><option value="AMD">AMD</option></select></label>
            <button className="button button-primary" type="submit" disabled={isCpuFetching}>{isCpuFetching ? '조회 중…' : 'CPU 조회'}</button>
          </form>

          {cpuError && <p className="alert cpu-catalog-alert" role="alert">{cpuError}</p>}
          {!cpuError && (
            <div className="comparison-table-wrap cpu-catalog-table-wrap" aria-busy={isCpuFetching}>
              <table className="comparison-table cpu-catalog-table">
                <thead><tr><th>순위</th><th>CPU</th><th>제조사</th><th>아키텍처</th><th>코어 / 스레드</th><th>기본 / 최대 클럭</th><th>캐시</th><th>TDP</th><th>출처</th></tr></thead>
                <tbody>
                  {cpuSpecs.map((cpu) => (
                    <tr key={cpu.id}>
                      <td><span className="cpu-rank-badge">{cpu.performance_rank}위</span></td>
                      <td><strong className="cpu-name">{cpu.cpu_name}</strong></td>
                      <td><span className={`cpu-maker cpu-maker-${cpu.manufacturer.toLowerCase()}`}>{cpu.manufacturer}</span></td>
                      <td>{cpu.architecture ?? '—'}</td>
                      <td><strong>{cpu.cores}</strong>코어 / <strong>{cpu.threads}</strong>스레드</td>
                      <td>{formatClock(cpu.base_clock_ghz)} / {formatClock(cpu.boost_clock_ghz)}</td>
                      <td>{formatMetric(cpu.cache_mb, 'MB')}</td>
                      <td>{formatMetric(cpu.tdp_watts, 'W')}</td>
                      <td><a className="table-link" href={cpu.source_url} target="_blank" rel="noreferrer">공식 사양 ↗</a></td>
                    </tr>
                  ))}
                  {!isCpuFetching && cpuSpecs.length === 0 && <tr><td className="cpu-empty" colSpan={9}>조건에 맞는 CPU가 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          <div className="cpu-catalog-footer">
            <p>클럭·캐시·TDP는 제조사 공식 사양이며, 벤치마크 점수는 동일 기준의 출처가 확정될 때까지 표시하지 않습니다.</p>
            <div className="cpu-pagination" aria-label="CPU 목록 페이지 이동">
              <button className="button button-outline button-small" type="button" disabled={isCpuFetching || cpuPage === 0} onClick={() => void fetchCpuSpecs(cpuPage - 1)}>이전</button>
              <span>{cpuPage + 1}페이지</span>
              <button className="button button-outline button-small" type="button" disabled={isCpuFetching || !cpuHasNext} onClick={() => void fetchCpuSpecs(cpuPage + 1)}>다음</button>
            </div>
          </div>
        </section>

      </main>
      <footer><span>AI LISTING ANALYZER</span><span>AI 분석 결과는 현재 세션에만 표시됩니다.</span></footer>
    </div>
  );
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function formatClock(value: number | null) {
  return value === null ? '—' : `${Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} GHz`;
}

function formatMetric(value: number | null, unit: string) {
  return value === null ? '—' : `${Number(value).toLocaleString()} ${unit}`;
}

function AiAttributes({ attributes }: { attributes: AiListingAnalysis['attributes'] }) {
  if (!attributes.length) return <span className="missing">확인 가능한 주요 정보 없음</span>;
  const confidenceLabel = { high: '높음', medium: '보통', low: '낮음' } as const;
  return (
    <dl className="ai-attributes">
      {attributes.map((attribute) => (
        <div key={attribute.name}>
          <dt>{attribute.name}</dt>
          <dd>{attribute.value}{attribute.unit && <small>{attribute.unit}</small>}</dd>
          <span className={`attribute-confidence confidence-${attribute.confidence}`}>{confidenceLabel[attribute.confidence]}</span>
        </div>
      ))}
    </dl>
  );
}

function DbCpuDetails({ cpuSpec }: { cpuSpec?: CpuSpec }) {
  if (!cpuSpec) return <span className="missing">DB CPU 매칭 없음</span>;
  return (
    <div className="ai-cpu-details">
      <strong>{cpuSpec.cpu_name}<b>{cpuSpec.performance_rank}위</b></strong>
      <span>{cpuSpec.architecture ?? '아키텍처 미상'} · {cpuSpec.cores}코어 / {cpuSpec.threads}스레드</span>
      <span>기본 {formatClock(cpuSpec.base_clock_ghz)} · 최대 {formatClock(cpuSpec.boost_clock_ghz)}</span>
      <span>캐시 {formatMetric(cpuSpec.cache_mb, 'MB')} · TDP {formatMetric(cpuSpec.tdp_watts, 'W')}</span>
      <span>종합 <b>{cpuSpec.performance_score.toLocaleString()}점</b> · 싱글 {cpuSpec.single_core_score.toLocaleString()} · 멀티 {cpuSpec.multi_core_score.toLocaleString()}</span>
      <small>{cpuSpec.benchmark_name} · {cpuSpec.benchmark_version}</small>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
