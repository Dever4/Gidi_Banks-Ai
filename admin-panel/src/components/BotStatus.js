import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

function BotStatus() {
  const [status, setStatus] = useState({
    state: 'unknown',
    uptime: '0h 0m 0s',
    lastRestart: 'Unknown',
    version: 'Unknown'
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const [socketStatus, setSocketStatus] = useState('disconnected');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await axios.get('/api/status');
        setStatus(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching status:', err);
        setError('Failed to load bot status');
        setLoading(false);
      }
    };

    fetchStatus();

    // Set up Socket.IO connection for real-time updates
    // Use relative URL for Socket.IO to work in both development and production
    const socket = io(window.location.origin);

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setSocketStatus('connected');
    });

    socket.on('status', (data) => {
      setStatus(prevStatus => ({
        ...prevStatus,
        state: data.status
      }));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setSocketStatus('disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setSocketStatus('error');
    });

    // Listen for restart events
    socket.on('restart', (data) => {
      console.log('Received restart event:', data);
      setMessage('Bot is restarting. Please wait for it to reconnect.');
      setMessageType('info');

      // Update status to show connecting
      setStatus(prevStatus => ({
        ...prevStatus,
        state: 'connecting'
      }));

      // Refresh status after a short delay
      setTimeout(() => {
        fetchStatus();
      }, 5000);
    });

    // Poll for updates every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    // Set up a visual indicator for auto-refresh
    const updateTimeElement = document.getElementById('status-update-time');
    const updateCountdownElement = document.getElementById('status-update-countdown');

    if (updateTimeElement && updateCountdownElement) {
      // Update the last refresh time
      updateTimeElement.textContent = new Date().toLocaleTimeString();

      // Set up countdown for next refresh
      let countdown = 10;
      updateCountdownElement.textContent = countdown;

      const countdownInterval = setInterval(() => {
        countdown -= 1;
        if (countdown < 0) {
          countdown = 10;
          updateTimeElement.textContent = new Date().toLocaleTimeString();
        }
        updateCountdownElement.textContent = countdown;
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(countdownInterval);
        socket.disconnect();
      };
    }

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await axios.post('/api/restart');
      setMessage('Bot restart initiated. Please wait for it to reconnect.');
      setMessageType('info');

      // Update status to show connecting
      setStatus(prevStatus => ({
        ...prevStatus,
        state: 'connecting'
      }));
    } catch (err) {
      setMessage('Failed to restart bot');
      setMessageType('error');
    } finally {
      setRestarting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading bot status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="error-message">
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
          {error}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: '16px' }}
        >
          <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
          Refresh Status
        </button>
      </div>
    );
  }

  const getStatusIndicatorClass = () => {
    switch (status.state) {
      case 'open':
        return 'status-connected';
      case 'connecting':
        return 'status-connecting';
      default:
        return 'status-disconnected';
    }
  };

  const getStatusText = () => {
    switch (status.state) {
      case 'open':
        return 'Connected to WhatsApp';
      case 'connecting':
        return 'Connecting to WhatsApp...';
      case 'close':
        return 'Disconnected from WhatsApp';
      default:
        return 'Unknown Status: ' + status.state;
    }
  };

  return (
    <div>
      <div className="header">
        <h1>
          <i className="fas fa-info-circle" style={{ marginRight: '12px' }}></i>
          Bot Status
        </h1>
        <div>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--primary-color)',
              border: '1px solid var(--primary-color)'
            }}
          >
            <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`message ${messageType}`} style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          backgroundColor: messageType === 'success' ? 'rgba(37, 211, 102, 0.1)' :
                          messageType === 'info' ? 'rgba(0, 123, 255, 0.1)' :
                          'rgba(255, 0, 0, 0.1)',
          color: messageType === 'success' ? '#25D366' :
                messageType === 'info' ? '#007bff' :
                '#ff0000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <i className={`fas ${messageType === 'success' ? 'fa-check-circle' :
                          messageType === 'info' ? 'fa-info-circle' :
                          'fa-exclamation-circle'}`}
              style={{ marginRight: '8px' }}></i>
            {message}
          </div>
          <button
            onClick={() => setMessage('')}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: 'inherit',
              opacity: 0.7
            }}
          >
            ×
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-signal"></i>
          </div>
          <div className="stat-value">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className={`status-indicator ${getStatusIndicatorClass()}`} style={{ width: '16px', height: '16px', marginRight: '8px' }}></span>
              {status.state === 'open' ? 'Online' : status.state === 'connecting' ? 'Connecting' : 'Offline'}
            </div>
          </div>
          <div className="stat-label">Connection Status</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-clock"></i>
          </div>
          <div className="stat-value">{status.uptime}</div>
          <div className="stat-label">Uptime</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-history"></i>
          </div>
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>{status.lastRestart}</div>
          <div className="stat-label">Last Restart</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-code-branch"></i>
          </div>
          <div className="stat-value">{status.version}</div>
          <div className="stat-label">Version</div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
          <i className="fas fa-heartbeat" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
          Status Details
        </h2>

        <div className="status-container" style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <span className={`status-indicator ${getStatusIndicatorClass()}`}></span>
            <span style={{ fontWeight: 'bold', marginLeft: '8px', fontSize: '1.1rem' }}>{getStatusText()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', color: socketStatus === 'connected' ? 'var(--primary-color)' : '#999' }}>
            <i className="fas fa-plug" style={{ marginRight: '8px' }}></i>
            <span>WebSocket: {socketStatus === 'connected' ? 'Connected' : socketStatus === 'error' ? 'Error' : 'Disconnected'}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div className="card" style={{ margin: 0, padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--primary-color)' }}>
              <i className="fas fa-clock" style={{ marginRight: '8px' }}></i>
              Uptime
            </h3>
            <p>{status.uptime}</p>
          </div>

          <div className="card" style={{ margin: 0, padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--primary-color)' }}>
              <i className="fas fa-history" style={{ marginRight: '8px' }}></i>
              Last Restart
            </h3>
            <p>{status.lastRestart}</p>
          </div>

          <div className="card" style={{ margin: 0, padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--primary-color)' }}>
              <i className="fas fa-code-branch" style={{ marginRight: '8px' }}></i>
              Version
            </h3>
            <p>{status.version}</p>
          </div>

          <div className="card" style={{ margin: 0, padding: '16px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--primary-color)' }}>
              <i className="fas fa-server" style={{ marginRight: '8px' }}></i>
              Server
            </h3>
            <p>localhost:8080</p>
          </div>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={handleRestart}
            disabled={restarting}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            {restarting ? (
              <>
                <div className="loading-spinner" style={{ width: '16px', height: '16px', margin: '0 8px 0 0' }}></div>
                Restarting...
              </>
            ) : (
              <>
                <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
                Restart Bot
              </>
            )}
          </button>

          <button onClick={() => window.location.reload()}>
            <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}

export default BotStatus;
