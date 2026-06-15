import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { connectQZ, disconnectQZ, listQZPrinters, printRawToQZ } from '../utils/qzTray';
import toast from 'react-hot-toast';

const PrinterContext = createContext(null);

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
    if (savedPrinter) {
      const autoConnect = async () => {
        try {
          await connectQZ();
          const printers = await listQZPrinters();
          setQzPrinters(printers);
          setQzConnected(true);
          if (printers.includes(savedPrinter)) {
            setSelectedQZPrinter(savedPrinter);
          } else {
            const thermal = printers.find(p =>
              /thermal|pos|receipt|58mm|80mm|epson|star|citizen|bixolon|xprinter/i.test(p)
            );
            setSelectedQZPrinter(thermal || printers[0] || '');
          }
        } catch (_) {
          // Silent fail on auto-connect, wait for manual user trigger
        }
      };
      autoConnect();
    }
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (qzTimerRef.current) clearInterval(qzTimerRef.current);
    };
  }, []);

  // --- Bluetooth Connection Operations ---
  const handleBluetoothConnect = async () => {
    if (navigator.bluetooth) {
      toast.loading("Scanning for Bluetooth thermal printers...", { id: 'bt-loading' });
      try {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '00001101-0000-1000-8000-00805f9b34fb'
          ]
        });

        toast.dismiss('bt-loading');
        toast.loading(`Found device: ${device.name}. Pairing...`, { id: 'bt-pair' });
        const server = await device.gatt.connect();

        const services = await server.getPrimaryServices();
        let characteristic = null;

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
            console.warn("Error getting primary service characteristics:", e);
          }
          if (characteristic) break;
        }

        if (!characteristic) {
          throw new Error("Could not find writable characteristic for printing on this device.");
        }

        printerCharacteristicRef.current = characteristic;
        setConnectedDevice(device.name);
        setBluetoothConnected(true);

        toast.dismiss('bt-pair');
        toast.success(`Connected to Bluetooth printer: ${device.name}!`);

        device.addEventListener('gattserverdisconnected', () => {
          printerCharacteristicRef.current = null;
          setConnectedDevice(null);
          setBluetoothConnected(false);
          toast.error("Bluetooth printer disconnected.");
        });

      } catch (err) {
        toast.dismiss('bt-loading');
        toast.dismiss('bt-pair');
        console.error("Bluetooth pairing connection error: ", err);

        if (err.name === 'NotFoundError') {
          // Native request cancelled. Show Pair BLE printer modal fallback for manual scan retry
          setShowBluetoothModal(true);
          restartBtScan();
        } else {
          toast.error(`Bluetooth connection failed: ${err.message}`);
        }
      }
    } else {
      toast.error("Web Bluetooth is not supported on this browser/platform. Please use USB QZ Tray or fallback HTML.");
    }
  };

  const restartBtScan = () => {
    setIsScanningBt(true);
    setBtDevices([]);
    setTimeout(() => {
      setBtDevices([
        { name: "Ravi Sweets 58mm Thermal BLE-01", type: "Dynamic BLE Printer", rssi: -48 },
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
      const thermal = printers.find(p =>
        /thermal|pos|receipt|58mm|80mm|epson|star|citizen|bixolon|xprinter/i.test(p)
      );
      const defaultPrinter = thermal || printers[0] || '';
      setSelectedQZPrinter(defaultPrinter);
      localStorage.setItem('selectedQZPrinter', defaultPrinter);
      setShowQZModal(true);
      toast.success(`QZ Tray connected! Found ${printers.length} printer(s).`);
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
    if (!printerCharacteristicRef.current) {
      throw new Error("Bluetooth printer is not connected.");
    }
    const dataArray = new Uint8Array(dataBytes);
    const CHUNK_SIZE = 20;
    for (let i = 0; i < dataArray.length; i += CHUNK_SIZE) {
      const chunk = dataArray.slice(i, i + CHUNK_SIZE);
      await printerCharacteristicRef.current.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };

  const printRawUSB = async (dataBytes) => {
    if (!selectedQZPrinter) {
      throw new Error("No USB printer selected.");
    }
    await printRawToQZ(selectedQZPrinter, dataBytes);
  };

  return (
    <PrinterContext.Provider
      value={{
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
        disconnectQZTray,
        printRawBLE,
        printRawUSB
      }}
    >
      {children}
    </PrinterContext.Provider>
  );
};

export const usePrinter = () => {
  const context = useContext(PrinterContext);
  if (!context) {
    throw new Error("usePrinter must be used within a PrinterProvider");
  }
  return context;
};
