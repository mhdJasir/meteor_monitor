import React, { useState, useEffect } from 'react';
import { Network, Plug, Unplug, Bookmark, Plus, Trash2, CheckCircle2, Save } from 'lucide-react';

const DEFAULT_PRESETS = [
  { id: 'c1', name: 'Localhost (Port 3000)', url: 'ws://localhost:3000/websocket' }
];

export const ConnectionCard = ({ state, ddpClient }) => {
  // Auto fill connection URL from localStorage or current state
  const [urlInput, setUrlInput] = useState(() => {
    return localStorage.getItem('meteor_server_url') || state.url || 'ws://localhost:3000/websocket';
  });

  const [autoConnect, setAutoConnect] = useState(() => {
    const stored = localStorage.getItem('meteor_auto_connect');
    return stored === null ? true : stored === 'true';
  });

  const [savedConnections, setSavedConnections] = useState(() => {
    const local = localStorage.getItem('meteor_saved_connections');
    return local ? JSON.parse(local) : DEFAULT_PRESETS;
  });

  const [presetLabel, setPresetLabel] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Sync state & save URL to localStorage
  useEffect(() => {
    if (state.url) {
      setUrlInput(state.url);
      localStorage.setItem('meteor_server_url', state.url);
    }
  }, [state.url]);

  const handleUrlChange = (e) => {
    const val = e.target.value;
    setUrlInput(val);
    localStorage.setItem('meteor_server_url', val);
  };

  const handleAutoConnectToggle = (e) => {
    const checked = e.target.checked;
    setAutoConnect(checked);
    localStorage.setItem('meteor_auto_connect', String(checked));
  };

  const handleConnect = (e) => {
    if (e) e.preventDefault();
    if (urlInput.trim()) {
      localStorage.setItem('meteor_server_url', urlInput.trim());
      ddpClient.connect(urlInput.trim());
    }
  };

  const handleDisconnect = () => {
    ddpClient.disconnect();
  };

  const handleSelectPreset = (presetUrl) => {
    setUrlInput(presetUrl);
    localStorage.setItem('meteor_server_url', presetUrl);
    ddpClient.connect(presetUrl);
  };

  const handleSavePreset = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    const label = presetLabel.trim() || urlInput.trim();
    const newPreset = {
      id: 'c_' + Date.now(),
      name: label,
      url: urlInput.trim()
    };

    const updated = [...savedConnections, newPreset];
    setSavedConnections(updated);
    localStorage.setItem('meteor_saved_connections', JSON.stringify(updated));
    setPresetLabel('');
    setShowSavePreset(false);
  };

  const handleDeletePreset = (id, e) => {
    e.stopPropagation();
    const updated = savedConnections.filter(c => c.id !== id);
    setSavedConnections(updated);
    localStorage.setItem('meteor_saved_connections', JSON.stringify(updated));
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Connection Parameters</h2>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoConnect}
              onChange={handleAutoConnectToggle}
              style={{ accentColor: 'var(--color-primary)' }}
            />
            Auto-connect on launch
          </label>
        </div>

        <form onSubmit={handleConnect}>
          <div className="form-group">
            <label className="form-label">
              <span>Meteor DDP WebSocket URL</span>
              <span style={{ color: 'var(--color-primary)', fontSize: '0.72rem', textTransform: 'none' }}>
                Auto-saved in LocalStorage
              </span>
            </label>
            <input
              type="text"
              className="form-input"
              value={urlInput}
              onChange={handleUrlChange}
              placeholder="ws://localhost:3000/websocket or wss://..."
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
            {state.status === 'connected' ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDisconnect}
                style={{ flex: 1 }}
              >
                <Unplug size={16} /> Disconnect
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={state.status === 'connecting'}
                style={{ flex: 1 }}
              >
                <Plug size={16} /> {state.status === 'connecting' ? 'Connecting...' : 'Connect to Meteor'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowSavePreset(!showSavePreset)}
              title="Bookmark this connection parameter"
            >
              <Bookmark size={16} />
            </button>
          </div>
        </form>

        {/* Save Preset Sub-Form */}
        {showSavePreset && (
          <form onSubmit={handleSavePreset} style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)' }}>
              Save Connection Bookmark:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                placeholder="Profile Name (e.g. Staging Server)"
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
              />
              <button type="submit" className="btn btn-primary btn-sm">
                <Save size={14} /> Save
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Saved Connection Bookmarks */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>SAVED CONNECTION PROFILES ({savedConnections.length})</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Click to auto-fill & connect</span>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
          {savedConnections.map((c) => {
            const isActive = state.url === c.url;

            return (
              <div
                key={c.id}
                onClick={() => handleSelectPreset(c.url)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(249, 115, 22, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isActive ? '1px solid rgba(249, 115, 22, 0.3)' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                  fontSize: '0.82rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Plug size={13} color={isActive ? 'var(--color-primary)' : 'var(--text-dim)'} />
                  <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ({c.url})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDeletePreset(c.id, e)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                  title="Delete bookmark"
                >
                  <Trash2 size={12} color="#fb7185" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
