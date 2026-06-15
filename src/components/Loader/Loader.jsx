import React from 'react';
import './Loader.css';

const Loader = ({ type = 'section', size = 'medium', message = 'Preparing fresh sweets...' }) => {
  if (type === 'inline') {
    // Compact loader for buttons and small inline states
    const inlineSize = size === 'small' ? '12px' : size === 'large' ? '24px' : '16px';
    return (
      <div 
        className="premium-inline-loader" 
        style={{ width: inlineSize, height: inlineSize }} 
      />
    );
  }

  if (type === 'section') {
    // Elegant loader for cards, tables, and sections of pages
    return (
      <div className="premium-section-loader-container">
        <div className="premium-loader-rings">
          <div className="ring-outer" />
          <div className="ring-inner" />
          <div className="mandala-center-mini">
            <svg viewBox="0 0 100 100" className="mandala-svg-mini">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-color)" strokeWidth="2" strokeDasharray="3 3" />
              <circle cx="50" cy="50" r="16" fill="var(--primary-color)" stroke="var(--accent-color)" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="6" fill="var(--accent-color)" />
            </svg>
          </div>
        </div>
        {message && <span className="premium-loader-message">{message}</span>}
      </div>
    );
  }

  // default type="page" - Premium Full-Screen Loading Screen
  return (
    <div className="premium-page-loader-screen">
      <div className="premium-page-loader-card">
        {/* Glowing aura effect */}
        <div className="loader-glow-aura" />
        
        {/* Animated concentric rings wrapper */}
        <div className="premium-loader-rings-large">
          <div className="ring-outer-large" />
          <div className="ring-inner-large" />
          
          {/* Stunning traditional sweets mandala centerpiece */}
          <div className="mandala-center-large">
            <svg viewBox="0 0 100 100" className="mandala-svg">
              <defs>
                <radialGradient id="gold-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Pulsing base glow */}
              <circle cx="50" cy="50" r="45" fill="url(#gold-glow)" className="mandala-glow-pulse" />
              
              {/* Delicate concentric geometric patterns */}
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--accent-color)" strokeWidth="0.75" strokeDasharray="4 4" />
              <circle cx="50" cy="50" r="32" fill="none" stroke="var(--primary-color)" strokeWidth="0.5" />
              
              {/* Sweet/Flower Petals - Indian Traditional sweets pattern */}
              <g transform="translate(50, 50)" stroke="var(--accent-color)" strokeWidth="1.5" fill="none">
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(45)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(90)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(135)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(180)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(225)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(270)" />
                <path d="M 0 0 C -8 -22, 8 -22, 0 0" transform="rotate(315)" />
              </g>
              
              {/* Inner core */}
              <circle cx="50" cy="50" r="14" fill="var(--primary-color)" stroke="var(--accent-color)" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="6" fill="var(--accent-color)" />
              <circle cx="50" cy="50" r="2.5" fill="#FFFFFF" />
            </svg>
          </div>
        </div>

        {/* Brand/Status Text */}
        <div className="premium-loader-brand-container">
          <h1 className="premium-loader-title">RAVI SWEETS</h1>
          <div className="premium-loader-divider">
            <div className="divider-dot" />
            <div className="divider-line" />
            <div className="divider-dot" />
          </div>
          <p className="premium-loader-subtitle">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default Loader;
