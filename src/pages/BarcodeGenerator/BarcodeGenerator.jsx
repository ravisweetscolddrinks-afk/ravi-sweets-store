import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Barcode, 
  Printer, 
  Search, 
  Scale, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Copy, 
  Layers, 
  Usb, 
  Settings2,
  Package,
  Eye,
  FileText,
  HelpCircle,
  ExternalLink,
  X,
  RotateCw,
  Move,
  Columns,
  Hash
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrinter } from '../../context/PrinterContext';
import './BarcodeGenerator.css';

// Default store branding header
const STORE_NAME = "SRI RAJU SWEETS";

const WEIGHT_PRESETS = [
  { label: '50g', value: 50 },
  { label: '100g', value: 100 },
  { label: '250g', value: 250 },
  { label: '400g', value: 400 },
  { label: '500g (1/2 KG)', value: 500 },
  { label: '750g', value: 750 },
  { label: '1000g (1 KG)', value: 1000 },
  { label: '1500g (1.5 KG)', value: 1500 },
  { label: '2000g (2 KG)', value: 2000 },
  { label: '2500g (2.5 KG)', value: 2500 },
  { label: '5000g (5 KG)', value: 5000 },
];

// Helper to extract clean numeric Barcode ID (e.g. 1004) instead of Firestore auto hashes (e.g. 7bnW...)
export const extractCleanNumericBarcodeId = (item) => {
  if (!item) return '1004';
  const raw = (item.barcode || item.barcodeId || item.code || item.itemCode || '').toString().trim();
  
  // If item has an explicit custom barcode/code (e.g. 1004, 1024), use it
  if (raw && !/^[a-zA-Z0-9]{15,30}$/.test(raw)) {
    return raw;
  }

  // If candidate is a 20-char Firestore auto hash (like 7bnW9x...), extract numbers or default to 1004
  const digits = (raw || item.id || '').replace(/[^0-9]/g, '');
  if (digits.length >= 4) {
    return digits.substring(0, 4);
  }

  return '1004';
};

