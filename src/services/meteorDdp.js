import CryptoJS from 'crypto-js';

export class MeteorDdpClient {
  constructor() {
    this.socket = null;
    this.url = localStorage.getItem('meteor_server_url') || 'ws://localhost:3000/websocket';
    this.status = 'disconnected'; // disconnected, connecting, connected
    this.sessionId = null;
    this.nextId = 1;
    this.pendingCallbacks = new Map(); // id -> { resolve, reject, timestamp, method }
    this.subscriptions = new Map(); // id -> { name, params }
    this.subscriptionResponses = new Map(); // subId -> Array of response frames
    this.collections = {}; // collectionName -> { id -> document }
    this.eventListeners = new Set();
    this.ddpLogs = [];

    // Auth State
    this.token = localStorage.getItem('meteor_login_token') || null;
    this.userId = localStorage.getItem('meteor_user_id') || null;
    this.userEmailOrName = localStorage.getItem('meteor_user_name') || null;
    this.isAuthenticated = false;

    // Heartbeat & Reconnect timers
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.autoReconnect = true;
  }

  // Subscribe to state changes in UI
  subscribeEvents(listener) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  addSubscriptionResponse(subId, msg) {
    const sId = String(subId);
    if (!this.subscriptionResponses.has(sId)) {
      this.subscriptionResponses.set(sId, []);
    }
    const logList = this.subscriptionResponses.get(sId);
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString(),
      data: msg
    };
    this.subscriptionResponses.set(sId, [entry, ...logList.slice(0, 199)]);
  }

  notifyStateChange() {
    const subResponsesObj = {};
    this.subscriptionResponses.forEach((val, key) => {
      subResponsesObj[key] = val;
    });

    this.eventListeners.forEach(listener => listener({
      status: this.status,
      sessionId: this.sessionId,
      url: this.url,
      token: this.token,
      userId: this.userId,
      userEmailOrName: this.userEmailOrName,
      isAuthenticated: this.isAuthenticated,
      subscriptions: Array.from(this.subscriptions.entries()).map(([id, sub]) => ({ id, ...sub })).reverse(),
      subscriptionResponses: subResponsesObj,
      collections: { ...this.collections },
      logs: [...this.ddpLogs]
    }));
  }

  subscribe(name, params = []) {
    if (this.status !== 'connected') {
      throw new Error('Not connected');
    }
    const parsedParams = Array.isArray(params) ? params : [params];
    const paramsStr = JSON.stringify(parsedParams);

    // Check if subscription with exact same name & params is already active
    let id = null;
    for (const [sId, subObj] of this.subscriptions.entries()) {
      if (subObj.name === name && JSON.stringify(subObj.params) === paramsStr) {
        id = sId;
        break;
      }
    }

    if (id) {
      // Re-subscribing: move to top, clear responses, and send fresh sub frame
      this.subscriptions.delete(id);
      this.subscriptions.set(id, { name, params: parsedParams });
      this.subscriptionResponses.set(id, []);

      const subFrame = {
        msg: 'sub',
        id,
        name,
        params: parsedParams
      };

      this.addSubscriptionResponse(id, subFrame);
      this.send(subFrame);
      this.notifyStateChange();
      return id;
    }

    // New Subscription
    id = String(this.nextId++);
    this.subscriptions.set(id, { name, params: parsedParams });
    this.subscriptionResponses.set(id, []);

    const subFrame = {
      msg: 'sub',
      id,
      name,
      params: parsedParams
    };

    this.addSubscriptionResponse(id, subFrame);
    this.send(subFrame);
    return id;
  }

  clearCollections() {
    this.collections = {};
    this.notifyStateChange();
  }

  addLog(type, data) {
    const entry = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      time: new Date().toLocaleTimeString(),
      type, // 'in' | 'out' | 'sys'
      data
    };
    this.ddpLogs = [entry, ...this.ddpLogs.slice(0, 199)]; // Keep latest 200 logs
    this.notifyStateChange();
  }

  // Start client heartbeat pinging to keep WebSocket connection alive
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.status === 'connected' && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.send({ msg: 'ping' });
        } catch (err) {
          console.warn('[DDP Client] Heartbeat ping failed:', err);
        }
      }
    }, 25000); // Send ping every 25s
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // Connect to Meteor DDP Server
  connect(targetUrl) {
    if (targetUrl) {
      this.url = targetUrl;
      localStorage.setItem('meteor_server_url', targetUrl);
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && (this.status === 'connecting' || this.status === 'connected')) {
      this.disconnect(false);
    }

    this.status = 'connecting';
    this.addLog('sys', { message: `Connecting to ${this.url}...` });
    this.notifyStateChange();

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.addLog('sys', { message: 'WebSocket established. Sending DDP connect handshake.' });
        this.send({
          msg: 'connect',
          version: '1',
          support: ['1', 'pre2', 'pre1']
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          this.addLog('in', raw);
          this.handleDdpMessage(raw);
        } catch (err) {
          this.addLog('sys', { error: 'Failed to parse incoming WebSocket frame', raw: event.data });
        }
      };

      this.socket.onerror = (err) => {
        this.addLog('sys', { error: 'WebSocket Error encountered', details: err });
      };

      this.socket.onclose = (event) => {
        this.stopHeartbeat();
        const wasConnected = this.status === 'connected';
        this.status = 'disconnected';
        this.sessionId = null;
        this.isAuthenticated = false;
        this.addLog('sys', { message: `WebSocket closed. Code: ${event.code}` });
        this.notifyStateChange();

        // Auto-reconnect after 3s if disconnected unexpectedly
        if (this.autoReconnect && wasConnected) {
          this.addLog('sys', { message: 'Reconnecting in 3 seconds...' });
          this.reconnectTimer = setTimeout(() => {
            this.connect();
          }, 3000);
        }
      };
    } catch (err) {
      this.status = 'disconnected';
      this.addLog('sys', { error: `Failed to initiate WebSocket: ${err.message}` });
      this.notifyStateChange();
    }
  }

  disconnect(shouldStopAutoReconnect = true) {
    if (shouldStopAutoReconnect) {
      this.autoReconnect = false;
    }
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.status = 'disconnected';
    this.sessionId = null;
    this.notifyStateChange();
  }

  send(data) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    const jsonStr = JSON.stringify(data);
    this.addLog('out', data);
    this.socket.send(jsonStr);
  }

  // Handle incoming DDP protocol frames
  handleDdpMessage(msg) {
    switch (msg.msg) {
      case 'connected':
        this.status = 'connected';
        this.sessionId = msg.session;
        this.autoReconnect = true;
        this.startHeartbeat();
        this.addLog('sys', { message: `Connected! Session ID: ${msg.session}` });
        
        // Auto resume token if stored
        if (this.token) {
          this.resumeLogin(this.token);
        } else {
          this.notifyStateChange();
        }
        break;

      case 'ping':
        this.send({ msg: 'pong', id: msg.id });
        break;

      case 'result':
        if (msg.id && this.pendingCallbacks.has(msg.id)) {
          const { resolve, reject } = this.pendingCallbacks.get(msg.id);
          this.pendingCallbacks.delete(msg.id);
          if (msg.error) {
            reject(msg.error);
          } else {
            resolve(msg.result);
          }
        }
        break;

      case 'added':
      case 'changed':
      case 'removed':
        this.handleCollectionUpdate(msg);
        if (Array.isArray(msg.subs)) {
          msg.subs.forEach(sId => this.addSubscriptionResponse(sId, msg));
        } else {
          // Route collection updates to all active subscriptions
          this.subscriptions.forEach((_, sId) => this.addSubscriptionResponse(sId, msg));
        }
        break;

      case 'ready':
        if (Array.isArray(msg.subs)) {
          msg.subs.forEach(sId => this.addSubscriptionResponse(sId, msg));
        }
        this.notifyStateChange();
        break;

      case 'nosub':
        if (msg.id) {
          this.addSubscriptionResponse(msg.id, msg);
        }
        this.notifyStateChange();
        break;

      case 'failed':
        this.addLog('sys', { error: `DDP handshake failed. Server supports version: ${msg.version}` });
        this.status = 'disconnected';
        this.notifyStateChange();
        break;

      default:
        break;
    }
  }

  handleCollectionUpdate(msg) {
    const { collection, id, fields } = msg;
    if (!collection) return;

    if (!this.collections[collection]) {
      this.collections[collection] = {};
    }

    if (msg.msg === 'added' || msg.msg === 'changed') {
      this.collections[collection][id] = {
        _id: id,
        ...(this.collections[collection][id] || {}),
        ...fields
      };
    } else if (msg.msg === 'removed') {
      delete this.collections[collection][id];
    }

    this.notifyStateChange();
  }

  callMethod(name, params = []) {
    return new Promise((resolve, reject) => {
      if (this.status !== 'connected') {
        return reject(new Error('Cannot call method: Not connected to Meteor server'));
      }

      const id = String(this.nextId++);
      const timestamp = Date.now();

      this.pendingCallbacks.set(id, { resolve, reject, timestamp, method: name });

      this.send({
        msg: 'method',
        method: name,
        params: Array.isArray(params) ? params : [params],
        id
      });
    });
  }

  hashPassword(password) {
    return CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
  }

  async loginWithPassword({ identity, password, authType = 'email' }) {
    const passwordDigest = {
      digest: this.hashPassword(password),
      algorithm: 'sha-256'
    };

    const userSelector = authType === 'email' ? { email: identity } : { username: identity };

    try {
      const res = await this.callMethod('login', [{
        user: userSelector,
        password: passwordDigest
      }]);

      if (res && res.token) {
        this.setAuthSession(res.token, res.id, identity);
        return { success: true, res };
      }
      throw new Error('Invalid login response from server');
    } catch (err) {
      this.clearAuthSession();
      throw err;
    }
  }

  async resumeLogin(tokenToResume) {
    const token = tokenToResume || this.token;
    if (!token) return;

    this.addLog('sys', { message: 'Attempting token auto-resume login...' });
    try {
      const res = await this.callMethod('login', [{ resume: token }]);
      if (res && res.token) {
        this.setAuthSession(res.token, res.id, this.userEmailOrName || 'Stored Session');
        this.addLog('sys', { message: `Token resume success! Logged in as User ID: ${res.id}` });
        return { success: true, res };
      }
    } catch (err) {
      this.addLog('sys', { error: 'Token resume failed or expired. Clearing token.', details: err });
      this.clearAuthSession();
    }
  }

  async logout() {
    try {
      if (this.status === 'connected') {
        await this.callMethod('logout', []);
      }
    } catch (err) {
      console.warn('Logout method warning:', err);
    } finally {
      this.clearAuthSession();
    }
  }

  setAuthSession(token, userId, userEmailOrName) {
    this.token = token;
    this.userId = userId;
    this.userEmailOrName = userEmailOrName;
    this.isAuthenticated = true;

    localStorage.setItem('meteor_login_token', token);
    localStorage.setItem('meteor_user_id', userId);
    localStorage.setItem('meteor_user_name', userEmailOrName);
    this.notifyStateChange();
  }

  clearAuthSession() {
    this.token = null;
    this.userId = null;
    this.userEmailOrName = null;
    this.isAuthenticated = false;

    localStorage.removeItem('meteor_login_token');
    localStorage.removeItem('meteor_user_id');
    localStorage.removeItem('meteor_user_name');
    this.notifyStateChange();
  }

  unsubscribe(id) {
    if (this.subscriptions.has(id)) {
      const sId = String(id);
      this.addSubscriptionResponse(sId, { msg: 'unsub', id: sId });
      this.send({ msg: 'unsub', id: sId });
      this.subscriptions.delete(sId);
      this.notifyStateChange();
    }
  }

  clearLogs() {
    this.ddpLogs = [];
    this.notifyStateChange();
  }

  clearSubscriptionResponses(subId) {
    if (subId) {
      this.subscriptionResponses.set(String(subId), []);
    } else {
      this.subscriptionResponses.clear();
    }
    this.notifyStateChange();
  }
}

export const ddpClient = new MeteorDdpClient();
