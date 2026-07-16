window.postMessage({ type: 'DANGGUN_ANALYZER_READY' }, window.location.origin);
window.addEventListener('message', (event) => {
  if (event.source === window && event.data?.type === 'DANGGUN_ANALYZER_PING') {
    window.postMessage({ type: 'DANGGUN_ANALYZER_READY' }, window.location.origin);
    return;
  }
  if (event.source !== window || event.data?.type !== 'DANGGUN_ANALYZER_FETCH') return;
  chrome.runtime.sendMessage({ type: 'FETCH_FIXED_DANGGUN_SEARCH' });
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'DANGGUN_LISTINGS' || message.type === 'DANGGUN_ANALYZER_ERROR') {
    window.postMessage(message, window.location.origin);
  }
});
