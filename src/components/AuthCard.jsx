import React, { useState } from 'react';
import { Lock, Mail, User, Key, Eye, EyeOff, LogIn, LogOut, CheckCircle, ShieldAlert, Database } from 'lucide-react';

export const AuthCard = ({ state, ddpClient }) => {
  const [authMode, setAuthMode] = useState('token'); // 'token' | 'email' | 'username'
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState(state.token || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (state.status !== 'connected') {
      setErrorMsg('Please connect to a Meteor DDP server first.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (authMode === 'token') {
        if (!tokenInput.trim()) {
          setErrorMsg('Please enter a valid login token.');
          setLoading(false);
          return;
        }
        await ddpClient.resumeLogin(tokenInput.trim());
        setSuccessMsg('Session resumed successfully with token!');
      } else {
        if (!identity.trim() || !password) {
          setErrorMsg('Please enter both identity and password.');
          setLoading(false);
          return;
        }
        await ddpClient.loginWithPassword({
          identity: identity.trim(),
          password,
          authType: authMode
        });
        setSuccessMsg('Authentication successful! Token saved.');
        setPassword('');
      }
    } catch (err) {
      setErrorMsg(err.reason || err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await ddpClient.logout();
      setSuccessMsg('Logged out successfully.');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Lock size={20} color="var(--color-accent)" />
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Authentication & Tokens</h2>
        </div>

        {/* Auth Mode Toggles */}
        {!state.isAuthenticated && (
          <div className="tab-group">
            <button
              className={`tab-btn ${authMode === 'token' ? 'active' : ''}`}
              onClick={() => { setAuthMode('token'); setErrorMsg(''); }}
            >
              Token
            </button>
            <button
              className={`tab-btn ${authMode === 'email' ? 'active' : ''}`}
              onClick={() => { setAuthMode('email'); setErrorMsg(''); }}
            >
              Email
            </button>
            <button
              className={`tab-btn ${authMode === 'username' ? 'active' : ''}`}
              onClick={() => { setAuthMode('username'); setErrorMsg(''); }}
            >
              Username
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          color: '#fda4af',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <ShieldAlert size={16} />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          color: '#6ee7b7',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.85rem',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle size={16} />
          {successMsg}
        </div>
      )}

      {state.isAuthenticated ? (
        /* Authenticated State & Token Details */
        <div>
          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#c084fc', fontWeight: 600 }}>
              <Key size={18} /> Active Meteor DDP Auth Session
            </div>

            <div style={{ display: 'grid', gap: '8px', fontSize: '0.85rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Identity:</span>{' '}
                <strong style={{ color: '#fff' }}>{state.userEmailOrName}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>User ID:</span>{' '}
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--color-cyan)' }}>
                  {state.userId}
                </code>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Persistent Login Token:</span>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  wordBreak: 'break-all',
                  marginTop: '4px',
                  color: 'var(--color-primary)'
                }}>
                  {state.token}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Database size={12} /> Auto-saved in LocalStorage (re-used automatically on reconnect).
            </div>
          </div>

          <button
            className="btn btn-danger"
            onClick={handleLogout}
            disabled={loading}
            style={{ width: '100%' }}
          >
            <LogOut size={16} /> Logout & Clear Stored Tokens
          </button>
        </div>
      ) : (
        /* Login Form */
        <form onSubmit={handleLogin}>
          {authMode === 'token' ? (
            <div className="form-group">
              <label className="form-label">Meteor Login Token</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '38px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste localStorage.getItem('Meteor.loginToken') here"
                  required
                />
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Key size={16} />
                </div>
              </div>
              <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                Copy from browser console: <code>localStorage.getItem('Meteor.loginToken')</code>
              </small>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">
                  {authMode === 'email' ? 'Email Address' : 'Username'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={authMode === 'email' ? 'email' : 'text'}
                    className="form-input"
                    style={{ paddingLeft: '38px' }}
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder={authMode === 'email' ? 'user@example.com' : 'username'}
                    required
                  />
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    {authMode === 'email' ? <Mail size={16} /> : <User size={16} />}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    style={{ paddingLeft: '38px', paddingRight: '38px' }}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                    <Lock size={16} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || state.status !== 'connected'}
            style={{ width: '100%', marginTop: '8px' }}
          >
            <LogIn size={16} /> {loading ? 'Authenticating...' : authMode === 'token' ? 'Resume Session with Token' : `Log In with ${authMode === 'email' ? 'Email' : 'Username'}`}
          </button>
        </form>
      )}
    </div>
  );
};
