import React, { useState, useEffect } from 'react';
import axios from 'axios';

function CommandList() {
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedCommand, setExpandedCommand] = useState(null);

  useEffect(() => {
    const fetchCommands = async () => {
      try {
        const response = await axios.get('/api/commands');
        setCommands(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching commands:', err);
        setError('Failed to load commands');
        setLoading(false);
      }
    };

    fetchCommands();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchCommands, 30000);

    // Set up a visual indicator for auto-refresh
    const updateTimeElement = document.getElementById('commands-update-time');
    const updateCountdownElement = document.getElementById('commands-update-countdown');

    if (updateTimeElement && updateCountdownElement) {
      // Update the last refresh time
      updateTimeElement.textContent = new Date().toLocaleTimeString();

      // Set up countdown for next refresh
      let countdown = 30;
      updateCountdownElement.textContent = countdown;

      const countdownInterval = setInterval(() => {
        countdown -= 1;
        if (countdown < 0) {
          countdown = 30;
          updateTimeElement.textContent = new Date().toLocaleTimeString();
        }
        updateCountdownElement.textContent = countdown;
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(countdownInterval);
      };
    }

    return () => clearInterval(interval);
  }, []);

  const categories = React.useMemo(() => {
    const cats = commands.reduce((acc, cmd) => {
      if (cmd.category && !acc.includes(cmd.category)) {
        acc.push(cmd.category);
      }
      return acc;
    }, []);
    return ['all', ...cats.sort()];
  }, [commands]);

  const filteredCommands = React.useMemo(() => {
    return commands.filter(cmd => {
      const matchesSearch =
        cmd.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cmd.description && cmd.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase())));

      const matchesCategory = selectedCategory === 'all' || cmd.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [commands, searchTerm, selectedCategory]);

  const toggleCommandExpand = (cmdName) => {
    if (expandedCommand === cmdName) {
      setExpandedCommand(null);
    } else {
      setExpandedCommand(cmdName);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading commands...</p>
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
          Refresh Commands
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <h1>
          <i className="fas fa-terminal" style={{ marginRight: '12px' }}></i>
          Bot Commands
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
            <i className="fas fa-terminal"></i>
          </div>
          <div className="stat-value">{commands.length}</div>
          <div className="stat-label">Total Commands</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-layer-group"></i>
          </div>
          <div className="stat-value">{categories.length - 1}</div>
          <div className="stat-label">Categories</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-search"></i>
          </div>
          <div className="stat-value">{filteredCommands.length}</div>
          <div className="stat-label">Filtered Commands</div>
        </div>

        <div className="card stat-card">
          <div style={{ fontSize: '24px', color: 'var(--primary-color)', marginBottom: '8px' }}>
            <i className="fas fa-code"></i>
          </div>
          <div className="stat-value">
            {commands.reduce((total, cmd) => total + (cmd.aliases?.length || 0), 0)}
          </div>
          <div className="stat-label">Total Aliases</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <i className="fas fa-list" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
            Command List
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999' }}></i>
              <input
                type="text"
                placeholder="Search commands..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '8px 8px 8px 32px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  width: '200px'
                }}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: 'white'
              }}
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredCommands.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Command</th>
                  <th>Category</th>
                  <th className="hide-on-mobile">Aliases</th>
                  <th>Description</th>
                  <th className="hide-on-mobile">Usage</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommands.map((cmd) => (
                  <React.Fragment key={cmd.name}>
                    <tr
                      onClick={() => toggleCommandExpand(cmd.name)}
                      style={{ cursor: 'pointer' }}
                      className={expandedCommand === cmd.name ? 'active-row' : ''}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <i className="fas fa-terminal" style={{ marginRight: '8px', color: 'var(--primary-color)' }}></i>
                          <strong>{cmd.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className="badge" style={{
                          backgroundColor: 'rgba(37, 211, 102, 0.1)',
                          color: 'var(--primary-color)',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8rem'
                        }}>
                          {cmd.category || 'General'}
                        </span>
                      </td>
                      <td className="hide-on-mobile">{cmd.aliases?.join(', ') || '-'}</td>
                      <td>{cmd.description}</td>
                      <td className="hide-on-mobile">{cmd.usage || '-'}</td>
                    </tr>
                    {expandedCommand === cmd.name && (
                      <tr className="expanded-row">
                        <td colSpan="5">
                          <div style={{ padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                            <div style={{ marginBottom: '12px' }}>
                              <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--primary-color)' }}>
                                Command Details: {cmd.name}
                              </h3>
                              <p>{cmd.description}</p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                              <div>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '4px', color: '#666' }}>Category</h4>
                                <p>{cmd.category || 'General'}</p>
                              </div>

                              <div>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '4px', color: '#666' }}>Aliases</h4>
                                <p>{cmd.aliases?.join(', ') || 'None'}</p>
                              </div>

                              <div>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '4px', color: '#666' }}>Usage</h4>
                                <code style={{
                                  display: 'block',
                                  padding: '8px',
                                  backgroundColor: '#f1f1f1',
                                  borderRadius: '4px',
                                  fontFamily: 'monospace',
                                  overflowX: 'auto'
                                }}>
                                  {cmd.usage || cmd.name}
                                </code>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: '48px', color: '#ddd', marginBottom: '16px' }}>
              <i className="fas fa-search"></i>
            </div>
            <h3>No commands found</h3>
            <p style={{ color: '#666' }}>
              {searchTerm ? `No commands matching "${searchTerm}"` : 'No commands available'}
              {selectedCategory !== 'all' ? ` in category "${selectedCategory}"` : ''}
            </p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              style={{ marginTop: '16px' }}
            >
              <i className="fas fa-times" style={{ marginRight: '8px' }}></i>
              Clear Filters
            </button>
          </div>
        )}

        {filteredCommands.length > 0 && (
          <div style={{ marginTop: '16px', fontSize: '0.9rem', color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              Showing {filteredCommands.length} of {commands.length} commands
              {searchTerm && ` (filtered by "${searchTerm}")`}
              {selectedCategory !== 'all' && ` in category "${selectedCategory}"`}
            </div>

            <div>
              <button
                onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
                disabled={!searchTerm && selectedCategory === 'all'}
              >
                <i className="fas fa-times" style={{ marginRight: '8px' }}></i>
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx="true">{`
        @media (max-width: 768px) {
          .hide-on-mobile {
            display: none;
          }

          .expanded-row td {
            padding: 0 !important;
          }

          .active-row {
            background-color: rgba(37, 211, 102, 0.05);
          }
        }
      `}</style>
    </div>
  );
}

export default CommandList;
