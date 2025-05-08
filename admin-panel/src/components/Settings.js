import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Settings.css';
import AutoApproveSettings from './AutoApproveSettings';
import MultiBotManager from './MultiBotManager';

function Settings() {
  // Group link settings
  const [groupLink, setGroupLink] = useState('');

  // Welcome message settings
  const [welcomeMessageTemplate, setWelcomeMessageTemplate] = useState('');
  const [whatsappTrainingLink, setWhatsappTrainingLink] = useState('');
  const [telegramCommunityLink, setTelegramCommunityLink] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [welcomeLoading, setWelcomeLoading] = useState(true);
  const [error, setError] = useState('');
  const [welcomeError, setWelcomeError] = useState('');
  const [success, setSuccess] = useState('');
  const [welcomeSuccess, setWelcomeSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWelcomeSubmitting, setIsWelcomeSubmitting] = useState(false);

  useEffect(() => {
    fetchGroupLink();
    fetchWelcomeMessageSettings();
  }, []);

  const fetchGroupLink = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/settings/group-link', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGroupLink(response.data.groupLink);
      setError('');
    } catch (err) {
      console.error('Error fetching group link:', err);
      setError('Failed to load group link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchWelcomeMessageSettings = async () => {
    setWelcomeLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('https://gidibanks-ai-production.up.railway.app/api/settings/welcome-message', {
        headers: { Authorization: `Bearer ${token}` }
      });

      setWelcomeMessageTemplate(response.data.welcomeMessageTemplate);
      setWhatsappTrainingLink(response.data.whatsappTrainingLink);
      setTelegramCommunityLink(response.data.telegramCommunityLink);
      setWelcomeError('');
    } catch (err) {
      console.error('Error fetching welcome message settings:', err);
      setWelcomeError('Failed to load welcome message settings. Please try again.');
    } finally {
      setWelcomeLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccess('');
    setError('');

    try {
      // Basic validation
      if (!groupLink) {
        setError('Group link is required');
        setIsSubmitting(false);
        return;
      }

      if (!groupLink.includes('chat.whatsapp.com/')) {
        setError('Invalid WhatsApp group link format');
        setIsSubmitting(false);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/settings/group-link',
        { groupLink },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Group link updated successfully!');
      setTimeout(() => setSuccess(''), 3000); // Clear success message after 3 seconds
    } catch (err) {
      console.error('Error updating group link:', err);
      setError(err.response?.data?.message || 'Failed to update group link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWelcomeSubmit = async (e) => {
    e.preventDefault();
    setIsWelcomeSubmitting(true);
    setWelcomeSuccess('');
    setWelcomeError('');

    try {
      // Basic validation
      if (!whatsappTrainingLink) {
        setWelcomeError('WhatsApp training link is required');
        setIsWelcomeSubmitting(false);
        return;
      }

      if (!telegramCommunityLink) {
        setWelcomeError('Telegram community link is required');
        setIsWelcomeSubmitting(false);
        return;
      }

      if (!welcomeMessageTemplate) {
        setWelcomeError('Welcome message template is required');
        setIsWelcomeSubmitting(false);
        return;
      }

      if (!whatsappTrainingLink.includes('chat.whatsapp.com/')) {
        setWelcomeError('Invalid WhatsApp group link format');
        setIsWelcomeSubmitting(false);
        return;
      }

      if (!telegramCommunityLink.includes('t.me/')) {
        setWelcomeError('Invalid Telegram link format');
        setIsWelcomeSubmitting(false);
        return;
      }

      if (!welcomeMessageTemplate.includes('{{whatsappLink}}') || !welcomeMessageTemplate.includes('{{telegramLink}}')) {
        setWelcomeError('Welcome message template must include the placeholders for WhatsApp and Telegram links');
        setIsWelcomeSubmitting(false);
        return;
      }

      const token = localStorage.getItem('token');
      const response = await axios.post(
        'https://gidibanks-ai-production.up.railway.app/api/settings/welcome-message',
        {
          whatsappTrainingLink,
          telegramCommunityLink,
          welcomeMessageTemplate
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setWelcomeSuccess('Welcome message settings updated successfully!');
      setTimeout(() => setWelcomeSuccess(''), 3000); // Clear success message after 3 seconds
    } catch (err) {
      console.error('Error updating welcome message settings:', err);
      setWelcomeError(err.response?.data?.message || 'Failed to update welcome message settings. Please try again.');
    } finally {
      setIsWelcomeSubmitting(false);
    }
  };

  return (
    <div className="settings-container">
      <h1>Bot Settings</h1>

      <MultiBotManager />

      <div className="settings-card">
        <h2>Group Link Settings</h2>
        <p className="settings-description">
          Set the WhatsApp group link that the bot will send to users when requested.
          The bot will use Gemini AI to generate a custom caption for each user.
        </p>

        {loading ? (
          <div className="loading">Loading settings...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="groupLink">WhatsApp Group Link:</label>
              <input
                type="text"
                id="groupLink"
                value={groupLink}
                onChange={(e) => setGroupLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="form-control"
              />
              <small className="form-text">
                Enter a valid WhatsApp group invite link (must contain "chat.whatsapp.com/")
              </small>
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button
              type="submit"
              className="submit-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Group Link'}
            </button>
          </form>
        )}
      </div>

      <AutoApproveSettings />

      <div className="settings-card">
        <h2>Welcome Message Settings</h2>
        <p className="settings-description">
          Configure the welcome message that is sent to users when they first message the bot.
          The bot will use Gemini AI to personalize the message while keeping the links intact.
        </p>

        {welcomeLoading ? (
          <div className="loading">Loading welcome message settings...</div>
        ) : (
          <form onSubmit={handleWelcomeSubmit}>
            <div className="form-group">
              <label htmlFor="whatsappTrainingLink">WhatsApp Training Group Link:</label>
              <input
                type="text"
                id="whatsappTrainingLink"
                value={whatsappTrainingLink}
                onChange={(e) => setWhatsappTrainingLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="form-control"
              />
              <small className="form-text">
                Enter a valid WhatsApp group invite link (must contain "chat.whatsapp.com/")
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="telegramCommunityLink">Telegram Community Link:</label>
              <input
                type="text"
                id="telegramCommunityLink"
                value={telegramCommunityLink}
                onChange={(e) => setTelegramCommunityLink(e.target.value)}
                placeholder="https://t.me/..."
                className="form-control"
              />
              <small className="form-text">
                Enter a valid Telegram group/channel link (must contain "t.me/")
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="welcomeMessageTemplate">Welcome Message Template:</label>
              <textarea
                id="welcomeMessageTemplate"
                value={welcomeMessageTemplate}
                onChange={(e) => setWelcomeMessageTemplate(e.target.value)}
                placeholder="Enter welcome message template with placeholders for links"
                className="form-control"
                rows={8}
              />
              <small className="form-text">
                Use {'{{'}'whatsappLink{'}}'}' and {'{{'}'telegramLink{'}}'}' as placeholders for the links.
                The bot will replace these with the actual links when sending the message.
              </small>
            </div>

            {welcomeError && <div className="error-message">{welcomeError}</div>}
            {welcomeSuccess && <div className="success-message">{welcomeSuccess}</div>}

            <button
              type="submit"
              className="submit-button"
              disabled={isWelcomeSubmitting}
            >
              {isWelcomeSubmitting ? 'Updating...' : 'Update Welcome Message Settings'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Settings;
