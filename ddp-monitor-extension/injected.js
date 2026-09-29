(function () {
  if (window.__DDP_MONITOR_INJECTED__) return;
  window.__DDP_MONITOR_INJECTED__ = true;

  const SOURCE_KEY = 'DDP_MONITOR_PAGE';
  const INVOKE_KEY = 'DDP_MONITOR_INVOKE';
  const RESPONSE_KEY = 'DDP_MONITOR_PAGE_RESPONSE';
  const CONTEXT_REQ_KEY = 'DDP_MONITOR_GET_CONTEXT';
  const CONTEXT_RES_KEY = 'DDP_MONITOR_CONTEXT_RESPONSE';

  const activeSockets = new Set();
  const pendingInvocations = new Map(); // msgId -> { reqId, startTime }

  function sendToContentScript(direction, rawData, socketUrl) {
    if (typeof rawData !== 'string') return;

    const parsedItems = parseDdpPayload(rawData);
    if (!parsedItems || parsedItems.length === 0) return;

    for (const ddpItem of parsedItems) {
      if (direction === 'in' && ddpItem.msg === 'result' && ddpItem.id && pendingInvocations.has(ddpItem.id)) {
        const { reqId, startTime } = pendingInvocations.get(ddpItem.id);
        pendingInvocations.delete(ddpItem.id);
        const latencyMs = Date.now() - startTime;

        window.postMessage({
          source: RESPONSE_KEY,
          detail: {
            reqId,
            error: ddpItem.error || null,
            result: ddpItem.result !== undefined ? ddpItem.result : null,
            latencyMs
          }
        }, '*');
      }

      try {
        window.postMessage({
          source: SOURCE_KEY,
          detail: {
            direction,
            timestamp: Date.now(),
            socketUrl: socketUrl || window.location.href,
            raw: rawData,
            ddp: ddpItem
          }
        }, '*');
      } catch (err) {
        // Ignore serialization issues
      }
    }
  }

  function parseDdpPayload(dataStr) {
    if (!dataStr || typeof dataStr !== 'string') return null;
    const str = dataStr.trim();
    if (!str) return null;

    const items = [];

    function tryAdd(obj) {
      if (obj && typeof obj === 'object') {
        if (typeof obj.msg === 'string') {
          items.push(obj);
        } else {
          items.push({ msg: 'json', data: obj });
        }
      }
    }

    if (str.startsWith('{') && str.endsWith('}')) {
      try {
        const parsed = JSON.parse(str);
        tryAdd(parsed);
        return items;
      } catch (e) {}
    }

    let targetJson = str;
    if (targetJson.startsWith('a[')) {
      targetJson = targetJson.substring(1);
    }

    if (targetJson.startsWith('[') && targetJson.endsWith(']')) {
      try {
        const arr = JSON.parse(targetJson);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (typeof item === 'string') {
              try {
                const innerObj = JSON.parse(item);
                tryAdd(innerObj);
              } catch (e) {
                items.push({ msg: 'raw', text: item });
              }
            } else if (typeof item === 'object') {
              tryAdd(item);
            }
          }
          return items;
        }
      } catch (e) {}
    }

    if (str.startsWith('m"')) {
      try {
        const innerStr = JSON.parse(str.substring(1));
        const obj = JSON.parse(innerStr);
        tryAdd(obj);
        return items;
      } catch (e) {}
    }

    if (str === 'h' || str === 'o') {
      return [{ msg: str === 'h' ? 'ping' : 'connect', raw: str }];
    }

    return [{ msg: 'raw', text: str }];
  }

  // Intercept WebSocket & track active instances
  const OriginalWebSocket = window.WebSocket;

  if (OriginalWebSocket) {
    const originalSend = OriginalWebSocket.prototype.send;
    OriginalWebSocket.prototype.send = function (data) {
      try {
        if (typeof data === 'string') {
          const url = this.url || window.location.href;
          sendToContentScript('out', data, url);
        }
      } catch (e) {}
      return originalSend.apply(this, arguments);
    };

    try {
      window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args, newTarget) {
          const ws = Reflect.construct(target, args, newTarget);
          activeSockets.add(ws);

          ws.addEventListener('close', () => activeSockets.delete(ws));
          ws.addEventListener('error', () => activeSockets.delete(ws));

          try {
            ws.addEventListener('message', function (event) {
              try {
                if (typeof event.data === 'string') {
                  sendToContentScript('in', event.data, ws.url || args[0]);
                }
              } catch (e) {}
            });
          } catch (e) {}
          return ws;
        }
      });
    } catch (e) {
      console.warn('[DDP Monitor] Proxy error:', e);
    }
  }

  // Intercept XHR for SockJS
  if (typeof window.XMLHttpRequest !== 'undefined') {
    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url) {
      this.__ddp_xhr_url = url;
      return origXhrOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      try {
        const url = this.__ddp_xhr_url || '';
        if (url.includes('/sockjs/') || url.includes('/ddp')) {
          if (typeof body === 'string') {
            sendToContentScript('out', body, url);
          }
          this.addEventListener('load', function () {
            if (typeof this.responseText === 'string') {
              sendToContentScript('in', this.responseText, url);
            }
          });
        }
      } catch (e) {}
      return origXhrSend.apply(this, arguments);
    };
  }

  // Listen for Context Auto-Detection requests
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data) return;

    if (event.data.source === CONTEXT_REQ_KEY) {
      const pageStorage = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) pageStorage[k] = localStorage.getItem(k);
        }
      } catch (e) {}

      window.postMessage({
        source: CONTEXT_RES_KEY,
        detail: {
          storage: pageStorage,
          url: window.location.href,
          hasMeteor: typeof window.Meteor !== 'undefined'
        }
      }, '*');
      return;
    }

    if (event.data.source !== INVOKE_KEY) return;

    const { reqId, method, params } = event.data.detail || {};
    if (!reqId || !method) return;

    const startTime = Date.now();

    // Strategy 1: Use window.Meteor.call or Meteor.connection if available on page
    if (window.Meteor && (typeof window.Meteor.call === 'function' || (window.Meteor.connection && typeof window.Meteor.connection.call === 'function'))) {
      try {
        const paramArr = Array.isArray(params) ? params : [];
        const callFn = typeof window.Meteor.call === 'function'
          ? window.Meteor.call.bind(window.Meteor)
          : window.Meteor.connection.call.bind(window.Meteor.connection);

        callFn(method, ...paramArr, function (err, res) {
          const latencyMs = Date.now() - startTime;
          window.postMessage({
            source: RESPONSE_KEY,
            detail: {
              reqId,
              error: err ? (err.reason || err.message || err) : null,
              result: res !== undefined ? res : null,
              latencyMs
            }
          }, '*');
        });
        return;
      } catch (e) {
        console.warn('[DDP Monitor] Meteor.call failed, falling back to socket frame:', e);
      }
    }

    // Strategy 2: SockJS & Raw DDP WebSocket Frame Injection
    let sent = false;
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        const msgId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        pendingInvocations.set(msgId, { reqId, startTime });

        const ddpObj = {
          msg: 'method',
          method: method,
          params: Array.isArray(params) ? params : [],
          id: msgId
        };

        const jsonStr = JSON.stringify(ddpObj);
        // Send as SockJS JSON array string format e.g. ["{\"msg\":\"method\",...}"]
        const sockJsFrame = JSON.stringify([jsonStr]);

        ws.send(sockJsFrame);
        sent = true;
        break;
      }
    }

    if (!sent) {
      window.postMessage({
        source: RESPONSE_KEY,
        detail: {
          reqId,
          error: 'No active open DDP WebSocket connection found on page.',
          result: null,
          latencyMs: Date.now() - startTime
        }
      }, '*');
    }
  });

  console.log('[DDP Monitor] Interceptor and Manual Invoker active.');
})();
