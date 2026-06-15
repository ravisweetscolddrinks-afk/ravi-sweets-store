import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { Mail, Lock, LogIn, Phone, ShieldCheck, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Descope, useSession, useUser, useDescope } from '@descope/react-sdk';
import logo from '../../assets/logo.png';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' or 'phone'
  
  // Custom OTP state
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  
  const sdk = useDescope();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  // PWA Installation states
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  useEffect(() => {
    // If running in standalone (installed) mode, do not show the install prompt button
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (isStandalone) {
      console.log('App is running in standalone mode. Hiding install button.');
      return;
    }

    // Check if the event was already captured by index.html early script
    if (window.deferredPrompt) {
      setInstallPromptEvent(window.deferredPrompt);
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
      window.deferredPrompt = e;
    };

    const handleDeferredPromptReady = () => {
      if (window.deferredPrompt) {
        setInstallPromptEvent(window.deferredPrompt);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('deferredpromptready', handleDeferredPromptReady);

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      window.deferredPrompt = null;
      toast.success('Ravi Sweets App installed successfully!');
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('deferredpromptready', handleDeferredPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    const promptEvent = installPromptEvent || window.deferredPrompt;
    if (!promptEvent) return;
    
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // Clear prompt event states once used
    setInstallPromptEvent(null);
    window.deferredPrompt = null;
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Successfully logged in!');
      navigate(from, { replace: true });
    } catch (error) {
      console.error(error);
      let message = 'Failed to log in. Please check your credentials.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = 'Invalid email or password.';
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();
    if (!mobile || mobile.length < 10) {
      toast.error('Please enter a valid mobile number');
      return;
    }
    setLoading(true);
    try {
      // Send OTP via SMS using Descope SDK
      // Using international format +91 for India if not provided
      const formattedPhone = mobile.startsWith('+') ? mobile : `+91${mobile}`;
      const response = await sdk.otp.signUpOrIn.sms(formattedPhone);
      
      if (!response.ok) {
        throw new Error(response.error?.errorDescription || response.error?.errorMessage || 'Failed to send OTP');
      }

      toast.success('OTP sent successfully!');
      setOtpSent(true);
    } catch (error) {
      console.error("Descope OTP request error:", error);
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 6) {
      toast.error('Please enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = mobile.startsWith('+') ? mobile : `+91${mobile}`;
      const response = await sdk.otp.verify.sms(formattedPhone, otp);
      
      if (!response.ok) {
        throw new Error(response.error?.errorDescription || response.error?.errorMessage || 'Invalid OTP or verification failed');
      }

      toast.success('Successfully logged in via OTP!');
      // Store phone number to identify them in Onboarding
      localStorage.setItem('userPhone', formattedPhone);
      navigate('/onboarding');
    } catch (error) {
      console.error("Descope OTP verification error:", error);
      toast.error(error.message || 'Invalid OTP or verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <motion.div 
        className="login-card glass"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="login-logo-container">
          <img src={logo} alt="Ravi Sweets" style={{ width: '80px', height: '80px', objectFit: 'contain', marginBottom: '16px', borderRadius: '12px' }} />
          <h1 style={{ fontSize: '32px', color: 'var(--primary-color)', marginBottom: '4px', fontWeight: '800' }}>Ravi Sweets</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', fontWeight: '500' }}>Authentic Traditional Flavors</p>
        </div>

        <h2 className="login-title">Welcome Back</h2>
        <p className="login-subtitle">Please enter your details to sign in</p>

        <div className="login-tabs">
          <button 
            className={`login-tab ${loginMethod === 'email' ? 'active' : ''}`}
            onClick={() => setLoginMethod('email')}
          >
            Email Login
          </button>
          <button 
            className={`login-tab ${loginMethod === 'phone' ? 'active' : ''}`}
            onClick={() => setLoginMethod('phone')}
          >
            Mobile OTP
          </button>
        </div>

        {loginMethod === 'email' ? (
          <form onSubmit={handleEmailLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="admin@ravisweets.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button 
              type="submit" 
              className="login-button"
              disabled={loading}
            >
              {loading ? <div className="loader" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div> : <><LogIn size={18} /> Sign In</>}
            </button>
          </form>
        ) : (
          <div className="custom-otp-container">
            {!import.meta.env.VITE_DESCOPE_PROJECT_ID ? (
              <div style={{ textAlign: 'center', padding: '20px', background: '#FEF2F2', borderRadius: '10px', border: '1px dashed #EF4444' }}>
                <p style={{ color: '#DC2626', fontWeight: '700', margin: '0 0 8px 0' }}>Descope Not Configured</p>
                <p style={{ fontSize: '12px', color: '#7F1D1D', margin: 0 }}>Please add <b>VITE_DESCOPE_PROJECT_ID</b> to your <b>.env</b> file to enable Mobile OTP login.</p>
              </div>
            ) : (
              !otpSent ? (
                <form onSubmit={handleSendOTP}>
                  <div className="form-group">
                    <label className="form-label">Mobile Number</label>
                    <div className="input-wrapper">
                      <Phone size={18} className="input-icon" />
                      <input 
                        type="tel" 
                        className="form-input" 
                        placeholder="Enter 10-digit mobile number"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        maxLength="10"
                      />
                    </div>
                  </div>
                  <button type="submit" className="login-button" disabled={loading}>
                    {loading ? <div className="loader" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div> : <><ShieldCheck size={18} /> Send OTP</>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP}>
                  <div className="form-group">
                    <label className="form-label">Enter OTP</label>
                    <div className="input-wrapper">
                      <Lock size={18} className="input-icon" />
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="6-digit OTP"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        maxLength="6"
                      />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'right' }}>
                      <span style={{ cursor: 'pointer', color: 'var(--primary-color)' }} onClick={() => setOtpSent(false)}>Change Number?</span>
                    </p>
                  </div>
                  <button type="submit" className="login-button" disabled={loading}>
                    {loading ? <div className="loader" style={{ width: '20px', height: '20px', borderWidth: '3px' }}></div> : <><LogIn size={18} /> Verify & Login</>}
                  </button>
                </form>
              )
            )}
          </div>
        )}

        {installPromptEvent && (
          <motion.button 
            type="button" 
            className="login-install-button"
            onClick={handleInstallApp}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Download size={18} /> Install Ravi Sweets App
          </motion.button>
        )}

        <p className="otp-note">
          Having trouble? <span>Contact Administrator</span>
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
