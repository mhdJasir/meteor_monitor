import React, { useState, useEffect } from 'react';
import { ddpClient } from './services/meteorDdp';
import { Header } from './components/Header';
import { ConnectionCard } from './components/ConnectionCard';
import { AuthCard } from './components/AuthCard';
import { MethodInvoker } from './components/MethodInvoker';
import { CollectionsViewer } from './components/CollectionsViewer';
import { DdpConsole } from './components/DdpConsole';
import { Network, Zap, Layers, Activity, Lock } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('connection'); // 'connection' | 'methods' | 'collections' | 'console'

  const [ddpState, setDdpState] = useState({
    status: ddpClient.status,
    sessionId: ddpClient.sessionId,
    url: ddpClient.url,
    token: ddpClient.token,
    userId: ddpClient.userId,
    userEmailOrName: ddpClient.userEmailOrName,
    isAuthenticated: ddpClient.isAuthenticated,
    collections: ddpClient.collections,
    logs: ddpClient.ddpLogs
  });

  useEffect(() => {
    // Subscribe to reactive DDP client updates
    const unsubscribe = ddpClient.subscribeEvents((newState) => {
      setDdpState(newState);
    });

    // Auto-connect to target Meteor server on launch if enabled
    const shouldAutoConnect = localStorage.getItem('meteor_auto_connect') !== 'false';
    if (shouldAutoConnect) {
      ddpClient.connect();
    }

    return () => unsubscribe();
  }, []);

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '12px 16px 20px' }}>
      <Header state={ddpState} ddpClient={ddpClient} />

      {/* Main App Navigation Tabs */}
      <div className="glass-panel" style={{ padding: '6px', marginBottom: '14px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
        <button
          className={`btn ${activeTab === 'connection' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('connection')}
          style={{ flex: 1, minWidth: '180px' }}
        >
          <Network size={16} /> Connection & Auth
        </button>

        <button
          className={`btn ${activeTab === 'methods' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('methods')}
          style={{ flex: 1, minWidth: '180px' }}
        >
          <Zap size={16} /> Methods & Subscriptions
        </button>

        <button
          className={`btn ${activeTab === 'collections' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('collections')}
          style={{ flex: 1, minWidth: '180px' }}
        >
          <Layers size={16} /> Collections Store
        </button>

        <button
          className={`btn ${activeTab === 'console' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('console')}
          style={{ flex: 1, minWidth: '180px' }}
        >
          <Activity size={16} /> DDP Traffic Console
        </button>
      </div>

      {/* Tab Contents */}
      <main>
        <div style={{ display: activeTab === 'connection' ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          <ConnectionCard state={ddpState} ddpClient={ddpClient} />
          <AuthCard state={ddpState} ddpClient={ddpClient} />
        </div>

        <div style={{ display: activeTab === 'methods' ? 'block' : 'none' }}>
          <MethodInvoker state={ddpState} ddpClient={ddpClient} />
        </div>

        <div style={{ display: activeTab === 'collections' ? 'block' : 'none' }}>
          <CollectionsViewer state={ddpState} ddpClient={ddpClient} />
        </div>

        <div style={{ display: activeTab === 'console' ? 'block' : 'none' }}>
          <DdpConsole state={ddpState} ddpClient={ddpClient} />
        </div>
      </main>
    </div>
  );
}
