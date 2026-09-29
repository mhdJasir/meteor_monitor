import React, { useState, useEffect } from 'react';
import {
  Terminal, Send, Plus, Bookmark, Trash2, Edit3, Play, Radio,
  Clock, CheckCircle2, XCircle, RotateCw, Save, Sparkles, ChevronDown, ChevronRight, Layers, Copy, Check
} from 'lucide-react';

const DEFAULT_SAVED_METHODS = [];

export const MethodInvoker = ({ state, ddpClient }) => {
  // Load saved methods from localStorage or defaults
  const [savedMethods, setSavedMethods] = useState(() => {
    const local = localStorage.getItem('meteor_saved_methods');
    return local ? JSON.parse(local) : DEFAULT_SAVED_METHODS;
  });

  const [selectedMethodId, setSelectedMethodId] = useState(savedMethods[0]?.id || null);
  const [methodName, setMethodName] = useState(savedMethods[0]?.name || '');
  const [methodType, setMethodType] = useState(savedMethods[0]?.type || 'method');
  const [paramsJson, setParamsJson] = useState(savedMethods[0]?.params || '[]');
  const [description, setDescription] = useState(savedMethods[0]?.description || '');

  const [isCreatingNew, setIsCreatingNew] = useState(savedMethods.length === 0);
  const [loading, setLoading] = useState(false);
  const [jsonError, setJsonError] = useState('');
  const [history, setHistory] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [streamFilter, setStreamFilter] = useState('all'); // 'all' | 'ready' | 'added' | 'changed' | 'removed' | 'nosub'
  const [isLogCollapsed, setIsLogCollapsed] = useState(false);

  const handleCopy = (id, objData) => {
    let jsonStr;
    if (objData === undefined) {
      jsonStr = 'undefined';
    } else if (typeof objData === 'string') {
      jsonStr = objData;
    } else {
      try {
        jsonStr = JSON.stringify(objData, null, 2);
      } catch (err) {
        jsonStr = String(objData);
      }
    }
    navigator.clipboard.writeText(jsonStr);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatResponse = (data) => {
    if (data === undefined) return 'undefined';
    if (data === null) return 'null';
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch (err) {
      return String(data);
    }
  };

  // Auto-select latest active subscription if none selected
  const activeSubs = state.subscriptions || [];
  useEffect(() => {
    if (!selectedSubId && activeSubs.length > 0) {
      setSelectedSubId(activeSubs[activeSubs.length - 1].id);
    }
  }, [activeSubs, selectedSubId]);

  // Save methods array to localStorage whenever modified
  useEffect(() => {
    localStorage.setItem('meteor_saved_methods', JSON.stringify(savedMethods));
  }, [savedMethods]);

  const handleSelectSaved = (m) => {
    setSelectedMethodId(m.id);
    setMethodName(m.name);
    setMethodType(m.type || 'method');
    setParamsJson(m.params);
    setDescription(m.description || '');
    setIsCreatingNew(false);
    setJsonError('');
  };

  const handleCreateNewClick = () => {
    setIsCreatingNew(true);
    setSelectedMethodId(null);
    setMethodName('');
    setMethodType('method');
    setParamsJson('[]');
    setDescription('');
    setJsonError('');
  };

  const handleSaveMethod = () => {
    if (!methodName.trim()) {
      alert('Please enter a method/subscription name.');
      return;
    }

    try {
      JSON.parse(paramsJson);
    } catch (err) {
      setJsonError('Invalid JSON parameters: ' + err.message);
      return;
    }

    if (isCreatingNew) {
      const newObj = {
        id: 'm_' + Date.now(),
        name: methodName.trim(),
        type: methodType,
        params: paramsJson,
        description: description.trim()
      };
      setSavedMethods((prev) => [...prev, newObj]);
      setSelectedMethodId(newObj.id);
      setIsCreatingNew(false);
    } else if (selectedMethodId) {
      setSavedMethods((prev) =>
        prev.map((m) =>
          m.id === selectedMethodId
            ? { ...m, name: methodName.trim(), type: methodType, params: paramsJson, description: description.trim() }
            : m
        )
      );
    }
    setJsonError('');
  };

  const handleDeleteSaved = (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this saved method template?')) {
      const filtered = savedMethods.filter((m) => m.id !== id);
      setSavedMethods(filtered);
      if (selectedMethodId === id && filtered.length > 0) {
        handleSelectSaved(filtered[0]);
      }
    }
  };

  const handleExecuteOrSubscribe = async (e) => {
    if (e) e.preventDefault();

    if (state.status !== 'connected') {
      alert('Must be connected to a Meteor DDP server.');
      return;
    }

    let parsedParams = [];
    try {
      if (paramsJson.trim()) {
        parsedParams = JSON.parse(paramsJson);
      }
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON format: ' + err.message);
      return;
    }

    const startTime = Date.now();
    setLoading(true);
    const historyId = Date.now() + Math.random().toString(36).substr(2, 4);

    if (methodType === 'subscription') {
      try {
        const subId = ddpClient.subscribe(methodName.trim(), parsedParams);
        setSelectedSubId(subId);
        const subMethodKey = `sub:${methodName.trim()}`;
        const duration = Date.now() - startTime;
        const newItem = {
          id: historyId,
          time: new Date().toLocaleTimeString(),
          method: subMethodKey,
          type: 'subscription',
          params: parsedParams,
          duration,
          status: 'success',
          result: { subscriptionId: subId, message: `Subscribed successfully to "${methodName.trim()}"` }
        };
        setHistory((prev) => [newItem, ...prev.filter(item => item.method !== subMethodKey)]);
        setExpandedItems({ [historyId]: true });
      } catch (err) {
        const duration = Date.now() - startTime;
        const newItem = {
          id: historyId,
          time: new Date().toLocaleTimeString(),
          method: `sub:${methodName.trim()}`,
          type: 'subscription',
          params: parsedParams,
          duration,
          status: 'error',
          error: err.message || err
        };
        setHistory((prev) => [newItem, ...prev]);
        setExpandedItems({ [historyId]: true });
      } finally {
        setLoading(false);
      }
    } else {
      // DDP Method Call
      try {
        const res = await ddpClient.callMethod(methodName.trim(), parsedParams);
        const duration = Date.now() - startTime;
        const newItem = {
          id: historyId,
          time: new Date().toLocaleTimeString(),
          method: methodName.trim(),
          type: 'method',
          params: parsedParams,
          duration,
          status: 'success',
          result: res
        };
        setHistory((prev) => [newItem, ...prev]);
        setExpandedItems({ [historyId]: true });
      } catch (err) {
        const duration = Date.now() - startTime;
        const newItem = {
          id: historyId,
          time: new Date().toLocaleTimeString(),
          method: methodName.trim(),
          type: 'method',
          params: parsedParams,
          duration,
          status: 'error',
          error: err.reason || err.message || err
        };
        setHistory((prev) => [newItem, ...prev]);
        setExpandedItems({ [historyId]: true });
      } finally {
        setLoading(false);
      }
    }
  };

  const toggleExpand = (id) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px' }}>
      {/* Left Sidebar: Saved Methods Library */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
            <Bookmark size={18} color="var(--color-primary)" /> Saved Methods & Subs
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCreateNewClick}
            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
          >
            <Plus size={14} /> New
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '550px', overflowY: 'auto' }}>
          {savedMethods.map((m) => {
            const isSelected = selectedMethodId === m.id && !isCreatingNew;
            const isSub = m.type === 'subscription';

            return (
              <div
                key={m.id}
                onClick={() => handleSelectSaved(m)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(249, 115, 22, 0.12)' : 'rgba(10, 13, 26, 0.5)',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', fontFamily: 'var(--font-mono)', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                    {m.name}
                  </span>
                  <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 6px', background: isSub ? 'rgba(6, 182, 212, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: isSub ? '#67e8f9' : '#c084fc' }}>
                    {isSub ? 'Sub' : 'Method'}
                  </span>
                </div>

                {m.description && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.description}
                  </p>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSaved(m.id, e)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                    title="Delete method"
                  >
                    <Trash2 size={13} color="#fb7185" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Main Panel: Editor, Runner & Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Method Definition & Runner Form */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={20} color="var(--color-primary)" />
              {isCreatingNew ? 'Create New Method / Subscription' : `Configure: ${methodName || 'Untitled'}`}
            </h2>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSaveMethod}
              >
                <Save size={14} /> Save Template
              </button>
            </div>
          </div>

          <form onSubmit={handleExecuteOrSubscribe}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '14px', marginBottom: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={methodType}
                  onChange={(e) => setMethodType(e.target.value)}
                >
                  <option value="method">Method</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{methodType === 'method' ? 'Method Name' : 'Publication Name'}</label>
                <input
                  type="text"
                  className="form-input"
                  value={methodName}
                  onChange={(e) => setMethodName(e.target.value)}
                  placeholder={methodType === 'method' ? 'e.g. users.updateProfile' : 'e.g. activeTasks'}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description / Purpose</label>
              <input
                type="text"
                className="form-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of what this method does..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                <span>Parameters (JSON Array or Object)</span>
                {jsonError && <span style={{ color: '#fb7185', textTransform: 'none' }}>{jsonError}</span>}
              </label>
              <textarea
                className="form-textarea"
                style={{ height: '90px', minHeight: '90px' }}
                value={paramsJson}
                onChange={(e) => { setParamsJson(e.target.value); setJsonError(''); }}
                placeholder='[ "arg1", { "key": "value" } ]'
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                Persisted in LocalStorage across sessions
              </span>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || state.status !== 'connected'}
              >
                {methodType === 'subscription' ? <Radio size={16} /> : <Send size={16} />}
                {loading
                  ? 'Processing...'
                  : methodType === 'subscription'
                  ? `Subscribe to "${methodName || 'Pub'}"`
                  : `Invoke Method "${methodName || 'Method'}"`}
              </button>
            </div>
          </form>
        </div>

        {/* Execution & Subscription Log (Shrinkable / Collapsible) */}
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none',
              marginBottom: isLogCollapsed ? '0px' : '12px',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <h3
              onClick={() => setIsLogCollapsed((prev) => !prev)}
              style={{ fontSize: '0.98rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            >
              {isLogCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <Clock size={16} color="var(--color-cyan)" /> Execution & Subscription Log ({history.length})
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {history.length > 0 && !isLogCollapsed && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                    onClick={() => {
                      const allObj = {};
                      history.forEach(item => { allObj[item.id] = true; });
                      setExpandedItems(allObj);
                    }}
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                    onClick={() => setExpandedItems({})}
                  >
                    Collapse All
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.72rem', padding: '2px 8px', color: '#fb7185' }}
                    onClick={() => { setHistory([]); setExpandedItems({}); }}
                    title="Clear Log History"
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                </>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                onClick={() => setIsLogCollapsed((prev) => !prev)}
              >
                {isLogCollapsed ? 'Expand Log Panel' : 'Shrink Log Panel'}
              </button>
            </div>
          </div>

          {!isLogCollapsed && (
            history.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                No method executions or subscriptions run yet. Configure above and click send!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '650px', overflowY: 'auto', paddingRight: '4px' }}>
                {history.map((item) => {
                  const isExpanded = expandedItems[item.id];
                  const isSuccess = item.status === 'success';

                  return (
                    <div
                      key={item.id}
                      style={{
                        background: 'rgba(10, 13, 26, 0.7)',
                        border: isExpanded ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid var(--border-color)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div
                        onClick={() => toggleExpand(item.id)}
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          {isSuccess ? <CheckCircle2 size={15} color="#34d399" /> : <XCircle size={15} color="#fb7185" />}
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>
                            {item.method}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            ({item.duration}ms)
                          </span>
                        </div>

                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{item.time}</span>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.35)', fontSize: '0.82rem' }}>
                          <div style={{ marginBottom: '10px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Arguments:
                            </span>
                            <pre style={{
                              margin: '4px 0 0',
                              background: 'rgba(0,0,0,0.5)',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              color: '#93c5fd',
                              fontSize: '0.78rem',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              maxHeight: '140px',
                              overflowY: 'auto',
                              overflowX: 'auto',
                              border: '1px solid rgba(255, 255, 255, 0.05)'
                            }}>
                              {formatResponse(item.params)}
                            </pre>
                          </div>

                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span style={{ color: isSuccess ? '#34d399' : '#fb7185', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {isSuccess ? 'Response Result:' : 'Error details:'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(`hist_${item.id}`, isSuccess ? item.result : item.error)}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  color: copiedId === `hist_${item.id}` ? '#34d399' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  padding: '2px 8px',
                                  fontSize: '0.72rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="Copy Result"
                              >
                                {copiedId === `hist_${item.id}` ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                                {copiedId === `hist_${item.id}` ? 'Copied!' : 'Copy Result'}
                              </button>
                            </div>
                            <pre style={{
                              margin: '4px 0 2px',
                              background: 'rgba(0,0,0,0.6)',
                              padding: '10px 14px',
                              borderRadius: '6px',
                              color: isSuccess ? '#a7f3d0' : '#fecdd3',
                              maxHeight: '450px',
                              minHeight: '40px',
                              overflowY: 'auto',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontSize: '0.82rem',
                              lineHeight: '1.45',
                              border: isSuccess ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(251, 113, 133, 0.2)'
                            }}>
                              {formatResponse(isSuccess ? item.result : item.error)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Live Subscription Response Stream (Full Width & Full Height) */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Radio size={18} color="var(--color-cyan)" />
              <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Subscription Response Stream</h3>
              {selectedSubId && (
                <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.2)', color: '#67e8f9', fontSize: '0.75rem', padding: '3px 8px' }}>
                  Sub #{selectedSubId}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Subscription Selector */}
              <select
                className="form-select"
                style={{ padding: '4px 10px', fontSize: '0.82rem', minWidth: '220px' }}
                value={selectedSubId || ''}
                onChange={(e) => setSelectedSubId(e.target.value)}
              >
                <option value="" disabled>-- Select Subscription --</option>
                {(state.subscriptions || []).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    Sub #{sub.id}: {sub.name}
                  </option>
                ))}
                {Object.keys(state.subscriptionResponses || {}).map((sId) => {
                  if ((state.subscriptions || []).some(s => String(s.id) === String(sId))) return null;
                  return (
                    <option key={sId} value={sId}>
                      Sub #{sId} (Ended/Inactive)
                    </option>
                  );
                })}
              </select>

              {selectedSubId && (state.subscriptions || []).some(s => String(s.id) === String(selectedSubId)) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ color: '#fb7185', padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => ddpClient.unsubscribe(selectedSubId)}
                >
                  Unsubscribe
                </button>
              )}

              {selectedSubId && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                  onClick={() => ddpClient.clearSubscriptionResponses(selectedSubId)}
                  title="Clear Subscription Stream Logs"
                >
                  <Trash2 size={13} /> Clear Stream
                </button>
              )}
            </div>
          </div>

          {/* Filter Pills Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div className="tab-group" style={{ display: 'flex', gap: '6px' }}>
              {['all', 'ready', 'added', 'changed', 'removed', 'nosub'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`tab-btn ${streamFilter === f ? 'active' : ''}`}
                  onClick={() => setStreamFilter(f)}
                  style={{ fontSize: '0.75rem', padding: '4px 10px', textTransform: 'capitalize' }}
                >
                  {f}
                </button>
              ))}
            </div>

            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Full Width Stream Inspection
            </span>
          </div>

          {/* Response Stream List (Full Width) */}
          <div style={{
            background: 'rgba(5, 7, 15, 0.9)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            minHeight: '480px',
            maxHeight: '75vh',
            overflowY: 'auto',
            padding: '14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {!selectedSubId ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                No active subscription selected. Subscribe to a publication above to view its live responses here!
              </div>
            ) : !state.subscriptionResponses || !(state.subscriptionResponses[selectedSubId]?.length) ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
                Waiting for DDP responses for Subscription #{selectedSubId}...
              </div>
            ) : (
              (state.subscriptionResponses[selectedSubId] || [])
                .filter(resp => streamFilter === 'all' || resp.data?.msg === streamFilter)
                .map((resp) => {
                  const msgType = resp.data?.msg || 'unknown';
                  let tagColor = '#94a3b8';
                  let bgColor = 'rgba(255,255,255,0.03)';

                  if (msgType === 'sub') {
                    tagColor = '#06b6d4';
                    bgColor = 'rgba(6, 182, 212, 0.1)';
                  } else if (msgType === 'ready') {
                    tagColor = '#34d399';
                    bgColor = 'rgba(52, 211, 153, 0.1)';
                  } else if (msgType === 'added' || msgType === 'changed') {
                    tagColor = '#fbbf24';
                    bgColor = 'rgba(251, 191, 36, 0.08)';
                  } else if (msgType === 'removed' || msgType === 'nosub' || msgType === 'unsub') {
                    tagColor = '#fb7185';
                    bgColor = 'rgba(251, 113, 133, 0.1)';
                  }

                  return (
                    <div
                      key={resp.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: bgColor,
                        borderLeft: `3px solid ${tagColor}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: tagColor, textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          [{msgType}]
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{resp.time}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(resp.id, resp.data)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              color: copiedId === resp.id ? '#34d399' : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px 8px',
                              fontSize: '0.72rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Copy JSON Object"
                          >
                            {copiedId === resp.id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                            {copiedId === resp.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto', color: '#f1f5f9', fontSize: '0.8rem', lineHeight: '1.4' }}>
                        {formatResponse(resp.data)}
                      </pre>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
