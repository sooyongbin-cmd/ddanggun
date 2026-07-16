import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { analyze, getCpuPerformanceScore, getCpuSpecification } from './analyzer';
import { loadAnalyses, saveAnalyses } from './storage';
import type { Analysis, Listing } from './types';
import './style.css';

const myComputer = analyze({
  id: 'my-computer',
  title: '내 컴퓨터 · i5-6600K',
  body: 'i5-6600K CPU @ 3.50GHz, RAM 8GB, SSD 120GB, GTX 960',
  price: 150000,
  url: '#',
  location: '보유 PC',
});

function App() {
  const [items, setItems] = useState<Analysis[]>(loadAnalyses);
  const [keyword, setKeyword] = useState('PC');
  const [minPrice, setMinPrice] = useState('100000');
  const [maxPrice, setMaxPrice] = useState('300000');
  const [regions, setRegions] = useState({ haeundae: true, suyeong: true });
  const [onlyOnSale, setOnlyOnSale] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => saveAnalyses(items), [items]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'DANGGUN_LISTINGS') {
        importListings(event.data.listings);
        setIsFetching(false);
        setLoadError('');
      }
      if (event.data?.type === 'DANGGUN_ANALYZER_ERROR') {
        setLoadError(event.data.message);
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
    const selectedRegions = Object.entries(regions).filter(([, selected]) => selected).map(([region]) => region);
    if (!selectedRegions.length) {
      setLoadError('조회할 지역을 하나 이상 선택해 주세요.');
      return;
    }
    setItems([]);
    setLoadError('');
    setIsFetching(true);
    try {
      const query = new URLSearchParams({
        search: keyword.trim() || 'PC',
        minPrice: minPrice.replace(/[^\d]/g, '') || '0',
        maxPrice: maxPrice.replace(/[^\d]/g, '') || '999999999',
        regions: selectedRegions.join(','),
        onlyOnSale: String(onlyOnSale),
      });
      const response = await fetch(`/api/danggun-search?${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '당근 검색에 실패했습니다.');
      importListings(data.listings);
      if (!data.listings.length) setLoadError('조건에 맞는 판매중 매물이 없습니다.');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '당근 검색에 실패했습니다.');
    } finally {
      setIsFetching(false);
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
            <fieldset className="search-field region-field"><legend>지역</legend><label><input type="checkbox" checked={regions.haeundae} onChange={(event) => setRegions((previous) => ({ ...previous, haeundae: event.target.checked }))} /> 해운대구</label><label><input type="checkbox" checked={regions.suyeong} onChange={(event) => setRegions((previous) => ({ ...previous, suyeong: event.target.checked }))} /> 수영구</label></fieldset>
            <label className="sale-field"><input type="checkbox" checked={onlyOnSale} onChange={(event) => setOnlyOnSale(event.target.checked)} /> 판매중만</label>
            <button className="button button-primary" type="submit" disabled={isFetching}>{isFetching ? '검색 결과 가져오는 중…' : '조회하기'}</button>
          </form>
          {loadError && <p className="alert" role="alert">{loadError}</p>}
        </section>

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

createRoot(document.getElementById('root')!).render(<App />);
