import React from 'react';
import { 
  Phone, 
  Mail, 
  MapPin, 
  Headset, 
  Clock, 
  ArrowRight,
  Send,
  Navigation
} from 'lucide-react';
import { motion } from 'framer-motion';
import './Support.css';

const Support = () => {
  const cards = [
    {
      id: 'call',
      title: 'Call Us',
      info: '+91 99999 99999',
      badge: 'Mon-Sat, 9am - 6pm',
      icon: <Phone size={24} />,
      colorClass: 'green',
      btnText: 'Contact Now',
      btnIcon: <Phone size={16} />,
      link: 'tel:+919999999999'
    },
    {
      id: 'email',
      title: 'Email Us',
      info: 'support@gamanext.com',
      badge: 'We reply within 24 hours',
      icon: <Mail size={24} />,
      colorClass: 'blue',
      btnText: 'Contact Now',
      btnIcon: <Mail size={16} />,
      link: 'mailto:support@gamanext.com'
    },
    {
      id: 'location',
      title: 'Our Location',
      info: 'GamaNext Solutions, Hitech City',
      subInfo: 'Hyderabad, Telangana - 500081',
      icon: <MapPin size={24} />,
      colorClass: 'purple',
      btnText: 'View on Map',
      btnIcon: <Navigation size={16} />,
      link: 'https://maps.google.com'
    }
  ];

  return (
    <div className="support-container">
      {/* Decorative Elements */}
      <div className="paper-plane plane-1">🚀</div>
      <div className="paper-plane plane-2">✈️</div>

      <motion.div 
        className="support-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="support-badge">
          <Headset size={16} />
          <span>We're here to help</span>
        </div>
        <h1 className="support-title">Technical Support</h1>
        <p className="support-subtitle">
          Need help? Our team at <strong>GamaNext</strong> is here to assist you.
        </p>
      </motion.div>

      <div className="support-grid">
        {cards.map((card, index) => (
          <motion.div 
            key={card.id}
            className="support-card"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className={`card-icon-wrapper icon-${card.colorClass}`}>
              {card.icon}
            </div>
            <h3>{card.title}</h3>
            <div className={`contact-info info-${card.colorClass}`}>
              {card.id === 'location' ? (
                <>
                  <div style={{ fontSize: '18px' }}>{card.info}</div>
                  <div style={{ fontSize: '14px', color: '#718096', marginTop: '10px', fontWeight: '500' }}>
                    {card.subInfo}
                  </div>
                </>
              ) : (
                card.info
              )}
            </div>
            
            {card.badge && (
              <div className={`info-badge badge-${card.colorClass}`}>
                <Clock size={16} />
                <span>{card.badge}</span>
              </div>
            )}

            <a href={card.link} target="_blank" rel="noopener noreferrer" className={`card-btn btn-${card.colorClass}`}>
              {card.btnIcon}
              <span>{card.btnText}</span>
              <ArrowRight size={18} />
            </a>
          </motion.div>
        ))}
      </div>

      <motion.div 
        className="banner-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="banner-left">
          <div className="rocket-illustration">🚀</div>
          <div className="banner-info">
            <h2>GamaNext Solutions</h2>
            <p>Accelerating Digital Transformation for <strong>Ravi Sweets</strong></p>
          </div>
        </div>
        <div className="store-illustration">🏪</div>
      </motion.div>
    </div>
  );
};

export default Support;
