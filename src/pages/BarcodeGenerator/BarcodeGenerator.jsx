import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Printer, 
  Search, 
  Scale, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Sliders, 
  Layers, 
  Settings2,
  Package,
  Eye,
  FileText,
  X,
  Zap,
  ChevronDown
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import JsBarcode from 'jsbarcode';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { usePrinter } from '../../context/PrinterContext';
import './BarcodeGenerator.css';

// Default store branding header
const STORE_NAME = "SRI RAVI SWEETS";

const WEIGHT_PRESETS = [
  { label: '100g', value: 100 },
  { label: '250g', value: 250 },
  { label: '400g', value: 400 },
  { label: '500g (1/2 KG)', value: 500 },
  { label: '750g', value: 750 },
  { label: '1000g (1 KG)', value: 1000 },
  { label: '1500g (1.5 KG)', value: 1500 },
  { label: '2000g (2 KG)', value: 2000 },
];

// Helper to extract clean numeric Barcode ID (only if present in product)
export const extractCleanNumericBarcodeId = (item) => {
  if (!item) return '';
  const raw = (item.barcode || item.barcodeId || item.code || item.itemCode || '').toString().trim();
  return raw;
};

const BarcodeGenerator = () => {
  const { 
    qzConnected, 
    selectedQZPrinter, 
    showQZModal,
    qzConnecting,
    qzConnectTimer,
    setShowQZModal,
    connectQZTray, 
    disconnectQZTray,
    printRawUSB,
    printHTMLContent
  } = usePrinter();

  // Item & Data states
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form states
  const [grams, setGrams] = useState(400);
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [barcodeFormatOption, setBarcodeFormatOption] = useState('asterisk'); // Default 'asterisk' (1004*0400)
  const [customBarcodeId, setCustomBarcodeId] = useState('');

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const initialCode = extractCleanNumericBarcodeId(selectedItem);
      setCustomBarcodeId(initialCode);
    }
  }, [selectedItem, grams]);

  // Determine if item has a valid barcode ID
  const effectiveBarcodeId = customBarcodeId.trim();
  const hasBarcodeId = Boolean(effectiveBarcodeId);

  // Compute Barcode String Value
  const getBarcodeValue = () => {
    if (!hasBarcodeId) return '';
    const paddedWeight = String(grams).padStart(4, '0');
    if (barcodeFormatOption === 'asterisk') {
      return `${effectiveBarcodeId}*${paddedWeight}`;
    }
    return `${effectiveBarcodeId}${paddedWeight}`;
  };

  const barcodeValue = getBarcodeValue();

  // Render Barcode SVG via JsBarcode
  useEffect(() => {
    if (barcodeRef.current && barcodeValue) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: 1.6,
          height: 38,
          displayValue: false,
          margin: 0,
          background: "#ffffff",
          lineColor: "#000000"
        });
      } catch (err) {
        console.error("JsBarcode rendering error:", err);
      }
    }
  }, [barcodeValue, selectedItem, grams, customPrice]);

  // Helper for human-readable weight on sticker
  const getFormattedWeightLabel = () => {
    if (selectedItem?.unit === 'Piece') return '1 Pc';
    if (grams >= 1000) {
      const kgVal = grams / 1000;
      return `${Number.isInteger(kgVal) ? kgVal : kgVal.toFixed(2)} KG`;
    }
    return `${grams} G`;
  };

  // Add current configuration to print queue
  const handleAddToQueue = () => {
    if (!selectedItem) {
      toast.error("Please select a product first");
      return;
    }
    if (!hasBarcodeId) {
      toast.error("This product does not have a Barcode ID. Please set one first.");
      return;
    }

    const newItem = {
      id: Date.now().toString(),
      item: selectedItem,
      name: selectedItem.name,
      grams: grams,
      weightLabel: getFormattedWeightLabel(),
      price: customPrice,
      barcodeValue: barcodeValue,
      barcodeId: effectiveBarcodeId,
      quantity: quantity
    };

    setPrintQueue(prev => [...prev, newItem]);
    toast.success(`Added ${quantity} sticker(s) of ${selectedItem.name} to queue`);
  };

  const handleRemoveFromQueue = (index) => {
    setPrintQueue(prev => prev.filter((_, i) => i !== index));
    toast.success("Removed item from queue");
  };

  const handleClearQueue = () => {
    setPrintQueue([]);
    toast.success("Cleared print queue");
  };

  // Print single sticker directly
  const handleUSBPrintCurrent = async () => {
    if (!selectedItem) {
      toast.error("Please select a product first");
      return;
    }
    if (!hasBarcodeId) {
      toast.error("Cannot print: Selected product has no Barcode ID.");
      return;
    }
    const singleBatch = [{
      item: selectedItem,
      name: selectedItem.name,
      grams: grams,
      weightLabel: getFormattedWeightLabel(),
      price: customPrice,
      barcodeValue: barcodeValue,
      barcodeId: effectiveBarcodeId,
      quantity: quantity
    }];
    await executePrint(singleBatch);
  };

  // Fast Instant Print with specific weight
  const handleQuickInstantPrint = async (presetGrams) => {
    if (!selectedItem) {
      toast.error("Please select a product first");
      return;
    }
    if (!hasBarcodeId) {
      toast.error("Cannot print: Selected product has no Barcode ID.");
      return;
    }
    setGrams(presetGrams);
    const basePrice = Number(selectedItem.price) || 0;
    const calcPrice = selectedItem.unit === 'Piece' ? basePrice : Math.round((basePrice * presetGrams) / 1000);
    const paddedWeight = String(presetGrams).padStart(4, '0');
    const bValue = barcodeFormatOption === 'asterisk' ? `${effectiveBarcodeId}*${paddedWeight}` : `${effectiveBarcodeId}${paddedWeight}`;

    const weightLabel = presetGrams >= 1000 
      ? `${Number.isInteger(presetGrams / 1000) ? presetGrams / 1000 : (presetGrams / 1000).toFixed(2)} KG`
      : `${presetGrams} G`;

    const singleBatch = [{
      item: selectedItem,
      name: selectedItem.name,
      grams: presetGrams,
      weightLabel: weightLabel,
      price: calcPrice,
      barcodeValue: bValue,
      barcodeId: effectiveBarcodeId,
      quantity: quantity
    }];
    await executePrint(singleBatch);
  };

  // Print whole batch queue
  const handleUSBPrintQueue = async () => {
    if (printQueue.length === 0) {
      toast.error("Queue is empty. Add items to queue first.");
      return;
    }
    await executePrint(printQueue);
  };

  const handleBrowserPrintCurrent = () => {
    if (!hasBarcodeId) {
      toast.error("Cannot print: Selected product has no Barcode ID.");
      return;
    }
    printStickersViaIframe();
  };

  // Master Print Execution Routine
  const executePrint = async (batchList) => {
    if (!qzConnected) {
      toast("QZ Tray not connected. Opening Windows Print dialog...", { icon: '🖨️' });
      printStickersViaIframe();
      return;
    }

    toast.loading("Sending commands to thermal barcode printer...", { id: 'usb-print-job' });

    try {
      if (printMode === 'tspl') {
        const tsplScript = buildTSPLCommandBatch(batchList);
        await printRawUSB(tsplScript);
      } else {
        const canvas = await html2canvas(document.getElementById('physical-sticker-preview'), {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
        const dataUrl = canvas.toDataURL('image/png');
        await printRawUSB(dataUrl);
      }

      toast.dismiss('usb-print-job');
      toast.success("Printed stickers successfully!");
    } catch (err) {
      console.error("USB Barcode print error:", err);
      toast.dismiss('usb-print-job');
      toast.error("USB direct print failed. Fallback to Windows Print dialog...");
      printStickersViaIframe();
    }
  };

  // Generate 2-Column 2-Up TSPL script
  const buildTSPLCommandBatch = (batchList) => {
    let tspl = "";
    tspl += `DIRECTION ${labelDirection}\n`;
    tspl += `OFFSET 0 mm\n`;
    tspl += `CLS\n`;

    const expandedList = [];
    batchList.forEach(entry => {
      const qty = Number(entry.quantity) || 1;
      for (let i = 0; i < qty; i++) {
        expandedList.push(entry);
      }
    });

    const is2Up = labelColumns === 2;

    if (is2Up) {
      tspl += `SIZE 104 mm, ${labelHeight} mm\n`;
      tspl += `GAP 2 mm, 0 mm\n`;

      for (let i = 0; i < expandedList.length; i += 2) {
        const leftItem = expandedList[i];
        const rightItem = expandedList[i + 1] || null;

        tspl += `CLS\n`;

        // Left Label (Column 1)
        tspl += renderSingleTSPLLabel(leftItem, 16 + xOffset, 10 + yOffset);

        // Right Label (Column 2)
        if (rightItem) {
          tspl += renderSingleTSPLLabel(rightItem, 432 + xOffset, 10 + yOffset);
        }

        tspl += `PRINT 1,1\n`;
      }
    } else {
      tspl += `SIZE ${labelWidth} mm, ${labelHeight} mm\n`;
      tspl += `GAP 2 mm, 0 mm\n`;

      expandedList.forEach(item => {
        tspl += `CLS\n`;
        tspl += renderSingleTSPLLabel(item, 16 + xOffset, 10 + yOffset);
        tspl += `PRINT 1,1\n`;
      });
    }

    return tspl;
  };

  const renderSingleTSPLLabel = (item, startX, startY) => {
    if (!item) return "";
    let code = "";
    const storeHeader = STORE_NAME;
    const itemName = (item.name || "").substring(0, 18);
    const weightText = item.weightLabel || "500 G";
    const bValue = item.barcodeValue || "1004*0500";
    const bId = item.barcodeId || "1004";
    const mrpText = `MRP:${item.price || 0}/-`;

    // 1. Header (Store Name)
    code += `TEXT ${startX + 180},${startY + 5},"3",0,1,1,2,"${storeHeader}"\n`;

    // 2. Item Name & Weight
    code += `TEXT ${startX + 10},${startY + 35},"2",0,1,1,1,"${itemName}"\n`;
    code += `TEXT ${startX + 350},${startY + 35},"2",0,1,1,3,"${weightText}"\n`;

    // 3. Barcode Graphic
    code += `BARCODE ${startX + 20},${startY + 65},"128",40,0,0,2,2,"${bValue}"\n`;

    // 4. Footer: Barcode ID & MRP
    code += `TEXT ${startX + 20},${startY + 112},"2",0,1,1,1,"${bId}"\n`;
    code += `TEXT ${startX + 350},${startY + 112},"3",0,1,1,3,"${mrpText}"\n`;

    return code;
  };

  const printStickersViaIframe = () => {
    if (!printAreaRef.current) return;
    const stickerHtml = printAreaRef.current.innerHTML;
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Barcodes - Ravi Ghee Sweets</title>
          <style>
            @page {
              size: 104mm auto;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
            }
            .print-grid {
              display: flex;
              flex-wrap: wrap;
              width: 104mm;
              padding: 0;
              margin: 0;
            }
            .physical-sticker-preview {
              width: 50mm;
              height: 25mm;
              margin: 1mm;
              border: 1px dashed #ccc;
              box-sizing: border-box;
              padding: 2mm 3mm;
              font-family: 'Arial', sans-serif;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #fff;
            }
            .preview-store-header {
              font-size: 9pt;
              font-weight: 900;
              text-align: center;
              line-height: 1;
            }
            .preview-item-row {
              display: flex;
              justify-content: space-between;
              font-size: 7.5pt;
              font-weight: 700;
            }
            .preview-barcode-container {
              display: flex;
              justify-content: center;
              align-items: center;
              height: 9mm;
            }
            .preview-barcode-svg {
              width: 95%;
              height: 100%;
            }
            .preview-footer-row {
              display: flex;
              justify-content: space-between;
              font-size: 7.5pt;
              font-weight: 800;
            }
          </style>
        </head>
        <body>
          <div class="print-grid">
            ${Array.from({ length: quantity }).map(() => stickerHtml).join('')}
          </div>
        </body>
      </html>
    `;

    printHTMLContent(fullHtml);
  };

  const filteredItems = items.filter(i => {
    const q = searchQuery.toLowerCase();
    const bId = extractCleanNumericBarcodeId(i).toLowerCase();
    return i.name?.toLowerCase().includes(q) || bId.includes(q);
  });

  return (
    <div className="barcode-compact-page">
      {/* Top USB & Hardware Quick Status Bar */}
      <div className="barcode-usb-bar">
        <div className="usb-bar-left">
          <div className={`usb-dot ${qzConnected ? 'active' : 'inactive'}`} />
          <span className="usb-bar-status">
            {qzConnected ? `QZ USB Ready: ${selectedQZPrinter || 'Connected'}` : 'QZ Tray Offline (Windows Driver Print Ready)'}
          </span>
        </div>

        <div className="usb-bar-actions">
          {qzConnected ? (
            <button className="usb-action-link" onClick={() => setShowQZModal(true)}>
              <Settings2 size={13} /> Change Printer
            </button>
          ) : (
            <button className="usb-action-link" onClick={connectQZTray} disabled={qzConnecting}>
              <RefreshCw size={13} className={qzConnecting ? 'animate-spin' : ''} />
              {qzConnecting ? `Connecting (${qzConnectTimer}s)...` : 'Connect QZ USB'}
            </button>
          )}
          <button className="usb-action-link" onClick={() => setShowCalibration(!showCalibration)}>
            <Sliders size={13} /> {showCalibration ? 'Hide Settings' : 'Settings'}
          </button>
        </div>
      </div>

      {/* Main Single-Screen Grid */}
      <div className="barcode-workspace-grid">
        
        {/* LEFT PANEL: Fast Product, Weight & Quantity Selector */}
        <div className="barcode-panel-card">
          
          {/* 1. Fast Product Selection (Searchable Typeahead Dropdown) */}
          <div className="fast-form-section" ref={dropdownRef}>
            <label className="fast-section-label">
              <Package size={14} />
              Select Sweet / Product
            </label>
            
            <div className="fast-search-wrapper">
              <div 
                className="fast-product-trigger"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <div className="fast-product-selected">
                  <span className="fast-product-name">{selectedItem ? selectedItem.name : 'Select a product...'}</span>
                  {selectedItem && (
                    <span className="fast-product-code">
                      {extractCleanNumericBarcodeId(selectedItem) ? (
                        <span className="badge-has-barcode">Code: #{extractCleanNumericBarcodeId(selectedItem)}</span>
                      ) : (
                        <span className="badge-no-barcode">⚠️ No Barcode ID</span>
                      )}
                      &nbsp;&bull; ₹{selectedItem.price}/{selectedItem.unit === 'Piece' ? 'pc' : 'kg'}
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className={`fast-chevron ${isDropdownOpen ? 'open' : ''}`} />
              </div>

              {isDropdownOpen && (
                <div className="fast-dropdown-menu">
                  <div className="fast-dropdown-search">
                    <Search size={14} className="dropdown-search-icon" />
                    <input 
                      type="text"
                      autoFocus
                      placeholder="Type to search product or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button className="fast-search-clear" onClick={() => setSearchQuery('')}>×</button>
                    )}
                  </div>

                  <div className="fast-dropdown-list">
                    {loading ? (
                      <div className="dropdown-empty">Loading products...</div>
                    ) : filteredItems.length > 0 ? (
                      filteredItems.map(item => {
                        const isSelected = selectedItem?.id === item.id;
                        const bId = extractCleanNumericBarcodeId(item);
                        return (
                          <div 
                            key={item.id} 
                            className={`dropdown-item ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedItem(item);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }}
                          >
                            <div className="dropdown-item-left">
                              <span className="dropdown-item-name">{item.name}</span>
                              <span className="dropdown-item-price">₹{item.price}/{item.unit === 'Piece' ? 'pc' : 'kg'}</span>
                            </div>
                            <div className="dropdown-item-right">
                              {bId ? (
                                <span className="dropdown-barcode-pill">#{bId}</span>
                              ) : (
                                <span className="dropdown-barcode-pill missing">No ID</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="dropdown-empty">No products found</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Popular Items Chips */}
            <div className="fast-chips-row">
              {items.slice(0, 6).map(item => {
                const bId = extractCleanNumericBarcodeId(item);
                return (
                  <button 
                    key={item.id}
                    type="button"
                    className={`fast-chip ${selectedItem?.id === item.id ? 'active' : ''} ${!bId ? 'no-barcode' : ''}`}
                    onClick={() => setSelectedItem(item)}
                    title={!bId ? 'No Barcode ID assigned' : `Barcode ID: #${bId}`}
                  >
                    {item.name} {!bId && '⚠️'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Missing Barcode ID Alert Banner */}
          {!hasBarcodeId && selectedItem && (
            <div className="fast-no-barcode-alert">
              <AlertCircle size={16} className="alert-icon" />
              <div>
                <strong>Barcode ID Missing:</strong> "{selectedItem.name}" has no Barcode ID assigned in the database. 
                Barcode generation & printing is <strong>disabled</strong> for this product.
              </div>
            </div>
          )}

          {/* 2. Weight & Size Selector (Pills) */}
          <div className="fast-form-section">
            <div className="fast-label-row">
              <label className="fast-section-label">
                <Scale size={14} />
                Weight / Size
              </label>
              <div className="fast-grams-input-wrap">
                <input 
                  type="number" 
                  min="1"
                  max="100000"
                  className="fast-grams-input"
                  value={grams}
                  onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
                />
                <span className="grams-unit">g</span>
              </div>
            </div>

            <div className="fast-weight-pills">
              {WEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`weight-pill ${grams === preset.value ? 'active' : ''}`}
                  onClick={() => setGrams(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Fast Numbers Row: Copies, Price & Code */}
          <div className="fast-numbers-grid">
            <div className="fast-num-card">
              <span className="fast-num-label">Copies (Qty)</span>
              <div className="fast-qty-stepper">
                <button type="button" onClick={() => setQuantity(prev => Math.max(1, prev - 1))}>-</button>
                <input 
                  type="number" 
                  min="1" 
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
                <button type="button" onClick={() => setQuantity(prev => prev + 1)}>+</button>
              </div>
            </div>

            <div className="fast-num-card">
              <span className="fast-num-label">Calculated MRP</span>
              <div className="fast-input-icon-wrap">
                <span className="fast-prefix">₹</span>
                <input 
                  type="number" 
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="fast-num-input"
                />
              </div>
            </div>

            <div className="fast-num-card">
              <span className="fast-num-label">Barcode Item ID</span>
              <div className="fast-input-icon-wrap">
                <span className="fast-prefix">#</span>
                <input 
                  type="text" 
                  value={customBarcodeId}
                  placeholder="Not Set"
                  onChange={(e) => setCustomBarcodeId(e.target.value)}
                  className={`fast-num-input ${!hasBarcodeId ? 'missing-id' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* 4. Quick 1-Click Weight Instant Print Buttons */}
          <div className="fast-instant-actions">
            <span className="instant-label">
              <Zap size={13} color="#f59e0b" />
              1-Click Instant Print:
            </span>
            <div className="instant-buttons-row">
              <button 
                type="button" 
                className="instant-print-btn"
                onClick={() => handleQuickInstantPrint(250)}
                disabled={!hasBarcodeId}
              >
                ⚡ 250g
              </button>
              <button 
                type="button" 
                className="instant-print-btn"
                onClick={() => handleQuickInstantPrint(500)}
                disabled={!hasBarcodeId}
              >
                ⚡ 500g
              </button>
              <button 
                type="button" 
                className="instant-print-btn"
                onClick={() => handleQuickInstantPrint(1000)}
                disabled={!hasBarcodeId}
              >
                ⚡ 1 KG
              </button>
              <button 
                type="button" 
                className="queue-add-btn"
                onClick={handleAddToQueue}
                disabled={!hasBarcodeId}
              >
                <Plus size={14} /> Add to Queue
              </button>
            </div>
          </div>

          {/* 5. Collapsible Advanced Calibration */}
          {showCalibration && (
            <div className="fast-calibration-box">
              <div className="calib-row">
                <div>
                  <label>Paper Layout:</label>
                  <select value={labelColumns} onChange={(e) => setLabelColumns(Number(e.target.value))}>
                    <option value={2}>2 Columns (2-Up Roll)</option>
                    <option value={1}>1 Column (Single Roll)</option>
                  </select>
                </div>

                <div>
                  <label>Format:</label>
                  <select value={barcodeFormatOption} onChange={(e) => setBarcodeFormatOption(e.target.value)}>
                    <option value="asterisk">Delimited (1004*0400)</option>
                    <option value="numeric">Numeric (10040400)</option>
                  </select>
                </div>

                <div>
                  <label>Orientation:</label>
                  <select value={labelDirection} onChange={(e) => setLabelDirection(Number(e.target.value))}>
                    <option value={0}>0° Top-to-Bottom</option>
                    <option value={1}>180° Inverted</option>
                  </select>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT PANEL: Live Sticker Preview & Instant Big Print */}
        <div className="barcode-panel-card preview-panel">
          
          <div className="preview-header-bar">
            <span className="preview-badge">
              <Eye size={13} />
              Real-time Sticker Preview
            </span>
            {hasBarcodeId ? (
              <span className="preview-barcode-val monospace">{barcodeValue}</span>
            ) : (
              <span className="preview-barcode-val disabled">NO BARCODE ID</span>
            )}
          </div>

          {/* Physical Thermal Sticker Preview (Exact 50mm x 25mm Ratio) */}
          <div className="fast-preview-viewport">
            <div className="physical-sticker-preview" id="physical-sticker-preview" ref={printAreaRef}>
              {/* Header: SRI RAVI SWEETS */}
              <div className="preview-store-header">{STORE_NAME}</div>
              
              {/* Second Line: Item Name (Left) | Weight (Right) */}
              <div className="preview-item-row">
                <span className="preview-item-name">{selectedItem?.name || 'Select Product'}</span>
                <span className="preview-weight">{getFormattedWeightLabel()}</span>
              </div>

              {/* Third Line: Barcode Graphic or Warning Box */}
              {hasBarcodeId ? (
                <div className="preview-barcode-container">
                  <svg ref={barcodeRef} className="preview-barcode-svg" />
                </div>
              ) : (
                <div className="preview-no-barcode-placeholder">
                  <AlertCircle size={18} />
                  <span>BARCODE ID MISSING</span>
                </div>
              )}

              {/* Fourth Line: Barcode ID (Left) | MRP (Right) */}
              <div className="preview-footer-row">
                <span className={`preview-barcode-id ${!hasBarcodeId ? 'missing' : ''}`}>
                  {hasBarcodeId ? effectiveBarcodeId : 'NO ID'}
                </span>
                <span className="preview-mrp">MRP: ₹{customPrice || 0}/-</span>
              </div>
            </div>
          </div>

          {/* Big Print Buttons */}
          <div className="fast-primary-actions">
            <button 
              type="button"
              className={`fast-big-print-btn ${!hasBarcodeId ? 'disabled-btn' : ''}`}
              onClick={handleUSBPrintCurrent}
              disabled={!selectedItem || !hasBarcodeId}
              title={!hasBarcodeId ? 'Select an item with a Barcode ID to print' : ''}
            >
              <Printer size={18} />
              {hasBarcodeId 
                ? `PRINT ${quantity} BARCODE ${quantity > 1 ? 'STICKERS' : 'STICKER'}`
                : 'PRINTING DISABLED (NO BARCODE ID)'}
            </button>

            <button 
              type="button"
              className="fast-browser-print-btn"
              onClick={handleBrowserPrintCurrent}
              disabled={!selectedItem || !hasBarcodeId}
              title="Print via standard Windows System Print dialog / PDF"
            >
              <FileText size={14} />
              PDF / Windows
            </button>
          </div>

          {/* Batch Print Queue Section */}
          {printQueue.length > 0 && (
            <div className="fast-queue-section">
              <div className="fast-queue-header">
                <span className="queue-title">
                  <Layers size={13} />
                  Print Queue ({printQueue.reduce((s, i) => s + i.quantity, 0)} stickers)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="queue-btn print" onClick={handleUSBPrintQueue}>
                    <Printer size={12} /> Print All
                  </button>
                  <button className="queue-btn clear" onClick={handleClearQueue}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="fast-queue-items-list">
                {printQueue.map((item, idx) => (
                  <div key={item.id || idx} className="fast-queue-row">
                    <span className="queue-item-info">
                      <strong>{item.name}</strong> &bull; {item.weightLabel} &bull; #{item.barcodeId} &bull; ₹{item.price} ({item.quantity}x)
                    </span>
                    <button 
                      className="queue-del-btn" 
                      onClick={() => handleRemoveFromQueue(idx)}
                      title="Remove"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default BarcodeGenerator;
