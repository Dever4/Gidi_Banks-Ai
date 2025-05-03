import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Broadcast.css';

function Broadcast() {
  const [message, setMessage] = useState('');
  const [groups, setGroups] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectAll, setSelectAll] = useState(false);
  const [broadcastType, setBroadcastType] = useState('selected'); // 'all', 'selected'

  // Fetch groups when component mounts
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/groups', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setGroups(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching groups:', err);
        setError('Failed to load groups. Please try again.');
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  // Handle select all checkbox
  useEffect(() => {
    if (selectAll) {
      setSelectedGroups(groups.map(group => group.id));
    } else if (selectedGroups.length === groups.length) {
      // If all were selected and selectAll is unchecked, clear selections
      setSelectedGroups([]);
    }
  }, [selectAll, groups]);

  // Update selectAll when individual selections change
  useEffect(() => {
    if (groups.length > 0 && selectedGroups.length === groups.length) {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  }, [selectedGroups, groups]);

  const handleGroupSelection = (groupId) => {
    if (selectedGroups.includes(groupId)) {
      setSelectedGroups(selectedGroups.filter(id => id !== groupId));
    } else {
      setSelectedGroups([...selectedGroups, groupId]);
    }
  };

  const handleSelectAllChange = (e) => {
    setSelectAll(e.target.checked);
  };

  const handleBroadcastTypeChange = (e) => {
    setBroadcastType(e.target.value);
    if (e.target.value === 'all') {
      setSelectAll(true);
    } else {
      setSelectAll(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate message
    if (!message.trim()) {
      setError('Please enter a message to broadcast');
      return;
    }

    // Validate group selection for 'selected' type
    if (broadcastType === 'selected' && selectedGroups.length === 0) {
      setError('Please select at least one group');
      return;
    }

    try {
      setSending(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/broadcast',
        {
          message,
          groups: broadcastType === 'all' ? 'all' : selectedGroups,
          type: broadcastType
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setSuccess(`Message successfully broadcast to ${response.data.successCount} groups!`);
      setMessage(''); // Clear the message field
    } catch (err) {
      console.error('Error broadcasting message:', err);
      setError(err.response?.data?.message || 'Failed to broadcast message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="broadcast-container">
      <div className="header">
        <h1>
          <i className="fas fa-broadcast-tower" style={{ marginRight: '12px' }}></i>
          Broadcast Message
        </h1>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '16px' }}>Send Message to Groups</h2>
        <p className="broadcast-description">
          Use this feature to send a message to multiple WhatsApp groups at once.
          You can select specific groups or broadcast to all groups.
        </p>

        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="broadcastType">Broadcast Type:</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="broadcastType"
                  value="all"
                  checked={broadcastType === 'all'}
                  onChange={handleBroadcastTypeChange}
                />
                All Groups ({groups.length})
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="broadcastType"
                  value="selected"
                  checked={broadcastType === 'selected'}
                  onChange={handleBroadcastTypeChange}
                />
                Selected Groups ({selectedGroups.length})
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="message">Message:</label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your broadcast message here..."
              rows={6}
              className="form-control"
              required
            />
            <small className="form-text">
              This message will be sent to all selected groups. You can use markdown formatting.
            </small>
          </div>

          {broadcastType === 'selected' && (
            <div className="form-group">
              <label>Select Groups:</label>
              {loading ? (
                <div className="loading-spinner" style={{ margin: '20px auto' }}></div>
              ) : groups.length === 0 ? (
                <div className="no-data-message">No groups found</div>
              ) : (
                <div className="groups-selection">
                  <div className="select-all-container">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAllChange}
                      />
                      Select All Groups
                    </label>
                  </div>
                  <div className="groups-list">
                    {groups.map(group => (
                      <div key={group.id} className="group-item">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.id)}
                            onChange={() => handleGroupSelection(group.id)}
                          />
                          <div className="group-info">
                            <span className="group-name">{group.name}</span>
                            <span className="group-participants">{group.participants} members</span>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={sending || loading || (broadcastType === 'selected' && selectedGroups.length === 0)}
          >
            {sending ? (
              <>
                <div className="loading-spinner" style={{ width: '16px', height: '16px', margin: '0 8px 0 0' }}></div>
                Sending...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane" style={{ marginRight: '8px' }}></i>
                Send Broadcast
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Broadcast;
