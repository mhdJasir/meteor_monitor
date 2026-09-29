// DDP Traffic Monitor - Service Worker (Background)

const tabStores = new Map(); // tabId -> TabDataStore
const devtoolsPorts = new Set(); // Set of active DevTools/Popup connection ports

function getOrCreateTabData(tabId) {
  if (!tabStores.has(tabId)) {
    tabStores.set(tabId, {
      frames: [],
      subscriptions: new Map(), // subId -> sub object
      collections: {}, // collectionName -> { [docId]: fields }
      pendingMethods: new Map(), // methodId -> { name, startTime, params }
      isPaused: false,
      socketUrl: '',
      connectedAt: null,
      stats: {
        totalFrames: 0,
        outCount: 0,
        inCount: 0,
        bytes: 0
      }
    });
  }
  return tabStores.get(tabId);
}

// Process incoming DDP frame from content script
function processFrame(tabId, payload) {
  if (!tabId) return;
  const store = getOrCreateTabData(tabId);
  if (store.isPaused) return;

  const { direction, timestamp, socketUrl, raw, ddp } = payload;
  store.socketUrl = socketUrl || store.socketUrl;

  const frameId = 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const bytes = raw ? raw.length : 0;

  store.stats.totalFrames++;
  store.stats.bytes += bytes;
  if (direction === 'out') store.stats.outCount++;
  if (direction === 'in') store.stats.inCount++;

  let latencyMs = null;
  const msgType = ddp.msg;

  // Track RPC Methods and calculate Latency
  if (direction === 'out' && msgType === 'method' && ddp.id) {
    store.pendingMethods.set(ddp.id, {
      name: ddp.method,
      startTime: timestamp,
      params: ddp.params
    });
  } else if (direction === 'in' && (msgType === 'result' || msgType === 'updated') && ddp.id) {
    const pending = store.pendingMethods.get(ddp.id);
    if (pending) {
      latencyMs = timestamp - pending.startTime;
      if (msgType === 'result') {
        store.pendingMethods.delete(ddp.id);
      }
    }
  }

  // Track Subscriptions
  if (direction === 'out' && msgType === 'sub' && ddp.id) {
    store.subscriptions.set(ddp.id, {
      id: ddp.id,
      name: ddp.name,
      params: ddp.params || [],
      status: 'pending',
      startTime: timestamp,
      readyTime: null,
      docCount: 0
    });
  } else if (direction === 'in' && msgType === 'ready' && Array.isArray(ddp.subs)) {
    for (const subId of ddp.subs) {
      if (store.subscriptions.has(subId)) {
        const sub = store.subscriptions.get(subId);
        sub.status = 'ready';
        sub.readyTime = timestamp;
      }
    }
  } else if ((direction === 'in' && msgType === 'nosub') || (direction === 'out' && msgType === 'unsub')) {
    const subId = ddp.id;
    if (store.subscriptions.has(subId)) {
      store.subscriptions.delete(subId);
    }
  }

  // Track Collections (MiniMongo cache emulator)
  if (direction === 'in') {
    if (msgType === 'added' || msgType === 'addedBefore') {
      const colName = ddp.collection;
      const docId = ddp.id;
      if (colName && docId) {
        if (!store.collections[colName]) store.collections[colName] = {};
        store.collections[colName][docId] = { ...ddp.fields };
      }
    } else if (msgType === 'changed') {
      const colName = ddp.collection;
      const docId = ddp.id;
      if (colName && docId && store.collections[colName] && store.collections[colName][docId]) {
        const existing = store.collections[colName][docId];
        if (ddp.fields) {
          Object.assign(existing, ddp.fields);
        }
        if (Array.isArray(ddp.cleared)) {
          for (const key of ddp.cleared) {
            delete existing[key];
          }
        }
      }
    } else if (msgType === 'removed') {
      const colName = ddp.collection;
      const docId = ddp.id;
      if (colName && docId && store.collections[colName]) {
        delete store.collections[colName][docId];
        if (Object.keys(store.collections[colName]).length === 0) {
          delete store.collections[colName];
        }
      }
    } else if (msgType === 'connected') {
      store.connectedAt = timestamp;
    }
  }

  const frameRecord = {
    id: frameId,
    direction,
    timestamp,
    socketUrl,
    bytes,
    msgType,
    ddp,
    raw,
    latencyMs
  };

  store.frames.push(frameRecord);
  if (store.frames.length > 5000) {
    store.frames.shift();
  }

  // Broadcast frame to active ports for this tab including live collections
  broadcastToDevtools({
    type: 'DDP_NEW_FRAME',
    tabId,
    frame: frameRecord,
    stats: store.stats,
    subscriptions: Array.from(store.subscriptions.values()),
    collections: store.collections,
    collectionsSummary: getCollectionsSummary(store.collections)
  }, tabId);
}

