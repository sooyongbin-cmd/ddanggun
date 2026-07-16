const status = document.querySelector('#status');
const setStatus = (text, kind = '') => { status.textContent = text; status.className = kind; };
document.querySelector('#run').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes('daangn.com')) return setStatus('당근 검색 결과 페이지를 먼저 열어주세요.', 'error');
  setStatus('매물을 읽는 중입니다…');
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectListings });
    if (!result?.listings?.length) return setStatus(result?.error || '읽을 수 있는 매물이 없습니다. 검색 결과 화면인지 확인하세요.', 'error');
    const encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(result.listings)))));
    await chrome.tabs.create({ url: `http://localhost:5173/?listings=${encoded}` });
    setStatus(`${result.listings.length}개 매물을 대시보드로 보냈습니다.`, 'ok');
  } catch (error) { setStatus(`가져오기 실패: ${error.message}`, 'error'); }
});
function collectListings() {
  const cards = [...document.querySelectorAll('article, [data-testid*="article"], a[href*="/kr/buy-sell/"]')];
  const seen = new Set(); const listings = [];
  for (const card of cards) {
    const link = card.matches('a') ? card : card.querySelector('a[href*="/kr/buy-sell/"]');
    const url = link?.href; if (!url || seen.has(url)) continue;
    const text = (card.innerText || link.innerText || '').replace(/\s+/g, ' ').trim();
    const priceMatch = text.match(/([\d,]+)\s*원/); const title = (card.querySelector('h1,h2,h3,[class*="title"]')?.innerText || text.split(/\d{1,3}(?:,\d{3})*\s*원/)[0] || '').trim();
    if (!title || !priceMatch) continue; seen.add(url);
    const bits = text.split(' ').filter(Boolean);
    listings.push({ id: url, title, price: Number(priceMatch[1].replaceAll(',', '')), url, location: bits.find(x => /동$|읍$|면$|구$/.test(x)), postedAt: text.match(/(?:방금 전|\d+\s*(?:분|시간|일)\s*전)/)?.[0], imageUrl: card.querySelector('img')?.src });
  }
  return { listings, error: listings.length ? undefined : '검색 결과 카드 구조를 찾지 못했습니다. 수동 입력을 이용해 주세요.' };
}
