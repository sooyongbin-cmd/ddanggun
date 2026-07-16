import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { analyze, getCpuPerformanceScore, getCpuSpecification } from './analyzer';
import { filterListingsForAi, MAX_AI_LISTINGS } from './ai-listing-filter';
import { getCpuDisplayInfo } from './cpu-display';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS, type GeminiModel } from './gemini-models';
import { getErrorMessage, readJsonResponse } from './http';
import { loadAnalyses, saveAnalyses } from './storage';
import type { AiListingAnalysis, Analysis, Listing } from './types';
import './style.css';

const myComputer = analyze({
  id: 'my-computer',
  title: '내 컴퓨터 · i5-6600K',
  body: 'i5-6600K CPU @ 3.50GHz, RAM 8GB, SSD 120GB, GTX 960',
  price: 150000,
  url: '#',
  location: '보유 PC',
});

const AI_STEPS = ['입력 조건 검증', '검색 API 요청', '부산 구·군 순차 조회', '동일 내용 중복 제거', 'CPU 성능순 대상 선정', 'Gemini AI 분석', 'JSON 응답 검증', '결과 표 표시'] as const;
type AiProgress = { state: 'idle' | 'running' | 'success' | 'error'; activeStep: number; detail: string };

function App() {
  const [items, setItems] = useState<Analysis[]>(loadAnalyses);
  const [keyword, setKeyword] = useState('PC');
  const [minPrice, setMinPrice] = useState('100000');
  const [maxPrice, setMaxPrice] = useState('300000');
  const [onlyOnSale, setOnlyOnSale] = useState(true);
  const [aiModel, setAiModel] = useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [isFetching, setIsFetching] = useState(false);
  const [isAiFetching, setIsAiFetching] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [aiResults, setAiResults] = useState<AiListingAnalysis[]>([]);
  const [aiProgress, setAiProgress] = useState<AiProgress>({ state: 'idle', activeStep: -1, detail: '' });

  useEffect(() => saveAnalyses(items), [items]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'DANGGUN_LISTINGS') {
        importListings(event.data.listings);
        setIsFetching(false);
        setLoadError('');
      }
      if (event.data?.type === 'DANGGUN_ANALYZER_ERROR') {
        setLoadError(getErrorMessage(event.data.message));
        setIsFetching(false);
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const sorted = useMemo(
    () => [myComputer, ...items.filter((item) => item.id !== myComputer.id)].filter((item) => (getCpuSpecification(item.specs.cpu)?.cores ?? 0) >= 4).sort((a, b) => getCpuPerformanceScore(b.specs.cpu) - getCpuPerformanceScore(a.specs.cpu) || (b.valueScore ?? -1) - (a.valueScore ?? -1)),
    [items],
  );

  function importListings(listings: Listing[]) {
    const incoming = listings.map((listing) => analyze(listing));
    setItems((previous) => [
      ...incoming,
      ...previous.filter((old) => !incoming.some((next) => next.url === old.url)),
    ]);
  }

  async function fetchDanggun() {
    setItems([]);
    setLoadError('');
    setIsFetching(true);
    try {
      const query = new URLSearchParams({
        search: keyword.trim() || 'PC',
        minPrice: minPrice.replace(/[^\d]/g, '') || '0',
        maxPrice: maxPrice.replace(/[^\d]/g, '') || '999999999',
        onlyOnSale: String(onlyOnSale),
      });
      const response = await fetch(`/api/danggun-search?${query}`, { headers: { Accept: 'application/json' } });
      const contentType = response.headers.get('content-type') ?? '';
      const responseText = await response.text();
      if (!contentType.includes('application/json')) {
        throw new Error(`조회 서버가 JSON이 아닌 응답을 반환했습니다 (HTTP ${response.status}). 이 앱은 조회 API가 설정된 서버에서 실행해야 합니다.`);
      }
      let data: { listings?: Listing[]; error?: unknown };
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`조회 서버 응답을 읽을 수 없습니다 (HTTP ${response.status}).`);
      }
      if (!response.ok) throw new Error(getErrorMessage(data.error, '당근 검색에 실패했습니다.'));
      importListings(data.listings ?? []);
      if (!data.listings?.length) setLoadError('조건에 맞는 판매중 매물이 없습니다.');
    } catch (error) {
      setLoadError(getErrorMessage(error, '당근 검색에 실패했습니다.'));
    } finally {
      setIsFetching(false);
    }
  }

  async function fetchWithAi() {
    setAiResults([]);
    setLoadError('');
    setAiProgress({ state: 'running', activeStep: 0, detail: '부산광역시 전체 조회 조건을 확인하고 있습니다.' });

    setIsAiFetching(true);
    try {
      await nextPaint();
      const query = new URLSearchParams({
        search: keyword.trim() || 'PC',
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
      setAiProgress({ state: 'running', activeStep: 3, detail: `부산 ${searchData.searchedDistricts ?? 16}개 구·군 조회 후 ${listings.length}개 고유 매물을 정리했습니다.${searchData.failedDistricts ? ` 실패 ${searchData.failedDistricts}개 구·군` : ''}` });
      if (!listings.length) throw new Error('조건에 맞는 판매중 매물이 없습니다.');

      await nextPaint();
      const filtered = filterListingsForAi(listings, keyword);
      setAiProgress({
        state: 'running',
        activeStep: 4,
        detail: filtered.applied
          ? `제목·본문이 동일한 중복 ${filtered.excludedDuplicates}건과 CPU 확인 불가 ${filtered.excludedMissingCpu}건을 제외한 뒤, CPU 성능이 높은 순서로 ${filtered.eligibleBeforeLimit}건 중 최대 ${MAX_AI_LISTINGS}건을 선정했습니다. AI 전달 대상은 ${filtered.listings.length}건입니다.`
          : `제목·본문이 동일한 중복 ${filtered.excludedDuplicates}건을 제외하고 조회 순서대로 최대 ${MAX_AI_LISTINGS}건을 선정했습니다. AI 전달 대상은 ${filtered.listings.length}건입니다.`,
      });
      if (!filtered.listings.length) throw new Error('PC 검색 결과에서 CPU를 확인할 수 있는 매물이 없어 AI 분석을 진행할 수 없습니다.');

      await nextPaint();
      setAiProgress({ state: 'running', activeStep: 5, detail: `${filtered.listings.length}개 매물의 id·제목·가격·본문을 하나의 JSON 배열로 Gemini에 전달했습니다. location은 전달하지 않습니다.` });
      const aiResponse = await fetch('/api/gemini-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ listings: filtered.listings, model: aiModel }),
      });
      const aiData = await readJsonResponse<{ analyses?: AiListingAnalysis[]; model?: string; limited?: boolean; error?: unknown }>(aiResponse, 'AI 분석 서버');
      if (!aiResponse.ok) throw new Error(getErrorMessage(aiData.error, 'AI 분석에 실패했습니다.'));

      setAiProgress({ state: 'running', activeStep: 6, detail: 'Gemini JSON 응답의 필드와 매물 ID를 검증했습니다.' });
      if (!Array.isArray(aiData.analyses) || !aiData.analyses.length) throw new Error('AI 분석 결과가 비어 있습니다.');
      setAiResults(aiData.analyses);
      await nextPaint();
      setAiProgress({ state: 'success', activeStep: 7, detail: `${aiData.model ?? 'Gemini'} 분석 결과 ${aiData.analyses.length}건을 표시했습니다.${aiData.limited ? ' 최대 40건만 분석했습니다.' : ''}` });
    } catch (error) {
      const message = getErrorMessage(error, 'AI 조회에 실패했습니다.');
      setLoadError(message);
      setAiProgress((previous) => ({ ...previous, state: 'error', detail: message }));
    } finally {
      setIsAiFetching(false);
    }
  }

  const grade = (item: Analysis) => item.valueScore && item.confidence !== 'low'
    ? item.valueScore >= 30 ? '추천' : '보통'
    : '주의';
  const gradeClass = (item: Analysis) => `grade grade-${grade(item)}`;

  return (
    <div className="app-shell">
      <nav className="topbar" aria-label="주요 메뉴">
        <a className="wordmark" href="#top" aria-label="PC Value 홈">
          <span className="wordmark-dot" /> ddanggun
        </a>
      </nav>

      <main id="top">
        <section className="search-band" aria-label="조회 조건">
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); fetchDanggun(); }}>
            <label className="search-field field-keyword">검색어<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="PC" /></label>
            <label className="search-field">최소 금액<input inputMode="numeric" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="100000" /></label>
            <label className="search-field">최대 금액<input inputMode="numeric" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="300000" /></label>
            <label className="sale-field"><input type="checkbox" checked={onlyOnSale} onChange={(event) => setOnlyOnSale(event.target.checked)} /> 판매중만</label>
            <label className="search-field model-field">AI 모델<select value={aiModel} disabled={isFetching || isAiFetching} onChange={(event) => setAiModel(event.target.value as GeminiModel)}>{GEMINI_MODELS.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label>
            <button className="button button-primary" type="submit" disabled={isFetching || isAiFetching}>{isFetching ? '검색 결과 가져오는 중…' : '조회하기'}</button>
            <button className="button button-ai" type="button" disabled={isFetching || isAiFetching} onClick={fetchWithAi}>{isAiFetching ? 'AI 분석 중…' : 'AI조회'}</button>
          </form>
          <p className="search-condition-note"><strong>조회 범위</strong> 부산광역시 전체 16개 구·군을 차례로 조회합니다. <strong>AI 전달 조건</strong> 제목과 본문이 동일하면 최초 id 한 건만 사용합니다. 검색어가 PC이면 CPU 확인 불가 매물을 제외하고 CPU 성능이 높은 순서로 최대 {MAX_AI_LISTINGS}건을 선정합니다. 지역 정보는 Gemini에 전달하지 않습니다.</p>
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
                return <li className={`progress-step step-${status}`} key={step}><span>{status === 'done' ? '✓' : index + 1}</span><strong>{step}</strong></li>;
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
                  <thead><tr><th>순위</th><th>매물</th><th>금액</th><th>CPU / 성능정보</th><th>RAM</th><th>저장장치</th><th>GPU</th><th>AI 점수</th><th>평가</th><th>요약</th><th>장점</th><th>주의사항</th></tr></thead>
                  <tbody>{aiResults.map((item, index) => (
                    <tr key={item.id}>
                      <td><span className="table-rank">{String(index + 1).padStart(2, '0')}</span></td>
                      <td><div className="ai-product"><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><span>{item.location ?? '지역 미상'}</span></div></td>
                      <td className="price-cell">{item.price ? `${item.price.toLocaleString()}원` : '미상'}</td>
                      <td><AiCpuDetails cpu={item.cpu} /></td><td>{item.ram}</td><td>{item.storage}</td><td>{item.gpu}</td>
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

        <section className="workspace table-workspace">
          <div className="results-panel">
            <div className="section-heading">
              <div><p className="eyebrow">RANKING</p><h2>CPU 성능 순위</h2></div>
              <span className="count-pill">{sorted.length}개 매물</span>
            </div>

            {sorted.length === 0 ? (
              <div className="empty-state"><span>01</span><h3>분석할 매물이 없습니다.</h3><p>조회하기를 누르거나 매물 정보를 직접 추가해 주세요.</p></div>
            ) : (
              <div className="comparison-table-wrap">
                <table className="comparison-table">
                  <thead><tr><th>순위</th><th>매물</th><th>금액</th><th>CPU</th><th>CPU 성능</th><th>처리속도</th><th>코어</th><th>스레드</th><th>RAM</th><th>저장장치</th><th>GPU</th><th>지역</th><th>게시일</th><th>가성비</th></tr></thead>
                  <tbody>{sorted.map((item, index) => (
                    <tr className={item.id === myComputer.id ? 'my-computer-row' : ''} key={item.id}>
                      <td><span className="table-rank">{String(index + 1).padStart(2, '0')}</span></td>
                      <td><div className="table-product">{item.imageUrl && item.url !== '#' ? <a className="table-image-link" href={item.url} target="_blank" rel="noreferrer" aria-label={`${item.title} 원문 보기`}><img src={item.imageUrl} alt="" /></a> : item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span className="image-placeholder">{item.id === myComputer.id ? 'MY' : 'PC'}</span>}<strong>{item.title}{item.id === myComputer.id && <span className="my-pc-label">내 PC</span>}</strong></div></td>
                      <td className="price-cell">{item.price ? `${item.price.toLocaleString()}원` : '미상'}</td>
                      <td>{item.specs.cpu ?? <Missing />}</td>
                      <td><span className="cpu-index">{getCpuPerformanceScore(item.specs.cpu)}</span></td>
                      <td>{formatCpuSpeed(item.specs.cpu)}</td>
                      <td>{getCpuSpecification(item.specs.cpu)?.cores ?? <Missing />}</td>
                      <td>{getCpuSpecification(item.specs.cpu)?.threads ?? <Missing />}</td>
                      <td>{item.specs.ramGb ? `${item.specs.ramGb}GB` : <Missing />}</td>
                      <td>{item.specs.storageGb ? `${item.specs.storageType ?? '타입 미상'} ${item.specs.storageGb}GB` : <Missing />}</td>
                      <td>{item.specs.gpu ?? <Missing />}</td>
                      <td>{item.location ?? '미상'}</td>
                      <td>{item.id === myComputer.id ? '—' : formatDate(item.postedAt)}</td>
                      <td><div className="value-cell"><strong>{item.valueScore ?? '—'}</strong><span className={gradeClass(item)}>{grade(item)}</span></div></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
      <footer><span>PC VALUE / INTERNAL TOOL</span><span>데이터는 이 브라우저에만 저장됩니다.</span></footer>
    </div>
  );
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function formatDate(value?: string) {
  if (!value) return '게시 시점 미상';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const postedStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.floor((todayStart - postedStart) / 86_400_000);
  if (daysAgo <= 0) return '오늘';
  return `${daysAgo}일 전`;
}

function Missing() { return <span className="missing">확인 필요</span>; }
function formatCpuSpeed(cpu?: string) { const spec = getCpuSpecification(cpu); if (!spec) return <Missing />; return spec.maxGhz ? `${spec.baseGhz} / ${spec.maxGhz}GHz` : `${spec.baseGhz}GHz`; }

function AiCpuDetails({ cpu }: { cpu: string }) {
  const info = getCpuDisplayInfo(cpu);
  return (
    <div className="ai-cpu-details">
      <strong>{cpu}</strong>
      <span>{info.performance === null ? '성능지수 확인 불가' : <>성능지수 <b>{info.performance}</b></>}</span>
      <small>{info.specification}</small>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
