import React from 'react';
import { Flame, Wifi, WifiOff, RefreshCw, User, LogOut, CheckCircle2 } from 'lucide-react';

export const Header = ({ state, ddpClient }) => {
  const isConnected = state.status === 'connected';
  const isConnecting = state.status === 'connecting';

  return (
    <header className="glass-panel" style={{ padding: '10px 18px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #f97316, #ea580c)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 15px rgba(249, 115, 22, 0.35)'
        }}>
          <Flame size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.35rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            Meteor DDP Studio
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Connect • Authenticate • Persist Tokens • Invoke Methods
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Active Target Server */}
        <div style={{
          fontSize: '0.82rem',
          fontFamily: 'var(--font-mono)',
          background: 'rgba(0, 0, 0, 0.4)',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          color: 'var(--text-muted)'
        }}>
          {state.url}
        </div>

        {/* Status Badge */}
        {isConnected ? (
          <span className="badge badge-connected">
            <span className="dot-indicator dot-connected"></span> Connected
          </span>
        ) : isConnecting ? (
          <span className="badge badge-connecting">
            <span className="dot-indicator dot-connecting"></span> Connecting...
          </span>
        ) : (
          <span className="badge badge-disconnected">
            <span className="dot-indicator dot-disconnected"></span> Disconnected
          </span>
        )}

        {/* User Session Badge */}
        {state.isAuthenticated && (
          <div className="badge badge-authenticated" title={`User ID: ${state.userId}`}>
            <User size={14} />
            <span>{state.userEmailOrName}</span>
          </div>
        )}
      </div>
    </header>
  );
};
