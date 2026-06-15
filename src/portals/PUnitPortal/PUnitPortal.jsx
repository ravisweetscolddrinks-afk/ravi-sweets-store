import React, { useState, useEffect, useRef } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import {
  BarChart3,
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Edit,
  Plus,
  Trash2,
  Bluetooth,
  Usb,
  RefreshCw,
  Printer,
  X,
  Search
} from 'lucide-react';
import { printRawToQZ, getLogoESCPOS } from '../../utils/qzTray';
import { usePrinter } from '../../context/PrinterContext';
import { db } from '../../config/firebase';
import {
  collection,
  query,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './PUnitPortal.css';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';
import { sendEventNotification } from '../../utils/notificationService';


const PUnitPortal = () => {
  const { id, tab } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDropdowns, setOpenDropdowns] = useState({});
  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    connectedDevice,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

  const getPrinterWidthParams = () => {
    // Default to 80mm (48 chars, 384 dots width for QZ/BLE image)
    let charsPerLine = 48;
    let qrWidth = 384; 

    // Check if Bluetooth device name or USB printer name indicates 58mm (2-inch)
    const printerName = bluetoothConnected ? connectedDevice : (qzConnected ? selectedQZPrinter : '');
    
    if (printerName && /58mm|58|mini|mobile|handheld/i.test(printerName)) {
      charsPerLine = 32;
      qrWidth = 280;
    } else if (printerName && /80mm|80|xp-80|xp80|epson|pos-80/i.test(printerName)) {
      charsPerLine = 48;
      qrWidth = 384;
    } else {
      // BLE handheld/portable receipt printers are overwhelmingly 58mm (32 chars)
      if (bluetoothConnected) {
        charsPerLine = 32;
        qrWidth = 280;
      }
    }
    return { charsPerLine, qrWidth };
  };

  // Editing Packing Details State
  const [editingOrderDetails, setEditingOrderDetails] = useState(null);
  const [boxes, setBoxes] = useState([{ boxNum: 1, contents: '' }]);
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [historyDate, setHistoryDate] = useState('');
  const [packingSubTab, setPackingSubTab] = useState('pending'); // 'pending' | 'completed' | 'moved'

  // Editing Order Items State
  const [editingOrderItems, setEditingOrderItems] = useState(null);
  const [tempItems, setTempItems] = useState([]);
  const [savingItems, setSavingItems] = useState(false);
  const [pUnitDetails, setPUnitDetails] = useState(null);

  const [storeFilter, setStoreFilter] = useState('All');
  const [itemFilter, setItemFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');

  // Get unique stores from the orders assigned to this unit
  const uniqueStores = React.useMemo(() => {
    const storesSet = new Set();
    orders.forEach(order => {
      if (order.pUnitId === id && order.storeName) {
        storesSet.add(order.storeName);
      }
    });
    return Array.from(storesSet).sort();
  }, [orders, id]);

  // Helper to format dates timezone-safely to DD/MM/YYYY format
  const formatToDDMMYYYY = (dateInput) => {
    if (!dateInput) return '';

    if (dateInput && typeof dateInput.toDate === 'function') {
      dateInput = dateInput.toDate();
    }

    if (dateInput instanceof Date) {
      const day = String(dateInput.getDate()).padStart(2, '0');
      const month = String(dateInput.getMonth() + 1).padStart(2, '0');
      const year = dateInput.getFullYear();
      return `${day}/${month}/${year}`;
    }

    if (typeof dateInput === 'string') {
      const trimmed = dateInput.trim();
      // Handle YYYY-MM-DD
      if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY-MM-DD
            return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
          } else if (parts[2].length === 4) { // DD-MM-YYYY
            return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
          }
        }
      }
      // Handle YYYY/MM/DD
      if (trimmed.includes('/')) {
        const parts = trimmed.split('/');
        if (parts.length === 3) {
          if (parts[0].length === 4) { // YYYY/MM/DD
            return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
          }
          return trimmed;
        }
      }

      const parsedDate = new Date(trimmed);
      if (!isNaN(parsedDate.getTime())) {
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const year = parsedDate.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return trimmed;
    }

    return '';
  };

  // Helper function to match dates across local format variations securely
  const isSameDay = (orderDateStr, selectedDateStr) => {
    if (!orderDateStr || !selectedDateStr) return false;

    // selectedDateStr is always YYYY-MM-DD
    const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);

    try {
      // 1. Slash format (DD/MM/YYYY or MM/DD/YYYY)
      if (orderDateStr.includes('/')) {
        const parts = orderDateStr.split('/');
        if (parts.length === 3) {
          const d = Number(parts[0]);
          const m = Number(parts[1]) - 1; // 0-indexed month
          const y = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
          // fallback to check MM/DD/YYYY
          const dAlt = Number(parts[1]);
          const mAlt = Number(parts[0]) - 1;
          const yAlt = Number(parts[2]);
          if (yAlt === selYear && mAlt === (selMonth - 1) && dAlt === selDay) {
            return true;
          }
        }
      }

      // 2. Dash format (YYYY-MM-DD)
      if (orderDateStr.includes('-')) {
        const parts = orderDateStr.split('-');
        if (parts.length === 3) {
          const y = Number(parts[0]);
          const m = Number(parts[1]) - 1;
          const d = Number(parts[2]);
          if (y === selYear && m === (selMonth - 1) && d === selDay) {
            return true;
          }
        }
      }

      // 3. Fallback date parse
      const parsed = new Date(orderDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() === selYear &&
          parsed.getMonth() === (selMonth - 1) &&
          parsed.getDate() === selDay;
      }
    } catch (e) {
      console.error("Error parsing order date:", e);
    }
    return false;
  };



  // --- Box Packing Handlers ---
  const handleOpenEditDetails = (order) => {
    setEditingOrderDetails(order);
    setPUnitDescription(order.pUnitDescription || '');

    // Check if the order already has dynamic boxes
    if (order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0) {
      setBoxes(order.boxes.map((b, idx) => ({ id: b.id || `box_${Date.now()}_${idx}_${Math.random()}`, ...b })));
    } else if (order.boxContents) {
      setBoxes([{ id: `box_${Date.now()}_0`, boxNum: 1, contents: order.boxContents }]);
    } else {
      setBoxes([{ id: `box_${Date.now()}_0`, boxNum: 1, contents: '' }]);
    }
  };

  const handleAddBox = () => {
    setBoxes(prev => {
      const newBox = { id: `box_${Date.now()}_${Math.random()}`, boxNum: 1, contents: '' };
      const updated = [newBox, ...prev];
      return updated.map((b, idx) => ({
        ...b,
        boxNum: idx + 1
      }));
    });
  };

  const handleRemoveBox = (index) => {
    if (boxes.length <= 1) {
      toast.error("An order must have at least one box");
      return;
    }
    const updated = boxes.filter((_, idx) => idx !== index).map((b, idx) => ({
      ...b,
      boxNum: idx + 1
    }));
    setBoxes(updated);
  };

  const handleBoxContentsChange = (index, value) => {
    const updated = [...boxes];
    updated[index].contents = value;
    setBoxes(updated);
  };

  const handleSavePackingDetails = async (e) => {
    e.preventDefault();
    if (!editingOrderDetails) return;

    const emptyBox = boxes.find(b => !b.contents.trim());
    if (emptyBox) {
      toast.error(`Please enter contents for Box #${emptyBox.boxNum}`);
      return;
    }

    setSavingDetails(true);
    try {
      const orderRef = doc(db, 'orders', editingOrderDetails.id);

      const plainTextContents = boxes.map(b => `Box ${b.boxNum}: ${b.contents.trim()}`).join('\n');

      await updateDoc(orderRef, {
        boxesPacked: boxes.length,
        boxes: boxes,
        boxContents: plainTextContents,
        pUnitDescription: pUnitDescription,
        updatedAt: serverTimestamp()
      });

      toast.success("Packing details saved!");
      setEditingOrderDetails(null);

      // Auto-trigger printing of slips (direct BLE or system printer dialog fallback)
      handlePrintTrigger(editingOrderDetails, boxes, pUnitDescription);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save packing details");
    } finally {
      setSavingDetails(false);
    }
  };

  const handlePrintTrigger = (order, boxesList, notes = '') => {
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }
    if (bluetoothConnected) {
      printDirectToBluetooth(order, boxesList, notes);
    } else if (qzConnected && selectedQZPrinter) {
      printDirectToQZ(order, boxesList, notes);
    } else {
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToQZ = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job to USB printer via QZ Tray...", { id: 'qz-print-job' });
    try {
      const { charsPerLine, qrWidth } = getPrinterWidthParams();
      const separator = "-".repeat(charsPerLine) + "\n";

      for (const box of boxesList) {
        const encoder = new TextEncoder();

        const INIT = new Uint8Array([0x1b, 0x40]);
        const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
        const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
        const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
        const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);

        let bytes = [];
        bytes.push(...INIT);
        bytes.push(...CENTER);
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode("RAVI SWEETS\n"));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
        bytes.push(...encoder.encode(separator));

        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode(separator));

        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}\n`));
        bytes.push(...encoder.encode(`Store: ${order.storeName || 'Outlet Store'}\n`));
        bytes.push(...encoder.encode(`Date: ${formatToDDMMYYYY(new Date())}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode(separator));

        bytes.push(...encoder.encode("Order Items:\n"));
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            const itemQtyStr = `${item.quantity} ${item.unit === 'Weight' ? 'kg' : 'pcs'}`;
            const maxNameLen = charsPerLine - itemQtyStr.length - 2;
            let nameToPrint = item.name;
            if (nameToPrint.length > maxNameLen) {
              nameToPrint = nameToPrint.substring(0, maxNameLen - 3) + "...";
            }
            const dotsCount = charsPerLine - nameToPrint.length - itemQtyStr.length;
            const lineStr = `${nameToPrint}${".".repeat(Math.max(1, dotsCount))}${itemQtyStr}\n`;
            bytes.push(...encoder.encode(lineStr));
          });
        } else {
          bytes.push(...encoder.encode("No items found\n"));
        }
        bytes.push(...encoder.encode(separator));

        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));

        if (notes) {
          bytes.push(...encoder.encode(separator));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }

        bytes.push(...encoder.encode(separator));

        // --- Dynamic ESC/POS QR Code Rasterization ---
        const boxIdToUse = box.id || `box_${Date.now()}_${box.boxNum}_${Math.random()}`;
        const qrDataUrl = window.location.origin + '/scan-box/' + order.id + '/' + boxIdToUse;
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrWidth}x${qrWidth}&data=${encodeURIComponent(qrDataUrl)}`;

        try {
          const qrBytes = await getLogoESCPOS(qrImgUrl, qrWidth); // Scale to dynamic width for maximum physical size
          if (qrBytes && qrBytes.length > 0) {
            bytes.push(...CENTER);
            bytes.push(...qrBytes);
            bytes.push(...encoder.encode("\nScan to Receive at Store\n"));
            bytes.push(...encoder.encode(separator));
          }
        } catch (qrErr) {
          console.error("ESCPOS QR generation error:", qrErr);
        }

        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${pUnitDetails?.name || id || 'Facility'}\n`));
        bytes.push(...encoder.encode("Thank you for your order!\n\n"));

        const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
        bytes.push(...CUT);

        const dataArray = new Uint8Array(bytes);
        await printRawUSB(dataArray);
        await new Promise(resolve => setTimeout(resolve, 800)); // wait between boxes
      }
      toast.dismiss('qz-print-job');
      toast.success("Printed successfully to USB printer!");
    } catch (err) {
      console.error("QZ USB print error: ", err);
      toast.dismiss('qz-print-job');
      let errorMsg = "Failed to print to USB";
      if (err.message && err.message.includes("not accepting job")) {
        errorMsg = "Printer is offline or paused. Please check Windows Print Queue settings";
      } else if (err.message) {
        errorMsg = err.message;
      }
      toast.error(`${errorMsg}. Opening system print fallback...`, { duration: 6000 });
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToBluetooth = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job directly to Bluetooth thermal printer...", { id: 'bt-print-job' });

    try {
      const { charsPerLine, qrWidth } = getPrinterWidthParams();
      const separator = "-".repeat(charsPerLine) + "\n";

      for (const box of boxesList) {
        const encoder = new TextEncoder();

        // ESC/POS Commands
        const INIT = new Uint8Array([0x1b, 0x40]);
        const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
        const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
        const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
        const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);

        let bytes = [];

        bytes.push(...INIT);

        bytes.push(...CENTER);
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode("RAVI SWEETS\n"));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
        bytes.push(...encoder.encode(separator));

        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode(separator));

        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}\n`));
        bytes.push(...encoder.encode(`Store: ${order.storeName || 'Outlet Store'}\n`));
        bytes.push(...encoder.encode(`Date: ${formatToDDMMYYYY(new Date())}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode(separator));

        bytes.push(...encoder.encode("Order Items:\n"));
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            const itemQtyStr = `${item.quantity} ${item.unit === 'Weight' ? 'kg' : 'pcs'}`;
            const maxNameLen = charsPerLine - itemQtyStr.length - 2;
            let nameToPrint = item.name;
            if (nameToPrint.length > maxNameLen) {
              nameToPrint = nameToPrint.substring(0, maxNameLen - 3) + "...";
            }
            const dotsCount = charsPerLine - nameToPrint.length - itemQtyStr.length;
            const lineStr = `${nameToPrint}${".".repeat(Math.max(1, dotsCount))}${itemQtyStr}\n`;
            bytes.push(...encoder.encode(lineStr));
          });
        } else {
          bytes.push(...encoder.encode("No items found\n"));
        }
        bytes.push(...encoder.encode(separator));

        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));

        if (notes) {
          bytes.push(...encoder.encode(separator));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }

        bytes.push(...encoder.encode(separator));

        // --- Dynamic ESC/POS QR Code Rasterization ---
        const boxIdToUse = box.id || `box_${Date.now()}_${box.boxNum}_${Math.random()}`;
        const qrDataUrl = window.location.origin + '/scan-box/' + order.id + '/' + boxIdToUse;
        const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrWidth}x${qrWidth}&data=${encodeURIComponent(qrDataUrl)}`;

        try {
          const qrBytes = await getLogoESCPOS(qrImgUrl, qrWidth); // Scale to dynamic width for maximum physical size
          if (qrBytes && qrBytes.length > 0) {
            bytes.push(...CENTER);
            bytes.push(...qrBytes);
            bytes.push(...encoder.encode("\nScan to Receive at Store\n"));
            bytes.push(...encoder.encode(separator));
          }
        } catch (qrErr) {
          console.error("ESCPOS QR generation error:", qrErr);
        }

        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${pUnitDetails?.name || id || 'Facility'}\n`));
        bytes.push(...encoder.encode("Thank you for your order!\n\n"));

        const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
        bytes.push(...CUT);

        const dataArray = new Uint8Array(bytes);

        await printRawBLE(dataArray);
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      toast.dismiss('bt-print-job');
      toast.success("Printed successfully to Bluetooth printer!");
    } catch (err) {
      console.error("Direct BLE print error: ", err);
      toast.dismiss('bt-print-job');
      toast.error("Failed to print directly. Opening system print fallback...");
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const handlePrintBoxes = (order, boxesList, notes = '') => {
    const loadingToastId = toast.loading("Generating QR Codes & preparing slips...");

    // Preload all QR Code images so they load instantly in the print window
    const preloadPromises = boxesList.map((box, index) => {
      const boxIdToUse = box.id || `box_${Date.now()}_${index}_${Math.random()}`;
      const qrDataUrl = window.location.origin + '/scan-box/' + order.id + '/' + boxIdToUse;
      const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(qrDataUrl)}`;

      return new Promise((resolve) => {
        const img = new Image();
        img.src = qrImgUrl;
        img.onload = () => resolve({ boxId: boxIdToUse, imgUrl: qrImgUrl });
        img.onerror = () => resolve({ boxId: boxIdToUse, imgUrl: qrImgUrl }); // Resolve anyway to avoid blocking
      });
    });

    Promise.all(preloadPromises).then((preloadedData) => {
      toast.dismiss(loadingToastId);

      const printContent = `
        <html>
          <head>
            <title>Box Slips - Order ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}</title>
            <style>
              @media print {
                @page { size: auto; margin: 0; }
                body { margin: 0; padding: 4mm; background: white; width: 100%; }
              }
              body {
                font-family: 'Courier New', Courier, monospace;
                width: 100%;
                margin: 0;
                padding: 8px;
                box-sizing: border-box;
                font-size: 13px;
                line-height: 1.4;
                color: #000;
              }
              .slip {
                border-bottom: 2px dashed #000;
                padding-bottom: 15px;
                margin-bottom: 15px;
                page-break-after: always;
                text-align: left;
                width: 100%;
                box-sizing: border-box;
              }
              .slip:last-child {
                border-bottom: none;
                page-break-after: avoid;
                margin-bottom: 0;
                padding-bottom: 0;
              }
              .title {
                font-size: 18px;
                font-weight: bold;
                text-align: center;
                text-transform: uppercase;
                margin: 4px 0 2px 0;
              }
              .subtitle {
                font-size: 11px;
                text-align: center;
                border-bottom: 1px solid #000;
                padding-bottom: 6px;
                margin-bottom: 8px;
              }
              .info-label {
                font-weight: bold;
              }
              .info-row {
                margin: 4px 0;
              }
              .divider {
                border-top: 1px dashed #000;
                margin: 8px 0;
              }
              .box-header {
                font-size: 15px;
                font-weight: bold;
                text-align: center;
                background: #000;
                color: #fff;
                padding: 5px;
                margin: 10px 0;
              }
              .box-desc {
                font-size: 13px;
                white-space: pre-wrap;
                background: #f4f4f5;
                padding: 8px;
                border-radius: 4px;
                margin-top: 6px;
                border: 1px solid #ddd;
              }
              .qr-container {
                display: block;
                margin: 18px -10px 10px -10px;
                padding: 0;
                border: none;
                width: calc(100% + 20px);
                text-align: center;
                box-sizing: border-box;
              }
              .qr-image {
                width: 100% !important;
                height: auto !important;
                aspect-ratio: 1 / 1;
                margin: 0 auto 6px auto;
                display: block;
              }
              .qr-caption {
                font-size: 10px;
                font-weight: bold;
                color: #000;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }
              .footer {
                text-align: center;
                font-size: 10px;
                margin-top: 15px;
                border-top: 1px solid #000;
                padding-top: 6px;
                color: #555;
              }
            </style>
          </head>
          <body>
            ${boxesList.map((box, index) => {
        const preloaded = preloadedData[index] || {};
        const boxIdToUse = preloaded.boxId || `box_${Date.now()}_${index}_${Math.random()}`;
        const qrImgUrl = preloaded.imgUrl || `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.origin + '/scan-box/' + order.id + '/' + boxIdToUse)}`;

        return `
                <div class="slip">
                  <div class="title">Ravi Sweets</div>
                  <div class="subtitle">Quality Sweets & Savouries</div>
                  
                  <div class="box-header">BOX ${box.boxNum} OF ${boxesList.length}</div>
                  
                  <div class="info-row"><span class="info-label">Order ID:</span> ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}</div>
                  <div class="info-row"><span class="info-label">Store:</span> ${order.storeName || 'Outlet Store'}</div>
                  <div class="info-row"><span class="info-label">Date:</span> ${formatToDDMMYYYY(new Date())}</div>
                  
                  <div class="divider"></div>
                  
                  <div class="info-row"><span class="info-label">Customer:</span> ${order.customerName}</div>
                  <div class="info-row"><span class="info-label">Phone:</span> ${order.customerPhone || 'N/A'}</div>
                  
                  <div class="divider"></div>

                  <div class="info-row"><span class="info-label">Order Items:</span></div>
                  <div style="font-size: 11.5px; margin-top: 4px; padding-left: 2px;">
                    ${order.items ? order.items.map(item => `
                      <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                        <span>• ${item.name}</span>
                        <span style="font-weight: bold; font-family: monospace;">${item.quantity} ${item.unit === 'Weight' ? 'kg' : 'pcs'}</span>
                      </div>
                    `).join('') : '<div style="font-style: italic;">No items found</div>'}
                  </div>
                  
                  <div class="divider"></div>
                  
                  <div class="info-row"><span class="info-label">Items in Box:</span></div>
                  <div class="box-desc">${box.contents}</div>
                  
                  ${notes ? `
                    <div class="divider"></div>
                    <div class="info-row"><span class="info-label">Note:</span> ${notes}</div>
                  ` : ''}
                  
                  <div class="divider"></div>
                  
                  <div class="qr-container">
                    <img class="qr-image" src="${qrImgUrl}" alt="Box QR Code" />
                    <span class="qr-caption">Scan to Receive at Store</span>
                  </div>
                  
                  <div class="footer">
                    <p>Packed by Packing Unit: ${pUnitDetails?.name || id || 'Facility'}</p>
                    <p>Thank you for your order!</p>
                  </div>
                </div>
              `;
      }).join('')}
          </body>
        </html>
      `;

      const printWindow = window.open('', '_blank', 'width=600,height=800');
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    });
  };

  // --- Order Items Editing Handlers ---
  const handleOpenEditOrder = (order) => {
    setEditingOrderItems(order);
    // Deep clone the items array to keep the editing sandbox clean
    setTempItems(
      order.items
        ? order.items.map(item => ({
          ...item,
          // Keep quantity as string for a seamless typing experience (decimals/erasing)
          quantity: item.quantity !== undefined ? item.quantity.toString() : '0'
        }))
        : []
    );
  };

  const handleItemQuantityChange = (idx, value) => {
    const updated = [...tempItems];
    updated[idx].quantity = value;

    // Recalculate dynamic item total on the fly
    const qty = parseFloat(value) || 0;
    const price = parseFloat(updated[idx].price) || 0;
    updated[idx].total = parseFloat((qty * price).toFixed(2));

    setTempItems(updated);
  };

  const handleSaveEditedOrder = async (e) => {
    e.preventDefault();
    if (!editingOrderItems) return;

    setSavingItems(true);
    try {
      const updatedItemsForFirestore = tempItems.map(item => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        return {
          ...item,
          quantity: qty,
          total: parseFloat((qty * price).toFixed(2))
        };
      });

      const newTotalAmount = parseFloat(updatedItemsForFirestore.reduce((sum, item) => sum + item.total, 0).toFixed(2));
      const receivedAmt = parseFloat(editingOrderItems.receivedAmount) || 0;

      let newPaymentStatus = 'Pending';
      if (receivedAmt > 0) {
        if (receivedAmt >= newTotalAmount - 0.01) {
          newPaymentStatus = 'Done';
        } else {
          newPaymentStatus = 'Partial';
        }
      }

      const balanceDue = Math.max(0, newTotalAmount - receivedAmt);
      const overallStatus = calculateOverallOrderStatus(updatedItemsForFirestore);
      const statusChangedToReady = (!editingOrderItems.status || editingOrderItems.status !== 'Ready for Delivery') && overallStatus === 'Ready for Delivery';

      const orderRef = doc(db, 'orders', editingOrderItems.id);
      await updateDoc(orderRef, {
        items: updatedItemsForFirestore,
        totalAmount: newTotalAmount,
        receivedAmount: receivedAmt,
        paymentStatus: newPaymentStatus,
        paymentDue: balanceDue,     // Explicitly update paymentDue field
        balanceDue: balanceDue,     // Explicitly update balanceDue field for safety
        status: overallStatus,
        updatedAt: serverTimestamp()
      });

      toast.success("Order items and payment totals updated successfully!");

      if (statusChangedToReady) {
        setTimeout(() => triggerWhatsAppOrderReady({
          ...editingOrderItems,
          items: updatedItemsForFirestore,
          status: overallStatus,
          totalAmount: newTotalAmount,
          receivedAmount: receivedAmt,
          paymentStatus: newPaymentStatus
        }), 500);
      }
      setEditingOrderItems(null);
    } catch (error) {
      console.error("Save Order Edit Error:", error);
      toast.error("Failed to update order items");
    } finally {
      setSavingItems(false);
    }
  };

  const links = [
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/punit-portal/${id}/analytics` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/punit-portal/${id}/orders` },
    { label: 'History', icon: <Clock size={20} />, path: `/punit-portal/${id}/history` }
  ];

  // Fetch packing unit details (like Name) from Firestore securely
  useEffect(() => {
    if (!id) return;
    const fetchPUnit = async () => {
      try {
        const docRef = doc(db, 'packing_units', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPUnitDetails(docSnap.data());
        }
      } catch (err) {
        console.error("Error fetching packing unit details:", err);
      }
    };
    fetchPUnit();
  }, [id]);

  // Subscribe to all orders from Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, 'orders'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(allOrders);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Subscribe Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const calculateOverallOrderStatus = (items) => {
    if (!items || items.length === 0) return 'new';
    const getStatus = (item) => (item.status || 'preparation_started').toLowerCase().trim();
    const allDelivered = items.every(item => getStatus(item) === 'delivered');
    if (allDelivered) return 'Delivered';
    const allReceived = items.every(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (allReceived) return 'Ready for Delivery';
    const someReceived = items.some(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (someReceived) return 'Partially Ready for Delivery';
    const allMoved = items.every(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (allMoved) return 'Moved to Store';
    const someMoved = items.some(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (someMoved) return 'Partially Moved to Store';
    const hasProgressed = items.some(item => {
      const st = getStatus(item);
      return st !== 'preparation_started' && st !== 'new' && st !== '';
    });
    if (hasProgressed) return 'In Progress';
    return 'new';
  };

  const handleUpdateSingleItemStatus = async (orderDocId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderDocId);
      const order = orders.find(o => o.id === orderDocId);
      if (!order) return;

      const newItems = order.items.map((item, idx) => {
        if (idx === itemIndex) {
          return { ...item, status: newStatus };
        }
        return { ...item };
      });
      const overallStatus = calculateOverallOrderStatus(newItems);
      await updateDoc(orderRef, {
        items: newItems,
        status: overallStatus
      });
      toast.success("Item status updated successfully");

      const updatedItem = newItems[itemIndex];

      // 🔔 Notify store users when item is moved to store
      if (newStatus === 'moved_to_store' && order.storeId) {
        sendEventNotification('item_moved_to_store', order.storeId, {
          orderId: order.orderId || orderDocId,
          itemName: updatedItem?.name || 'Item',
          quantity: `${updatedItem?.quantity || ''} ${updatedItem?.unit === 'Weight' ? 'kg' : 'pcs'}`,
          customerName: order.customerName || '',
          storeName: order.storeName || '',
          storeId: order.storeId
        });
      }

      const statusChangedToReady = (!order.status || order.status !== 'Ready for Delivery') && overallStatus === 'Ready for Delivery';
      if (statusChangedToReady) {
        setTimeout(() => triggerWhatsAppOrderReady({
          ...order,
          items: newItems,
          status: overallStatus
        }), 500);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update status");
    }
  };

  const toggleDropdown = (orderId) => {
    setOpenDropdowns(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  if (!tab) return <Navigate to={`/punit-portal/${id}/orders`} replace />;

  // Filter orders assigned to this packing unit
  const assignedOrders = orders.filter(order => order.pUnitId === id);

  // Calculate Active Sub-tab counts
  const pendingCount = assignedOrders.filter(order => order.items?.some(i => i.status === 'moved_to_packing')).length;
  const completedCount = assignedOrders.filter(order => order.items?.some(i => i.status === 'packing_complete') && !order.items?.some(i => i.status === 'moved_to_packing')).length;
  const movedCount = assignedOrders.filter(order => order.items?.some(i => i.status === 'moved_to_store') && !order.items?.some(i => i.status === 'moved_to_packing') && !order.items?.some(i => i.status === 'packing_complete')).length;

  // Filter active packing orders based on sweet packaging status and selected sub-tab
  const getSubTabActiveOrders = () => {
    return assignedOrders.filter(order => {
      if (!order.items || order.items.length === 0) return false;

      const hasPending = order.items.some(i => i.status === 'moved_to_packing');
      const hasCompleted = order.items.some(i => i.status === 'packing_complete');
      const hasMoved = order.items.some(i => i.status === 'moved_to_store');

      if (packingSubTab === 'pending') {
        return hasPending;
      } else if (packingSubTab === 'completed') {
        return hasCompleted && !hasPending;
      } else if (packingSubTab === 'moved') {
        return hasMoved && !hasPending && !hasCompleted;
      }
      return false;
    });
  };

  // Filter history orders based on selected date filter
  const historyOrders = assignedOrders.filter(order => {
    if (!historyDate) return true;
    const orderDateStr = order.deliveryDate || (order.createdAt ? formatToDDMMYYYY(order.createdAt) : '');
    return isSameDay(orderDateStr, historyDate);
  });

  const applyAllFilters = (ordersList) => {
    return ordersList.filter(order => {
      // 1. Store Filter
      if (storeFilter !== 'All') {
        const orderStore = order.storeName || 'Outlet Store';
        if (orderStore !== storeFilter) return false;
      }
      
      // 2. Item Filter (Search inside order.items)
      if (itemFilter.trim() !== '') {
        const query = itemFilter.toLowerCase();
        const matchesItem = order.items && order.items.some(item => 
          (item.name || '').toLowerCase().includes(query)
        );
        if (!matchesItem) return false;
      }
      
      // 3. Order Filter (Search orderId, customerName, customerPhone)
      if (orderFilter.trim() !== '') {
        const query = orderFilter.toLowerCase();
        const matchesOrder = 
          (order.orderId || '').toLowerCase().includes(query) ||
          (order.customerName || '').toLowerCase().includes(query) ||
          (order.customerPhone || '').toLowerCase().includes(query);
        if (!matchesOrder) return false;
      }
      
      return true;
    });
  };

  // Decide which orders to display: 'orders' tab shows only active filtered by sub-tab, 'history' tab shows all history
  const displayedOrders = applyAllFilters(tab === 'orders' ? getSubTabActiveOrders() : historyOrders);

  return (
    <PortalLayout title="Packing Portal" links={links}>
      <div className="pu-portal-content">
        {loading ? (
          <div className="pu-loading-container">
            <div className="loader"></div>
            <p style={{ marginTop: '15px' }}>Loading packing dashboard...</p>
          </div>
        ) : (
          <>
            {/* --- ANALYTICS VIEW --- */}
            {tab === 'analytics' && (
              <div className="pu-analytics-view animate-fade-in">
                <h2>Packing Analytics</h2>
                <div className="pu-placeholder-card" style={{ background: '#fdf4ff', border: '1px dashed #e879f9', color: '#c026d3' }}>
                  Analytics dashboard for packing unit: <b>{id}</b> is currently under development.
                </div>
              </div>
            )}

            {/* --- ORDERS & HISTORY VIEW --- */}
            {(tab === 'orders' || tab === 'history') && (
              <div className="pu-orders-view animate-fade-in">



                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                  <div>
                    <h2>{tab === 'orders' ? 'Active Packing Orders' : 'Packing History'} ({displayedOrders.length})</h2>
                    <p style={{ color: '#64748b', fontSize: '13px', margin: '2px 0 0 0' }}>
                      {tab === 'orders'
                        ? 'Manage active sweet packaging workflows for this unit'
                        : 'View history of all orders for this unit'}
                    </p>
                  </div>
                  <span className="pu-status-badge" style={{ padding: '6px 12px', fontSize: '11px', background: 'var(--primary-color)', color: 'white' }}>
                    Packing Unit: {id}
                  </span>
                </div>

                {/* Sub-Tabs Selector for Active Packing Orders */}
                {tab === 'orders' && (
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    background: '#f1f5f9',
                    padding: '6px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    flexWrap: 'wrap',
                    border: '1px solid #e2e8f0'
                  }}>
                    <button
                      type="button"
                      onClick={() => setPackingSubTab('pending')}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: 'none',
                        background: packingSubTab === 'pending' ? 'white' : 'transparent',
                        color: packingSubTab === 'pending' ? 'var(--primary-color)' : '#64748b',
                        boxShadow: packingSubTab === 'pending' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        outline: 'none'
                      }}
                    >
                      ⏳ Pending Packing ({pendingCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackingSubTab('completed')}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: 'none',
                        background: packingSubTab === 'completed' ? 'white' : 'transparent',
                        color: packingSubTab === 'completed' ? '#7c3aed' : '#64748b',
                        boxShadow: packingSubTab === 'completed' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        outline: 'none'
                      }}
                    >
                      📦 Packing Completed ({completedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackingSubTab('moved')}
                      style={{
                        flex: 1,
                        minWidth: '120px',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        border: 'none',
                        background: packingSubTab === 'moved' ? 'white' : 'transparent',
                        color: packingSubTab === 'moved' ? '#ea580c' : '#64748b',
                        boxShadow: packingSubTab === 'moved' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                        outline: 'none'
                      }}
                    >
                      🚚 Moved to Store ({movedCount})
                    </button>
                  </div>
                )}

                {/* Date Filter Bar for History */}
                {tab === 'history' && (
                  <div className="pu-date-filter-bar" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '15px',
                    flexWrap: 'wrap',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    marginBottom: '20px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Calendar size={18} style={{ color: 'var(--primary-color)' }} />
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#334155' }}>Filter History by Date:</span>
                      <input
                        type="date"
                        value={historyDate}
                        onChange={(e) => setHistoryDate(e.target.value)}
                        style={{
                          padding: '6px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '600',
                          outline: 'none',
                          color: '#334155'
                        }}
                      />
                    </div>
                    {historyDate && (
                      <button
                        type="button"
                        onClick={() => setHistoryDate('')}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '700',
                          color: '#475569',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>
                )}

                {/* Store, Order, and Item Filters */}
                <div className="pu-filters-bar" style={{
                  display: 'flex',
                  gap: '15px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  {/* Store Filter */}
                  <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>Filter by Store</label>
                    <select
                      value={storeFilter}
                      onChange={(e) => setStoreFilter(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#334155',
                        outline: 'none',
                        background: '#fff',
                        cursor: 'pointer',
                        height: '38px'
                      }}
                    >
                      <option value="All">All Stores</option>
                      {uniqueStores.map(storeName => (
                        <option key={storeName} value={storeName}>{storeName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Order Search Filter */}
                  <div style={{ flex: '2 1 250px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>Search Order (ID, Customer, Phone)</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Type to search..."
                        value={orderFilter}
                        onChange={(e) => setOrderFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 36px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '13px',
                          color: '#334155',
                          outline: 'none',
                          boxSizing: 'border-box',
                          height: '38px'
                        }}
                      />
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </div>

                  {/* Item Search Filter */}
                  <div style={{ flex: '2 1 250px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569' }}>Search Item Name</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="e.g. Laddu, Halwa..."
                        value={itemFilter}
                        onChange={(e) => setItemFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px 8px 36px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '13px',
                          color: '#334155',
                          outline: 'none',
                          boxSizing: 'border-box',
                          height: '38px'
                        }}
                      />
                      <Package size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    </div>
                  </div>
                  
                  {/* Clear All Filters Button */}
                  {(storeFilter !== 'All' || orderFilter !== '' || itemFilter !== '') && (
                    <button
                      type="button"
                      onClick={() => {
                        setStoreFilter('All');
                        setOrderFilter('');
                        setItemFilter('');
                      }}
                      style={{
                        alignSelf: 'flex-end',
                        height: '38px',
                        padding: '0 16px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '700',
                        color: '#475569',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                    >
                      <X size={14} /> Clear
                    </button>
                  )}
                </div>

                <div className="pu-orders-grid">
                  {displayedOrders.length === 0 ? (
                    <div className="pu-empty-state">
                      <ShoppingBag size={48} className="pu-empty-icon" />
                      <h3>{tab === 'orders' ? 'No Active Orders' : 'No Order History'}</h3>
                      <p>
                        {tab === 'orders'
                          ? 'There are no active orders waiting to be packed.'
                          : historyDate
                            ? `No orders found in history for ${formatToDDMMYYYY(historyDate)}.`
                            : 'No orders found in history.'}
                      </p>
                    </div>
                  ) : (
                    displayedOrders.map(order => (
                      <div key={order.id} className="pu-order-card">
                        <div className="pu-order-header">
                          <div>
                            <h3>
                              Order {order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
                              <p className="pu-customer-name" style={{ margin: 0 }}>👤 {order.customerName}</p>
                              <p className="pu-customer-phone" style={{ margin: 0 }}>📞 {order.customerPhone || 'No Phone'}</p>
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px', 
                                fontSize: '11px', 
                                fontWeight: '700', 
                                color: '#475569', 
                                background: '#f1f5f9', 
                                padding: '2px 8px', 
                                borderRadius: '6px', 
                                width: 'fit-content',
                                marginTop: '2px'
                              }}>
                                🏪 {order.storeName || 'Outlet Store'}
                              </span>
                              {order.globalDescription && (
                                <div style={{
                                  marginTop: '6px',
                                  padding: '6px 10px',
                                  background: '#fef3c7',
                                  border: '1px solid #fcd34d',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  color: '#92400e',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '6px',
                                  lineHeight: '1.4'
                                }}>
                                  <span style={{ flexShrink: 0 }}>📝</span>
                                  <span><strong>Order Note:</strong> {order.globalDescription}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                            <span className={`pu-status-badge ${order.status}`}>
                              {order.status.replace(/_/g, ' ')}
                            </span>
                            {order.deliveryDate && (
                              <p className="pu-delivery-target">
                                📅 {formatToDDMMYYYY(order.deliveryDate)}
                                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{order.deliveryTime || ''}</div>
                              </p>
                            )}
                          </div>
                        </div>

                        {tab !== 'history' && (
                          <div style={{ display: 'flex', gap: '10px', marginTop: '12px', marginBottom: '4px' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenEditOrder(order)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: '800',
                                background: '#eff6ff',
                                color: '#2563eb',
                                border: '1px solid #bfdbfe',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                outline: 'none'
                              }}
                              className="pu-edit-order-main-btn"
                            >
                              <Edit size={13} /> Edit Order (Adjust Quantities)
                            </button>
                          </div>
                        )}

                        {/* Comprehensive Packing & Box Details Card */}
                        <div className="pu-instructions" style={{ borderLeft: '3px solid var(--primary-color)', background: '#faf5ff', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', marginTop: '10px', marginBottom: '12px', border: '1px solid #f3e8ff', borderLeftWidth: '3px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Package size={14} /> PACKING SLIPS & BOXES
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {order.boxesPacked !== undefined && (
                                <button
                                  type="button"
                                  onClick={() => handlePrintTrigger(order, order.boxes || [{ boxNum: 1, contents: order.boxContents }], order.pUnitDescription)}
                                  className="pu-mini-action-btn print"
                                  title="Print Box Slips"
                                >
                                  <Printer size={12} /> Print
                                </button>
                              )}
                              {tab !== 'history' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDetails(order)}
                                  className="pu-mini-action-btn edit"
                                  title="Edit packing details"
                                >
                                  <Edit size={12} /> Edit
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            <strong>📋 Packing Notes:</strong> {order.pUnitDescription || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None specified</span>}
                          </div>
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            <strong>📦 Boxes Packed:</strong> {order.boxesPacked !== undefined ? `${order.boxesPacked} boxes` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not recorded</span>}
                          </div>

                          {order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0 ? (
                            <div className="pu-packing-boxes-list">
                              {order.boxes.map((box, bIdx) => {
                                const isScanned = box.status === 'received_at_store' || box.received;
                                return (
                                  <div
                                    key={bIdx}
                                    className="pu-packing-box-item animate-fade-in"
                                    style={{
                                      background: isScanned ? '#d1fae5' : 'white',
                                      borderColor: isScanned ? '#10b981' : '#f1f5f9',
                                      color: isScanned ? '#065f46' : '#475569',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '10px'
                                    }}
                                  >
                                    <span>
                                      <strong>Box {box.boxNum}:</strong> <span>{box.contents}</span>
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      {isScanned && (
                                        <span style={{ fontSize: '9px', background: '#10b981', color: 'white', padding: '2px 6px', borderRadius: '4px', fontWeight: '800', whiteSpace: 'nowrap' }}>✓ RECEIVED AT STORE</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handlePrintTrigger(order, [box], order.pUnitDescription)}
                                        className="pu-mini-action-btn print"
                                        style={{ padding: '3px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        title={`Print Box ${box.boxNum}`}
                                      >
                                        <Printer size={10} /> Print Box {box.boxNum}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            order.boxContents && (
                              <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                <strong>📝 Box Contents:</strong> <span style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{order.boxContents}</span>
                              </div>
                            )
                          )}
                        </div>

                        {/* Dropdown Toggle Button */}
                        <button
                          type="button"
                          className="pu-dropdown-toggle-btn"
                          onClick={() => toggleDropdown(order.id)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            marginTop: 'auto',
                            fontWeight: '700',
                            fontSize: '12px',
                            color: '#475569',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span>Items List ({order.items?.length || 0} items)</span>
                          <span>{openDropdowns[order.id] ? '▲ Hide' : '▼ View Items'}</span>
                        </button>

                        {/* Dropdown list with animation */}
                        <AnimatePresence>
                          {openDropdowns[order.id] && (
                            <motion.div
                              className="pu-items-dropdown-list"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              style={{
                                overflow: 'hidden',
                                marginTop: '10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}
                            >
                              {order.items?.map((item, idx) => {
                                const isMovedToPacking = item.status === 'moved_to_packing';

                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '10px 12px',
                                      borderRadius: '8px',
                                      border: isMovedToPacking ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                                      background: isMovedToPacking ? '#f0fdf4' : '#fff7ed',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: isMovedToPacking ? '#166534' : '#9a3412' }}>
                                        {item.name}
                                      </h4>
                                      <div style={{ fontSize: '11px', color: isMovedToPacking ? '#15803d' : '#ea580c', display: 'flex', gap: '8px' }}>
                                        <span>Qty: {item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</span>
                                        {item.description && <span>• Note: {item.description}</span>}
                                      </div>
                                    </div>

                                    {tab === 'history' ? (
                                      <span
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          fontWeight: '700',
                                          borderRadius: '6px',
                                          border: '1px solid',
                                          borderColor: isMovedToPacking ? '#86efac' : '#fdba74',
                                          background: isMovedToPacking ? '#f0fdf4' : '#fff7ed',
                                          color: isMovedToPacking ? '#166534' : '#9a3412',
                                          display: 'inline-block'
                                        }}
                                      >
                                        {(item.status || 'preparation_started').replace(/_/g, ' ').toUpperCase()}
                                      </span>
                                    ) : (
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateSingleItemStatus(order.id, idx, item.status === 'packing_complete' ? 'moved_to_packing' : 'packing_complete')}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            border: '1px solid ' + (item.status === 'packing_complete' ? '#c084fc' : '#cbd5e1'),
                                            background: item.status === 'packing_complete' ? '#f3e8ff' : '#ffffff',
                                            color: item.status === 'packing_complete' ? '#6b21a8' : '#64748b',
                                            height: '28px',
                                            lineHeight: '1',
                                            outline: 'none',
                                            boxShadow: item.status === 'packing_complete' ? '0 1px 3px rgba(107, 33, 168, 0.1)' : 'none'
                                          }}
                                        >
                                          Packing Complete
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateSingleItemStatus(order.id, idx, item.status === 'moved_to_store' ? 'moved_to_packing' : 'moved_to_store')}
                                          style={{
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            border: '1px solid ' + (item.status === 'moved_to_store' ? '#fdba74' : '#cbd5e1'),
                                            background: item.status === 'moved_to_store' ? '#ffedd5' : '#ffffff',
                                            color: item.status === 'moved_to_store' ? '#9a3412' : '#64748b',
                                            height: '28px',
                                            lineHeight: '1',
                                            outline: 'none',
                                            boxShadow: item.status === 'moved_to_store' ? '0 1px 3px rgba(154, 52, 18, 0.1)' : 'none'
                                          }}
                                        >
                                          Moved to Store
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Edit Order Items Modal */}
            <AnimatePresence>
              {editingOrderItems && (
                <div className="pu-modal-overlay">
                  <motion.div
                    className="pu-modal-content"
                    style={{ maxWidth: '480px' }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div className="pu-modal-header">
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ShoppingBag size={18} style={{ color: 'var(--primary-color)' }} />
                        Edit Items - Order {editingOrderItems.serialNumber ? `S${editingOrderItems.serialNumber}-${editingOrderItems.orderId}` : `#${editingOrderItems.orderId}`}
                      </h3>
                      <button type="button" className="pu-modal-close" onClick={() => setEditingOrderItems(null)}>
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleSaveEditedOrder} className="pu-modal-form">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>
                          Adjust Weights (kg) or Pieces (pcs)
                        </label>

                        <div className="pu-edit-order-items-list" style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          maxHeight: '300px',
                          overflowY: 'auto',
                          padding: '8px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          background: '#f8fafc'
                        }}>
                          {tempItems.map((item, idx) => (
                            <div key={idx} className="pu-edit-order-item-row" style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                              background: 'white',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0'
                            }}>
                              <div style={{ flex: 2, minWidth: '120px' }}>
                                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>{item.name}</h4>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>Unit type: {item.unit === 'Weight' ? 'Weight-based' : 'Piece-based'}</span>
                              </div>

                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                <input
                                  type="number"
                                  step={item.unit === 'Weight' ? '0.001' : '1'}
                                  min="0"
                                  required
                                  value={item.quantity}
                                  onChange={(e) => handleItemQuantityChange(idx, e.target.value)}
                                  className="pu-edit-order-input"
                                  style={{
                                    width: '80px',
                                    height: '32px',
                                    padding: '0 8px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    color: '#334155',
                                    boxSizing: 'border-box',
                                    textAlign: 'center',
                                    outline: 'none'
                                  }}
                                />
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b', minWidth: '30px' }}>
                                  {item.unit === 'Weight' ? 'kg' : 'pcs'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pu-modal-footer">
                        <button
                          type="button"
                          onClick={() => setEditingOrderItems(null)}
                          className="pu-modal-btn cancel"
                          disabled={savingItems}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="pu-modal-btn save"
                          disabled={savingItems}
                        >
                          {savingItems ? (
                            <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff', margin: 0 }}></div>
                          ) : (
                            'Save Changes'
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Edit Dynamic Packing Details Modal */}
            <AnimatePresence>
              {editingOrderDetails && (
                <div className="pu-modal-overlay">
                  <motion.div
                    className="pu-modal-content"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <div className="pu-modal-header">
                      <h3>Packing Details - Order {editingOrderDetails.serialNumber ? `S${editingOrderDetails.serialNumber}-${editingOrderDetails.orderId}` : `#${editingOrderDetails.orderId}`}</h3>
                      <button type="button" className="pu-modal-close" onClick={() => setEditingOrderDetails(null)}>
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleSavePackingDetails} className="pu-modal-form">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>Configure Boxes *</label>
                          <button
                            type="button"
                            onClick={handleAddBox}
                            className="pu-add-box-btn"
                          >
                            <Plus size={14} style={{ marginRight: '4px' }} /> Add Box
                          </button>
                        </div>

                        <div className="pu-modal-boxes-container">
                          {boxes.map((box, index) => (
                            <div key={box.id || index} className="pu-modal-box-row animate-fade-in">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)' }}>BOX #{box.boxNum}</span>
                                {boxes.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBox(index)}
                                    className="pu-remove-box-btn"
                                    title="Remove box"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                              <textarea
                                required
                                rows={2}
                                placeholder={`Specify sweets, quantities or items packed in Box #${box.boxNum}...`}
                                value={box.contents}
                                onChange={(e) => handleBoxContentsChange(index, e.target.value)}
                                className="pu-modal-textarea"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pu-modal-field">
                        <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>Packing Instructions / Notes</label>
                        <textarea
                          rows={2}
                          placeholder="Enter instructions, notes or packing details..."
                          value={pUnitDescription}
                          onChange={(e) => setPUnitDescription(e.target.value)}
                          className="pu-modal-textarea"
                        />
                      </div>

                      <div className="pu-modal-footer">
                        <button
                          type="button"
                          onClick={() => setEditingOrderDetails(null)}
                          className="pu-modal-btn cancel"
                          disabled={savingDetails}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="pu-modal-btn save"
                          disabled={savingDetails}
                        >
                          {savingDetails ? (
                            <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff', margin: 0 }}></div>
                          ) : (
                            'Save & Print Slips'
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default PUnitPortal;
