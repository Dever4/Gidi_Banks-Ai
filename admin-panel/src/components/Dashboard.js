import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState({
    users: 0,
    groups: 0,
    commands: 0,
    uptime: '0h 0m 0s'
  });
  const [botInstances, setBotInstances] = useState([]);
  const [activeBot, setActiveBot] = useState(null);
  const [botStatus, setBotStatus] = useState('unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);
  const socketRef = useRef(null);

  const [activatingBot, setActivatingBot] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/stats');
        setStats(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Failed to load dashboard data');
        setLoading(false);
      }
    };



    const fetchBots = async () => {
      try {
        const token = localStorage.getItem('token');

        // First try to get bot instances from the API
        try {
          const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/bots', {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (response.data && Array.isArray(response.data)) {
            setBotInstances(response.data);

            // Set active bot
            const activeBotInstance = response.data.find(bot => bot.isActive);
            if (activeBotInstance) {
              setActiveBot(activeBotInstance);
            }
            return; // Exit if successful
          }
        } catch (apiErr) {
          console.error('Error fetching bots from API:', apiErr);
          // Continue to fallback method
        }

        // Fallback: Get bot status from the status endpoint
        const statusResponse = await axios.get('https://gidibanks-ai-production.up.railway.app/api/status');
        if (statusResponse.data) {
          const { state, phoneNumber } = statusResponse.data;

          // Create a default bot instance
          const defaultBot = {
            id: 1,
            name: 'WhatsApp Bot',
            status: state || 'unknown',
            isActive: true,
            phoneNumber: phoneNumber || null
          };

          setBotInstances([defaultBot]);
          setActiveBot(defaultBot);
        }
      } catch (err) {
        console.error('Error fetching bot status:', err);

        // Create a minimal fallback bot instance
        const fallbackBot = {
          id: 1,
          name: 'WhatsApp Bot',
          status: 'unknown',
          isActive: true
        };

        setBotInstances([fallbackBot]);
        setActiveBot(fallbackBot);
      }
    };

    // Set up Socket.IO connection for real-time updates
    // Use relative URL to connect to the current host
    socketRef.current = io(window.location.origin);

    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server for dashboard updates');
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      setError('Failed to connect to WebSocket server. Dashboard updates may not be real-time.');
    });

    // Listen for bot instances updates
    socketRef.current.on('botInstances', (updatedInstances) => {
      console.log('Received bot instances update:', updatedInstances);
      setBotInstances(updatedInstances);

      // Update active bot
      const activeBotInstance = updatedInstances.find(bot => bot.isActive);
      if (activeBotInstance) {
        setActiveBot(activeBotInstance);
      }
    });

    // Listen for status updates
    socketRef.current.on('status', (data) => {
      console.log('Received status update:', data);
      setBotStatus(data.status);

      // Refresh stats when status changes to connected
      if (data.status === 'open') {
        fetchStats();
      }
    });

    // Listen for restart events
    socketRef.current.on('restart', (data) => {
      console.log('Received restart event:', data);
      setMessage('Bot is restarting. Please wait for it to reconnect.');
      setMessageType('info');
      setBotStatus('connecting');

      // Refresh data after a short delay
      setTimeout(() => {
        fetchStats();
        fetchBots();
      }, 5000);
    });

    fetchStats();

    fetchBots();

    // Poll for updates every 15 seconds
    const statsInterval = setInterval(fetchStats, 15000);


    // Set up a visual indicator for auto-refresh
    const updateTimeElement = document.getElementById('last-update-time');
    const updateCountdownElement = document.getElementById('update-countdown');

    if (updateTimeElement && updateCountdownElement) {
      // Update the last refresh time
      updateTimeElement.textContent = new Date().toLocaleTimeString();

      // Set up countdown for next refresh
      let countdown = 15;
      updateCountdownElement.textContent = countdown;

      const countdownInterval = setInterval(() => {
        countdown -= 1;
        if (countdown < 0) {
          countdown = 15;
          updateTimeElement.textContent = new Date().toLocaleTimeString();
        }
        updateCountdownElement.textContent = countdown;
      }, 1000);

      return () => {
        clearInterval(statsInterval);

        clearInterval(countdownInterval);
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
      };
    }

    return () => {
      clearInterval(statsInterval);

      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await axios.post('https://gidibanks-ai-production.up.railway.app/api/restart');
      setMessage('Bot restart initiated. Please wait for it to reconnect.');
      setMessageType('info');
      setBotStatus('connecting');
    } catch (err) {
      setMessage('Failed to restart bot');
      setMessageType('error');
    } finally {
      setRestarting(false);
    }
  };

  const activateBot = async (botId) => {
    try {
      setActivatingBot(true);
      setMessage('');

      const token = localStorage.getItem('token');
      const response = await axios.post(`https://gidibanks-ai-production.up.railway.app/api/bots/${botId}/activate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Show message about QR code if needed
      if (response.data.requiresNewQrCode) {
        setMessage(`Bot ${botId} activated. Restart the bot to scan a new QR code for this instance.`);
        setMessageType('info');
      } else {
        setMessage(`Bot ${botId} activated. Restart the bot to apply changes.`);
        setMessageType('success');
      }

      // No need to manually fetch bot instances here as the server will emit a 'botInstances' event
      // that will be caught by the Socket.IO listener and update the state automatically

      // Still, let's update the local state to provide immediate feedback
      setBotInstances(prevInstances => {
        const updatedInstances = prevInstances.map(bot => ({
          ...bot,
          isActive: bot.id === botId
        }));

        // Update active bot
        const activeBotInstance = updatedInstances.find(bot => bot.isActive);
        if (activeBotInstance) {
          setActiveBot(activeBotInstance);
        }

        return updatedInstances;
      });
    } catch (err) {
      console.error(`Error activating bot ${botId}:`, err);
      setMessage(`Failed to activate bot ${botId}`);
      setMessageType('error');
    } finally {
      setActivatingBot(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading dashboard data...</p>
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
          Refresh Dashboard
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>
          <i className="fas fa-tachometer-alt" style={{ marginRight: '12px' }}></i>
          Dashboard
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

      <div className="dashboard-grid">


        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-users-cog"></i>
          </div>
          <div className="stat-value">{stats.groups}</div>
          <div className="stat-label">Total Groups</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-terminal"></i>
          </div>
          <div className="stat-value">{stats.commands}</div>
          <div className="stat-label">Available Commands</div>
          <Link to="/commands" style={{
            display: 'inline-block',
            marginTop: '12px',
            color: 'var(--primary-color)',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}>
            View Commands <i className="fas fa-arrow-right" style={{ fontSize: '0.8rem' }}></i>
          </Link>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-clock"></i>
          </div>
          <div className="stat-value">{stats.uptime}</div>
          <div className="stat-label">Uptime</div>
          <Link to="/status" style={{
            display: 'inline-block',
            marginTop: '12px',
            color: 'var(--primary-color)',
            textDecoration: 'none',
            fontSize: '0.9rem'
          }}>
            View Status <i className="fas fa-arrow-right" style={{ fontSize: '0.8rem' }}></i>
          </Link>
        </div>
      </div>

      {message && (
        <div className={`message ${messageType}`}>
          <i className={`fas ${messageType === 'success' ? 'fa-check-circle' : messageType === 'info' ? 'fa-info-circle' : 'fa-exclamation-circle'}`}></i>
          {message}
          <button className="close-message" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
          <i className="fas fa-bolt" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button onClick={handleRestart} disabled={restarting}>
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
          <Link to="/qrcode">
            <button>
              <i className="fas fa-qrcode" style={{ marginRight: '8px' }}></i>
              View QR Code
            </button>
          </Link>
          <Link to="/broadcast">
            <button>
              <i className="fas fa-broadcast-tower" style={{ marginRight: '8px' }}></i>
              Broadcast Message
            </button>
          </Link>
          <button disabled>
            <i className="fas fa-file-alt" style={{ marginRight: '8px' }}></i>
            View Logs
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
          <i className="fas fa-info-circle" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
          Bot Information
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Status</h3>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className={`status-indicator status-${botStatus === 'open' ? 'connected' : botStatus === 'connecting' ? 'initializing' : 'disconnected'}`}></span>
              <span>{botStatus === 'open' ? 'Connected' : botStatus === 'connecting' ? 'Connecting' : 'Disconnected'}</span>
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Version</h3>
            <div>1.0.0</div>
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Last Restart</h3>
            <div>Today at {new Date().toLocaleTimeString()}</div>
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Server</h3>
            <div>{window.location.host}</div>
          </div>
          {activeBot && (
            <div>
              <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Active Bot</h3>
              <div>{activeBot.name} {activeBot.phoneNumber ? `(${activeBot.phoneNumber})` : ''}</div>
            </div>
          )}
        </div>
      </div>

      {/* Bot Instances Section */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <i className="fas fa-robot" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
            Bot Instances
          </h2>
          <Link to="/bots">
            <button style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
              <i className="fas fa-cog" style={{ marginRight: '6px' }}></i>
              Manage Bots
            </button>
          </Link>
        </div>

        <div className="bot-instances-grid">
          {botInstances.length === 0 ? (
            <div className="no-data-message">No bot instances found</div>
          ) : (
            botInstances.map(bot => (
              <div key={bot.id} className={`bot-instance-card ${bot.isActive ? 'active' : ''} ${bot.status}`}>
                <div className="bot-instance-name">
                  <span className={`status-indicator ${bot.status}`}></span>
                  {bot.name}
                </div>
                <div className="bot-instance-details">
                  <div>Status: <span className={bot.status}>{bot.status}</span></div>
                  {bot.phoneNumber && <div>Phone: {bot.phoneNumber}</div>}
                  {bot.isActive ? (
                    <div className="active-badge">Active</div>
                  ) : (
                    <button
                      className="activate-button-small"
                      onClick={() => activateBot(bot.id)}
                      disabled={activatingBot}
                    >
                      {activatingBot ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>


    </div>
  );
}

export default Dashboard;
