import React, { useState } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Info, Trash2, Filter, Copy, Check } from 'lucide-react';

export const DdpConsole = ({ state, ddpClient }) => {
  const [filter, setFilter] = useState('all'); // 'all' | 'in' | 'out' | 'sys'
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = (id, data) => {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const logs = state.logs || [];

  const filteredLogs = logs.filter((log) => {
    if (filter !== 'all' && log.type !== filter) return false;
    if (!searchTerm) return true;
    const str = JSON.stringify(log.data).toLowerCase();
    return str.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="glass-panel" style={{ padding: '20px', minHeight: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={20} color="var(--color-primary)" />
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>DDP Traffic Console</h2>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            {logs.length} frames
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search Input */}
          <input
            type="text"
            className="form-input"
            style={{ width: '180px', padding: '4px 10px', fontSize: '0.8rem' }}
            placeholder="Filter by method/id..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* Filter Pills */}
          <div className="tab-group">
            <button className={`tab-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
            <button className={`tab-btn ${filter === 'in' ? 'active' : ''}`} onClick={() => setFilter('in')}>Inbound</button>
            <button className={`tab-btn ${filter === 'out' ? 'active' : ''}`} onClick={() => setFilter('out')}>Outbound</button>
            <button className={`tab-btn ${filter === 'sys' ? 'active' : ''}`} onClick={() => setFilter('sys')}>System</button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => ddpClient.clearLogs()}
            title="Clear Traffic Logs"
          >
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      <div style={{
        background: 'rgba(5, 7, 15, 0.9)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        flex: 1,
        minHeight: '480px',
        maxHeight: 'calc(100vh - 280px)',
        overflowY: 'auto',
        padding: '12px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px'
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            No DDP traffic logged matching filters.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isOut = log.type === 'out';
            const isIn = log.type === 'in';
            const isSys = log.type === 'sys';

            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  background: isOut
                    ? 'rgba(249, 115, 22, 0.06)'
                    : isIn
                    ? 'rgba(6, 182, 212, 0.06)'
                    : 'rgba(139, 92, 246, 0.06)',
                  borderLeft: `3px solid ${isOut ? '#f97316' : isIn ? '#06b6d4' : '#8b5cf6'}`
                }}
              >
                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', minWidth: '65px' }}>
                  {log.time}
                </span>

                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, minWidth: '70px', color: isOut ? '#f97316' : isIn ? '#06b6d4' : '#c084fc' }}>
                  {isOut && <ArrowUpRight size={12} />}
                  {isIn && <ArrowDownLeft size={12} />}
                  {isSys && <Info size={12} />}
                  {log.type.toUpperCase()}
                </span>

                <div style={{ flex: 1, wordBreak: 'break-all', color: isSys ? '#cbd5e1' : '#f1f5f9' }}>
                  {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(log.id, log.data)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: copiedId === log.id ? '#34d399' : 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: '4px'
                  }}
                  title="Copy JSON frame"
                >
                  {copiedId === log.id ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
                  {copiedId === log.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
