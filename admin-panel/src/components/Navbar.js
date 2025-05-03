import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navbar({ onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close menu when location changes (user navigates to a new page)
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuOpen && !event.target.closest('.nav-container') && !event.target.closest('.mobile-menu-button')) {
        setMenuOpen(false);
      }
    };

    // Prevent scrolling when menu is open on mobile
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path ? 'nav-link active' : 'nav-link';
  };

  return (
    <>
      {/* Overlay for mobile menu */}
      <div className={`mobile-menu-overlay ${menuOpen ? 'open' : ''}`} onClick={closeMenu}></div>

      <nav className="nav">
        <div className="nav-container">
          <div className="nav-logo">
            <i className="fas fa-robot" style={{ marginRight: '8px' }}></i>
            WhatsApp Bot Admin
          </div>

          <button
            className="mobile-menu-button"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            <i className={`fas ${menuOpen ? 'fa-times' : 'fa-bars'}`}></i>
          </button>

          <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
            <div className="mobile-menu-header">
              <div className="nav-logo">
                <i className="fas fa-robot" style={{ marginRight: '8px' }}></i>
                WhatsApp Bot Admin
              </div>
              <button
                className="mobile-menu-close"
                onClick={closeMenu}
                aria-label="Close menu"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <Link to="/" className={isActive('/')} onClick={closeMenu}>
              <i className="fas fa-tachometer-alt" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>Dashboard</span>
            </Link>
            <Link to="/qrcode" className={isActive('/qrcode')} onClick={closeMenu}>
              <i className="fas fa-qrcode" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>QR Code</span>
            </Link>
            <Link to="/status" className={isActive('/status')} onClick={closeMenu}>
              <i className="fas fa-info-circle" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>Bot Status</span>
            </Link>

            <Link to="/broadcast" className={isActive('/broadcast')} onClick={closeMenu}>
              <i className="fas fa-broadcast-tower" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>Broadcast</span>
            </Link>
            <Link to="/settings" className={isActive('/settings')} onClick={closeMenu}>
              <i className="fas fa-cog" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>Settings</span>
            </Link>
            <button
              onClick={() => { closeMenu(); onLogout(); }}
              className="nav-link logout-button"
            >
              <i className="fas fa-sign-out-alt" style={{ marginRight: '10px', width: '20px', textAlign: 'center' }}></i>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

export default Navbar;
