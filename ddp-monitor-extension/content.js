(function () {
  if (window.__DDP_MONITOR_CONTENT_SCRIPT__) return;
  window.__DDP_MONITOR_CONTENT_SCRIPT__ = true;

  const SOURCE_KEY = 'DDP_MONITOR_PAGE';
  const INVOKE_KEY = 'DDP_MONITOR_INVOKE';
  const RESPONSE_KEY = 'DDP_MONITOR_PAGE_RESPONSE';

  // Dynamic injection fallback
  function injectMainScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {}
  }

  injectMainScript();

  // Listen for window postMessages from main world
  window.addEventListener('message', function (event) {
    if (!event.data) return;

    if (event.data.source === SOURCE_KEY && event.data.detail) {
      try {
        chrome.runtime.sendMessage({
          type: 'DDP_FRAME',
          payload: event.data.detail
        }, function (response) {
          if (chrome.runtime.lastError) {}
        });
      } catch (err) {}
    } else if (event.data.source === RESPONSE_KEY && event.data.detail) {
      try {
        chrome.runtime.sendMessage({
          type: 'DDP_INVOKE_RESPONSE',
          payload: event.data.detail
        }, function (response) {
          if (chrome.runtime.lastError) {}
        });
      } catch (err) {}
    }
  });

  // Listen for extension commands from Background script
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === 'EXECUTE_DDP_METHOD' && message.payload) {
      window.postMessage({
        source: INVOKE_KEY,
        detail: message.payload
      }, '*');
      sendResponse({ status: 'sent' });
    }
    return true;
  });
})();
