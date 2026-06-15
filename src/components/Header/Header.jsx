import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Star, Menu, X, 
  Bluetooth as BluetoothIcon, 
  Usb as UsbIcon, 
  RefreshCw, AlertCircle 
} from 'lucide-react';
import logo from '../../assets/logo.png';
import { usePrinter } from '../../context/PrinterContext';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import './Header.css';

const Header = ({ toggleSidebar, isSidebarOpen }) => {
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

  return (
    <>
      <header className="header">
        <div className="header-left">
          <button 
            className="header-menu-btn" 
            onClick={toggleSidebar}
            aria-label="Toggle Navigation Sidebar"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <Link to="/" className="header-logo">
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
            <span>Super Admin</span>
          </div>
        </div>
      </header>

      {/* ========================================== */}
      {/* GLOBAL PRINTER UTILITY MODALS (PORTALS)    */}
      {/* ========================================== */}

      {/* Bluetooth BLE Scanner Modal */}
      <AnimatePresence>
        {showBluetoothModal && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowBluetoothModal(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                <BluetoothIcon size={28} />
              </div>
              <h3 className="modal-title">Pair BLE Thermal Printer</h3>

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

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="modal-btn cancel" onClick={() => setShowBluetoothModal(false)}>Close</button>
                <button
                  className="ws-save-btn"
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
          <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowQZModal(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '400px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
                <UsbIcon size={28} />
              </div>
              <h3 className="modal-title">Select USB Thermal Printer</h3>

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

              <div className="modal-actions" style={{ marginTop: '20px' }}>
                <button className="modal-btn cancel" onClick={() => { disconnectQZTray(); setShowQZModal(false); }}>Disconnect</button>
                <button
                  className="ws-save-btn"
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
          <div className="modal-overlay" style={{ zIndex: 9000 }} onClick={() => setShowQZSetupGuide(false)}>
            <motion.div
              className="custom-modal"
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

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button className="modal-btn cancel" onClick={() => setShowQZSetupGuide(false)}>Close</button>
                <button
                  className="ws-save-btn"
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
    </>
  );
};

export default Header;
