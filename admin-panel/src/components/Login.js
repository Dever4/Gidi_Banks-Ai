import React, { useState } from 'react';
import axios from 'axios';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/login', { email, password });
      onLogin(response.data.token);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '64px',
            color: 'var(--primary-color)',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '16px'
          }}>
            <i className="fab fa-whatsapp"></i>
          </div>
          <h1 style={{
            color: 'var(--primary-color)',
            marginBottom: '8px',
            fontSize: '2rem',
            fontWeight: 'bold'
          }}>
            WhatsApp Bot Admin
          </h1>
          <p style={{ color: '#666', fontSize: '1rem' }}>
            Sign in to access the admin dashboard
          </p>
        </div>

        <div className="login-card">
          <h2 style={{
            marginBottom: '24px',
            color: '#333',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center'
          }}>
            <i className="fas fa-user-shield" style={{ marginRight: '12px', color: 'var(--primary-color)' }}></i>
            Admin Login
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">
                <i className="fas fa-envelope" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
                Email Address
              </label>
              <div className="input-container">
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <i className="fas fa-lock" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
                Password
              </label>
              <div className="input-container">
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="error-message" style={{
                padding: '12px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                border: '1px solid rgba(255, 0, 0, 0.2)',
                marginBottom: '16px'
              }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '24px',
                padding: '14px',
                fontSize: '1rem',
                fontWeight: 'bold',
                borderRadius: '4px',
                backgroundColor: 'var(--primary-color)',
                color: 'white',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {loading ? (
                <>
                  <div className="loading-spinner" style={{ width: '20px', height: '20px', margin: '0 10px 0 0' }}></div>
                  Signing in...
                </>
              ) : (
                <>
                  <i className="fas fa-sign-in-alt" style={{ marginRight: '10px' }}></i>
                  Sign In
                </>
              )}
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            padding: '16px',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
            fontSize: '0.9rem'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
              <i className="fas fa-info-circle" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
              Default Credentials
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>Email:</strong> admin@example.com</div>
              <div><strong>Password:</strong> admin123</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#666' }}>
          <p>© {new Date().getFullYear()} WhatsApp Bot Admin Panel</p>
        </div>
      </div>

      <style jsx="true">{`
        .login-page {
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #f5f5f5;
          padding: 20px;
        }

        .login-container {
          max-width: 450px;
          width: 100%;
        }

        .login-card {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          padding: 32px;
          margin-bottom: 24px;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .input-container {
          position: relative;
        }

        .input-container input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          transition: border-color 0.3s;
        }

        .input-container input:focus {
          border-color: var(--primary-color);
          outline: none;
          box-shadow: 0 0 0 2px rgba(37, 211, 102, 0.2);
        }
      `}</style>
    </div>
  );
}

export default Login;
