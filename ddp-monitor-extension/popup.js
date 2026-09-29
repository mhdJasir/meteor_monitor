(function () {
  let port = null;
  let activeTabId = null;

  const popTotal = document.getElementById('pop-total');
  const popSubs = document.getElementById('pop-subs');
  const popCols = document.getElementById('pop-cols');
  const popBytes = document.getElementById('pop-bytes');
  const socketUrlEl = document.getElementById('socket-url');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const popPauseBtn = document.getElementById('pop-pause-btn');
  const popPauseIcon = document.getElementById('pop-pause-icon');
  const popClearBtn = document.getElementById('pop-clear-btn');

  // Query active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs && tabs[0]) {
      activeTabId = tabs[0].id;
      initPort();
    }
  });

  function initPort() {
    port = chrome.runtime.connect({ name: 'ddp-monitor-port' });

    port.onMessage.addListener((msg) => {
      if (msg.tabId === activeTabId) {
        if (msg.type === 'DDP_TAB_DATA' || msg.type === 'DDP_NEW_FRAME') {
          updateUI(msg);
        } else if (msg.type === 'DDP_TAB_CLEARED') {
          popTotal.textContent = '0';
          popSubs.textContent = '0';
          popCols.textContent = '0';
          popBytes.textContent = '0 KB';
        } else if (msg.type === 'DDP_PAUSE_STATE') {
          setPauseState(msg.isPaused);
        }
      }
    });

    port.postMessage({ action: 'GET_TAB_DATA', tabId: activeTabId });
  }

  function updateUI(data) {
    const stats = data.stats || { totalFrames: 0, bytes: 0 };
    popTotal.textContent = stats.totalFrames || 0;
    popBytes.textContent = ((stats.bytes || 0) / 1024).toFixed(1) + ' KB';

    if (data.subscriptions) {
      popSubs.textContent = data.subscriptions.length;
    }
    if (data.collectionsSummary) {
      popCols.textContent = Object.keys(data.collectionsSummary).length;
    } else if (data.collections) {
      popCols.textContent = Object.keys(data.collections).length;
    }

    if (data.socketUrl) {
      socketUrlEl.textContent = data.socketUrl;
    } else {
      socketUrlEl.textContent = 'Waiting for Meteor WebSocket connection...';
    }

    if (typeof data.isPaused === 'boolean') {
      setPauseState(data.isPaused);
    }
  }

  function setPauseState(isPaused) {
    if (isPaused) {
      statusDot.classList.add('paused');
      statusText.textContent = 'Capture Paused';
      popPauseIcon.textContent = '▶️';
      popPauseBtn.innerHTML = '<span>▶️</span> Resume Capture';
    } else {
      statusDot.classList.remove('paused');
      statusText.textContent = 'Monitoring Active Tab';
      popPauseIcon.textContent = '⏸️';
      popPauseBtn.innerHTML = '<span>⏸️</span> Pause Capture';
    }
  }

  popPauseBtn.addEventListener('click', () => {
    if (port && activeTabId) {
      port.postMessage({ action: 'TOGGLE_PAUSE', tabId: activeTabId });
    }
  });

  popClearBtn.addEventListener('click', () => {
    if (port && activeTabId) {
      port.postMessage({ action: 'CLEAR_TAB_DATA', tabId: activeTabId });
    }
  });
})();
