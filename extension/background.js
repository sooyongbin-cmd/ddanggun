const SEARCH_URL = 'https://www.daangn.com/kr/buy-sell/s/?in=%EC%9E%AC%EC%86%A1%EB%8F%99-6027&only_on_sale=true&price=100000__300000&search=pc';

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type !== 'FETCH_FIXED_DANGGUN_SEARCH' || !sender.tab?.id) return;
  fetchFixedSearch(sender.tab.id).catch((error) => chrome.tabs.sendMessage(sender.tab.id, { type: 'DANGGUN_ANALYZER_ERROR', message: `당근 검색 결과를 가져오지 못했습니다: ${error.message}` }).catch(() => {}));
});

async function fetchFixedSearch(dashboardTabId) {
  const tab = await chrome.tabs.create({ url: SEARCH_URL, active: false });
  if (!tab.id) throw new Error('검색 탭을 만들 수 없습니다.');
  await waitForComplete(tab.id);
  await new Promise(resolve => setTimeout(resolve, 1200));
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectListings });
  await chrome.tabs.remove(tab.id);
  if (!result?.listings?.length) throw new Error(result?.error || '검색 결과에서 매물을 찾지 못했습니다.');
  await chrome.tabs.sendMessage(dashboardTabId, { type: 'DANGGUN_LISTINGS', listings: result.listings });
}
function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timeout;
    const finish = () => { if (done) return; done = true; clearTimeout(timeout); chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (changedTabId, info) => { if (changedTabId === tabId && info.status === 'complete') finish(); };
    chrome.tabs.onUpdated.addListener(listener);
    timeout = setTimeout(() => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(listener); reject(new Error('검색 페이지 로딩 시간이 초과되었습니다.')); }, 20000);
    chrome.tabs.get(tabId).then(tab => { if (tab.status === 'complete') finish(); });
  });
}
function collectListings() {
  const cards = [...document.querySelectorAll('article, [data-testid*="article"], a[href*="/kr/buy-sell/"]')];
  const seen = new Set(); const listings = [];
  for (const card of cards) {
    const link = card.matches('a') ? card : card.querySelector('a[href*="/kr/buy-sell/"]'); const url = link?.href;
    if (!url || seen.has(url)) continue;
    const text = (card.innerText || link.innerText || '').replace(/\s+/g, ' ').trim(); const price = text.match(/([\d,]+)\s*원/);
    const title = (card.querySelector('h1,h2,h3,[class*="title"]')?.innerText || text.split(/\d{1,3}(?:,\d{3})*\s*원/)[0] || '').trim();
    if (!title || !price) continue; seen.add(url);
    listings.push({ id:url, title, price:Number(price[1].replaceAll(',', '')), url, location:text.match(/\S+(?:동|읍|면|구)(?=\s|$)/)?.[0], postedAt:text.match(/(?:방금 전|\d+\s*(?:분|시간|일)\s*전)/)?.[0], imageUrl:card.querySelector('img')?.src });
  }
  return { listings, error: listings.length ? undefined : '검색 결과 카드 구조를 찾지 못했습니다.' };
}
