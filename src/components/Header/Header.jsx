import React from 'react';
import { Link } from 'react-router-dom';
import {
  Star, Menu, X,
  Bluetooth as BluetoothIcon,
  Usb as UsbIcon,
  Printer as PrinterIcon,
  Wifi as WifiIcon,
  Settings as SettingsIcon,
  RefreshCw, RotateCw, AlertCircle,
  Search, Eye, Bell
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
    inbuiltPOSActive,
    toggleInbuiltPOS,
    cancelPOSMode,
    enablePOSMode,
    restartPOSSetup,
    showPOSModal,
    setShowPOSModal,
    testInbuiltPOSPrint,
    handleWebUSBConnect,
    webUsbConnected,
    webUsbDevice,
    handleWebSerialConnect,
    webSerialConnected,
    wifiConnected,
    wifiPrinterIp,
    showWifiModal,
    setShowWifiModal,
    connectWifiPrinter,
    disconnectWifiPrinter,
    testWifiPrint,
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
    disconnectQZTray,
    disconnectWebUSB
  } = usePrinter();

  const [inputWifiIp, setInputWifiIp] = React.useState(wifiPrinterIp || '');
  const [showLocalWifiModal, setShowLocalWifiModal] = React.useState(false);
  const [showLocalPOSModal, setShowLocalPOSModal] = React.useState(false);

  React.useEffect(() => {
    if (wifiPrinterIp) {
      setInputWifiIp(wifiPrinterIp);
    }
  }, [wifiPrinterIp]);

  const handleOpenPOSModal = () => {
    setShowPOSModal(true);
    setShowLocalPOSModal(true);
  };

  const handleClosePOSModal = () => {
    setShowPOSModal(false);
    setShowLocalPOSModal(false);
  };

  const handleOpenWifiModal = () => {
    setShowWifiModal(true);
    setShowLocalWifiModal(true);
  };

  const handleCloseWifiModal = () => {
    setShowWifiModal(false);
    setShowLocalWifiModal(false);
  };

  return (
    <>
      <header className="header">
        <div className="header-left">
          <button
            className="header-menu-btn"
            onClick={toggleSidebar}
            aria-label="Toggle Navigation Sidebar"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link to="/" className="header-logo">
            <img src={logo} alt="Raju Ghee Sweets" className="header-logo-img" />
            {/* <span className="header-brand-title">Raju Ghee Sweets</span> */}
          </Link>
          <span className="header-season-tag">v2.0 Admin</span>
        </div>

        {/* Polaris Search Bar Center */}
        {/* <div className="header-search-container">
          <Search size={14} className="header-search-icon" />
          <input
            type="text"
            placeholder="Search items, orders, stores..."
            className="header-search-input"
          />
          <span className="header-search-shortcut">
            <kbd>CTRL</kbd> <kbd>K</kbd>
          </span>
        </div> */}

        <div className="header-right">
          {/* Reload Page Button */}
          <button
            className="header-icon-btn"
            title="Reload Page"
            onClick={() => window.location.reload()}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <RotateCw size={16} />
          </button>


          {/* Notifications Button */}
          <button className="header-icon-btn" title="Notifications">
            <Bell size={16} />
            <span className="header-notif-badge">4</span>
          </button>

          {/* Global Printer Connection Widgets */}
          <div className="header-printer-status-bar">
            {/* Inbuilt POS Thermal Printer Button & Settings */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <button
                className={`header-print-status-btn ${inbuiltPOSActive ? 'connected pos' : 'disconnected pos'}`}
                title={inbuiltPOSActive ? "Click to Turn OFF Inbuilt POS Printer" : "Click to Turn ON Inbuilt POS Printer"}
                onClick={toggleInbuiltPOS}
              >
                <PrinterIcon size={13} />
                <span>POS: {inbuiltPOSActive ? 'Active' : 'Off'}</span>
              </button>
              <button
                className="header-icon-btn"
                style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255, 255, 255, 0.18)', color: '#ffffff', cursor: 'pointer' }}
                title="POS Printer Settings & Setup"
                onClick={handleOpenPOSModal}
              >
                <SettingsIcon size={12} />
              </button>
            </div>

            {/* Direct WebUSB Printer Button */}
            {webUsbConnected ? (
              <button className="header-print-status-btn connected usb" title={`WebUSB: ${webUsbDevice} (Click to disconnect)`} onClick={disconnectWebUSB}>
                <UsbIcon size={13} />
                <span>WebUSB: {webUsbDevice ? (webUsbDevice.length > 8 ? `${webUsbDevice.substring(0, 8)}...` : webUsbDevice) : 'Connected'}</span>
              </button>
            ) : (
              <button
                className="header-print-status-btn disconnected usb"
                title="Connect Direct WebUSB Printer"
                onClick={() => {
                  if (!navigator.usb) {
                    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    const isHttps = window.location.protocol === 'https:';
                    if (!isLocalhost && !isHttps) {
                      alert(
                        '⚠️ WebUSB not available!\n\n' +
                        'You are accessing the app via IP address: ' + window.location.host + '\n\n' +
                        'WebUSB only works on:\n' +
                        '  • http://localhost:5173  ← Open this on the POS machine\n' +
                        '  • OR via HTTPS\n\n' +
                        'On the POS machine, open Chrome and go to:\n' +
                        'http://localhost:5173\n\n' +
                        'Then click WebUSB again to pair your internal USB printer.'
                      );
                    } else {
                      alert('⚠️ WebUSB not supported in this browser.\nPlease use Google Chrome or Microsoft Edge.');
                    }
                    return;
                  }
                  handleWebUSBConnect();
                }}
              >
                <UsbIcon size={13} />
                <span>WebUSB</span>
              </button>
            )}

            {/* Wi-Fi Network Thermal Printer Button */}
            {wifiConnected ? (
              <button className="header-print-status-btn connected wifi" title={`Wi-Fi Printer: ${wifiPrinterIp}`} onClick={handleOpenWifiModal}>
                <WifiIcon size={13} />
                <span>WiFi: {wifiPrinterIp ? (wifiPrinterIp.length > 8 ? `${wifiPrinterIp.substring(0, 8)}...` : wifiPrinterIp) : 'Connected'}</span>
              </button>
            ) : (
              <button className="header-print-status-btn disconnected wifi" title="Connect Wi-Fi Network Printer" onClick={handleOpenWifiModal}>
                <WifiIcon size={13} />
                <span>WiFi</span>
              </button>
            )}

            {bluetoothConnected ? (
              <button className="header-print-status-btn connected ble" title={`BLE: ${connectedDevice}`} onClick={disconnectPrinter}>
                <BluetoothIcon size={13} />
                <span>BLE: {connectedDevice ? (connectedDevice.length > 8 ? `${connectedDevice.substring(0, 8)}...` : connectedDevice) : 'Connected'}</span>
              </button>
            ) : (
              <button className="header-print-status-btn disconnected ble" title="Connect Bluetooth Printer" onClick={handleBluetoothConnect}>
                <BluetoothIcon size={13} />
                <span>BLE</span>
              </button>
            )}

            {qzConnected ? (
              <button className="header-print-status-btn connected usb" title={`USB: ${selectedQZPrinter}`} onClick={() => setShowQZModal(true)}>
                <UsbIcon size={13} />
                <span>USB: {selectedQZPrinter ? (selectedQZPrinter.length > 8 ? `${selectedQZPrinter.substring(0, 8)}...` : selectedQZPrinter) : 'Connected'}</span>
              </button>
            ) : (
              <button className="header-print-status-btn disconnected usb" title="Connect USB Printer" onClick={connectQZTray} disabled={qzConnecting}>
                <UsbIcon size={13} />
                <span>{qzConnecting ? `USB: ${qzConnectTimer}s` : 'USB'}</span>
              </button>
            )}
          </div>

          {/* Store Switcher Badge */}
          <div className="header-store-badge">
            <div className="header-avatar">RG</div>
            <span className="header-store-name">Raju Ghee Sweets</span>
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

              <div style={{ margin: '15px 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className="polaris-btn"
                    style={{ flex: 1, fontSize: '11px', height: '34px', background: '#2563eb', color: '#fff', border: 'none' }}
                    onClick={() => {
                      setShowQZModal(false);
                      handleWebUSBConnect();
                    }}
                  >
                    <UsbIcon size={13} /> Pair WebUSB Printer
                  </button>
                  <button
                    className="polaris-btn"
                    style={{ flex: 1, fontSize: '11px', height: '34px', background: '#059669', color: '#fff', border: 'none' }}
                    onClick={() => {
                      setShowQZModal(false);
                      handleWebSerialConnect();
                    }}
                  >
                    <UsbIcon size={13} /> Pair USB Serial
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px', display: 'block' }}>QZ Tray / System USB Printers</label>
                  <select
                    value={selectedQZPrinter}
                    onChange={(e) => confirmQZPrinter(e.target.value)}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      border: '1.5px solid var(--border-color)',
                      fontSize: '13px',
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

      {/* Inbuilt POS Printer Setup & Diagnostics Modal */}
      <AnimatePresence>
        {(showPOSModal || showLocalPOSModal) && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={handleClosePOSModal}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '440px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <PrinterIcon size={28} />
              </div>
              <h3 className="modal-title">Inbuilt POS Printer (RK3568)</h3>

              <div style={{ margin: '15px 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                  <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>Device Hardware Specs:</div>
                  <div>• Model: <strong>RK3568 (Android 11)</strong></div>
                  <div>• Hardware Board: <strong>Inbuilt USB Thermal Printer V1.0.1</strong></div>
                  <div>• Active Mode: <strong style={{ color: inbuiltPOSActive ? '#16a34a' : '#dc2626' }}>{inbuiltPOSActive ? 'ENABLED' : 'DISABLED'}</strong></div>
                  {webUsbConnected && <div>• Direct WebUSB: <strong style={{ color: '#2563eb' }}>{webUsbDevice}</strong></div>}
                  {webSerialConnected && <div>• USB Serial: <strong style={{ color: '#16a34a' }}>CONNECTED</strong></div>}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    className="polaris-btn"
                    style={{ flex: 1, minWidth: '130px', fontSize: '11px', height: '34px', background: '#2563eb', color: '#fff', border: 'none' }}
                    onClick={handleWebUSBConnect}
                  >
                    <UsbIcon size={13} /> Pair WebUSB Printer
                  </button>
                  <button
                    className="polaris-btn"
                    style={{ flex: 1, minWidth: '130px', fontSize: '11px', height: '34px', background: '#059669', color: '#fff', border: 'none' }}
                    onClick={handleWebSerialConnect}
                  >
                    <UsbIcon size={13} /> Pair USB Serial
                  </button>
                  <button
                    className="polaris-btn"
                    style={{ fontSize: '11px', height: '34px', padding: '0 10px' }}
                    onClick={testInbuiltPOSPrint}
                  >
                    <PrinterIcon size={13} /> Test Print
                  </button>
                </div>

                <div style={{ background: '#fffbebfb', padding: '12px', borderRadius: '8px', border: '1px solid #fef3c7', fontSize: '11px', color: '#92400e' }}>
                  <div style={{ fontWeight: '800', marginBottom: '4px', textTransform: 'uppercase' }}>Android 11 Hardware Driver Guide:</div>
                  <ol style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>When the print preview appears, tap the top <strong>Printer Dropdown</strong>.</li>
                    <li>Select your internal <strong>Thermal Printer Driver</strong> (or RawBT / POS Service) instead of "Save as PDF".</li>
                    <li>Click <strong>Print</strong>. Android 11 will remember your choice for all future receipts!</li>
                  </ol>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="polaris-btn"
                  style={{ fontSize: '11px', height: '32px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
                  onClick={restartPOSSetup}
                  title="Reset POS Printer setup and re-configure"
                >
                  <RotateCw size={12} /> Restart Setup
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {inbuiltPOSActive ? (
                    <button
                      className="modal-btn"
                      style={{ fontSize: '11px', color: '#dc2626', background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '0 10px', height: '32px', borderRadius: '6px' }}
                      onClick={() => {
                        cancelPOSMode();
                        handleClosePOSModal();
                      }}
                    >
                      Cancel POS Mode
                    </button>
                  ) : (
                    <button
                      className="modal-btn"
                      style={{ fontSize: '11px', color: '#16a34a', background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.2)', padding: '0 10px', height: '32px', borderRadius: '6px' }}
                      onClick={() => {
                        enablePOSMode();
                        handleClosePOSModal();
                      }}
                    >
                      Enable POS Mode
                    </button>
                  )}
                  <button className="modal-btn cancel" style={{ height: '32px', fontSize: '11px' }} onClick={handleClosePOSModal}>Close</button>
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* Wi-Fi / Network Thermal Printer Setup Modal */}
      <AnimatePresence>
        {(showWifiModal || showLocalWifiModal) && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={handleCloseWifiModal}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '440px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9' }}>
                <WifiIcon size={28} />
              </div>
              <h3 className="modal-title">Connect Wi-Fi / Network Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Enter the local Wi-Fi or Ethernet IP address of your thermal printer (e.g., <code>192.168.1.100</code>).
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>Printer Wi-Fi IP Address:</label>
                  <input
                    type="text"
                    placeholder="e.g. 192.168.1.100 or 192.168.29.87"
                    value={inputWifiIp}
                    onChange={(e) => setInputWifiIp(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      outline: 'none'
                    }}
                  />
                </div>

                {wifiConnected && wifiPrinterIp && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '6px', fontSize: '11px', color: '#166534' }}>
                    Currently Connected to: <strong>{wifiPrinterIp}</strong>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="polaris-btn"
                    style={{ flex: 1, fontSize: '12px', height: '34px', background: '#0ea5e9', color: '#fff', border: 'none' }}
                    onClick={() => {
                      connectWifiPrinter(inputWifiIp);
                      handleCloseWifiModal();
                    }}
                  >
                    Save & Connect Wi-Fi
                  </button>
                  <button
                    className="polaris-btn"
                    style={{ fontSize: '12px', height: '34px' }}
                    onClick={() => testWifiPrint(inputWifiIp)}
                  >
                    <PrinterIcon size={14} /> Send Test Print
                  </button>
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {wifiConnected ? (
                  <button className="modal-btn" style={{ fontSize: '11px', color: '#dc2626' }} onClick={() => { disconnectWifiPrinter(); handleCloseWifiModal(); }}>
                    Disconnect Wi-Fi
                  </button>
                ) : <div />}
                <button className="modal-btn cancel" style={{ height: '32px', fontSize: '11px' }} onClick={handleCloseWifiModal}>Close</button>
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
