import React, { useState } from 'react';
import { Layers, Radio, RefreshCw, XCircle, Search, Table, Code, Trash2, Database, ListFilter } from 'lucide-react';

export const CollectionsViewer = ({ state, ddpClient }) => {
  const [pubName, setPubName] = useState('');
  const [paramsJson, setParamsJson] = useState('[]');
  const [selectedCollection, setSelectedCollection] = useState('all'); // 'all' or collection name
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('tree'); // 'tree' | 'table'
  const [jsonError, setJsonError] = useState('');

  const activeSubs = state.subscriptions || [];
  const collectionNames = Object.keys(state.collections || {});

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (state.status !== 'connected') {
      alert('Must be connected to Meteor DDP server.');
      return;
    }

    if (!pubName.trim()) {
      alert('Please enter a publication name.');
      return;
    }

    let parsedParams = [];
    try {
      if (paramsJson.trim()) {
        parsedParams = JSON.parse(paramsJson);
      }
      setJsonError('');
    } catch (err) {
      setJsonError('Invalid JSON parameters: ' + err.message);
      return;
    }

    try {
      ddpClient.subscribe(pubName.trim(), parsedParams);
      setPubName('');
      setParamsJson('[]');
    } catch (err) {
      alert('Subscription failed: ' + err.message);
    }
  };

  const handleUnsubscribe = (subId) => {
    ddpClient.unsubscribe(subId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Subscribe Runner Form */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Radio size={20} color="var(--color-cyan)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Publication Subscription Manager</h2>
          </div>

          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Subscribe to Meteor DDP publications to sync reactive data
          </span>
        </div>

        <form onSubmit={handleSubscribe}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Publication Name</label>
              <input
                type="text"
                className="form-input"
                value={pubName}
                onChange={(e) => setPubName(e.target.value)}
                placeholder="e.g. activeTasks or userData"
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">
                <span>Arguments (JSON Array)</span>
                {jsonError && <span style={{ color: '#fb7185', textTransform: 'none' }}>{jsonError}</span>}
              </label>
              <input
                type="text"
                className="form-input"
                value={paramsJson}
                onChange={(e) => { setParamsJson(e.target.value); setJsonError(''); }}
                placeholder='[ "arg1", { "limit": 10 } ]'
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={state.status !== 'connected'}
            >
              <Radio size={16} /> Subscribe to Publication
            </button>
          </div>
        </form>

        {/* Active Subscriptions Badges */}
        {activeSubs.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              ACTIVE SUBSCRIPTIONS ({activeSubs.length}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeSubs.map((sub) => (
                <div
                  key={sub.id}
                  className="badge badge-connected"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '0.82rem' }}
                >
                  <Radio size={12} className="dot-connecting" />
                  <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{sub.name}</span>
                  {sub.params && sub.params.length > 0 && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                      {JSON.stringify(sub.params)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleUnsubscribe(sub.id)}
                    style={{ background: 'none', border: 'none', color: '#fb7185', cursor: 'pointer', padding: 0 }}
                    title="Unsubscribe"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Collection Store Inspector */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Synced Collection Store</h2>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
              {collectionNames.length} Collection(s)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Text Search */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                style={{ width: '200px', padding: '6px 10px 6px 30px', fontSize: '0.82rem' }}
                placeholder="Search collection data..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            </div>

            {/* View Mode Toggle */}
            <div className="tab-group">
              <button className={`tab-btn ${viewMode === 'tree' ? 'active' : ''}`} onClick={() => setViewMode('tree')} title="JSON View">
                <Code size={14} />
              </button>
              <button className={`tab-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')} title="Table View">
                <Table size={14} />
              </button>
            </div>

            {/* Clear Store Cache */}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => ddpClient.clearCollections()}
              title="Clear Local Collection Store Cache"
            >
              <Trash2 size={14} /> Clear Cache
            </button>
          </div>
        </div>

        {/* Collection Selector Tabs */}
        {collectionNames.length > 0 && (
          <div className="tab-group" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <button
              className={`tab-btn ${selectedCollection === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCollection('all')}
            >
              All Collections
            </button>
            {collectionNames.map((cName) => {
              const count = Object.keys(state.collections[cName] || {}).length;
              return (
                <button
                  key={cName}
                  className={`tab-btn ${selectedCollection === cName ? 'active' : ''}`}
                  onClick={() => setSelectedCollection(cName)}
                >
                  {cName} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Collection Documents Output */}
        {collectionNames.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
            <Database size={32} style={{ marginBottom: '8px', opacity: 0.5 }} /><br />
            No collection data synchronized yet. Enter a publication name above and click <strong>Subscribe</strong> to sync live documents from your Meteor server!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {collectionNames
              .filter((cName) => selectedCollection === 'all' || selectedCollection === cName)
              .map((cName) => {
                const docsMap = state.collections[cName] || {};
                let docList = Object.values(docsMap);

                if (searchTerm.trim()) {
                  const s = searchTerm.toLowerCase();
                  docList = docList.filter((doc) => JSON.stringify(doc).toLowerCase().includes(s));
                }

                // Extract all unique field keys for Table view
                const fieldKeys = Array.from(new Set(docList.flatMap((d) => Object.keys(d))));

                return (
                  <div key={cName} style={{ background: 'rgba(10, 13, 26, 0.6)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>
                          {cName}
                        </span>
                        <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#67e8f9', fontSize: '0.75rem' }}>
                          {docList.length} doc(s)
                        </span>
                      </div>
                    </div>

                    {docList.length === 0 ? (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                        No documents match the search query.
                      </div>
                    ) : viewMode === 'tree' ? (
                      /* JSON Tree View */
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {docList.map((doc) => (
                          <pre
                            key={doc._id || Math.random()}
                            style={{
                              background: 'rgba(0,0,0,0.5)',
                              padding: '12px',
                              borderRadius: '6px',
                              fontSize: '0.82rem',
                              color: '#a7f3d0',
                              overflowX: 'auto',
                              border: '1px solid rgba(255,255,255,0.05)',
                              fontFamily: 'var(--font-mono)'
                            }}
                          >
                            {JSON.stringify(doc, null, 2)}
                          </pre>
                        ))}
                      </div>
                    ) : (
                      /* Table / Grid View */
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left', color: 'var(--text-muted)' }}>
                              {fieldKeys.map((key) => (
                                <th key={key} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
                                  {key}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {docList.map((doc, i) => (
                              <tr key={doc._id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {fieldKeys.map((key) => (
                                  <td key={key} style={{ padding: '8px 12px', color: key === '_id' ? 'var(--color-primary)' : 'var(--text-main)' }}>
                                    {typeof doc[key] === 'object' ? JSON.stringify(doc[key]) : String(doc[key] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};