const BarcodeGenerator = () => {
  const { 
    qzConnected, 
    qzPrinters,
    selectedQZPrinter, 
    showQZModal,
    showQZSetupGuide,
    qzConnecting,
    qzConnectTimer,
    setShowQZModal,
    setShowQZSetupGuide,
    connectQZTray, 
    confirmQZPrinter,
    disconnectQZTray,
    printRawUSB,
    printHTMLContent
  } = usePrinter();

  // Item & Data states
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Form states
  const [grams, setGrams] = useState(400);
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [barcodeFormatOption, setBarcodeFormatOption] = useState('asterisk'); // Default 'asterisk' (1004*0400)
  const [customBarcodeId, setCustomBarcodeId] = useState('1004');

  // Sticker Dimensions & Printer Calibration
  const [labelColumns, setLabelColumns] = useState(2); // 2 Columns per row (2-Up Sticker Roll)
  const [labelWidth, setLabelWidth] = useState(50); // 50mm per sticker
  const [labelHeight, setLabelHeight] = useState(25); // 25mm per sticker
  const [printMode, setPrintMode] = useState('tspl'); // 'tspl' (2-Column TSPL Text) or 'image' (Bitmap)
  const [labelDirection, setLabelDirection] = useState(0); // 0 = Standard, 1 = 180° Inverted
  const [xOffset, setXOffset] = useState(0);
  const [yOffset, setYOffset] = useState(0);
  const [showCalibration, setShowCalibration] = useState(false);

  // Batch Print Queue
  const [printQueue, setPrintQueue] = useState([]);

  // Barcode SVG Ref for rendering
  const barcodeRef = useRef(null);
  const printAreaRef = useRef(null);

  // Fetch products from Firestore
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemData);
      if (itemData.length > 0 && !selectedItem) {
        setSelectedItem(itemData[0]);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error fetching items:", err);
      toast.error("Failed to load products");
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Update custom price & barcode ID when selected item or grams changes
  useEffect(() => {
    if (selectedItem) {
      const basePrice = Number(selectedItem.price) || 0;
      if (selectedItem.unit === 'Piece') {
        setCustomPrice(basePrice);
      } else {
        const calculated = Math.round((basePrice * grams) / 1000);
        setCustomPrice(calculated);
      }
      const cleanId = extractCleanNumericBarcodeId(selectedItem);
      setCustomBarcodeId(cleanId);
    }
  }, [selectedItem, grams]);

  // Generate Barcode Encoded String (e.g. 1004*0400)
  const getBarcodeValue = () => {
    const rawBarcodeId = (customBarcodeId || (selectedItem ? extractCleanNumericBarcodeId(selectedItem) : '1004')).trim();
    const paddedWeight = String(grams || 0).padStart(4, '0');

    if (barcodeFormatOption === 'numeric') {
      return `${rawBarcodeId}${paddedWeight}`;
    }
    // Delimited Format: 1004*0400
    return `${rawBarcodeId}*${paddedWeight}`;
  };

  const barcodeValue = getBarcodeValue();

  // Render Barcode using JsBarcode
  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 1.6,
          height: 38,
          displayValue: false,
          margin: 0,
          background: "transparent"
        });
      } catch (err) {
        console.warn("JsBarcode render notice:", err);
      }
    }
  }, [barcodeValue, barcodeRef.current]);

  // Formatted Weight Display String (e.g. "400 GM" or "1 KG")
  const getFormattedWeightLabel = () => {
    if (!selectedItem) return '400 GM';
    if (selectedItem.unit === 'Piece') return '1 PC';
    
    if (grams >= 1000) {
      const kgVal = grams / 1000;
      return `${kgVal % 1 === 0 ? kgVal : kgVal.toFixed(2)} KG`;
    }
    return `${grams} GM`;
  };

  // Filter items search
  const filteredItems = items.filter(item => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (item.name || '').toLowerCase().includes(q);
    const codeMatch = (item.barcode || item.barcodeId || '').toLowerCase().includes(q);
    return nameMatch || codeMatch;
  });

  // Add to batch queue
  const handleAddToQueue = () => {
    if (!selectedItem) {
      toast.error("Please select a product first");
      return;
    }

    const newItem = {
      queueId: Date.now() + Math.random(),
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      barcodeId: customBarcodeId || extractCleanNumericBarcodeId(selectedItem),
      barcodeValue,
      grams,
      weightLabel: getFormattedWeightLabel(),
      mrp: Number(customPrice) || 0,
      quantity: Number(quantity) || 1,
      unit: selectedItem.unit || 'Weight'
    };

    setPrintQueue(prev => [...prev, newItem]);
    toast.success(`Added ${quantity} x ${selectedItem.name} to print queue`);
  };

  const handleRemoveFromQueue = (queueId) => {
    setPrintQueue(prev => prev.filter(i => i.queueId !== queueId));
  };

  const handleClearQueue = () => {
    setPrintQueue([]);
  };

  // --- TSPL 2-Column Buffer Generator ---
  const buildTSPLBuffer = (stickerItems) => {
    let tspl = '';
    const cols = Number(labelColumns);
    const totalWidthMm = cols === 2 ? 104 : labelWidth;

    for (let i = 0; i < stickerItems.length; i += cols) {
      const col1 = stickerItems[i];
      const col2 = cols === 2 ? stickerItems[i + 1] : null;

      tspl += `
SIZE ${totalWidthMm} mm, ${labelHeight} mm
GAP 2 mm, 0 mm
DIRECTION ${labelDirection}
CLS
`;

      // --- COLUMN 1 (LEFT STICKER: X = 10) ---
      const x1 = 10 + Number(xOffset);
      const y1 = 8 + Number(yOffset);
      tspl += `
TEXT ${180 + x1}, ${y1}, "2", 0, 1, 1, "${STORE_NAME}"
TEXT ${x1}, ${30 + y1}, "2", 0, 1, 1, "${col1.itemName.substring(0, 18)}"
TEXT ${300 + x1}, ${30 + y1}, "2", 0, 1, 1, "${col1.weightLabel}"
BARCODE ${15 + x1}, ${56 + y1}, "128", 40, 0, 0, 2, 2, "${col1.barcodeValue}"
TEXT ${15 + x1}, ${102 + y1}, "2", 0, 1, 1, "${col1.barcodeId}"
TEXT ${230 + x1}, ${102 + y1}, "2", 0, 1, 1, "MRP: ${col1.mrp}/-"
`;

      // --- COLUMN 2 (RIGHT STICKER: X = 425) ---
      if (col2) {
        const x2 = 425 + Number(xOffset);
        const y2 = 8 + Number(yOffset);
        tspl += `
TEXT ${180 + x2}, ${y2}, "2", 0, 1, 1, "${STORE_NAME}"
TEXT ${x2}, ${30 + y2}, "2", 0, 1, 1, "${col2.itemName.substring(0, 18)}"
TEXT ${300 + x2}, ${30 + y2}, "2", 0, 1, 1, "${col2.weightLabel}"
BARCODE ${15 + x2}, ${56 + y2}, "128", 40, 0, 0, 2, 2, "${col2.barcodeValue}"
TEXT ${15 + x2}, ${102 + y2}, "2", 0, 1, 1, "${col2.barcodeId}"
TEXT ${230 + x2}, ${102 + y2}, "2", 0, 1, 1, "MRP: ${col2.mrp}/-"
`;
      }

      tspl += `PRINT 1\n`;
    }

    return tspl;
  };

  const printStickersViaIframe = () => {
    if (!printAreaRef.current) return;
    const stickerHtml = printAreaRef.current.innerHTML;
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcodes - Raju Ghee Sweets</title>
          <style>
            @page {
              size: 104mm auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #fff;
            }
            .printable-stickers-area {
              display: flex;
              flex-wrap: wrap;
              gap: 2mm 3mm;
              width: 103mm;
              padding: 1mm;
              box-sizing: border-box;
            }
            .print-sticker-card {
              width: 50mm;
              height: 25mm;
              border: 1px solid #d1d5db;
              border-radius: 1mm;
              padding: 1.5mm 2mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              page-break-inside: avoid;
              font-family: 'Arial', sans-serif;
              color: #000000;
            }
            .sticker-header-title {
              text-align: center;
              font-size: 9pt;
              font-weight: 700;
              letter-spacing: 0.3px;
              text-transform: uppercase;
            }
            .sticker-sub-row {
              display: flex;
              justify-content: space-between;
              font-size: 8pt;
              font-weight: 600;
              color: #000000;
            }
            .sticker-barcode-wrapper {
              display: flex;
              justify-content: center;
              height: 11mm;
              overflow: hidden;
            }
            .sticker-barcode-wrapper svg {
              height: 100%;
              width: 100%;
            }
            .sticker-footer-row {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }
            .sticker-code-id {
              font-size: 8pt;
              font-weight: 600;
              font-family: monospace;
            }
            .sticker-mrp-price {
              font-size: 10pt;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="printable-stickers-area">
            ${stickerHtml}
          </div>
        </body>
      </html>
    `;
    printHTMLContent(fullHtml);
  };

  // --- Browser & USB Print Handlers ---
  const handleBrowserPrintCurrent = () => {
    if (!selectedItem) return;
    printStickersViaIframe();
  };

  // --- USB Printer Handler ---
  const handleUSBPrintCurrent = async () => {
    if (!selectedItem) return;

    if (qzConnected && selectedQZPrinter) {
      const copyQty = Number(quantity) || 1;
      const toastId = toast.loading(`Printing ${copyQty} sticker(s) on 2-Column roll to ${selectedQZPrinter}...`);

      try {
        const singleStickerObj = {
          itemName: selectedItem.name,
          weightLabel: getFormattedWeightLabel(),
          barcodeValue,
          barcodeId: customBarcodeId || extractCleanNumericBarcodeId(selectedItem),
          mrp: Number(customPrice) || 0
        };

        const stickerItems = Array.from({ length: copyQty }).map(() => singleStickerObj);

        if (printMode === 'image') {
          // --- HIGH-PRECISION BITMAP RASTER MODE ---
          const previewElem = document.getElementById('physical-sticker-preview');
          if (!previewElem) throw new Error("Sticker preview element not found");

          const canvas = await html2canvas(previewElem, {
            scale: 3,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false
          });

          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

          const qz = window.qz;
          const config = qz.configs.create(selectedQZPrinter, {
            size: { width: Number(labelColumns) === 2 ? 104 : Number(labelWidth), height: Number(labelHeight) },
            units: 'mm',
            density: 203,
            copies: copyQty,
            rotation: Number(labelDirection) === 1 ? 180 : 0
          });

          const data = [{
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: base64Data
          }];

          await qz.print(config, data);
          toast.success(`Printed ${copyQty} sticker(s) successfully!`, { id: toastId });
          return;
        } else {
          // --- 2-COLUMN TSPL MODE (RECOMMENDED FOR 2-UP ROLL) ---
          const tsplCode = buildTSPLBuffer(stickerItems);
          const encoder = new TextEncoder();
          await printRawUSB(encoder.encode(tsplCode));
          toast.success(`Sent 2-Column stickers (${barcodeValue}) to USB printer!`, { id: toastId });
          return;
        }
      } catch (err) {
        console.error("USB Print Error:", err);
        toast.error(`Direct USB print error: ${err.message || 'Check printer'}. Trying Windows Driver...`, { id: toastId });
      }
    }

    // Fallback: Windows Printer Driver Print via isolated iframe
    toast("Opening Windows USB Printer Driver...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe();
    }, 150);
  };

  // USB Batch Print
  const handleUSBPrintBatch = async () => {
    if (printQueue.length === 0) {
      toast.error("Print queue is empty!");
      return;
    }

    if (qzConnected && selectedQZPrinter) {
      const totalCount = printQueue.reduce((a, c) => a + c.quantity, 0);
      const toastId = toast.loading(`Printing 2-Column queue batch (${totalCount} stickers) to ${selectedQZPrinter}...`);

      try {
        const flattenedStickers = [];
        printQueue.forEach(item => {
          for (let i = 0; i < item.quantity; i++) {
            flattenedStickers.push(item);
          }
        });

        if (printMode === 'tspl') {
          const tsplCode = buildTSPLBuffer(flattenedStickers);
          const encoder = new TextEncoder();
          await printRawUSB(encoder.encode(tsplCode));
          toast.success(`Printed ${totalCount} stickers on 2-Column roll!`, { id: toastId });
          return;
        } else {
          const qz = window.qz;
          const config = qz.configs.create(selectedQZPrinter, {
            size: { width: Number(labelColumns) === 2 ? 104 : Number(labelWidth), height: Number(labelHeight) },
            units: 'mm',
            density: 203,
            rotation: Number(labelDirection) === 1 ? 180 : 0
          });

          const previewElem = document.getElementById('physical-sticker-preview');
          const canvas = await html2canvas(previewElem, { scale: 3, backgroundColor: '#ffffff', logging: false });
          const base64Data = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

          const data = flattenedStickers.map(() => ({
            type: 'pixel',
            format: 'image',
            flavor: 'base64',
            data: base64Data
          }));

          await qz.print(config, data);
          toast.success(`Batch printed ${totalCount} sticker(s)!`, { id: toastId });
          return;
        }
      } catch (err) {
        console.error("Batch USB Print Error:", err);
      }
    }

    // Fallback: Trigger Browser Print for entire batch via isolated iframe
    toast("Opening Windows USB Print dialog for batch...", { icon: '🖨️' });
    setTimeout(() => {
      printStickersViaIframe();
    }, 150);
  };

  return (
    <div className="barcode-generator-page">
      {/* Printable Area for Window Print (@media print hides everything else) */}
      <div className="printable-stickers-area" ref={printAreaRef}>
        {printQueue.length > 0 ? (
          printQueue.map((item) => (
            Array.from({ length: item.quantity }).map((_, idx) => (
              <div key={`${item.queueId}-${idx}`} className="print-sticker-card">
                <div className="sticker-header-title">{STORE_NAME}</div>
                <div className="sticker-sub-row">
                  <span className="sticker-item-name">{item.itemName}</span>
                  <span className="sticker-weight-tag">{item.weightLabel}</span>
                </div>
                <div className="sticker-barcode-wrapper">
                  <svg 
                    ref={node => {
                      if (node) {
                        try {
                          JsBarcode(node, item.barcodeValue, {
                            format: "CODE128",
                            lineColor: "#000000",
                            width: 1.5,
                            height: 34,
                            displayValue: false,
                            margin: 0
                          });
                        } catch(e) {}
                      }
                    }} 
                  />
                </div>
                <div className="sticker-footer-row">
                  <span className="sticker-code-id">{item.barcodeId}</span>
                  <span className="sticker-mrp-price">MRP: {item.mrp}/-</span>
                </div>
              </div>
            ))
          ))
        ) : selectedItem ? (
          Array.from({ length: quantity }).map((_, idx) => (
            <div key={`current-${idx}`} className="print-sticker-card">
              <div className="sticker-header-title">{STORE_NAME}</div>
              <div className="sticker-sub-row">
                <span className="sticker-item-name">{selectedItem.name}</span>
                <span className="sticker-weight-tag">{getFormattedWeightLabel()}</span>
              </div>
              <div className="sticker-barcode-wrapper">
                <svg 
                  ref={node => {
                    if (node) {
                      try {
                        JsBarcode(node, barcodeValue, {
                          format: "CODE128",
                          lineColor: "#000000",
                          width: 1.5,
                          height: 34,
                          displayValue: false,
                          margin: 0
                        });
                      } catch(e) {}
                    }
                  }} 
                />
              </div>
              <div className="sticker-footer-row">
                <span className="sticker-code-id">{customBarcodeId || extractCleanNumericBarcodeId(selectedItem)}</span>
                <span className="sticker-mrp-price">MRP: {customPrice}/-</span>
              </div>
            </div>
          ))
        ) : null}
      </div>

      {/* Screen UI Header */}
      <div className="barcode-header-bar">
        <div className="barcode-title-group">
          <div className="barcode-icon-badge">
            <Barcode size={24} />
          </div>
          <div>
            <h1 className="barcode-page-title">Barcode Sticker Generator</h1>
            <p className="barcode-page-subtitle">Select item, weight & quantity to print 2-column thermal barcodes</p>
          </div>
        </div>

        {/* Top Actions */}
        <div className="barcode-header-actions">
          <button 
            className="barcode-btn barcode-btn-secondary" 
            onClick={handleBrowserPrintCurrent}
            disabled={!selectedItem}
          >
            <Printer size={16} />
            Direct Windows Driver Print
          </button>

          <button 
            className="barcode-btn barcode-btn-primary" 
            onClick={handleUSBPrintCurrent}
            disabled={!selectedItem}
          >
            <Usb size={16} />
            Print Stickers ({quantity} Copies)
          </button>
        </div>
      </div>

      {/* USB PRINTER STATUS & SETUP BANNER */}
      {qzConnected && /pdf|fax|onenote|xps|document writer|microsoft/i.test(selectedQZPrinter || '') && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', padding: '14px 20px', borderRadius: '14px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={22} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '800', color: '#991b1b', fontSize: '14px' }}>
                Virtual File Printer Selected: "{selectedQZPrinter}"
              </div>
              <div style={{ fontSize: '13px', color: '#7f1d1d', marginTop: '2px' }}>
                This is why Windows opens a "Save File" dialog instead of printing to paper. Please select your physical USB Sticker Printer (e.g. TSC, TVS, Xprinter, Zebra).
              </div>
            </div>
          </div>
          <button className="barcode-btn barcode-btn-primary" style={{ background: '#dc2626', border: 'none', whiteSpace: 'nowrap' }} onClick={() => setShowQZModal(true)}>
            Select Physical USB Printer
          </button>
        </div>
      )}

      <div className="usb-printer-control-banner">
        <div className="usb-banner-info">
          <div className={`usb-status-dot ${qzConnected ? 'active' : 'inactive'}`} />
          <div>
            <h4 className="usb-banner-title">
              {qzConnected ? `QZ Tray USB Active: ${selectedQZPrinter || 'Printer Connected'}` : 'USB Thermal Printer Setup'}
            </h4>
            <p className="usb-banner-sub">
              {qzConnected 
                ? '2-Column 2-Up TSPL sticker printing is active.' 
                : 'QZ Tray desktop app is disconnected. You can connect QZ Tray for silent printing OR use Direct Windows Driver print.'}
            </p>
          </div>
        </div>

        <div className="usb-banner-actions">
          {qzConnected ? (
            <>
              <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZModal(true)}>
                <Settings2 size={14} /> Change Printer
              </button>
              <button className="barcode-btn barcode-btn-outline" onClick={disconnectQZTray}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <button className="barcode-btn barcode-btn-primary" onClick={connectQZTray} disabled={qzConnecting}>
                <RefreshCw size={14} className={qzConnecting ? 'animate-spin' : ''} />
                {qzConnecting ? `Connecting (${qzConnectTimer}s)...` : 'Connect QZ Tray USB'}
              </button>

              <button className="barcode-btn barcode-btn-secondary" onClick={() => setShowQZSetupGuide(true)}>
                <HelpCircle size={14} /> Setup & Download Guide
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="barcode-main-grid">

        {/* LEFT COLUMN: Item Selector & Configuration */}
        <div className="barcode-card form-section">
          
          {/* Item Selector Header */}
          <div className="card-section-header">
            <Package size={18} />
            <h3>1. Select Product</h3>
          </div>

          {/* Search Box */}
          <div className="barcode-search-box">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search product name or barcode ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          {/* Item Select List */}
          <div className="item-select-list">
            {loading ? (
              <div className="item-loader">Loading catalog items...</div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map(item => {
                const isSelected = selectedItem?.id === item.id;
                const barcodeId = extractCleanNumericBarcodeId(item);

                return (
                  <div 
                    key={item.id} 
                    className={`item-select-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="item-info">
                      <span className="item-name">{item.name}</span>
                      <span className="item-meta">
                        Code: <strong>{barcodeId}</strong> | Price: <strong>₹{item.price}/{item.unit === 'Piece' ? 'pc' : 'kg'}</strong>
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 size={18} className="selected-check" />}
                  </div>
                );
              })
            ) : (
              <div className="no-items-found">No matching products found</div>
            )}
          </div>

          {/* Step 2: Grams & Weight Input */}
          <div className="card-section-header margin-top">
            <Scale size={18} />
            <h3>2. Weight & Grams Selection</h3>
          </div>

          <div className="weight-input-container">
            <div className="form-group">
              <label>Weight in Grams (g)</label>
              <div className="input-with-unit">
                <input 
                  type="number" 
                  min="1"
                  max="100000"
                  value={grams}
                  onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
                />
                <span className="unit-label">Grams</span>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="form-group">
              <label>Quick Presets</label>
              <div className="weight-presets-grid">
                {WEIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`preset-btn ${grams === preset.value ? 'active' : ''}`}
                    onClick={() => setGrams(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Step 3: Quantity, Pricing & Barcode ID */}
          <div className="card-section-header margin-top">
            <Sliders size={18} />
            <h3>3. Quantity & Barcode Details</h3>
          </div>

          <div className="form-row-2col">
            <div className="form-group">
              <label>Sticker Quantity (Copies)</label>
              <div className="quantity-counter">
                <button 
                  type="button" 
                  onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                >-</button>
                <input 
                  type="number" 
                  min="1" 
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
                <button 
                  type="button" 
                  onClick={() => setQuantity(prev => prev + 1)}
                >+</button>
              </div>
            </div>

            <div className="form-group">
              <label>Item Barcode ID (e.g. 1004)</label>
              <div className="input-with-unit">
                <span className="unit-prefix"><Hash size={14} /></span>
                <input 
                  type="text" 
                  value={customBarcodeId}
                  placeholder="1004"
                  onChange={(e) => setCustomBarcodeId(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-group margin-top">
            <label>Calculated Sticker MRP (₹)</label>
            <div className="input-with-unit">
              <span className="unit-prefix">₹</span>
              <input 
                type="number" 
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Step 4: Barcode Format Settings */}
          <div className="form-group margin-top">
            <label>Barcode String Format</label>
            <div className="format-toggle-group">
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'asterisk' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('asterisk')}
              >
                Delimited (1004*0400)
              </button>
              <button 
                type="button" 
                className={`toggle-btn ${barcodeFormatOption === 'numeric' ? 'active' : ''}`}
                onClick={() => setBarcodeFormatOption('numeric')}
              >
                Numeric (10040400)
              </button>
            </div>
          </div>

          {/* Step 5: Printer Calibration & 2-Column Settings */}
          <div className="card-section-header margin-top" style={{ cursor: 'pointer' }} onClick={() => setShowCalibration(!showCalibration)}>
            <Settings2 size={18} />
            <h3>4. Printer Calibration & 2-Column Settings</h3>
            <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b' }}>{showCalibration ? '▲ Hide' : '▼ Expand'}</span>
          </div>

          {showCalibration && (
            <motion.div 
              className="calibration-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div className="form-group">
                <label>Sticker Paper Roll Layout</label>
                <div className="format-toggle-group">
                  <button 
                    type="button" 
                    className={`toggle-btn ${labelColumns === 2 ? 'active' : ''}`}
                    onClick={() => setLabelColumns(2)}
                  >
                    2 Columns (2-Up Roll)
                  </button>
                  <button 
                    type="button" 
                    className={`toggle-btn ${labelColumns === 1 ? 'active' : ''}`}
                    onClick={() => setLabelColumns(1)}
                  >
                    1 Column (Single Roll)
                  </button>
                </div>
              </div>

              <div className="form-group margin-top">
                <label>Print Engine Mode</label>
                <div className="format-toggle-group">
                  <button 
                    type="button" 
                    className={`toggle-btn ${printMode === 'tspl' ? 'active' : ''}`}
                    onClick={() => setPrintMode('tspl')}
                  >
                    TSPL Mode (2-Column Align)
                  </button>
                  <button 
                    type="button" 
                    className={`toggle-btn ${printMode === 'image' ? 'active' : ''}`}
                    onClick={() => setPrintMode('image')}
                  >
                    Image Mode (HTML Canvas)
                  </button>
                </div>
              </div>

              <div className="form-row-2col margin-top">
                <div className="form-group">
                  <label>Single Label Width (mm)</label>
                  <input 
                    type="number" 
                    value={labelWidth}
                    onChange={(e) => setLabelWidth(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
                <div className="form-group">
                  <label>Single Label Height (mm)</label>
                  <input 
                    type="number" 
                    value={labelHeight}
                    onChange={(e) => setLabelHeight(Number(e.target.value))}
                    className="calibration-input"
                  />
                </div>
              </div>

              <div className="form-group margin-top">
                <label>Label Feed Orientation / Rotation</label>
                <select 
                  value={labelDirection} 
                  onChange={(e) => setLabelDirection(Number(e.target.value))}
                  className="calibration-select"
                >
                  <option value={0}>0° Standard Top-to-Bottom</option>
                  <option value={1}>180° Inverted (Rotated upside down)</option>
                </select>
              </div>

              {printMode === 'tspl' && (
                <div className="form-row-2col margin-top">
                  <div className="form-group">
                    <label>X-Offset Alignment (dots)</label>
                    <input 
                      type="number" 
                      value={xOffset}
                      onChange={(e) => setXOffset(Number(e.target.value))}
                      className="calibration-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Y-Offset Alignment (dots)</label>
                    <input 
                      type="number" 
                      value={yOffset}
                      onChange={(e) => setYOffset(Number(e.target.value))}
                      className="calibration-input"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="form-actions-row margin-top">
            <button 
              type="button" 
              className="barcode-btn barcode-btn-outline full-width"
              onClick={handleAddToQueue}
              disabled={!selectedItem}
            >
              <Plus size={16} />
              Add to Print Queue
            </button>
          </div>

        </div>

        {/* RIGHT COLUMN: Live Sticker Preview & Printer Controls */}
        <div className="barcode-right-column">

          {/* Live Sticker Mockup Card */}
          <div className="barcode-card preview-card">
            <div className="card-section-header">
              <Eye size={18} />
              <h3>Live Sticker Preview</h3>
              <span className="live-tag">Clean Crisp Format</span>
            </div>

            <div className="sticker-preview-wrapper">
              <div className="physical-sticker-preview" id="physical-sticker-preview">
                {/* Header: SRI RAJU SWEETS */}
                <div className="preview-store-header">{STORE_NAME}</div>
                
                {/* Second Line: Item Name (Left) | Weight (Right) */}
                <div className="preview-item-row">
                  <span className="preview-item-name">{selectedItem?.name || 'Kaju Kalakan'}</span>
                  <span className="preview-weight">{getFormattedWeightLabel()}</span>
                </div>

                {/* Third Line: Barcode Graphics */}
                <div className="preview-barcode-container">
                  <svg ref={barcodeRef} className="preview-barcode-svg" />
                </div>

                {/* Fourth & Fifth Line: Barcode ID (Left) | MRP (Right) */}
                <div className="preview-footer-row">
                  <span className="preview-barcode-id">
                    {customBarcodeId || extractCleanNumericBarcodeId(selectedItem)}
                  </span>
                  <span className="preview-mrp">MRP: {customPrice || 360}/-</span>
                </div>
              </div>
            </div>

            <div className="preview-info-box">
              <div className="info-item">
                <span className="info-label">Scanned Barcode:</span>
                <span className="info-val monospace" style={{ fontWeight: '700', color: '#047857' }}>{barcodeValue}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Print Layout:</span>
                <span className="info-val">{labelColumns} Columns / Row</span>
              </div>
            </div>

            {/* Quick Print Action Buttons */}
            <div className="preview-action-buttons">
              <button 
                className="barcode-btn barcode-btn-primary flex-1"
                onClick={handleUSBPrintCurrent}
                disabled={!selectedItem}
              >
                <Printer size={16} />
                Print Labels ({quantity})
              </button>

              <button 
                className="barcode-btn barcode-btn-secondary flex-1"
                onClick={handleBrowserPrintCurrent}
                disabled={!selectedItem}
              >
                <FileText size={16} />
                Windows Print / PDF
              </button>
            </div>

          </div>

          {/* Batch Print Queue Section */}
          <div className="barcode-card queue-card">
            <div className="card-section-header">
              <Layers size={18} />
              <h3>Batch Print Queue ({printQueue.length})</h3>
              {printQueue.length > 0 && (
                <button className="clear-queue-btn" onClick={handleClearQueue}>
                  Clear All
                </button>
              )}
            </div>

            {printQueue.length > 0 ? (
              <div className="queue-list-wrapper">
                <table className="queue-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Weight</th>
                      <th>Copies</th>
                      <th>MRP</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printQueue.map((item) => (
                      <tr key={item.queueId}>
                        <td>
                          <strong>{item.itemName}</strong>
                          <br />
                          <small className="monospace">{item.barcodeValue}</small>
                        </td>
                        <td>{item.weightLabel}</td>
                        <td><span className="queue-qty">{item.quantity}</span></td>
                        <td>₹{item.mrp}</td>
                        <td>
                          <button 
                            className="remove-queue-btn" 
                            onClick={() => handleRemoveFromQueue(item.queueId)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="queue-footer">
                  <div className="queue-total-summary">
                    Total Stickers to Print: <strong>{printQueue.reduce((sum, item) => sum + item.quantity, 0)}</strong>
                  </div>
                  <button 
                    className="barcode-btn barcode-btn-primary full-width"
                    onClick={handleUSBPrintBatch}
                  >
                    <Printer size={16} />
                    Print All Queue Items
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-queue-state">
                <Layers size={28} className="empty-queue-icon" />
                <p>Print Queue is empty.</p>
                <small>Click "Add to Print Queue" to bundle multiple sticker sizes & items together.</small>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* ========================================== */}
      {/* IN-PAGE QZ TRAY MODALS                     */}
      {/* ========================================== */}

      {/* 1. Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowQZModal(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '420px', width: '95%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Usb size={28} />
              </div>
              <h3 className="modal-title">Select USB Thermal Printer</h3>

              <div style={{ margin: '15px 0', textAlign: 'left' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', display: 'block' }}>
                  Detected System Printers
                </label>
                <select
                  value={selectedQZPrinter}
                  onChange={(e) => confirmQZPrinter(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '14px',
                    background: '#ffffff',
                    outline: 'none'
                  }}
                >
                  {qzPrinters.length > 0 ? (
                    qzPrinters.map(p => <option key={p} value={p}>{p}</option>)
                  ) : (
                    <option value="">No USB thermal printers found</option>
                  )}
                </select>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button className="barcode-btn barcode-btn-outline flex-1" onClick={() => { disconnectQZTray(); setShowQZModal(false); }}>
                  Disconnect
                </button>
                <button
                  className="barcode-btn barcode-btn-primary flex-1"
                  onClick={() => setShowQZModal(false)}
                >
                  Confirm Selection
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* 2. QZ Tray Connection & Setup Guide Modal */}
      <AnimatePresence>
        {showQZSetupGuide && createPortal(
          <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowQZSetupGuide(false)}>
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '480px', width: '95%', textAlign: 'left' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a' }}>
                  <Usb size={20} style={{ color: '#2563eb' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>USB Thermal Printer Setup Guide</h3>
                </div>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowQZSetupGuide(false)}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0 }}>
                  For <strong>silent direct USB printing</strong> without browser popups, the free <strong>QZ Tray</strong> desktop service must be running on your computer.
                </p>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '13px', marginBottom: '6px' }}>Quick Setup Instructions:</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <li>
                      Download QZ Tray (Free for Windows):{' '}
                      <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontWeight: '700', textDecoration: 'underline' }}>
                        qz.io/download <ExternalLink size={12} style={{ display: 'inline' }} />
                      </a>
                    </li>
                    <li>Install and open <strong>QZ Tray</strong> from your Windows Start Menu.</li>
                    <li>If Windows requests permission, select <strong>"Allow Access / Always Trust"</strong>.</li>
                    <li>Click the <strong>Retry Connect</strong> button below.</li>
                  </ol>
                </div>

                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '12px', color: '#166534' }}>
                  <strong>Alternative Option:</strong> You can also print directly to any USB printer using <strong>Windows Printer Driver Direct Print</strong> without installing QZ Tray!
                </div>
              </div>

              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                <button className="barcode-btn barcode-btn-secondary" onClick={() => { setShowQZSetupGuide(false); handleBrowserPrintCurrent(); }}>
                  <Printer size={14} /> Use Windows Driver
                </button>
                <button
                  className="barcode-btn barcode-btn-primary"
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await connectQZTray();
                  }}
                >
                  <RefreshCw size={14} /> Retry Connect
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

export default BarcodeGenerator;
