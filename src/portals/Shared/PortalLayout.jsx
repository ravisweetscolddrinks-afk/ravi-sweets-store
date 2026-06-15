import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { 
  LogOut, Home, Star,
  Bluetooth as BluetoothIcon, 
  Usb as UsbIcon, 
  RefreshCw, AlertCircle, X, Menu
} from 'lucide-react';
import { auth, db } from '../../config/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.png';
import { usePrinter } from '../../context/PrinterContext';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './PortalLayout.css';

const PortalLayout = ({ children, title, links }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const [entityName, setEntityName] = useState('');
  const [entityRole, setEntityRole] = useState('Operator');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    connectedDevice,
    qzConnected,
    qzPrinters,
    selectedQZPrinter,
    isScanningBt,
    btDevices,
    connectingBtDevice,
    showBluetoothModal,
    showQZModal,
    showQZSetupGuide,
    qzConnecting,
    qzConnectTimer,
    setShowBluetoothModal,
    setShowQZModal,
    setShowQZSetupGuide,
    handleBluetoothConnect,
    restartBtScan,
    connectBtDevice,
    disconnectPrinter,
    connectQZTray,
    confirmQZPrinter,
    disconnectQZTray
  } = usePrinter();

  useEffect(() => {
    if (!id && !location.pathname.startsWith('/individual-portal')) return;

    const fetchEntityDetails = async () => {
      try {
        if (location.pathname.startsWith('/individual-portal')) {
          setEntityRole('Employee Portal');
          const phone = localStorage.getItem('userPhone') || auth.currentUser?.phoneNumber;
          if (phone) {
            const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;
            const q = query(collection(db, 'employees'), where('phone', 'in', [phone, normalizedPhone]));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const empData = snap.docs[0].data();
              setEntityName(`${empData.firstName} ${empData.lastName || ''}`);
            }
          }
        } else if (location.pathname.startsWith('/store-portal')) {
          setEntityRole('Store Operator');
          const docRef = doc(db, 'stores', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        } else if (location.pathname.startsWith('/munit-portal')) {
          setEntityRole('Manufacturing Operator');
          const docRef = doc(db, 'manufacturing_units', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        } else if (location.pathname.startsWith('/punit-portal')) {
          setEntityRole('Packing Operator');
          const docRef = doc(db, 'packing_units', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setEntityName(docSnap.data().name);
          }
        }
      } catch (error) {
        console.error("Error fetching entity details in PortalLayout:", error);
      }
    };

    fetchEntityDetails();
  }, [id, location.pathname]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  return (
    <div className={`layout-wrapper ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <aside className={`sidebar ${isSidebarOpen ? 'drawer-open' : ''}`}>
        <div className="sidebar-header-mobile">
          <span className="sidebar-mobile-title">Menu</span>
          <button className="sidebar-close-btn" onClick={closeSidebar} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-menu">
          {links.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              onClick={closeSidebar}
              className={`sidebar-item ${location.pathname.startsWith(link.path) ? 'active' : ''}`}
            >
              {React.cloneElement(link.icon, { size: 24, className: 'sidebar-icon' })}
              <span className="sidebar-label">{link.label}</span>
            </Link>
          ))}
        </div>
        <div className="sidebar-footer">
          <button 
            onClick={() => { closeSidebar(); navigate('/onboarding'); }} 
            className="sidebar-switch-btn" 
            title="Switch Portal"
          >
            <Home size={24} />
            <span className="sidebar-label">Switch Portal</span>
          </button>
          <button 
            onClick={() => { closeSidebar(); handleLogout(); }} 
            className="sidebar-logout-btn" 
            title="Logout"
          >
            <LogOut size={24} />
            <span className="sidebar-label">Logout</span>
          </button>
        </div>
      </aside>

      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}

      <div className="layout-main">
        <header className="header">
          <div className="header-left">
            <button 
              className="header-menu-btn" 
              onClick={toggleSidebar}
              aria-label="Toggle Navigation Sidebar"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <Link to="/onboarding" className="header-logo">
              <img src={logo} alt="Ravi Sweets" className="header-logo-img" />
            </Link>
          </div>

          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {/* Global Printer Connection Widgets */}
            <div className="header-printer-status-bar">
              {bluetoothConnected ? (
                <button className="header-print-status-btn connected ble" title={`BLE: ${connectedDevice}`} onClick={disconnectPrinter}>
                  <BluetoothIcon size={13} />
                  <span>BLE: {connectedDevice ? (connectedDevice.length > 10 ? `${connectedDevice.substring(0, 10)}...` : connectedDevice) : 'Connected'}</span>
                </button>
              ) : (
                <button className="header-print-status-btn disconnected ble" title="Connect Bluetooth Printer" onClick={handleBluetoothConnect}>
                  <BluetoothIcon size={13} />
                  <span>Connect BLE</span>
                </button>
              )}

              {qzConnected ? (
                <button className="header-print-status-btn connected usb" title={`USB: ${selectedQZPrinter}`} onClick={() => setShowQZModal(true)}>
                  <UsbIcon size={13} />
                  <span>USB: {selectedQZPrinter ? (selectedQZPrinter.length > 10 ? `${selectedQZPrinter.substring(0, 10)}...` : selectedQZPrinter) : 'Connected'}</span>
                </button>
              ) : (
                <button className="header-print-status-btn disconnected usb" title="Connect USB Printer" onClick={connectQZTray} disabled={qzConnecting}>
                  <UsbIcon size={13} />
                  <span>{qzConnecting ? `USB: ${qzConnectTimer}s` : 'Connect USB'}</span>
                </button>
              )}
            </div>

            <div className="admin-badge">
              <Star size={12} fill="currentColor" />
              <span>{entityRole}{entityName ? ` - ${entityName}` : ''}</span>
            </div>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </div>

      {/* ========================================== */}
      {/* GLOBAL PRINTER UTILITY MODALS (PORTALS)    */}
      {/* ========================================== */}

      {/* Bluetooth BLE Scanner Modal */}
      <AnimatePresence>
        {showBluetoothModal && createPortal(
          <div className="portal-modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowBluetoothModal(false)}>
            <motion.div
              className="portal-custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="portal-modal-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                <BluetoothIcon size={28} />
              </div>
              <h3 className="portal-modal-title">Pair BLE Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Available Devices</span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                  {isScanningBt ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <RefreshCw size={14} className="animate-spin" /> Scanning for printers...
                    </div>
                  ) : btDevices.length > 0 ? (
                    btDevices.map(dev => (
                      <div
                        key={dev.name}
                        onClick={() => !connectingBtDevice && connectBtDevice(dev.name)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          cursor: connectingBtDevice ? 'not-allowed' : 'pointer',
                          background: '#f8fafc',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { if (!connectingBtDevice) e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                      >
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{dev.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{dev.type}</div>
                        </div>
                        <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '700' }}>
                          {connectingBtDevice === dev.name ? 'Pairing...' : `${dev.rssi} dBm`}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      No BLE printers detected in range.
                    </div>
                  )}
                </div>
              </div>

              <div className="portal-modal-actions" style={{ marginTop: '20px' }}>
                <button className="portal-modal-btn cancel" onClick={() => setShowBluetoothModal(false)}>Close</button>
                <button
                  className="portal-ws-save-btn"
                  style={{ height: '36px', fontSize: '13px' }}
                  onClick={restartBtScan}
                  disabled={isScanningBt}
                >
                  <RefreshCw size={12} className={isScanningBt ? 'animate-spin' : ''} /> Rescan
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* QZ Tray Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && createPortal(
          <div className="portal-modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowQZModal(false)}>
            <motion.div
              className="portal-custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="portal-modal-icon-box" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                <UsbIcon size={28} />
              </div>
              <h3 className="portal-modal-title">Select USB Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>Detected USB Printers</label>
                <select
                  value={selectedQZPrinter}
                  onChange={(e) => confirmQZPrinter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1.5px solid var(--border-color)',
                    fontSize: '14px',
                    background: '#f8fafc',
                    outline: 'none'
                  }}
                >
                  {qzPrinters.length > 0 ? (
                    qzPrinters.map(p => <option key={p} value={p}>{p}</option>)
                  ) : (
                    <option value="">No USB printers found</option>
                  )}
                </select>
              </div>

              <div className="portal-modal-actions" style={{ marginTop: '20px' }}>
                <button className="portal-modal-btn cancel" onClick={() => { disconnectQZTray(); setShowQZModal(false); }}>Disconnect</button>
                <button
                  className="portal-ws-save-btn"
                  style={{ height: '36px', fontSize: '13px', background: '#2563eb', boxShadow: '0 4px 12px rgba(37,99,235,0.15)' }}
                  onClick={() => setShowQZModal(false)}
                >
                  Confirm Printer
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* QZ Tray Connection Setup Guide */}
      <AnimatePresence>
        {showQZSetupGuide && createPortal(
          <div className="portal-modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowQZSetupGuide(false)}>
            <motion.div
              className="portal-custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '440px', width: '95%', textAlign: 'left' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                  <AlertCircle size={20} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>USB Thermal Print Driver Missing</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowQZSetupGuide(false)}><X size={18} /></button>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p>Direct USB printing requires <strong>QZ Tray</strong> local service to bridges web actions to hardware drivers.</p>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '4px' }}>Setup Steps:</div>
                  <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Download & install from: <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700' }}>qz.io/download/</a></li>
                    <li>Launch QZ Tray application on your PC.</li>
                    <li>If prompted for security warning, choose "Always Trust".</li>
                    <li>Click the Retry Connect button below.</li>
                  </ol>
                </div>
              </div>

              <div className="portal-modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="portal-modal-btn cancel" onClick={() => setShowQZSetupGuide(false)}>Close</button>
                <button
                  className="portal-ws-save-btn"
                  style={{ height: '36px', fontSize: '13px', background: '#dc2626', boxShadow: 'none' }}
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await connectQZTray();
                  }}
                >
                  <RefreshCw size={12} /> Retry Connect
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
};

export default PortalLayout;
