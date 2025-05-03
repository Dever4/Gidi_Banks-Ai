import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Settings.css'; // Reuse the same CSS as other settings components

function AutoApproveSettings() {
  const [autoApproveJoinRequests, setAutoApproveJoinRequests] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchAutoApproveSettings();
  }, []);

  const fetchAutoApproveSettings = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/settings/auto-approve', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAutoApproveJoinRequests(response.data.autoApproveJoinRequests);
      setError('');
    } catch (err) {
      console.error('Error fetching auto-approve settings:', err);
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        '/api/settings/auto-approve',
        { autoApproveJoinRequests: !autoApproveJoinRequests },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAutoApproveJoinRequests(!autoApproveJoinRequests);
      setSuccess('Updated');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      console.error('Error updating settings:', err);
      setError('Update failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="control-card">
      <div className="control-header">
        <h3>Auto-Approve Join Requests</h3>
        {loading ? (
          <div className="loading-indicator"></div>
        ) : (
          <button
            className={`control-toggle ${autoApproveJoinRequests ? 'active' : 'inactive'}`}
            onClick={handleToggle}
            disabled={isSubmitting}
          >
            {autoApproveJoinRequests ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
}

export default AutoApproveSettings;
