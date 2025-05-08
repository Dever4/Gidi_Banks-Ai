import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import { Link } from 'react-router-dom';

// Function to load QRCode.js from CDN
const loadQRCodeScript = () => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.QRCode) {
      resolve(window.QRCode);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js';
    script.async = true;
    script.onload = () => resolve(window.QRCode);
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

function QRCode() {
  const [qrCode, setQrCode] = useState('');
  const [status, setStatus] = useState('waiting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); // QR code typically expires in 60 seconds
  const [qrGenerated, setQrGenerated] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [botInstances, setBotInstances] = useState([]);
  const [activeBot, setActiveBot] = useState(null);
  const [activatingBot, setActivatingBot] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const timerRef = useRef(null);
  const socketRef = useRef(null);
  const autoRefreshIntervalRef = useRef(null);
  const canvasRef = useRef(null);

  // Function to generate QR code from raw data using client-side QRCode.js
  const generateQRCodeFromRawData = async (rawData) => {
    try {
      console.log('Generating QR code from raw data:', rawData);

      // Load QRCode.js from CDN if not already loaded
      if (!window.QRCode) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js';
        script.async = true;

        // Wait for script to load
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });

        console.log('QRCode.js loaded successfully');
      }

      // Create a temporary canvas element
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;

      // Generate QR code on canvas
      await new Promise((resolve, reject) => {
        window.QRCode.toCanvas(canvas, rawData, {
          width: 256,
          margin: 4,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        }, (error) => {
          if (error) {
            console.error('Error generating QR code:', error);
            reject(error);
            return;
          }
          resolve();
        });
      });

      // Convert canvas to base64 image
      const dataUrl = canvas.toDataURL('image/png');
      setQrCode(dataUrl);
      setQrGenerated(new Date());
      setTimeLeft(60); // Reset timer to 60 seconds
      console.log('QR code generated on client side successfully');
    } catch (error) {
      console.error('Error generating QR code:', error);
      setMessage('Failed to generate QR code. Please try again.');
      setMessageType('error');
    }
  };

  // Function to fetch bot instances
  const fetchBotInstances = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/bots', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setBotInstances(response.data);

      // Set active bot
      const activeBotInstance = response.data.find(bot => bot.isActive);
      if (activeBotInstance) {
        setActiveBot(activeBotInstance.id);
      }
    } catch (err) {
      console.error('Error fetching bot instances:', err);
      setError('Failed to load bot instances');
    }
  };

  // Function to activate a bot instance
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

      // Update active bot
      setActiveBot(botId);

      // Refresh QR code after activation
      fetchQrCode();
    } catch (err) {
      console.error(`Error activating bot ${botId}:`, err);
      setMessage(`Failed to activate bot ${botId}`);
      setMessageType('error');
    } finally {
      setActivatingBot(false);
    }
  };

  // Function to fetch QR code - Railway-compatible
  const fetchQrCode = async () => {
    setRefreshing(true);
    try {
      // First get the status to check if already connected
      const statusResponse = await axios.get('https://gidibanks-ai-production.up.railway.app/api/status');
      setStatus(statusResponse.data.state);

      if (statusResponse.data.phoneNumber) {
        setPhoneNumber(statusResponse.data.phoneNumber);
      }

      // Only fetch QR code if not connected
      if (statusResponse.data.state !== 'open') {
        const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/qrcode');
        console.log('QR code API response:', response.data);

        // Handle the QR code data
        if (response.data.qrCode) {
          // If we have a base64 QR code image, use it directly
          setQrCode(response.data.qrCode);
          setQrGenerated(new Date());
          setTimeLeft(60); // Reset timer to 60 seconds
          console.log('Using provided QR code image from API');
        } else if (response.data.qrRaw) {
          // If we only have raw QR data, generate the QR code on the client side
          // This is a fallback for Railway deployments where image generation might fail
          console.log('Raw QR data received from API, generating QR code on client side');

          // Generate QR code on client side
          generateQRCodeFromRawData(response.data.qrRaw);
        } else if (response.data.message) {
          // If there's a message, display it
          setMessage(response.data.message);
          setMessageType('info');
        }
      } else {
        // If connected, clear QR code
        setQrCode('');
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching QR code:', err);
      setError('Failed to load QR code');
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  };

  // Initial setup
  useEffect(() => {
    // Initial fetch of QR code and bot instances
    fetchQrCode();
    fetchBotInstances();

    // Set up auto-refresh every 45 seconds if not connected
    autoRefreshIntervalRef.current = setInterval(() => {
      if (status !== 'open' && status !== 'connected') {
        fetchQrCode();
      }
    }, 45000); // 45 seconds

    // Set up Socket.IO connection for real-time updates
    // Use relative URL for Socket.IO to work in both development and production
    socketRef.current = io(window.location.origin);

    socketRef.current.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socketRef.current.on('qrcode', (data) => {
      console.log('Received QR code data:', data.source || 'unknown source');

      // Handle the QR code data
      if (data.qrCode) {
        // If we have a base64 QR code image, use it directly
        setQrCode(data.qrCode);
        console.log('Using provided QR code image');
      } else if (data.qrRaw) {
        // If we only have raw QR data, generate the QR code on the client side
        // This is a fallback for Railway deployments where image generation might fail
        console.log('Using raw QR data to generate QR code');

        // Generate QR code on client side
        generateQRCodeFromRawData(data.qrRaw);
      }

      setStatus(data.status);
      setQrGenerated(new Date());
      setTimeLeft(60); // Reset timer to 60 seconds
      setRefreshing(false);

      // If the QR code is for a specific instance, update that information
      if (data.instanceId) {
        setActiveBot(data.instanceId);
      }
    });

    socketRef.current.on('status', (data) => {
      setStatus(data.status);

      // If connected, fetch status to get phone number
      if (data.status === 'open') {
        axios.get('https://gidibanks-ai-production.up.railway.app/api/status').then(response => {
          if (response.data.phoneNumber) {
            setPhoneNumber(response.data.phoneNumber);
          }
        }).catch(err => {
          console.error('Error fetching status after connection:', err);
        });
      }
    });

    // Listen for bot instances updates
    socketRef.current.on('botInstances', (updatedInstances) => {
      console.log('Received bot instances update:', updatedInstances);
      setBotInstances(updatedInstances);

      // Update active bot if needed
      const activeBotInstance = updatedInstances.find(bot => bot.isActive);
      if (activeBotInstance) {
        setActiveBot(activeBotInstance.id);
      }

      // If we have a new active bot, refresh the QR code
      if (activeBotInstance && activeBotInstance.id !== activeBot) {
        console.log('Active bot changed, refreshing QR code');
        fetchQrCode();
      }
    });

    // Listen for restart events
    socketRef.current.on('restart', (data) => {
      console.log('Received restart event:', data);
      setMessage('Bot is restarting. Please wait for the QR code to appear.');
      setMessageType('info');

      // Clear QR code and reset status
      setQrCode('');
      setStatus('waiting');

      // Fetch QR code and bot instances after a short delay
      setTimeout(() => {
        fetchQrCode();
        fetchBotInstances();
      }, 5000);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      setError('WebSocket connection error');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, []);

  // Timer for QR code expiration
  useEffect(() => {
    if (qrCode && status !== 'open' && status !== 'connected') {
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Start a new timer
      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          if (prevTime <= 1) {
            // QR code expired, fetch a new one
            fetchQrCode();
            return 60;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else if (timerRef.current && (status === 'open' || status === 'connected')) {
      // Stop the timer if connected
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [qrCode, status]);

  const getStatusIndicatorClass = () => {
    switch (status) {
      case 'open':
      case 'connected':
        return 'status-connected';
      case 'connecting':
        return 'status-connecting';
      default:
        return 'status-disconnected';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'open':
      case 'connected':
        return 'Connected to WhatsApp';
      case 'connecting':
        return 'Connecting to WhatsApp...';
      case 'waiting':
        return 'Waiting for QR code...';
      case 'close':
        return 'Disconnected from WhatsApp';
      default:
        return 'Status: ' + status;
    }
  };

  const handleRefresh = () => {
    fetchQrCode();
  };

  const handleDisconnect = async () => {
    setShowDisconnectConfirm(true);
  };

  const confirmDisconnect = async () => {
    try {
      await axios.post('https://gidibanks-ai-production.up.railway.app/api/logout');
      setStatus('disconnected');
      setPhoneNumber(null);
      setQrCode('');
      fetchQrCode();
      setShowDisconnectConfirm(false);
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect. Please try again.');
    }
  };

  const cancelDisconnect = () => {
    setShowDisconnectConfirm(false);
  };

  const [restarting, setRestarting] = useState(false);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await axios.post('https://gidibanks-ai-production.up.railway.app/api/restart');
      setMessage('Bot restart initiated. Please wait for the QR code to appear.');
      setMessageType('info');

      // Clear QR code and reset status
      setQrCode('');
      setStatus('waiting');

      // Fetch QR code after a short delay to allow the bot to restart
      setTimeout(() => {
        fetchQrCode();
        setRestarting(false);
      }, 5000);
    } catch (err) {
      console.error('Error restarting bot:', err);
      setError('Failed to restart bot');
      setRestarting(false);
    }
  };

  // Format time left as MM:SS
  const formatTimeLeft = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage for the timer
  const progressPercentage = (timeLeft / 60) * 100;

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading QR code...</p>
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
        <button onClick={handleRefresh} style={{ marginTop: '16px' }}>
          <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>
          <i className="fas fa-qrcode" style={{ marginRight: '12px' }}></i>
          WhatsApp QR Code
        </h1>
        <div className="status-container">
          <span className={`status-indicator ${getStatusIndicatorClass()}`}></span>
          <span>{getStatusText()}</span>
        </div>
      </div>

      {/* Bot Instance Selector */}
      {botInstances.length > 1 && (
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
            <i className="fas fa-robot" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
            Bot Instances
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {botInstances.map(bot => (
              <div
                key={bot.id}
                className={`bot-instance-card ${bot.isActive ? 'active' : ''} ${bot.status}`}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: bot.id === activeBot ? '2px solid var(--primary-color)' : '1px solid #ddd',
                  backgroundColor: bot.isActive ? 'rgba(37, 211, 102, 0.1)' : '#f9f9f9',
                  cursor: 'pointer',
                  minWidth: '200px',
                  position: 'relative'
                }}
                onClick={() => !bot.isActive && activateBot(bot.id)}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '8px',
                  fontWeight: 'bold'
                }}>
                  <span style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: bot.status === 'connected' ? '#25D366' :
                                    bot.status === 'initializing' ? '#FFA500' : '#ccc',
                    marginRight: '8px'
                  }}></span>
                  {bot.name || `Bot ${bot.id}`}
                  {bot.isActive && (
                    <span style={{
                      fontSize: '0.7rem',
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      marginLeft: '8px'
                    }}>Active</span>
                  )}
                </div>
                {bot.phoneNumber && (
                  <div style={{ fontSize: '0.9rem' }}>
                    <i className="fas fa-phone" style={{ marginRight: '6px', opacity: 0.7 }}></i>
                    {bot.phoneNumber}
                  </div>
                )}
                {!bot.isActive && (
                  <button
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      backgroundColor: 'var(--primary-color)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      activateBot(bot.id);
                    }}
                    disabled={activatingBot}
                  >
                    {activatingBot ? 'Activating...' : 'Activate'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message display */}
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

      <div className="card qr-container">
        {status === 'open' || status === 'connected' ? (
          <div className="card" style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
            <div style={{ fontSize: '64px', color: 'var(--primary-color)', marginBottom: '16px' }}>
              <i className="fas fa-check-circle"></i>
            </div>
            <h2 style={{ color: 'var(--primary-color)', marginBottom: '16px' }}>WhatsApp Connected</h2>
            <p>Your WhatsApp bot is successfully connected and running.</p>

            {/* Show active bot instance */}
            {botInstances.length > 0 && activeBot && (
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(37, 211, 102, 0.1)',
                borderRadius: '8px',
                margin: '16px 0'
              }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                  <i className="fas fa-robot" style={{ marginRight: '8px' }}></i>
                  Active Bot Instance
                </p>
                <p style={{ fontSize: '1.2rem' }}>
                  {botInstances.find(bot => bot.id === activeBot)?.name || `Bot ${activeBot}`}
                </p>
              </div>
            )}

            {phoneNumber && (
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(37, 211, 102, 0.1)',
                borderRadius: '8px',
                margin: '16px 0'
              }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                  <i className="fas fa-phone" style={{ marginRight: '8px' }}></i>
                  Connected Number
                </p>
                <p style={{ fontSize: '1.2rem' }}>+{phoneNumber}</p>
              </div>
            )}

            <p style={{ marginTop: '16px', fontSize: '0.9rem', color: '#666' }}>
              <i className="fas fa-clock" style={{ marginRight: '8px' }}></i>
              Connected since: {qrGenerated ? new Date(qrGenerated).toLocaleTimeString() : 'Unknown'}
            </p>

            {showDisconnectConfirm ? (
              <div style={{ marginTop: '24px' }}>
                <p style={{ marginBottom: '16px', color: '#FF0000' }}>
                  <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }}></i>
                  Are you sure you want to disconnect? This will log out the current WhatsApp session.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={confirmDisconnect}
                    style={{ backgroundColor: '#FF0000' }}
                  >
                    <i className="fas fa-sign-out-alt" style={{ marginRight: '8px' }}></i>
                    Yes, Disconnect
                  </button>
                  <button
                    onClick={cancelDisconnect}
                    style={{ backgroundColor: '#666' }}
                  >
                    <i className="fas fa-times" style={{ marginRight: '8px' }}></i>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                <button
                  onClick={handleDisconnect}
                  style={{
                    backgroundColor: '#FF5722'
                  }}
                >
                  <i className="fas fa-sign-out-alt" style={{ marginRight: '8px' }}></i>
                  Disconnect
                </button>
                <button
                  onClick={handleRestart}
                  disabled={restarting}
                  style={{
                    backgroundColor: 'var(--primary-color)'
                  }}
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
              </div>
            )}
          </div>
        ) : qrCode ? (
          <>
            <div className="card" style={{
              padding: '16px',
              marginBottom: '16px',
              backgroundColor: '#f9f9f9',
              position: 'relative'
            }}>
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="WhatsApp QR Code"
                className="qr-image"
              />

              {/* QR Code Timer */}
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                right: '16px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#eee',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    width: `${progressPercentage}%`,
                    height: '100%',
                    backgroundColor: progressPercentage > 30
                      ? 'var(--primary-color)'
                      : progressPercentage > 15
                        ? '#FFA500'
                        : '#FF0000',
                    transition: 'width 1s linear'
                  }}></div>
                </div>
                <div style={{
                  fontSize: '0.9rem',
                  color: progressPercentage > 30 ? '#666' : '#FF0000',
                  fontWeight: progressPercentage > 30 ? 'normal' : 'bold'
                }}>
                  <i className="fas fa-clock" style={{ marginRight: '8px' }}></i>
                  QR Code expires in: {formatTimeLeft(timeLeft)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', maxWidth: '400px', margin: '0 auto' }}>
              <h3 style={{ marginBottom: '12px', color: 'var(--primary-color)' }}>
                <i className="fas fa-qrcode" style={{ marginRight: '8px' }}></i>
                Connect WhatsApp Account
              </h3>

              <div style={{
                backgroundColor: '#f9f9f9',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                textAlign: 'left'
              }}>
                <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>To connect your WhatsApp account:</p>
                <ol style={{ paddingLeft: '24px', marginBottom: '0' }}>
                  <li>Open WhatsApp on your phone</li>
                  <li>Go to Settings <i className="fas fa-cog"></i> &gt; Linked Devices</li>
                  <li>Tap on "Link a Device"</li>
                  <li>Scan the QR code displayed here</li>
                </ol>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: '#666'
              }}>
                <i className="fas fa-shield-alt"></i>
                <span style={{ fontSize: '0.9rem' }}>Your chats are end-to-end encrypted</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '64px', color: '#FFA500', marginBottom: '16px' }}>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h2 style={{ marginBottom: '16px' }}>No QR Code Available</h2>
            <p>The bot might already be connected or there was an error generating the QR code.</p>
          </div>
        )}

        {qrCode && status !== 'open' && status !== 'connected' && (
          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px'
          }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--primary-color)',
                border: '1px solid var(--primary-color)',
                padding: '8px 16px'
              }}
            >
              {refreshing ? (
                <>
                  <div className="loading-spinner" style={{ width: '16px', height: '16px', margin: '0 8px 0 0' }}></div>
                  Generating New QR Code...
                </>
              ) : (
                <>
                  <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
                  Generate New QR Code
                </>
              )}
            </button>

            <button
              onClick={handleRestart}
              disabled={restarting}
              style={{
                backgroundColor: 'var(--primary-color)',
                color: 'white',
                padding: '8px 16px'
              }}
            >
              {restarting ? (
                <>
                  <div className="loading-spinner" style={{ width: '16px', height: '16px', margin: '0 8px 0 0' }}></div>
                  Restarting Bot...
                </>
              ) : (
                <>
                  <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
                  Restart Bot
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QRCode;
