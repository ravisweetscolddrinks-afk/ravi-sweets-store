import React from 'react';
import { Heart } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-left">
        <div className="footer-logo">🏺</div>
        <div className="footer-info">
          <h3>Ravi Sweets</h3>
          <p>Premium Quality, Traditional Taste</p>
        </div>
      </div>

      <div className="footer-center">
        <Heart size={18} fill="currentColor" />
        <span>Made with love for sweetness</span>
      </div>

      <div className="footer-right">
        <span>|</span>
        <span>© 2024 Ravi Sweets. All rights reserved.</span>
      </div>

      <div className="footer-pattern">
        {/* Decorative pattern placeholder */}
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 0 L100 50 L50 100 L0 50 Z" fill="white" />
        </svg>
      </div>
    </footer>
  );
};

export default Footer;
