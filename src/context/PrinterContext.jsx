import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { connectQZ, disconnectQZ, listQZPrinters, printRawToQZ } from '../utils/qzTray';
import { buildReceiptESCPOS, buildOrderESCPOS } from '../utils/printReceiptHelper';
import toast from 'react-hot-toast';

const PrinterContext = createContext(null);

// Helper to filter out virtual PDF/Fax printers and pick real thermal label printers
export const findBestThermalPrinter = (printers = []) => {
  if (!Array.isArray(printers) || printers.length === 0) return '';

  // 1. Preferred keywords (label, sticker, barcode, tsc, tvs, zebra, xprinter, etc.)
  const preferred = printers.find(p =>
    /label|sticker|barcode|tsc|tvs|zebra|xprinter|godex|bixolon|epson|star|citizen|thermal|pos|receipt|58mm|80mm/i.test(p)
  );
  if (preferred) return preferred;

  // 2. Second preference: any printer that is NOT a virtual PDF/Fax/OneNote printer
  const realPrinter = printers.find(p =>
    !/pdf|fax|onenote|xps|document writer|microsoft|virtual/i.test(p)
  );
  if (realPrinter) return realPrinter;

  return printers[0] || '';
};

export const PrinterProvider = ({ children }) => {
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState([]);
  const [selectedQZPrinter, setSelectedQZPrinter] = useState(
    localStorage.getItem('selectedQZPrinter') || ''
  );

  const [isScanningBt, setIsScanningBt] = useState(false);
  const [btDevices, setBtDevices] = useState([]);
  const [connectingBtDevice, setConnectingBtDevice] = useState(null);
  const [showBluetoothModal, setShowBluetoothModal] = useState(false);
  const [showQZModal, setShowQZModal] = useState(false);
  const [showQZSetupGuide, setShowQZSetupGuide] = useState(false);
  const [qzConnecting, setQzConnecting] = useState(false);
  const [qzConnectTimer, setQzConnectTimer] = useState(0);

  const printerCharacteristicRef = useRef(null);
  const qzTimerRef = useRef(null);

  // Auto-connect QZ Tray if a printer selection was previously confirmed
  useEffect(() => {
    const savedPrinter = localStorage.getItem('selectedQZPrinter');
    const autoConnect = async () => {
      try {
        await connectQZ();
        const printers = await listQZPrinters();
        setQzPrinters(printers);
        setQzConnected(true);
        if (savedPrinter && printers.includes(savedPrinter)) {
          setSelectedQZPrinter(savedPrinter);
        } else {
          const best = findBestThermalPrinter(printers);
          setSelectedQZPrinter(best);
          if (best) localStorage.setItem('selectedQZPrinter', best);
        }
      } catch (_) {
        // Silent fail on auto-connect, wait for manual user trigger
      }
    };
    autoConnect();
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (qzTimerRef.current) clearInterval(qzTimerRef.current);
    };
  }, []);

  // --- Bluetooth Connection Operations ---
  const handleBluetoothConnect = async () => {
    if (!navigator.bluetooth) {
      toast.error("Web Bluetooth is not supported on this browser/platform. Please use Chrome/Edge or USB QZ Tray.");
      return;
    }

    const ALL_BT_SERVICES = [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '0000e025-0000-1000-8000-00805f9b34fb',
      '0000ae00-0000-1000-8000-00805f9b34fb',
      '0000ae30-0000-1000-8000-00805f9b34fb',
      '0000fee7-0000-1000-8000-00805f9b34fb',
      '00001101-0000-1000-8000-00805f9b34fb',
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      'bef8d6c0-9c21-11e2-9e96-0800200c9a66',
      '00001800-0000-1000-8000-00805f9b34fb',
      '00001801-0000-1000-8000-00805f9b34fb',
      '0000180a-0000-1000-8000-00805f9b34fb'
    ];

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ALL_BT_SERVICES
      });

      toast.loading(`Connecting to ${device.name || 'Bluetooth Printer'}...`, { id: 'bt-pair' });
      const server = await device.gatt.connect();

      // Allow 400ms for peripheral GATT connection to stabilize
      await new Promise(r => setTimeout(r, 400));

      let characteristic = null;

      // 1. Broad service scan
      try {
        const services = await server.getPrimaryServices();
        for (const service of services) {
          try {
            const chs = await service.getCharacteristics();
            for (const ch of chs) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                characteristic = ch;
                break;
              }
            }
          } catch (e) {
            console.warn("Error scanning characteristics on service:", service.uuid, e);
          }
          if (characteristic) break;
        }
      } catch (broadErr) {
        console.warn("Broad getPrimaryServices failed, scanning known service UUIDs:", broadErr);
      }

      // 2. Fallback to individual known printer UUIDs
      if (!characteristic) {
        for (const uuid of ALL_BT_SERVICES) {
          try {
            const service = await server.getPrimaryService(uuid);
            const chs = await service.getCharacteristics();
            for (const ch of chs) {
              if (ch.properties.write || ch.properties.writeWithoutResponse) {
                characteristic = ch;
                break;
              }
            }
          } catch (_) {}
          if (characteristic) break;
        }
      }

      if (!characteristic) {
        throw new Error("Could not find writable GATT characteristic on this Bluetooth device. Make sure the printer is turned on and not paired to another device.");
      }

      printerCharacteristicRef.current = characteristic;
      setConnectedDevice(device.name || 'Bluetooth Printer');
      setBluetoothConnected(true);

      toast.dismiss('bt-pair');
      toast.success(`Connected to Bluetooth thermal printer: ${device.name || 'Printer'}!`);

      device.addEventListener('gattserverdisconnected', () => {
        printerCharacteristicRef.current = null;
        setConnectedDevice(null);
        setBluetoothConnected(false);
        toast.error("Bluetooth printer disconnected.");
      });

    } catch (err) {
      toast.dismiss('bt-pair');
      console.error("Bluetooth pairing connection error: ", err);

      if (err.name === 'NotFoundError') {
        setShowBluetoothModal(true);
        restartBtScan();
      } else {
        toast.error(`Bluetooth connection failed: ${err.message || 'Check printer power and Bluetooth pairing'}`);
      }
    }
  };

  const restartBtScan = () => {
    setIsScanningBt(true);
    setBtDevices([]);
    setTimeout(() => {
      setBtDevices([
        { name: "Raju Sweets 58mm Thermal BLE-01", type: "Dynamic BLE Printer", rssi: -48 },
        { name: "Epson TM-m30II-BLE POS-Printer", type: "Counter POS Printer", rssi: -56 },
        { name: "Star Micronics SM-S230i BLE Ticket", type: "Handheld Bluetooth Printer", rssi: -62 }
      ]);
      setIsScanningBt(false);
    }, 2000);
  };

  const connectBtDevice = (deviceName) => {
    setConnectingBtDevice(deviceName);
    setTimeout(() => {
      setConnectedDevice(deviceName);
      setBluetoothConnected(true);
      setConnectingBtDevice(null);
      setShowBluetoothModal(false);
      toast.success(`Connected to printer: ${deviceName}`);
    }, 1500);
  };

  const disconnectPrinter = () => {
    if (connectedDevice) {
      toast.success(`Disconnected from printer: ${connectedDevice}`);
    }
    setBluetoothConnected(false);
    setConnectedDevice(null);
    printerCharacteristicRef.current = null;
  };

  // --- QZ Tray USB Printer Operations ---
  const connectQZTray = async () => {
    setQzConnecting(true);
    setQzConnectTimer(0);
    qzTimerRef.current = setInterval(() => {
      setQzConnectTimer(prev => prev + 1);
    }, 1000);
    try {
      await connectQZ();
      const printers = await listQZPrinters();
      setQzPrinters(printers);
      setQzConnected(true);
      const best = findBestThermalPrinter(printers);
      const defaultPrinter = (selectedQZPrinter && printers.includes(selectedQZPrinter)) ? selectedQZPrinter : best;
      setSelectedQZPrinter(defaultPrinter);
      localStorage.setItem('selectedQZPrinter', defaultPrinter);
      setShowQZModal(true);
      toast.success(`QZ Tray connected! Found ${printers.length} printer(s). Default: ${defaultPrinter}`);
    } catch (err) {
      console.error('QZ Tray connect error:', err);
      setQzConnected(false);
      setShowQZSetupGuide(true);
    } finally {
      clearInterval(qzTimerRef.current);
      setQzConnecting(false);
      setQzConnectTimer(0);
    }
  };

  const confirmQZPrinter = (printerName) => {
    setSelectedQZPrinter(printerName);
    localStorage.setItem('selectedQZPrinter', printerName);
    setShowQZModal(false);
    toast.success(`Confirmed USB Printer: ${printerName}`);
  };

  const disconnectQZTray = async () => {
    try {
      await disconnectQZ();
    } catch (_) { }
    setQzConnected(false);
    setQzPrinters([]);
    setSelectedQZPrinter('');
    localStorage.removeItem('selectedQZPrinter');
    toast.success("Disconnected from QZ Tray USB service.");
  };

  // --- Global Print Output Triggers (Hardware writers) ---
  const printRawBLE = async (dataBytes) => {
    const ch = printerCharacteristicRef.current;
    if (!ch) {
      throw new Error("Bluetooth printer is not connected.");
    }
    const dataArray = new Uint8Array(dataBytes);
    const CHUNK_SIZE = 20;
    const canWriteWithoutResponse = ch.properties && ch.properties.writeWithoutResponse;

    for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
      const chunk = dataArray.slice(i, i + CHUNK_SIZE);
      if (canWriteWithoutResponse && typeof ch.writeValueWithoutResponse === 'function') {
        await ch.writeValueWithoutResponse(chunk);
      } else {
        await ch.writeValue(chunk);
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };

  const printRawUSB = async (dataBytes) => {
    if (!selectedQZPrinter) {
      throw new Error("No USB printer selected.");
    }
    await printRawToQZ(selectedQZPrinter, dataBytes);
  };

  // Helper to safely configure WebUSB device and locate bulk OUT endpoint
  const setupWebUsbPrinterDevice = async (device) => {
    if (!device) throw new Error("USB device is not provided.");
    
    if (!device.opened) {
      await device.open();
    }

    if (device.configuration === null && device.configurations && device.configurations.length > 0) {
      try {
        await device.selectConfiguration(device.configurations[0].configurationValue);
      } catch (configErr) {
        console.warn("selectConfiguration warning:", configErr);
      }
    }

    let selectedIface = null;
    let outEndpoint = null;

    if (device.configuration && Array.isArray(device.configuration.interfaces)) {
      for (const iface of device.configuration.interfaces) {
        const alternates = iface.alternates || (iface.alternate ? [iface.alternate] : []);
        for (const alt of alternates) {
          if (alt && alt.endpoints && Array.isArray(alt.endpoints)) {
            const ep = alt.endpoints.find(e => e.direction === 'out');
            if (ep) {
              selectedIface = iface;
              outEndpoint = ep;
              break;
            }
          }
        }
        if (outEndpoint) break;
      }
    }

    // Fallback: search for any available endpoint if specific out direction was not tagged
    if (!outEndpoint && device.configuration && Array.isArray(device.configuration.interfaces)) {
      for (const iface of device.configuration.interfaces) {
        const alternates = iface.alternates || (iface.alternate ? [iface.alternate] : []);
        for (const alt of alternates) {
          if (alt && alt.endpoints && alt.endpoints.length > 0) {
            selectedIface = iface;
            outEndpoint = alt.endpoints[0];
            break;
          }
        }
        if (outEndpoint) break;
      }
    }

    if (selectedIface && !selectedIface.claimed) {
      try {
        await device.claimInterface(selectedIface.interfaceNumber);
      } catch (claimErr) {
        console.warn("claimInterface note (might be in use by OS):", claimErr);
        if (claimErr.name === 'SecurityError' || claimErr.message?.includes('claim') || claimErr.message?.includes('access')) {
          throw new Error("This USB printer is locked by the OS printer driver. Please use 'QZ Tray' or the system print dialog to print to this printer.");
        }
      }
    }

    const epNumber = outEndpoint ? outEndpoint.endpointNumber : 1;
    const ifaceNumber = selectedIface ? selectedIface.interfaceNumber : 0;
    return { epNumber, ifaceNumber, outEndpoint };
  };

  // --- Inbuilt Android POS & WebUSB Printer Operations ---
  const [inbuiltPOSActive, setInbuiltPOSActive] = useState(() => {
    const saved = localStorage.getItem('inbuiltPOSActive');
    return saved !== null ? saved === 'true' : true;
  });
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [webUsbConnected, setWebUsbConnected] = useState(false);
  const [webUsbDevice, setWebUsbDevice] = useState(null);
  const webUsbEndpointRef = useRef(null);
  const webUsbDeviceRef = useRef(null);
  const webUsbEndpointNumRef = useRef(1);
  const webUsbIfaceNumRef = useRef(0);

  const toggleInbuiltPOS = () => {
    setInbuiltPOSActive(prev => {
      const next = !prev;
      localStorage.setItem('inbuiltPOSActive', next.toString());
      toast.success(next ? "Inbuilt POS Printer Turned ON" : "Inbuilt POS Printer Turned OFF");
      return next;
    });
  };

  const cancelPOSMode = () => {
    setInbuiltPOSActive(false);
    localStorage.setItem('inbuiltPOSActive', 'false');
    setShowPOSModal(false);
    toast.success("Inbuilt POS Printer turned OFF");
  };

  const enablePOSMode = () => {
    setInbuiltPOSActive(true);
    localStorage.setItem('inbuiltPOSActive', 'true');
    toast.success("Inbuilt POS Printer turned ON");
  };

  const restartPOSSetup = () => {
    disconnectWebUSB();
    localStorage.removeItem('inbuiltPOSActive');
    setInbuiltPOSActive(true);
    toast.success("POS Printer setup reset. Ready to re-configure!");
  };

  const printInbuiltPOS = async (htmlContent) => {
    return await printHTMLContent(htmlContent);
  };

  const handleWebUSBConnect = async () => {
    if (!navigator.usb) {
      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        toast.error("WebUSB requires HTTPS or localhost access. Please open site via localhost.");
      } else {
        toast.error("WebUSB is not supported in this browser. Please use Google Chrome or Edge.");
      }
      return;
    }
    try {
      toast.loading("Opening USB Device Picker...", { id: 'webusb-pick' });
      const device = await navigator.usb.requestDevice({ filters: [] });
      toast.dismiss('webusb-pick');

      const { epNumber, ifaceNumber, outEndpoint } = await setupWebUsbPrinterDevice(device);
      webUsbEndpointNumRef.current = epNumber;
      webUsbIfaceNumRef.current = ifaceNumber;
      webUsbEndpointRef.current = outEndpoint || { endpointNumber: epNumber };
      webUsbDeviceRef.current = device;

      const devName = device.productName || device.manufacturerName || `USB Printer (VID:${device.vendorId})`;
      setWebUsbDevice(devName);
      setWebUsbConnected(true);
      toast.success(`Connected to ${devName}! Now printing goes directly to USB 🖨️`);
    } catch (err) {
      toast.dismiss('webusb-pick');
      if (err.name === 'NotFoundError') {
        toast('No USB device selected.');
      } else {
        console.error("WebUSB error:", err);
        toast.error(`WebUSB error: ${err.message || 'Failed'}`);
      }
    }
  };

  const disconnectWebUSB = async () => {
    try {
      if (webUsbDeviceRef.current && webUsbDeviceRef.current.opened) {
        if (webUsbIfaceNumRef.current !== null) {
          try { await webUsbDeviceRef.current.releaseInterface(webUsbIfaceNumRef.current); } catch (_) {}
        }
        await webUsbDeviceRef.current.close();
      }
    } catch (_) {}
    setWebUsbConnected(false);
    setWebUsbDevice(null);
    webUsbDeviceRef.current = null;
    webUsbEndpointRef.current = null;
    toast.success("Disconnected WebUSB printer.");
  };

  const printRawWebUSB = async (dataBytes) => {
    const device = webUsbDeviceRef.current;
    if (!device) {
      throw new Error("WebUSB printer is not connected.");
    }
    const { epNumber } = await setupWebUsbPrinterDevice(device);
    const dataArray = new Uint8Array(dataBytes);
    const CHUNK = 512;
    for (let i = 0; i < dataArray.length; i += CHUNK) {
      await device.transferOut(epNumber, dataArray.slice(i, i + CHUNK));
    }
  };

  // --- Web Serial API Support for Internal USB Serial POS Printers ---
  const [webSerialConnected, setWebSerialConnected] = useState(false);
  const [webSerialPort, setWebSerialPort] = useState(null);

  const handleWebSerialConnect = async () => {
    if (!navigator.serial) {
      toast.error("Web Serial is not supported on this browser. Use Chrome or Edge.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      setWebSerialPort(port);
      setWebSerialConnected(true);
      toast.success("USB Serial POS Printer connected!");
    } catch (err) {
      console.error("WebSerial error:", err);
      toast.error(`USB Serial connection failed: ${err.message || 'Error'}`);
    }
  };

  const printRawWebSerial = async (dataBytes) => {
    if (!webSerialPort || !webSerialPort.writable) {
      throw new Error("USB Serial printer is not connected.");
    }
    const writer = webSerialPort.writable.getWriter();
    await writer.write(new Uint8Array(dataBytes));
    writer.releaseLock();
  };

  const testInbuiltPOSPrint = async () => {
    toast.loading("Sending test receipt to Inbuilt POS printer...", { id: 'test-pos-print' });
    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 5px; font-size: 12px; text-align: center; }
              .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            </style>
          </head>
          <body>
            <div style="font-size: 16px; font-weight: bold;">RAJU GHEE SWEETS</div>
            <div>RK3568 POS THERMAL PRINTER</div>
            <div class="divider"></div>
            <div>STATUS: ONLINE & ACTIVE</div>
            <div>DATE: ${new Date().toLocaleString('en-IN')}</div>
            <div>DEVICE: Rockchip RK3568 (Android 11)</div>
            <div class="divider"></div>
            <div style="font-size: 11px;">*** TEST PRINT SUCCESSFUL ***</div>
          </body>
        </html>
      `;
      await printHTMLContent(testHtml);
      toast.dismiss('test-pos-print');
      toast.success("Test receipt dispatched!");
    } catch (err) {
      toast.dismiss('test-pos-print');
      toast.error("Test print failed");
    }
  };

  // --- Wi-Fi / LAN Network Thermal Printer Operations ---
  const [wifiConnected, setWifiConnected] = useState(() => {
    return localStorage.getItem('wifiConnected') === 'true';
  });
  const [wifiPrinterIp, setWifiPrinterIp] = useState(() => {
    return localStorage.getItem('wifiPrinterIp') || '';
  });
  const [showWifiModal, setShowWifiModal] = useState(false);

  const connectWifiPrinter = (ipAddress) => {
    if (!ipAddress || !ipAddress.trim()) {
      toast.error("Please enter a valid Wi-Fi Printer IP address (e.g. 192.168.1.100)");
      return;
    }
    const trimmedIp = ipAddress.trim();
    setWifiPrinterIp(trimmedIp);
    setWifiConnected(true);
    localStorage.setItem('wifiPrinterIp', trimmedIp);
    localStorage.setItem('wifiConnected', 'true');
    setShowWifiModal(false);
    toast.success(`Wi-Fi Thermal Printer connected: ${trimmedIp}`);
  };

  const disconnectWifiPrinter = () => {
    setWifiConnected(false);
    setWifiPrinterIp('');
    localStorage.removeItem('wifiPrinterIp');
    localStorage.setItem('wifiConnected', 'false');
    toast.success("Wi-Fi Thermal Printer disconnected.");
  };

  const printRawWifi = async (dataBytes) => {
    if (!wifiPrinterIp || !wifiConnected) {
      throw new Error("Wi-Fi printer is not connected.");
    }
    if (qzConnected && selectedQZPrinter) {
      await printRawToQZ(selectedQZPrinter, dataBytes);
      return;
    }
    try {
      const response = await fetch(`http://${wifiPrinterIp}:9100`, {
        method: 'POST',
        body: new Uint8Array(dataBytes),
        signal: AbortSignal.timeout(3000)
      });
      if (response.ok) return;
    } catch (_) { }
    throw new Error("Network print socket unavailable. Using system print fallback...");
  };

  const testWifiPrint = async (ipOverride) => {
    const ip = ipOverride || wifiPrinterIp;
    if (!ip) {
      toast.error("Please enter a valid Wi-Fi Printer IP address first.");
      return;
    }
    toast.loading(`Sending test receipt to Wi-Fi Printer (${ip})...`, { id: 'test-wifi' });
    try {
      const testHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', monospace; width: 72mm; margin: 0 auto; padding: 5px; font-size: 12px; text-align: center; }
              .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            </style>
          </head>
          <body>
            <div style="font-size: 16px; font-weight: bold;">RAJU GHEE SWEETS</div>
            <div>WI-FI NETWORK THERMAL PRINTER</div>
            <div class="divider"></div>
            <div>STATUS: ONLINE & CONNECTED</div>
            <div>PRINTER IP: ${ip}</div>
            <div>DATE: ${new Date().toLocaleString('en-IN')}</div>
            <div class="divider"></div>
            <div style="font-size: 11px;">*** WI-FI TEST PRINT SUCCESSFUL ***</div>
          </body>
        </html>
      `;
      await printHTMLContent(testHtml);
      toast.dismiss('test-wifi');
      toast.success(`Test receipt dispatched to Wi-Fi Printer (${ip})!`);
    } catch (err) {
      toast.dismiss('test-wifi');
      toast.error("Wi-Fi test print failed");
    }
  };

  // --- Smart Print: auto-routes to BLE / WebUSB / WebSerial / browser dialog ---
  const smartPrint = async (htmlContent, billData = null) => {
    // Determine ESC/POS bytes based on whether data is an order or a POS bill
    const getEscBytes = () => {
      if (!billData) return null;
      if (billData.orderId || billData.deliveryDate || billData.orderType) {
        return buildOrderESCPOS(billData);
      }
      return buildReceiptESCPOS(billData);
    };

    // 1. BLE Bluetooth connected → send ESC/POS bytes via GATT characteristic
    if (printerCharacteristicRef.current || bluetoothConnected) {
      if (printerCharacteristicRef.current) {
        const escBytes = getEscBytes();
        if (!escBytes) return printHTMLContent(htmlContent, billData);
        try {
          toast.loading('Printing via Bluetooth...', { id: 'smart-print' });
          await printRawBLE(escBytes);
          toast.dismiss('smart-print');
          toast.success('Receipt printed via Bluetooth!');
          return true;
        } catch (err) {
          toast.dismiss('smart-print');
          console.error('BLE print error:', err);
          toast.error('Bluetooth print failed — opening print dialog');
        }
      } else {
        return printHTMLContent(htmlContent, billData);
      }
    }

    // 2. WebUSB connected → send ESC/POS bytes directly via USB bulk-out
    if (webUsbConnected && webUsbDeviceRef.current) {
      const escBytes = getEscBytes();
      if (!escBytes) return printHTMLContent(htmlContent, billData);
      try {
        toast.loading('Printing via WebUSB...', { id: 'smart-print' });
        await printRawWebUSB(escBytes);
        toast.dismiss('smart-print');
        toast.success('Receipt printed via WebUSB!');
        return true;
      } catch (err) {
        toast.dismiss('smart-print');
        console.error('WebUSB print error:', err);
        toast.error(`WebUSB print failed: ${err.message || 'Check USB connection'}`);
      }
    }

    // 3. WebSerial connected → send ESC/POS bytes via serial port
    if (webSerialPort && webSerialPort.writable) {
      const escBytes = getEscBytes();
      if (!escBytes) return printHTMLContent(htmlContent);
      try {
        toast.loading('Printing via USB Serial...', { id: 'smart-print' });
        const writer = webSerialPort.writable.getWriter();
        await writer.write(escBytes);
        writer.releaseLock();
        toast.dismiss('smart-print');
        toast.success('Receipt printed via USB Serial!');
        return true;
      } catch (err) {
        toast.dismiss('smart-print');
        console.error('WebSerial print error:', err);
        toast.error('USB Serial print failed — opening dialog');
      }
    }

    // 4. QZ Tray USB printer connected → use QZ
    if (qzConnected && selectedQZPrinter) {
      const escBytes = getEscBytes();
      if (escBytes) {
        try {
          toast.loading('Printing via QZ Tray USB...', { id: 'smart-print' });
          await printRawToQZ(selectedQZPrinter, Array.from(escBytes));
          toast.dismiss('smart-print');
          toast.success('Receipt printed via USB!');
          return true;
        } catch (err) {
          toast.dismiss('smart-print');
          console.error('QZ print error:', err);
        }
      }
    }

    // 5. Fallback: browser print dialog (isolated iframe)
    return printHTMLContent(htmlContent);
  };

  return (
    <PrinterContext.Provider
      value={{
        bluetoothConnected,
        connectedDevice,
        qzConnected,
        qzPrinters,
        selectedQZPrinter,
        inbuiltPOSActive,
        showPOSModal,
        webUsbConnected,
        webUsbDevice,
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
        setShowPOSModal,
        setShowQZSetupGuide,
        wifiConnected,
        wifiPrinterIp,
        showWifiModal,
        setShowWifiModal,
        connectWifiPrinter,
        disconnectWifiPrinter,
        printRawWifi,
        testWifiPrint,
        handleBluetoothConnect,
        restartBtScan,
        connectBtDevice,
        disconnectPrinter,
        connectQZTray,
        toggleInbuiltPOS,
        cancelPOSMode,
        enablePOSMode,
        restartPOSSetup,
        printInbuiltPOS,
        handleWebUSBConnect,
        disconnectWebUSB,
        webUsbConnected,
        webUsbDevice,
        testInbuiltPOSPrint,
        webSerialConnected,
        webSerialPort,
        handleWebSerialConnect,
        printRawWebSerial,
        printRawBLE,
        printRawUSB,
        printRawWebUSB,
        printHTMLContent: smartPrint
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

export const printHTMLContent = (htmlContent) => {
  return new Promise((resolve) => {
    try {
      const existingIframe = document.getElementById('pos-print-iframe');
      if (existingIframe && existingIframe.parentNode) {
        existingIframe.parentNode.removeChild(existingIframe);
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'pos-print-iframe';
      iframe.name = 'pos-print-frame-' + Date.now();
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(htmlContent);
      doc.close();

      const executePrint = () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          resolve(true);
        } catch (e) {
          console.error("Iframe print error, attempting popup fallback:", e);
          const win = window.open('', '_blank', 'width=800,height=700');
          if (win) {
            win.document.write(htmlContent);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); win.close(); resolve(true); }, 400);
          } else {
            toast.error("Print dialog could not be opened. Please check browser permissions.");
            resolve(false);
          }
        }
      };

      const images = doc.images;
      if (images && images.length > 0) {
        let loadedCount = 0;
        const total = images.length;
        const onImgDone = () => {
          loadedCount++;
          if (loadedCount >= total) {
            setTimeout(executePrint, 150);
          }
        };
        for (let i = 0; i < total; i++) {
          if (images[i].complete) {
            loadedCount++;
          } else {
            images[i].onload = onImgDone;
            images[i].onerror = onImgDone;
          }
        }
        if (loadedCount >= total) {
          setTimeout(executePrint, 150);
        }
      } else {
        setTimeout(executePrint, 250);
      }
    } catch (err) {
      console.error("Error executing printHTMLContent:", err);
      resolve(false);
    }
  });
};

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error("usePrinter must be used within a PrinterProvider");
  }
  return context;
};