function getCollectionsSummary(collections) {
  const summary = {};
  for (const [name, docs] of Object.entries(collections)) {
    summary[name] = Object.keys(docs).length;
  }
  return summary;
}

// Broadcast message to DevTools and Popup ports matching target tabId
function broadcastToDevtools(msg, targetTabId) {
  for (const port of devtoolsPorts) {
    if (!port.tabId || port.tabId === targetTabId) {
      try {
        port.postMessage(msg);
      } catch (err) {
        devtoolsPorts.delete(port);
      }
    }
  }
}

// Listen for Runtime messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DDP_FRAME') {
    const tabId = (sender.tab && sender.tab.id) ? sender.tab.id : null;
    if (tabId) {
      processFrame(tabId, message.payload);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          processFrame(tabs[0].id, message.payload);
        }
      });
    }
    sendResponse({ status: 'ok' });
  } else if (message.type === 'DDP_INVOKE_RESPONSE') {
    const tabId = (sender.tab && sender.tab.id) ? sender.tab.id : null;
    broadcastToDevtools({
      type: 'DDP_INVOKE_RESPONSE',
      tabId,
      payload: message.payload
    }, tabId);
    sendResponse({ status: 'ok' });
  }
  return true;
});

// Manage DevTools & Popup Port Connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'ddp-monitor-port') {
    devtoolsPorts.add(port);

    port.onMessage.addListener((req) => {
      const tabId = req.tabId;
      if (req.tabId) port.tabId = req.tabId;

      if (req.action === 'GET_TAB_DATA') {
        const store = getOrCreateTabData(tabId);
        port.postMessage({
          type: 'DDP_TAB_DATA',
          tabId,
          socketUrl: store.socketUrl,
          frames: store.frames,
          stats: store.stats,
          isPaused: store.isPaused,
          subscriptions: Array.from(store.subscriptions.values()),
          collections: store.collections,
          collectionsSummary: getCollectionsSummary(store.collections)
        });
      } else if (req.action === 'CLEAR_TAB_DATA') {
        if (tabStores.has(tabId)) {
          const store = tabStores.get(tabId);
          store.frames = [];
          store.stats = { totalFrames: 0, outCount: 0, inCount: 0, bytes: 0 };
          store.subscriptions.clear();
          store.collections = {};
          store.pendingMethods.clear();
        }
        port.postMessage({
          type: 'DDP_TAB_CLEARED',
          tabId
        });
      } else if (req.action === 'TOGGLE_PAUSE') {
        const store = getOrCreateTabData(tabId);
        store.isPaused = !store.isPaused;
        port.postMessage({
          type: 'DDP_PAUSE_STATE',
          tabId,
          isPaused: store.isPaused
        });
      } else if (req.action === 'INVOKE_METHOD') {
        const { reqId, method, params } = req;
        chrome.tabs.sendMessage(tabId, {
          type: 'EXECUTE_DDP_METHOD',
          payload: { reqId, method, params }
        }, (res) => {
          if (chrome.runtime.lastError) {
            port.postMessage({
              type: 'DDP_INVOKE_RESPONSE',
              tabId,
              payload: {
                reqId,
                error: 'Failed to communicate with tab content script. Refresh the target web page.',
                result: null,
                latencyMs: 0
              }
            });
          }
        });
      }
    });

    port.onDisconnect.addListener(() => {
      devtoolsPorts.delete(port);
    });
  }
});

// Clean up tab store when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStores.delete(tabId);
});

console.log('[DDP Monitor Service Worker] Initialized and listening.');
