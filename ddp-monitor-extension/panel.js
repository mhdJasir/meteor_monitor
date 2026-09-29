// DDP Monitor DevTools Panel Script

(function () {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  let port = null;

  // Local state
  let frames = [];
  let subscriptions = [];
  let collections = {};
  let stats = { totalFrames: 0, outCount: 0, inCount: 0, bytes: 0 };
  let isPaused = false;
  let socketUrl = '';

  let activeView = 'stream';
  let activeFilter = 'all';
  let searchQuery = '';
  let selectedFrameId = null;
  let selectedCollection = null;

  // Method Runner State
  let invocationHistory = []; // { reqId, method, params, status, result, error, latencyMs, timestamp }
  let activeInvocationReqId = null;

  // AI Chat Assistant State
  let apiKey = '';
  let aiModel = 'gemini-2.5-flash';
  let chatHistory = [];
  let isGenerating = false;

  // DOM Elements
  const logTbody = document.getElementById('log-tbody');
  const streamEmpty = document.getElementById('stream-empty');
  const searchInput = document.getElementById('search-input');
  const pauseBtn = document.getElementById('pause-btn');
  const pauseIcon = document.getElementById('pause-icon');
  const pauseLabel = document.getElementById('pause-label');
  const clearBtn = document.getElementById('clear-btn');
  const exportBtn = document.getElementById('export-btn');
  const inspectContent = document.getElementById('inspect-content');
  const inspectMsgBadge = document.getElementById('inspect-msg-badge');
  const copyJsonBtn = document.getElementById('copy-json-btn');

  // Stats Elements
  const statTotal = document.getElementById('stat-total');
  const statOut = document.getElementById('stat-out');
  const statIn = document.getElementById('stat-in');
  const statLatency = document.getElementById('stat-latency');
  const statBytes = document.getElementById('stat-bytes');
  const statUrl = document.getElementById('stat-url');
  const subCountBadge = document.getElementById('sub-count-badge');
  const colCountBadge = document.getElementById('col-count-badge');

  // Views & Containers
  const viewStream = document.getElementById('view-stream');
  const viewInvoker = document.getElementById('view-invoker');
  const viewCollections = document.getElementById('view-collections');
  const viewSubscriptions = document.getElementById('view-subscriptions');
  const viewAiChat = document.getElementById('view-ai-chat');
  const streamFilterBar = document.getElementById('stream-filter-bar');

  // AI DOM Elements
  const aiKeyStatus = document.getElementById('ai-key-status');
  const aiKeyStatusText = document.getElementById('ai-key-status-text');
  const aiContextStats = document.getElementById('ai-context-stats');
  const aiConfigBtn = document.getElementById('ai-config-btn');
  const aiConfigCard = document.getElementById('ai-config-card');
  const aiApiKeyInput = document.getElementById('ai-api-key-input');
  const aiSaveKeyBtn = document.getElementById('ai-save-key-btn');
  const aiModelSelect = document.getElementById('ai-model-select');
  const aiClearChatBtn = document.getElementById('ai-clear-chat-btn');
  const aiMessagesContainer = document.getElementById('ai-messages-container');
  const aiUserInput = document.getElementById('ai-user-input');
  const aiIncludeContext = document.getElementById('ai-include-context');
  const aiSendBtn = document.getElementById('ai-send-btn');

  const colListContainer = document.getElementById('col-list-container');
  const colActiveName = document.getElementById('col-active-name');
  const colDocCount = document.getElementById('col-doc-count');
  const colDocsContainer = document.getElementById('col-docs-container');
  const subsTbody = document.getElementById('subs-tbody');
  const subsEmpty = document.getElementById('subs-empty');

  // Method Runner Elements
  const invMethodName = document.getElementById('inv-method-name');
  const invParamsJson = document.getElementById('inv-params-json');
  const invFormatBtn = document.getElementById('inv-format-btn');
  const invSubmitBtn = document.getElementById('inv-submit-btn');
  const invResponseStatus = document.getElementById('inv-response-status');
  const invResponseLatency = document.getElementById('inv-response-latency');
  const invCopyBtn = document.getElementById('inv-copy-btn');
  const invResponseContainer = document.getElementById('inv-response-container');
  const invHistoryList = document.getElementById('inv-history-list');
  const capturedMethodsList = document.getElementById('captured-methods-list');

  // Initialize Port Connection safely
  function connectPort() {
    if (port) return;
    try {
      port = chrome.runtime.connect({ name: 'ddp-monitor-port' });

      port.onDisconnect.addListener(() => {
        port = null;
      });

      port.onMessage.addListener((msg) => {
        if (msg.type === 'DDP_TAB_DATA' && msg.tabId === tabId) {
          frames = msg.frames || [];
          stats = msg.stats || stats;
          isPaused = msg.isPaused || false;
          socketUrl = msg.socketUrl || socketUrl;
          subscriptions = msg.subscriptions || [];
          collections = msg.collections || {};
          updatePauseUI();
          renderAll();
        } else if (msg.type === 'DDP_NEW_FRAME' && msg.tabId === tabId) {
          frames.push(msg.frame);
          if (frames.length > 5000) frames.shift();
          stats = msg.stats;
          subscriptions = msg.subscriptions;
          if (msg.collections) {
            collections = msg.collections;
          }

          renderStats();
          updateMethodDatalist();
          if (activeView === 'stream') renderStreamTable();
          if (activeView === 'subscriptions') renderSubscriptionsView();
          if (activeView === 'collections') renderCollectionsView();
        } else if (msg.type === 'DDP_TAB_CLEARED' && msg.tabId === tabId) {
          frames = [];
          subscriptions = [];
          collections = {};
          stats = { totalFrames: 0, outCount: 0, inCount: 0, bytes: 0 };
          selectedFrameId = null;
          selectedCollection = null;
          renderAll();
        } else if (msg.type === 'DDP_PAUSE_STATE' && msg.tabId === tabId) {
          isPaused = msg.isPaused;
          updatePauseUI();
        } else if (msg.type === 'DDP_INVOKE_RESPONSE' && msg.tabId === tabId) {
          handleInvokeResponse(msg.payload);
        }
      });

      try {
        port.postMessage({ action: 'GET_TAB_DATA', tabId });
      } catch (e) {
        port = null;
      }
    } catch (err) {
      port = null;
    }
  }

  // Safe wrapper for sending messages over extension port
  function safePostMessage(msgData) {
    if (!port) {
      connectPort();
    }
    if (!port) return;

    try {
      port.postMessage(msgData);
    } catch (err) {
      console.warn('[DDP Monitor] Port message suppressed:', err);
      port = null;
    }
  }

  connectPort();

  // Tab Navigation Handler
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      activeView = targetBtn.getAttribute('data-view');

      viewStream.style.display = activeView === 'stream' ? 'flex' : 'none';
      streamFilterBar.style.display = activeView === 'stream' ? 'flex' : 'none';
      viewInvoker.style.display = activeView === 'invoker' ? 'flex' : 'none';
      viewCollections.style.display = activeView === 'collections' ? 'flex' : 'none';
      viewSubscriptions.style.display = activeView === 'subscriptions' ? 'block' : 'none';
      if (viewAiChat) viewAiChat.style.display = activeView === 'ai-chat' ? 'flex' : 'none';

      renderAll();
    });
  });

  // Filter Pills Handler
  document.querySelectorAll('.pill-btn').forEach((btn) => {
    if (btn.classList.contains('template-btn')) return;
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-pills .pill-btn').forEach((b) => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      activeFilter = targetBtn.getAttribute('data-filter');
      renderStreamTable();
    });
  });

  // Search Input Handler
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderStreamTable();
  });

  // Action Buttons
  pauseBtn.addEventListener('click', () => {
    safePostMessage({ action: 'TOGGLE_PAUSE', tabId });
  });

  clearBtn.addEventListener('click', () => {
    safePostMessage({ action: 'CLEAR_TAB_DATA', tabId });
  });

  exportBtn.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(frames, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ddp-traffic-tab-${tabId}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  copyJsonBtn.addEventListener('click', () => {
    const selectedFrame = frames.find((f) => f.id === selectedFrameId);
    if (selectedFrame) {
      navigator.clipboard.writeText(JSON.stringify(selectedFrame.ddp, null, 2));
      copyJsonBtn.textContent = '✅ Copied!';
      setTimeout(() => {
        copyJsonBtn.textContent = '📋 Copy JSON';
      }, 2000);
    }
  });

  // Method Runner Interactivity
  const invDetectBtn = document.getElementById('inv-detect-btn');
  if (invDetectBtn) {
    invDetectBtn.addEventListener('click', () => {
      let detectedContainerId = null;

      for (const sub of subscriptions) {
        if (Array.isArray(sub.params)) {
          for (const p of sub.params) {
            if (typeof p === 'string' && p !== '/my/bookings' && p.length >= 4) {
              detectedContainerId = p;
              break;
            } else if (typeof p === 'object' && p && (p.containerId || p.id)) {
              detectedContainerId = p.containerId || p.id;
              break;
            }
          }
        }
        if (detectedContainerId) break;
      }

      if (detectedContainerId) {
        invParamsJson.value = JSON.stringify(["/my/bookings", detectedContainerId], null, 2);
        alert(`Auto-detected Container ID: "${detectedContainerId}" from active subscription parameters! Updated parameters.`);
      } else {
        alert('Could not auto-detect container ID from subscriptions yet.\n\nTo fix "missing_container_id", enter the Container ID as the 2nd parameter in the JSON array:\n["/my/bookings", "YOUR_CONTAINER_ID"]');
      }
    });
  }
  invFormatBtn.addEventListener('click', () => {
    try {
      const raw = invParamsJson.value.trim() || '[]';
      const parsed = JSON.parse(raw);
      invParamsJson.value = JSON.stringify(parsed, null, 2);
    } catch (e) {
      alert('Invalid JSON in Parameters field: ' + e.message);
    }
  });

  document.querySelectorAll('.template-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tmpl = e.currentTarget.getAttribute('data-tmpl');
      invParamsJson.value = tmpl;
    });
  });

  invSubmitBtn.addEventListener('click', () => {
    const method = invMethodName.value.trim();
    if (!method) {
      alert('Please enter a method name.');
      return;
    }

    let params = [];
    const paramsRaw = invParamsJson.value.trim();
    if (paramsRaw) {
      try {
        const parsed = JSON.parse(paramsRaw);
        if (!Array.isArray(parsed)) {
          alert('Method parameters must be a valid JSON Array e.g. ["/my/bookings"]');
          return;
        }
        params = parsed;
      } catch (err) {
        alert('Invalid JSON parameters format: ' + err.message);
        return;
      }
    }

    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    activeInvocationReqId = reqId;

    const invocationRecord = {
      reqId,
      method,
      params,
      status: 'pending',
      result: null,
      error: null,
      latencyMs: 0,
      timestamp: Date.now()
    };

    invocationHistory.unshift(invocationRecord);
    renderInvokerResult(invocationRecord);
    renderInvokerHistory();

    safePostMessage({
      action: 'INVOKE_METHOD',
      tabId,
      reqId,
      method,
      params
    });
  });

  invCopyBtn.addEventListener('click', () => {
    const record = invocationHistory.find((h) => h.reqId === activeInvocationReqId);
    if (record) {
      const payloadToCopy = record.error ? record.error : record.result;
      navigator.clipboard.writeText(JSON.stringify(payloadToCopy, null, 2));
      invCopyBtn.textContent = '✅ Copied!';
      setTimeout(() => {
        invCopyBtn.textContent = '📋 Copy Response';
      }, 2000);
    }
  });

  function handleInvokeResponse(payload) {
    const { reqId, error, result, latencyMs } = payload;
    const record = invocationHistory.find((h) => h.reqId === reqId);
    if (record) {
      record.status = error ? 'error' : 'success';
      record.error = error;
      record.result = result;
      record.latencyMs = latencyMs;

      if (activeInvocationReqId === reqId || !activeInvocationReqId) {
        activeInvocationReqId = reqId;
        renderInvokerResult(record);
      }
      renderInvokerHistory();
    }
  }

  function renderInvokerResult(record) {
    if (!record) {
      invResponseStatus.style.display = 'none';
      invResponseLatency.textContent = '';
      invResponseContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚀</div>
          <p>No response yet.</p>
        </div>
      `;
      return;
    }

    invResponseStatus.style.display = 'inline-flex';
    if (record.status === 'pending') {
      invResponseStatus.className = 'status-badge';
      invResponseStatus.style.background = 'rgba(245, 158, 11, 0.2)';
      invResponseStatus.style.color = 'var(--accent-amber)';
      invResponseStatus.textContent = 'Executing...';
    } else if (record.status === 'success') {
      invResponseStatus.className = 'status-badge';
      invResponseStatus.style.background = 'rgba(34, 197, 94, 0.2)';
      invResponseStatus.style.color = 'var(--accent-green)';
      invResponseStatus.textContent = 'Success (200)';
    } else {
      invResponseStatus.className = 'status-badge';
      invResponseStatus.style.background = 'rgba(239, 68, 68, 0.2)';
      invResponseStatus.style.color = 'var(--accent-red)';
      invResponseStatus.textContent = 'Error';
    }

    invResponseLatency.textContent = record.latencyMs ? `${record.latencyMs} ms` : '';

    const payloadObj = record.error ? { error: record.error } : (record.result !== null ? record.result : { status: 'No return value' });
    const formattedHtml = syntaxHighlightJson(payloadObj);

    invResponseContainer.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px;">Method: <span style="color: var(--accent-blue);">${escapeHtml(record.method)}</span></div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 12px;">Parameters: ${escapeHtml(JSON.stringify(record.params))}</div>
      <pre class="json-viewer">${formattedHtml}</pre>
    `;
  }

  function renderInvokerHistory() {
    if (invocationHistory.length === 0) {
      invHistoryList.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">No method invocations yet.</div>';
      return;
    }

    invHistoryList.innerHTML = invocationHistory.map((item) => {
      const isSelected = item.reqId === activeInvocationReqId;
      const statusIcon = item.status === 'pending' ? '🟡' : (item.status === 'success' ? '🟢' : '🔴');
      return `
        <div class="history-pill ${isSelected ? 'active' : ''}" data-req="${item.reqId}">
          <span>${statusIcon} <strong>${escapeHtml(item.method)}</strong> (${escapeHtml(JSON.stringify(item.params))})</span>
          <span style="color: var(--text-muted); font-size: 10px;">${item.latencyMs ? item.latencyMs + 'ms' : 'pending'}</span>
        </div>
      `;
    }).join('');

    invHistoryList.querySelectorAll('.history-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const reqId = e.currentTarget.getAttribute('data-req');
        activeInvocationReqId = reqId;
        const record = invocationHistory.find((h) => h.reqId === reqId);
        if (record) {
          invMethodName.value = record.method;
          invParamsJson.value = JSON.stringify(record.params, null, 2);
          renderInvokerResult(record);
          renderInvokerHistory();
        }
      });
    });
  }

  function updateMethodDatalist() {
    const methodNames = new Set();
    frames.forEach((f) => {
      if (f.ddp && f.ddp.msg === 'method' && f.ddp.method) {
        methodNames.add(f.ddp.method);
      }
    });

    capturedMethodsList.innerHTML = Array.from(methodNames).map((m) => `<option value="${escapeHtml(m)}">`).join('');
  }

  function updatePauseUI() {
    if (isPaused) {
      pauseBtn.classList.add('paused');
      pauseIcon.textContent = '▶️';
      pauseLabel.textContent = 'Resume';
    } else {
      pauseBtn.classList.remove('paused');
      pauseIcon.textContent = '⏸️';
      pauseLabel.textContent = 'Pause';
    }
  }

  function renderAll() {
    renderStats();
    updateMethodDatalist();
    if (activeView === 'stream') renderStreamTable();
    if (activeView === 'collections') renderCollectionsView();
    if (activeView === 'subscriptions') renderSubscriptionsView();
    if (activeView === 'invoker') renderInvokerHistory();
    renderInspector();
  }

  function renderStats() {
    statTotal.textContent = stats.totalFrames || 0;
    statOut.textContent = stats.outCount || 0;
    statIn.textContent = stats.inCount || 0;
    statBytes.textContent = ((stats.bytes || 0) / 1024).toFixed(1) + ' KB';
    statUrl.textContent = socketUrl || 'Waiting for Meteor socket connection...';

    const framesWithLatency = frames.filter((f) => typeof f.latencyMs === 'number');
    if (framesWithLatency.length > 0) {
      const avg = framesWithLatency.reduce((acc, curr) => acc + curr.latencyMs, 0) / framesWithLatency.length;
      statLatency.textContent = avg.toFixed(0) + ' ms';
    } else {
      statLatency.textContent = '-- ms';
    }

    subCountBadge.textContent = subscriptions.length;
    colCountBadge.textContent = Object.keys(collections).length;

    if (aiContextStats) {
      const subCount = subscriptions ? subscriptions.length : 0;
      const colCount = collections ? Object.keys(collections).length : 0;
      const methodSet = new Set();
      (frames || []).forEach((f) => {
        if (f.ddp && f.ddp.msg === 'method' && f.ddp.method) {
          methodSet.add(f.ddp.method);
        }
      });
      aiContextStats.textContent = `${subCount} Subs, ${colCount} Cols, ${methodSet.size} Methods`;
    }
  }

  function matchesFilter(frame) {
    const ddp = frame.ddp || {};
    const msg = ddp.msg || '';

    if (activeFilter === 'method') {
      if (!['method', 'result', 'updated'].includes(msg)) return false;
    } else if (activeFilter === 'sub') {
      if (!['sub', 'unsub', 'nosub', 'ready'].includes(msg)) return false;
    } else if (activeFilter === 'collection') {
      if (!['added', 'changed', 'removed', 'addedBefore', 'movedBefore'].includes(msg)) return false;
    } else if (activeFilter === 'ping') {
      if (!['ping', 'pong'].includes(msg)) return false;
    }

    if (searchQuery) {
      const textContent = (JSON.stringify(ddp) + ' ' + (frame.socketUrl || '')).toLowerCase();
      if (!textContent.includes(searchQuery)) return false;
    }

    return true;
  }

  function renderStreamTable() {
    const filteredFrames = frames.filter(matchesFilter);

    if (filteredFrames.length === 0) {
      logTbody.innerHTML = '';
      streamEmpty.style.display = 'flex';
      return;
    }

    streamEmpty.style.display = 'none';

    const rowsHtml = filteredFrames.map((frame) => {
      const isSelected = frame.id === selectedFrameId;
      const timeStr = new Date(frame.timestamp).toLocaleTimeString();
      const dirHtml = frame.direction === 'out'
        ? '<span class="dir-badge dir-out">⬆️ OUT</span>'
        : '<span class="dir-badge dir-in">⬇️ IN</span>';

      const msgType = frame.msgType || 'unknown';
      const badgeClass = getBadgeClasses()[msgType] || 'msg-default';

      const summary = getFrameSummary(frame.ddp);
      const latencyHtml = typeof frame.latencyMs === 'number'
        ? `<span class="latency-tag">${frame.latencyMs} ms</span>`
        : '-';

      const sizeStr = frame.bytes ? frame.bytes + ' B' : '-';

      return `
        <tr data-id="${frame.id}" class="${isSelected ? 'selected' : ''}">
          <td style="color: var(--text-muted);">${timeStr}</td>
          <td>${dirHtml}</td>
          <td><span class="msg-badge ${badgeClass}">${msgType}</span></td>
          <td class="summary-cell" title="${escapeHtml(summary)}">${escapeHtml(summary)}</td>
          <td>${latencyHtml}</td>
          <td style="color: var(--text-muted);">${sizeStr}</td>
        </tr>
      `;
    }).join('');

    logTbody.innerHTML = rowsHtml;

    logTbody.querySelectorAll('tr').forEach((row) => {
      row.addEventListener('click', (e) => {
        const frameId = e.currentTarget.getAttribute('data-id');
        selectedFrameId = frameId;
        logTbody.querySelectorAll('tr').forEach((r) => r.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        renderInspector();
      });
    });
  }

  function getBadgeClasses() {
    return {
      method: 'msg-method',
      result: 'msg-result',
      sub: 'msg-sub',
      ready: 'msg-ready',
      added: 'msg-added',
      changed: 'msg-changed',
      removed: 'msg-removed',
      ping: 'msg-ping',
      pong: 'msg-pong'
    };
  }

  function getFrameSummary(ddp) {
    if (!ddp) return '';
    const msg = ddp.msg;

    switch (msg) {
      case 'method':
        return `Method: ${ddp.method || ''} (id: ${ddp.id || ''})`;
      case 'result':
        return `Result for id: ${ddp.id || ''} ${ddp.error ? '(Error: ' + ddp.error.reason + ')' : ''}`;
      case 'sub':
        return `Sub: ${ddp.name || ''} (id: ${ddp.id || ''})`;
      case 'ready':
        return `Ready subs: [${(ddp.subs || []).join(', ')}]`;
      case 'added':
        return `[${ddp.collection || 'col'}] Added doc id: ${ddp.id || ''}`;
      case 'changed':
        return `[${ddp.collection || 'col'}] Changed doc id: ${ddp.id || ''}`;
      case 'removed':
        return `[${ddp.collection || 'col'}] Removed doc id: ${ddp.id || ''}`;
      case 'connect':
        return `Connect (version: ${ddp.version || '1'})`;
      case 'connected':
        return `Connected (session: ${ddp.session || ''})`;
      case 'ping':
      case 'pong':
        return `Keepalive (${msg})`;
      default:
        return JSON.stringify(ddp);
    }
  }

  function renderInspector() {
    const selectedFrame = frames.find((f) => f.id === selectedFrameId);
    if (!selectedFrame) {
      inspectMsgBadge.textContent = '--';
      inspectMsgBadge.className = 'msg-badge msg-default';
      inspectContent.innerHTML = `
        <div style="color: var(--text-muted); text-align: center; margin-top: 40px;">
          Select a DDP message row on the left to inspect detailed payload structure.
        </div>
      `;
      return;
    }

    const ddp = selectedFrame.ddp || {};
    const msgType = selectedFrame.msgType || 'unknown';
    inspectMsgBadge.textContent = msgType;
    inspectMsgBadge.className = `msg-badge ${getBadgeClasses()[msgType] || 'msg-default'}`;

    const formattedJson = syntaxHighlightJson(ddp);

    inspectContent.innerHTML = `
      <div style="margin-bottom: 12px; font-size: 11px; color: var(--text-muted);">
        <div><strong>Direction:</strong> ${selectedFrame.direction === 'out' ? 'Outgoing ⬆️' : 'Incoming ⬇️'}</div>
        <div><strong>Timestamp:</strong> ${new Date(selectedFrame.timestamp).toLocaleString()}</div>
        ${selectedFrame.latencyMs ? `<div style="color: var(--accent-amber);"><strong>RTT Latency:</strong> ${selectedFrame.latencyMs} ms</div>` : ''}
        <div><strong>Raw Size:</strong> ${selectedFrame.bytes} bytes</div>
      </div>
      <div style="font-weight: bold; margin-bottom: 6px;">Parsed DDP Payload:</div>
      <pre class="json-viewer">${formattedJson}</pre>
    `;
  }

  function renderCollectionsView() {
    const colNames = Object.keys(collections);
    if (colNames.length === 0) {
      colListContainer.innerHTML = '<div style="padding: 16px; color: var(--text-muted); font-size: 11px;">No active collections synced yet.</div>';
      colDocsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <p>No synced collections found in MiniMongo cache.</p>
        </div>
      `;
      return;
    }

    if (!selectedCollection || !collections[selectedCollection]) {
      selectedCollection = colNames[0];
    }

    colListContainer.innerHTML = colNames.map((name) => {
      const docCount = Object.keys(collections[name] || {}).length;
      const isActive = name === selectedCollection;
      return `
        <div class="col-item ${isActive ? 'active' : ''}" data-col="${escapeHtml(name)}">
          <span style="font-weight: 600;">${escapeHtml(name)}</span>
          <span class="pill-btn active" style="font-size: 10px; padding: 2px 6px;">${docCount}</span>
        </div>
      `;
    }).join('');

    colListContainer.querySelectorAll('.col-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        selectedCollection = e.currentTarget.getAttribute('data-col');
        renderCollectionsView();
      });
    });

    colActiveName.textContent = selectedCollection;
    const docs = collections[selectedCollection] || {};
    const docIds = Object.keys(docs);
    colDocCount.textContent = `${docIds.length} document${docIds.length === 1 ? '' : 's'}`;

    if (docIds.length === 0) {
      colDocsContainer.innerHTML = '<div style="color: var(--text-muted);">Collection is currently empty.</div>';
      return;
    }

    colDocsContainer.innerHTML = docIds.map((docId) => {
      const docObj = docs[docId] || {};
      const fields = Object.entries(docObj);

      const fieldsHtml = fields.map(([key, val]) => {
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        const valType = Array.isArray(val) ? 'array' : typeof val;
        return `
          <div class="field-item-card">
            <span class="field-key-name">🔹 ${escapeHtml(key)}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="field-type-tag">${valType}</span>
              <span class="field-val-text">${escapeHtml(valStr)}</span>
            </div>
          </div>
        `;
      }).join('');

      return `
        <details class="json-details" open style="margin-bottom: 12px;">
          <summary class="json-summary">
            <span>📦 Document ID: <strong style="color: var(--accent-purple); font-family: var(--font-mono);">${escapeHtml(docId)}</strong></span>
            <span class="collapse-hint">${fields.length} fields (Click to shrink/expand)</span>
          </summary>
          <div style="padding: 10px;">
            <div style="font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase;">Fields List (One by One)</div>
            <div class="field-grid-container" style="margin: 0 0 10px 0;">
              ${fieldsHtml || '<div style="color: var(--text-muted); padding: 4px;">Empty document object</div>'}
            </div>
            <details style="font-size: 11px; color: var(--text-muted);">
              <summary style="cursor: pointer; margin-bottom: 4px;">View raw JSON payload</summary>
              <pre class="json-viewer" style="font-size: 11px; margin-top: 4px;">${syntaxHighlightJson(docObj)}</pre>
            </details>
          </div>
        </details>
      `;
    }).join('');
  }

  function renderSubscriptionsView() {
    if (subscriptions.length === 0) {
      subsTbody.innerHTML = '';
      subsEmpty.style.display = 'flex';
      return;
    }

    subsEmpty.style.display = 'none';

    subsTbody.innerHTML = subscriptions.map((sub) => {
      const statusBadge = sub.status === 'ready'
        ? '<span class="status-badge" style="background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan);">Ready</span>'
        : '<span class="status-badge" style="background: rgba(245, 158, 11, 0.2); color: var(--accent-amber);">Pending</span>';

      const startTimeStr = new Date(sub.startTime).toLocaleTimeString();
      const durationStr = sub.readyTime
        ? `${sub.readyTime - sub.startTime} ms`
        : 'In progress';

      const paramsStr = sub.params && sub.params.length > 0 ? JSON.stringify(sub.params) : 'None';

      return `
        <tr>
          <td style="font-weight: bold; color: var(--accent-purple);">${escapeHtml(sub.name)}</td>
          <td style="color: var(--text-muted);">${escapeHtml(sub.id)}</td>
          <td>${statusBadge}</td>
          <td>${escapeHtml(paramsStr)}</td>
          <td style="color: var(--text-muted);">${startTimeStr}</td>
          <td>${durationStr}</td>
        </tr>
      `;
    }).join('');
  }

  function syntaxHighlightJson(jsonObj) {
    if (typeof jsonObj !== 'string') {
      jsonObj = JSON.stringify(jsonObj, null, 2);
    }
    jsonObj = escapeHtml(jsonObj);
    return jsonObj.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- AI Data Flow Assistant Logic ---

  function loadAiSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (res) => {
        if (res.geminiApiKey) {
          apiKey = res.geminiApiKey;
          if (aiApiKeyInput) aiApiKeyInput.value = apiKey;
        }
        if (res.geminiModel) {
          aiModel = res.geminiModel.trim().replace(/^models\//, '');
          if (aiModelSelect) aiModelSelect.value = aiModel;
        }
        updateAiKeyStatus();
        if (apiKey) fetchAvailableModels(apiKey);
      });
    } else {
      apiKey = localStorage.getItem('geminiApiKey') || '';
      aiModel = (localStorage.getItem('geminiModel') || 'gemini-1.5-flash').trim().replace(/^models\//, '');
      if (aiApiKeyInput) aiApiKeyInput.value = apiKey;
      if (aiModelSelect) aiModelSelect.value = aiModel;
      updateAiKeyStatus();
      if (apiKey) fetchAvailableModels(apiKey);
    }
  }

  function saveAiSettings(newKey, newModel) {
    apiKey = newKey;
    aiModel = (newModel || 'gemini-1.5-flash').trim().replace(/^models\//, '');

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiApiKey: apiKey, geminiModel: aiModel }, () => {
        updateAiKeyStatus();
      });
    } else {
      localStorage.setItem('geminiApiKey', apiKey);
      localStorage.setItem('geminiModel', aiModel);
      updateAiKeyStatus();
    }
  }

  function updateAiKeyStatus() {
    if (!aiKeyStatus || !aiKeyStatusText) return;
    if (apiKey && apiKey.trim().length > 0) {
      aiKeyStatus.style.background = 'rgba(34, 197, 94, 0.2)';
      aiKeyStatus.style.color = 'var(--accent-green)';
      aiKeyStatusText.textContent = 'API Key Configured ✅';
      if (aiConfigCard) aiConfigCard.style.display = 'none';
    } else {
      aiKeyStatus.style.background = 'rgba(245, 158, 11, 0.2)';
      aiKeyStatus.style.color = 'var(--accent-amber)';
      aiKeyStatusText.textContent = 'API Key Required';
    }
  }

  if (aiConfigBtn) {
    aiConfigBtn.addEventListener('click', () => {
      if (aiConfigCard) {
        const isHidden = aiConfigCard.style.display === 'none';
        aiConfigCard.style.display = isHidden ? 'block' : 'none';
      }
    });
  }

  if (aiSaveKeyBtn) {
    aiSaveKeyBtn.addEventListener('click', async () => {
      const val = aiApiKeyInput ? aiApiKeyInput.value.trim() : '';
      const mod = aiModelSelect ? aiModelSelect.value : 'gemini-1.5-flash';
      if (!val) {
        alert('Please enter a valid Gemini API Key.');
        return;
      }
      saveAiSettings(val, mod);
      const models = await fetchAvailableModels(val);
      if (models && models.length > 0) {
        alert(`API Key saved! Available models loaded (${models.length} models found).`);
      } else {
        alert('API Key saved successfully!');
      }
    });
  }

  async function fetchAvailableModels(key) {
    if (!key) return null;
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models`, {
        headers: { 'x-goog-api-key': key }
      });
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        const validModels = data.models
          .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, ''));

        if (validModels.length > 0 && aiModelSelect) {
          aiModelSelect.innerHTML = validModels.map((m) =>
            `<option value="${m}" ${m === aiModel ? 'selected' : ''}>${m}</option>`
          ).join('');

          if (!validModels.includes(aiModel)) {
            aiModel = validModels[0];
            saveAiSettings(key, aiModel);
          } else {
            aiModelSelect.value = aiModel;
          }
        }
        return validModels;
      }
    } catch (err) {
      console.warn('[AI Assistant] ListModels failed:', err);
    }
    return null;
  }

  if (aiModelSelect) {
    aiModelSelect.addEventListener('change', () => {
      if (apiKey) {
        saveAiSettings(apiKey, aiModelSelect.value);
      }
    });
  }

  if (aiClearChatBtn) {
    aiClearChatBtn.addEventListener('click', () => {
      chatHistory = [];
      if (aiMessagesContainer) {
        aiMessagesContainer.innerHTML = `
          <div class="ai-welcome-card" id="ai-welcome-card">
            <div class="ai-welcome-icon">🤖</div>
            <h3 style="margin-bottom: 6px; font-size: 15px; color: var(--text-main);">Welcome to AI Data Flow Assistant</h3>
            <p style="color: var(--text-muted); font-size: 12px; max-width: 540px; line-height: 1.5; margin-bottom: 14px;">
              Ask questions about your Meteor website's real-time WebSocket traffic, client subscriptions, RPC method endpoints, and MiniMongo cached collections.
            </p>
          </div>
        `;
      }
    });
  }

  // Quick Chips Click Event
  document.querySelectorAll('.ai-chip-btn').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      const prompt = e.currentTarget.getAttribute('data-prompt');
      if (prompt && aiUserInput) {
        aiUserInput.value = prompt;
        sendAiMessage();
      }
    });
  });

  if (aiSendBtn) {
    aiSendBtn.addEventListener('click', () => {
      sendAiMessage();
    });
  }

  if (aiUserInput) {
    aiUserInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
  }

  function getLiveDataFlowContext() {
    const activeSubs = subscriptions.map((s) => ({
      name: s.name,
      id: s.id,
      params: s.params,
      status: s.status
    }));

    const colSummary = {};
    for (const [colName, docs] of Object.entries(collections)) {
      const docList = Object.values(docs || {});
      const sampleDoc = docList[0] || {};
      colSummary[colName] = {
        documentCount: docList.length,
        sampleFields: Object.keys(sampleDoc),
        sampleDocument: docList.length > 0 ? sampleDoc : null
      };
    }

    const methodMap = new Map();
    frames.forEach((f) => {
      if (f.ddp && f.ddp.msg === 'method' && f.ddp.method) {
        const mName = f.ddp.method;
        if (!methodMap.has(mName)) {
          methodMap.set(mName, {
            name: mName,
            paramsSample: f.ddp.params || [],
            latencyMs: f.latencyMs || null,
            count: 1
          });
        } else {
          const item = methodMap.get(mName);
          item.count++;
          if (f.latencyMs) item.latencyMs = f.latencyMs;
        }
      }
    });

    const capturedMethods = Array.from(methodMap.values());

    const recentFrames = frames.slice(-15).map((f) => ({
      direction: f.direction,
      msgType: f.msgType,
      summary: getFrameSummary(f.ddp)
    }));

    return {
      socketEndpoint: socketUrl || 'Unknown',
      activeSubscriptions: activeSubs,
      miniMongoCollections: colSummary,
      capturedRpcMethods: capturedMethods,
      recentDdpTrafficSummary: recentFrames
    };
  }

  async function sendAiMessage() {
    if (isGenerating) return;
    const text = aiUserInput ? aiUserInput.value.trim() : '';
    if (!text) return;

    if (!apiKey) {
      if (aiConfigCard) aiConfigCard.style.display = 'block';
      alert('Please enter and save your Gemini API Key in the settings drawer to use the AI Assistant.');
      return;
    }

    if (aiUserInput) aiUserInput.value = '';

    const welcomeCard = document.getElementById('ai-welcome-card');
    if (welcomeCard) welcomeCard.remove();

    appendChatMessage('user', text);

    isGenerating = true;
    if (aiSendBtn) {
      aiSendBtn.disabled = true;
      aiSendBtn.innerHTML = 'Thinking... ⏳';
    }

    const loadingBubble = appendChatMessage('ai', '⏳ *Analyzing live data flow context...*');

    try {
      let systemPromptText = `You are an expert Meteor DDP and Web Application Data Flow Assistant built into a Chrome DevTools extension.\n` +
        `Your primary job is to help developers inspect, debug, and query real-time website data flows, active Meteor subscriptions, RPC methods, and MiniMongo client collections.\n` +
        `Answer questions accurately and concisely. When asked if a subscription or method lists specific data (e.g. countries, profile fields), check the provided live context data flow snapshot carefully and point out the exact method name or subscription name!\n`;

      if (aiIncludeContext && aiIncludeContext.checked) {
        const liveContext = getLiveDataFlowContext();
        systemPromptText += `\n--- LIVE DATA FLOW CONTEXT SNAPSHOT ---\n` +
          JSON.stringify(liveContext, null, 2) +
          `\n--- END LIVE DATA FLOW CONTEXT SNAPSHOT ---\n`;
      }

      const contentsPayload = [
        {
          role: 'user',
          parts: [{ text: systemPromptText + `\n\nUser Question: ${text}` }]
        }
      ];

      aiModel = (aiModel || 'gemini-1.5-flash').trim().replace(/^models\//, '');
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent`;

      let response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ contents: contentsPayload })
      });

      let data = await response.json();

      // Auto-fallback if the selected model is deprecated/not found for the API key
      if (data.error && (data.error.code === 404 || (data.error.message && (data.error.message.includes('not found') || data.error.message.includes('not supported'))))) {
        const fetchedModels = await fetchAvailableModels(apiKey);
        const fallbackCandidates = (fetchedModels && fetchedModels.length > 0)
          ? fetchedModels
          : ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];

        for (const candidateModel of fallbackCandidates) {
          const cleanCandidate = candidateModel.trim().replace(/^models\//, '');
          if (cleanCandidate === aiModel) continue;
          const fallbackEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanCandidate}:generateContent`;
          const fbRes = await fetch(fallbackEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey
            },
            body: JSON.stringify({ contents: contentsPayload })
          });
          const fbData = await fbRes.json();
          if (!fbData.error) {
            data = fbData;
            aiModel = cleanCandidate;
            if (aiModelSelect) aiModelSelect.value = cleanCandidate;
            saveAiSettings(apiKey, cleanCandidate);
            break;
          }
        }
      }

      if (data.error) {
        throw new Error(data.error.message || 'Gemini API Error');
      }

      const candidate = data.candidates && data.candidates[0];
      const responseText = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0]
        ? candidate.content.parts[0].text
        : 'No response received from AI model.';

      if (loadingBubble) loadingBubble.remove();

      appendChatMessage('ai', responseText);

      chatHistory.push({ role: 'user', text });
      chatHistory.push({ role: 'model', text: responseText });

    } catch (err) {
      if (loadingBubble) loadingBubble.remove();
      appendChatMessage('ai', `❌ **Error:** ${escapeHtml(err.message)}`);
    } finally {
      isGenerating = false;
      if (aiSendBtn) {
        aiSendBtn.disabled = false;
        aiSendBtn.innerHTML = '<span>Send</span> ⚡';
      }
    }
  }

  function appendChatMessage(role, rawText) {
    if (!aiMessagesContainer) return null;

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${role}`;

    const avatar = document.createElement('div');
    avatar.className = `chat-avatar avatar-${role}`;
    avatar.textContent = role === 'user' ? 'U' : '✨';

    const content = document.createElement('div');
    content.className = 'chat-content';

    if (role === 'user') {
      content.textContent = rawText;
    } else {
      content.innerHTML = formatMarkdown(rawText);

      const capturedNames = new Set(frames.filter((f) => f.ddp && f.ddp.method).map((f) => f.ddp.method));
      const words = rawText.match(/\b([a-zA-Z0-9_\/]{3,40})\b/g) || [];
      const foundMethod = words.find((m) => capturedNames.has(m));
      if (foundMethod) {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'chat-action-btn';
        actionBtn.innerHTML = `🚀 Run method "${escapeHtml(foundMethod)}" in Method Runner`;
        actionBtn.addEventListener('click', () => {
          const invokerTabBtn = document.getElementById('tab-invoker-btn');
          if (invokerTabBtn) invokerTabBtn.click();
          if (invMethodName) invMethodName.value = foundMethod;
        });
        content.appendChild(actionBtn);
      }
    }

    bubble.appendChild(avatar);
    bubble.appendChild(content);

    aiMessagesContainer.appendChild(bubble);
    aiMessagesContainer.scrollTop = aiMessagesContainer.scrollHeight;

    return bubble;
  }

  function formatMarkdown(str) {
    if (!str) return '';
    let html = escapeHtml(str);

    // Shrinkable / Collapsible Code & JSON Blocks
    html = html.replace(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/g, function (match, lang, code) {
      const codeTrimmed = code.trim();
      let highlighted = codeTrimmed;
      if (lang === 'json' || codeTrimmed.startsWith('{') || codeTrimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(codeTrimmed);
          highlighted = syntaxHighlightJson(parsed);
        } catch (e) {
          highlighted = escapeHtml(codeTrimmed);
        }
      }
      return `
        <details class="json-details" open>
          <summary class="json-summary">
            <span>📋 JSON / Data Payload (${lang || 'code'})</span>
            <span class="collapse-hint">(Click to shrink / expand)</span>
          </summary>
          <div style="padding: 10px;">
            <pre class="json-viewer"><code>${highlighted}</code></pre>
          </div>
        </details>
      `;
    });

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^[\s]*[-*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    return `<p>${html}</p>`;
  }

  // Load AI configuration settings on start
  loadAiSettings();

})();
