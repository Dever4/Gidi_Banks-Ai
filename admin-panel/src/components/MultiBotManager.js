import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import './MultiBotManager.css';

function MultiBotManager() {
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [activeBot, setActiveBot] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    fetchBots();

    // Set up Socket.IO connection for real-time updates
    socketRef.current = io('https://gidibanks-ai-production.up.railway.app');

    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server for bot updates');
    });

    // Listen for bot instances updates
    socketRef.current.on('botInstances', (updatedInstances) => {
      console.log('Received bot instances update:', updatedInstances);
      setBots(updatedInstances);

      // Update active bot
      const activeBotId = updatedInstances.find(bot => bot.isActive)?.id || null;
      setActiveBot(activeBotId);
    });

    // Listen for status updates
    socketRef.current.on('status', (data) => {
      console.log('Received status update:', data);
      if (data.instanceId) {
        setBots(prevBots => prevBots.map(bot => {
          if (bot.id === data.instanceId) {
            return {
              ...bot,
              status: data.status
            };
          }
          return bot;
        }));
      }
    });

    // Clean up on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchBots = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/bots', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBots(response.data);

      // Set active bot
      const activeBotId = response.data.find(bot => bot.isActive)?.id || null;
      setActiveBot(activeBotId);

      setError('');
    } catch (err) {
      console.error('Error fetching bots:', err);
      setError('Failed to load bot instances');
    } finally {
      setLoading(false);
    }
  };

  const activateBot = async (botId) => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const response = await axios.post(`https://gidibanks-ai-production.up.railway.app/api/bots/${botId}/activate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Update local state immediately for better UX
      setActiveBot(botId);
      setBots(prevBots => prevBots.map(bot => ({
        ...bot,
        isActive: bot.id === botId
      })));

      // Show message about QR code if needed
      if (response.data.requiresNewQrCode) {
        setMessage(`Bot ${botId} activated. Restart the bot to scan a new QR code for this instance.`);
        setMessageType('info');
      } else {
        setMessage(`Bot ${botId} activated. Restart the bot to apply changes.`);
        setMessageType('success');
      }

      // Socket.IO will handle the real-time update of the bot instances
      // But we can also refresh the data to be sure
      fetchBots();

    } catch (err) {
      console.error(`Error activating bot ${botId}:`, err);
      setError('Failed to activate bot');
    }
  };

  const addBot = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('https://gidibanks-ai-production.up.railway.app/api/bots', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Add new bot to the list
      setBots(prevBots => [...prevBots, response.data]);

    } catch (err) {
      console.error('Error adding new bot:', err);
      setError('Failed to add new bot instance');
    }
  };

  const deleteBot = async (botId) => {
    if (!window.confirm('Are you sure you want to delete this bot instance?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`https://gidibanks-ai-production.up.railway.app/api/bots/${botId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Remove bot from the list
      setBots(prevBots => prevBots.filter(bot => bot.id !== botId));

      // If active bot was deleted, set active to null
      if (activeBot === botId) {
        setActiveBot(null);
      }

    } catch (err) {
      console.error(`Error deleting bot ${botId}:`, err);
      setError('Failed to delete bot instance');
    }
  };

  return (
    <div className="multibot-container">
      <div className="multibot-header">
        <h2>Bot Instances</h2>
        {bots.length < 4 && (
          <button
            className="add-bot-button"
            onClick={addBot}
            disabled={loading}
          >
            <i className="fas fa-plus"></i> Add Bot
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}
      {message && (
        <div className={`message ${messageType}`}>
          <i className={`fas ${messageType === 'success' ? 'fa-check-circle' : messageType === 'info' ? 'fa-info-circle' : 'fa-exclamation-circle'}`}></i>
          {message}
          <button className="close-message" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading bot instances...</div>
      ) : (
        <div className="bot-list">
          {bots.length === 0 ? (
            <div className="no-bots">
              <p>No bot instances found. Click "Add Bot" to create your first instance.</p>
            </div>
          ) : (
            bots.map(bot => (
              <div
                key={bot.id}
                className={`bot-card ${bot.isActive ? 'active' : ''} ${bot.status}`}
              >
                <div className="bot-info">
                  <div className="bot-name">
                    <span className={`status-indicator ${bot.status}`}></span>
                    {bot.name || `Bot ${bot.id}`}
                  </div>
                  <div className="bot-status">
                    Status: <span className={bot.status}>{bot.status}</span>
                  </div>
                  {bot.phoneNumber && (
                    <div className="bot-phone">
                      Phone: <span>{bot.phoneNumber}</span>
                    </div>
                  )}
                  {bot.lastActive && (
                    <div className="bot-last-active">
                      Last Active: <span>{new Date(bot.lastActive).toLocaleString()}</span>
                    </div>
                  )}
                  {bot.isActive && (
                    <div className="bot-active-indicator">
                      <span className="active-dot"></span> Currently Active
                    </div>
                  )}
                </div>
                <div className="bot-actions">
                  {!bot.isActive && (
                    <button
                      className="activate-button"
                      onClick={() => activateBot(bot.id)}
                      disabled={bot.status === 'initializing'}
                    >
                      Activate
                    </button>
                  )}
                  {bot.isActive && (
                    <span className="active-badge">Active</span>
                  )}
                  <button
                    className="delete-button"
                    onClick={() => deleteBot(bot.id)}
                    disabled={bot.isActive}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
                {bot.status === 'disconnected' && !bot.phoneNumber && (
                  <div className="bot-scan-info">
                    <p>Restart the bot to scan QR code and connect this instance</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <div className="multibot-info">
        <p><i className="fas fa-info-circle"></i> You can create up to 4 bot instances. If one gets banned, you can easily activate a backup.</p>
      </div>
    </div>
  );
}

export default MultiBotManager;
