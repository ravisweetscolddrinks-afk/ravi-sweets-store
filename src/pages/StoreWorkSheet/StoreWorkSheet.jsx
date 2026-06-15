import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Calendar,
  Save,
  Printer,
  History,
  ChevronRight,
  PackageCheck,
  Building,
  X,
  Search
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  where,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { usePrinter } from '../../context/PrinterContext';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Loader from '../../components/Loader/Loader';
import './StoreWorkSheet.css';


// Get Tomorrow's Date String in YYYY-MM-DD format
const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const StoreWorkSheet = () => {
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'history'
  const [date, setDate] = useState(getTomorrowDateString());
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [quantities, setQuantities] = useState({}); // { [itemId]: { [storeId]: quantity } }
  const [history, setHistory] = useState([]);
  const [previewSheet, setPreviewSheet] = useState(null);
  const [printTargetSheet, setPrintTargetSheet] = useState(null);
  const [itemSearch, setItemSearch] = useState('');


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Consume Shared Global Printer Connections
  const {
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

  // Fetch Items & Stores on Load
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [storesSnap, itemsSnap] = await Promise.all([
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'items'), orderBy('name', 'asc')))
        ]);

        setStores(storesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        
        const allItems = itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const activeWorksheetItems = allItems.filter(item => item.showInWorksheet !== false);
        setItems(activeWorksheetItems);
      } catch (err) {
        console.error("Error fetching data:", err);
        toast.error("Failed to load stores or items.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Fetch worksheet for the selected date automatically to enable editing
  useEffect(() => {
    const fetchExistingWorksheet = async () => {
      if (!date) return;
      try {
        const q = query(collection(db, 'store_worksheets'), where('date', '==', date));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const sheet = snap.docs[0].data();
          setQuantities(sheet.quantities || {});
          toast.success(`Loaded saved worksheet for ${date}`);
        } else {
          setQuantities({});
        }
      } catch (err) {
        console.error("Error checking worksheet:", err);
      }
    };
    fetchExistingWorksheet();
  }, [date]);

  // Fetch Worksheet History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'store_worksheets'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching history:", err);
      toast.error("Failed to load worksheet history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Watch tab change to fetch history
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const handleQtyChange = (itemId, storeId, value) => {
    const val = value === '' ? '' : parseFloat(value);
    setQuantities(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {}),
        [storeId]: val
      }
    }));
  };

  const handleSave = async () => {
    if (!date) {
      toast.error("Please select a date.");
      return;
    }

    setSaving(true);
    try {
      // Filter out empty rows and zero allocations to save space in Firestore
      const cleanedQuantities = {};
      Object.entries(quantities).forEach(([itemId, storeQtyMap]) => {
        const storeClean = {};
        Object.entries(storeQtyMap).forEach(([storeId, qty]) => {
          if (qty !== '' && qty !== 0 && !isNaN(qty)) {
            storeClean[storeId] = Number(qty);
          }
        });
        if (Object.keys(storeClean).length > 0) {
          cleanedQuantities[itemId] = storeClean;
        }
      });

      const worksheetPayload = {
        date,
        quantities: cleanedQuantities,
        updatedAt: serverTimestamp()
      };

      const q = query(collection(db, 'store_worksheets'), where('date', '==', date));
      const snap = await getDocs(q);

      if (!snap.empty) {
        // Update existing worksheet document
        const docId = snap.docs[0].id;
        await updateDoc(doc(db, 'store_worksheets', docId), worksheetPayload);
        toast.success(`Store worksheet for ${date} updated successfully!`);
      } else {
        // Create new worksheet document
        await addDoc(collection(db, 'store_worksheets'), {
          ...worksheetPayload,
          createdAt: serverTimestamp()
        });
        toast.success(`Store worksheet for ${date} saved successfully!`);
      }
    } catch (err) {
      console.error("Error saving store worksheet:", err);
      toast.error("Failed to save worksheet details.");
    } finally {
      setSaving(false);
    }
  };

  // Printing implementation tailored for thermal printers
  const printDirectToBluetooth = async (worksheet, printType = 'store') => {
    toast.loading("Sending worksheet directly to Bluetooth thermal printer...", { id: 'bt-worksheet-print-job' });

    try {
      const bytes = buildWorksheetESCPOSBytes(worksheet, 32, printType); // standard 58mm default width, BLE prints are usually 58mm
      await printRawBLE(bytes);

      toast.dismiss('bt-worksheet-print-job');
      toast.success("Worksheet printed successfully via Bluetooth!");
    } catch (err) {
      console.error("Direct BLE worksheet print error: ", err);
      toast.dismiss('bt-worksheet-print-job');
      toast.error("Bluetooth print failed. Opening system print fallback...");
      printHTMLFallback(worksheet, printType);
    }
  };

  const buildWorksheetESCPOSBytes = (worksheet, charsPerLine = 48, printType = 'store') => {
    const encoder = new TextEncoder();
    const wsQuantities = worksheet.quantities || {};

    const INIT = new Uint8Array([0x1b, 0x40]);
    const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
    const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
    const RIGHT = new Uint8Array([0x1b, 0x61, 0x02]);
    const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
    const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
    const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
    const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
    const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);

    const dashedLine = ''.padEnd(charsPerLine, '-') + '\n';
    const miniDashedLine = ''.padEnd(charsPerLine, '.') + '\n';

    const justifyLR = (left, right) => {
      let spaces = charsPerLine - left.length - right.length;
      if (spaces < 1) spaces = 1;
      return left + ' '.repeat(spaces) + right + '\n';
    };

    let bytes = [];
    bytes.push(...INIT);

    // Header
    bytes.push(...CENTER, ...DOUBLE_SIZE);
    bytes.push(...encoder.encode("RAVI SWEETS\n"));
    bytes.push(...NORMAL_SIZE);
    bytes.push(...encoder.encode("STORE WORK SHEET\n"));
    bytes.push(...LEFT);
    bytes.push(...encoder.encode(dashedLine));
    bytes.push(...encoder.encode(`DATE: ${worksheet.date}\n`));
    bytes.push(...encoder.encode(`PRINTED: ${new Date().toLocaleString()}\n`));
    bytes.push(...encoder.encode(dashedLine));

    if (printType === 'store') {
      // I. Store-Wise Summary
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("I. STORE-WISE ITEMS\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));

      stores.forEach(store => {
        let storeItems = [];
        items.forEach(item => {
          const qty = wsQuantities[item.id]?.[store.id];
          if (qty && qty > 0) {
            const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';
            storeItems.push({ name: item.name, qty, unitLabel });
          }
        });

        if (storeItems.length > 0) {
          bytes.push(...BOLD_ON);
          bytes.push(...encoder.encode(`${store.name.toUpperCase()}\n`));
          bytes.push(...BOLD_OFF);

          storeItems.forEach(si => {
            let leftText = `* ${si.name}`;
            if (leftText.length > (charsPerLine - 12)) {
              bytes.push(...encoder.encode(`${leftText}\n`));
              leftText = "  ";
            }
            const rightText = `${si.qty} ${si.unitLabel}`;
            bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
          });
          bytes.push(...encoder.encode(miniDashedLine));
        }
      });

      // II. Handwritten Notes
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("II. HANDWRITTEN NOTES\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode("\n\n")); // Renders space for writing
    }

    if (printType === 'item') {
      // II. Globally Consolidated Summary
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("I. GLOBALLY CONSOLIDATED\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));

      let overallSumWeight = 0;
      let overallSumPieces = 0;
      let totalActiveItems = 0;

      items.forEach(item => {
        const allocations = wsQuantities[item.id] || {};
        const activeAllocations = Object.entries(allocations).filter(([_, qty]) => qty > 0);

        if (activeAllocations.length > 0) {
          totalActiveItems++;
          const total = activeAllocations.reduce((sum, [_, qty]) => sum + qty, 0);
          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';

          if (item.unit === 'Weight') {
            overallSumWeight += total;
          } else {
            overallSumPieces += total;
          }

          bytes.push(...BOLD_ON);
          bytes.push(...encoder.encode(`${item.name.toUpperCase()} (${unitLabel})\n`));
          bytes.push(...BOLD_OFF);

          activeAllocations.forEach(([storeId, qty]) => {
            const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
            let leftText = `- ${storeName}`;
            if (leftText.length > (charsPerLine - 12)) {
              bytes.push(...encoder.encode(`${leftText}\n`));
              leftText = "  ";
            }
            const rightText = `${qty} ${unitLabel}`;
            bytes.push(...encoder.encode(justifyLR(leftText, rightText)));
          });

          // Dashed divider line and sum
          bytes.push(...encoder.encode(miniDashedLine));
          const sumText = `SUM: ${total.toFixed(item.unit === 'Weight' ? 2 : 0)} ${unitLabel}`;
          bytes.push(...BOLD_ON, ...RIGHT);
          bytes.push(...encoder.encode(sumText + '\n'));
          bytes.push(...BOLD_OFF, ...LEFT);
          bytes.push(...encoder.encode(dashedLine));
        }
      });

      // III. Handwritten Notes
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("II. HANDWRITTEN NOTES\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode("\n\n")); // Renders space for writing

      // IV. Cumulative Sums
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("III. CUMULATIVE SUMS\n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(dashedLine));
      bytes.push(...encoder.encode(justifyLR("Allocated Items:", `${totalActiveItems} Products`)));
      bytes.push(...encoder.encode(justifyLR("Total Weight:", `${overallSumWeight.toFixed(2)} KG`)));
      bytes.push(...encoder.encode(justifyLR("Total Pieces:", `${overallSumPieces} Pcs`)));
    }

    // Cut paper
    bytes.push(...CENTER);
    bytes.push(...encoder.encode("\n*** BLUETOOTH THERMAL PRINT ***\n\n\n"));
    bytes.push(...CUT);

    return new Uint8Array(bytes);
  };

  const printHTMLFallback = (worksheet, printType = 'store') => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      toast.error("Popup blocked! Please allow popups for thermal printing.");
      return;
    }

    const wsQuantities = worksheet.quantities || {};

    let bodyContentHtml = '';

    if (printType === 'store') {
      // 1. Build Store-Wise Allocations Section
      let storeWiseHtml = '';
      stores.forEach(store => {
        let storeItems = [];
        items.forEach(item => {
          const qty = wsQuantities[item.id]?.[store.id];
          if (qty && qty > 0) {
            const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';
            storeItems.push({ name: item.name, qty, unitLabel });
          }
        });

        if (storeItems.length > 0) {
          storeWiseHtml += `<div class="bold store-name-title">${store.name.toUpperCase()}</div>`;
          storeItems.forEach(si => {
            storeWiseHtml += `
              <div class="item-row indent">
                <span>* ${si.name}</span>
                <span class="bold">${si.qty} ${si.unitLabel}</span>
              </div>
            `;
          });
          storeWiseHtml += `<div class="mini-divider"></div>`;
        }
      });

      if (!storeWiseHtml) {
        storeWiseHtml = '<div class="text-center">No allocations recorded.</div>';
      }

      bodyContentHtml = `
        <div class="bold section-title">I. STORE-WISE ITEMS</div>
        ${storeWiseHtml}
        
        <div class="divider"></div>
        
        <div class="bold section-title">II. HANDWRITTEN NOTES</div>
        <div class="note-line"></div>
        <div class="note-line"></div>
      `;
    }

    if (printType === 'item') {
      // 2. Build Globally Consolidated Items Section
      let itemWiseHtml = '';
      let overallSumWeight = 0;
      let overallSumPieces = 0;
      let totalActiveItems = 0;

      items.forEach(item => {
        const allocations = wsQuantities[item.id] || {};
        const activeAllocations = Object.entries(allocations).filter(([_, qty]) => qty > 0);

        if (activeAllocations.length > 0) {
          totalActiveItems++;
          const total = activeAllocations.reduce((sum, [_, qty]) => sum + qty, 0);
          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pcs';

          if (item.unit === 'Weight') {
            overallSumWeight += total;
          } else {
            overallSumPieces += total;
          }

          itemWiseHtml += `<div class="bold item-name-title">${item.name.toUpperCase()} (${unitLabel})</div>`;
          activeAllocations.forEach(([storeId, qty]) => {
            const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
            itemWiseHtml += `
              <div class="item-row indent">
                <span>- ${storeName}</span>
                <span>${qty} ${unitLabel}</span>
              </div>
            `;
          });

          // Add visual divider note line before writing the sum
          itemWiseHtml += `
            <div class="mini-divider-dashed"></div>
            <div class="item-row indent bold sum-row">
              <span>SUM:</span>
              <span>${total.toFixed(item.unit === 'Weight' ? 2 : 0)} ${unitLabel}</span>
            </div>
            <div class="mini-divider"></div>
          `;
        }
      });

      if (!itemWiseHtml) {
        itemWiseHtml = '<div class="text-center">No allocations recorded.</div>';
      }

      bodyContentHtml = `
        <div class="bold section-title">I. GLOBALLY CONSOLIDATED</div>
        ${itemWiseHtml}
        
        <div class="divider"></div>
        
        <div class="bold section-title">II. HANDWRITTEN NOTES</div>
        <div class="note-line"></div>
        <div class="note-line"></div>
        
        <div class="divider"></div>
        
        <div class="bold section-title">III. CUMULATIVE SUMS</div>
        <div class="item-row">
          <span>Allocated Items:</span>
          <span class="bold">${totalActiveItems} Products</span>
        </div>
        <div class="item-row">
          <span>Total Ghee Weight:</span>
          <span class="bold">${overallSumWeight.toFixed(2)} KG</span>
        </div>
        <div class="item-row">
          <span>Total Piece Count:</span>
          <span class="bold">${overallSumPieces} Pcs</span>
        </div>
      `;
    }

    const receiptContent = `
      <html>
        <head>
          <title>Worksheet Print - ${worksheet.date}</title>
          <style>
            @page {
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 80mm;
              padding: 6mm 4mm;
              margin: 0;
              font-size: 13px;
              color: #000;
              background: #ffffff;
              line-height: 1.4;
              box-sizing: border-box;
            }
            .text-center { text-align: center; }
            .bold { font-weight: bold; }
            .header {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 2px;
              text-transform: uppercase;
            }
            .subheader {
              font-size: 11px;
              margin-bottom: 6px;
              letter-spacing: 1px;
              text-transform: uppercase;
            }
            .divider {
              border-top: 1.5px dashed #000;
              margin: 8px 0;
            }
            .mini-divider {
              border-top: 1px dotted #888;
              margin: 5px 0;
            }
            .mini-divider-dashed {
              border-top: 1px dashed #666;
              margin: 4px 0;
            }
            .section-title {
              font-size: 13px;
              margin: 14px 0 6px 0;
              text-transform: uppercase;
              border-bottom: 1.5px solid #000;
              padding-bottom: 2px;
            }
            .store-name-title {
              font-size: 12px;
              margin-top: 8px;
              margin-bottom: 4px;
            }
            .item-name-title {
              font-size: 12px;
              margin-top: 8px;
              margin-bottom: 4px;
            }
            .item-row {
              display: flex;
              justify-content: space-between;
              margin: 2px 0;
            }
            .indent {
              padding-left: 10px;
            }
            .sum-row {
              margin-top: 2px;
            }
            .note-line {
              border-bottom: 1px dotted #333;
              height: 25px;
              margin-bottom: 5px;
            }
            .footer {
              margin-top: 30px;
              font-size: 10px;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <div class="text-center bold header">RAVI SWEETS</div>
          <div class="text-center subheader">STORE WORK SHEET</div>
          <div class="divider"></div>
          <div><strong>DATE:</strong> ${worksheet.date}</div>
          <div><strong>PRINTED:</strong> ${new Date().toLocaleString()}</div>
          <div class="divider"></div>
          
          ${bodyContentHtml}
          
          <div class="divider"></div>
          <div class="text-center footer">*** THERMAL TICKET PRINT ***</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptContent);
    printWindow.document.close();
  };

  const handlePrint = async (worksheet, printType = 'store') => {
    // 1. Bluetooth Connection Check
    if (bluetoothConnected) {
      await printDirectToBluetooth(worksheet, printType);
      return;
    }

    // 2. QZ Tray USB Connection Check
    if (qzConnected && selectedQZPrinter) {
      toast.loading("Sending worksheet directly to USB thermal printer...", { id: 'usb-worksheet-print-job' });
      try {
        const bytes = buildWorksheetESCPOSBytes(worksheet, 48, printType); // 48 chars standard width for QZ 80mm
        await printRawUSB(bytes);
        toast.dismiss('usb-worksheet-print-job');
        toast.success("Worksheet printed successfully via USB!");
        return;
      } catch (err) {
        console.error("Direct USB worksheet print error: ", err);
        toast.dismiss('usb-worksheet-print-job');
        toast.error("USB print failed. Opening system print fallback...");
      }
    }

    // 3. Fallback to System HTML dialog
    printHTMLFallback(worksheet, printType);
  };

  const filteredItems = items.filter(item =>
    (item.name || '').toLowerCase().includes(itemSearch.toLowerCase())
  );

  if (loading) {
    return <Loader type="page" message="Loading worksheet inventory..." />;
  }

  return (
    <>
      <div className="ws-container">
      <div className="ws-header">
        <div className="ws-header-info">
          <h1>Store Work Sheet</h1>
          <p>Plan, allocate, and distribute ghee sweets inventory across branches</p>
        </div>

        <div className="ws-tabs-container">
          <button
            className={`ws-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            <ClipboardList size={16} /> Active Sheet
          </button>
          <button
            className={`ws-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={16} /> History Log
          </button>
        </div>
      </div>

      <div className="ws-content">
        {activeTab === 'active' ? (
          <>
            <div className="ws-filters-row">
              <div className="ws-date-picker-group">
                <label>Allocation Date</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={18} color="var(--primary-color)" />
                  <input
                    type="date"
                    className="ws-date-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="ws-search-group">
                <label>Search Items</label>
                <div className="ws-search-wrapper">
                  <Search size={18} className="ws-search-icon" />
                  <input
                    type="text"
                    className="ws-search-input"
                    placeholder="Search by product name..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {items.length > 0 ? (
              <>
                <div className="ws-table-container">
                  <table className="ws-table">
                    <thead>
                      <tr>
                        <th>Product Name</th>
                        <th>Unit</th>
                        {stores.map(store => (
                          <th key={store.id}>{store.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.length > 0 ? (
                        filteredItems.map(item => {
                          const unitBadgeClass = item.unit === 'Weight' ? 'weight' : 'piece';
                          const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pieces';
                          const unitPlaceholder = item.unit === 'Weight' ? '0.00' : '0';

                          return (
                            <tr key={item.id}>
                              <td>
                                <span className="ws-item-name">{item.name}</span>
                              </td>
                              <td>
                                <span className={`ws-unit-badge ${unitBadgeClass}`}>
                                  {unitLabel}
                                </span>
                              </td>
                              {stores.map(store => {
                                const itemQty = quantities[item.id]?.[store.id] ?? '';
                                return (
                                  <td key={store.id}>
                                    <div className="ws-qty-input-wrapper">
                                      <input
                                        type="number"
                                        className="ws-qty-input"
                                        value={itemQty}
                                        placeholder={unitPlaceholder}
                                        onChange={(e) => handleQtyChange(item.id, store.id, e.target.value)}
                                        min="0"
                                        step={item.unit === 'Weight' ? '0.01' : '1'}
                                      />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={2 + stores.length} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                              <Search size={24} style={{ color: '#94a3b8' }} />
                              <span style={{ fontWeight: 600 }}>No items match your search "{itemSearch}"</span>
                              <button 
                                onClick={() => setItemSearch('')} 
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--primary-color)',
                                  textDecoration: 'underline',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  marginTop: '4px'
                                }}
                              >
                                Clear search filter
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="ws-action-bar">
                  <button
                    onClick={handleSave}
                    className="ws-save-btn"
                    disabled={saving}
                  >
                    <Save size={18} />
                    {saving ? 'Saving...' : 'Save Worksheet'}
                  </button>
                </div>
              </>
            ) : (
              <div className="ws-empty-state">
                <div className="ws-empty-icon">
                  <PackageCheck size={28} />
                </div>
                <h3>No Inventory Items Available</h3>
                <p>Register products under the "Items" panel first to start planning worksheets.</p>
              </div>
            )}
          </>
        ) : (
          /* HISTORY TAB */
          <>
            {loadingHistory ? (
              <div style={{ padding: '60px 0' }}>
                <Loader type="section" message="Fetching history entries..." />
              </div>
            ) : history.length > 0 ? (
              <div className="ws-history-grid">
                {history.map(sheet => {
                  // Count total allocated items
                  const allocatedItemsCount = Object.keys(sheet.quantities || {}).length;
                  
                  return (
                    <div 
                      key={sheet.id} 
                      className="ws-history-card" 
                      onClick={() => setPreviewSheet(sheet)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="ws-card-header">
                        <span className="ws-card-date">
                          <Calendar size={18} color="var(--accent-color)" />
                          {sheet.date}
                        </span>
                        <ChevronRight size={18} color="var(--text-secondary)" />
                      </div>
                      
                      <div className="ws-card-stats">
                        <span className="ws-stat-pill">
                          <strong>{allocatedItemsCount}</strong> Products
                        </span>
                        <span className="ws-stat-pill">
                          <Building size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                          {stores.length} Stores
                        </span>
                      </div>
                      
                      <div className="ws-card-actions">
                        <button 
                          className="ws-print-btn" 
                          onClick={(e) => { e.stopPropagation(); setPrintTargetSheet(sheet); }}
                        >
                          <Printer size={15} />
                          Print Ticket
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ws-empty-state">
                <div className="ws-empty-icon">
                  <ClipboardList size={28} />
                </div>
                <h3>No Worksheets Saved Yet</h3>
                <p>Prepare and save active worksheets to log details in the history tab.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>



      {/* Consolidated Analytics Preview Modal */}
      <AnimatePresence>
        {previewSheet && (() => {
          const wsQuantities = previewSheet.quantities || {};
          
          // Calculate cumulative sums
          let overallSumWeight = 0;
          let overallSumPieces = 0;
          let totalActiveItems = 0;
          
          const completedMap = previewSheet.completed || {};
          
          // Store-wise parsed data
          const storeBreakdowns = stores.map(store => {
            const allocatedItems = [];
            items.forEach(item => {
              const qty = Number(wsQuantities[item.id]?.[store.id] || 0);
              if (qty > 0) {
                allocatedItems.push({
                  id: item.id,
                  name: item.name,
                  qty,
                  unit: item.unit,
                  unitLabel: item.unit === 'Weight' ? 'KG' : 'Pcs',
                  isCompleted: !!(completedMap[item.id]?.[store.id])
                });
              }
            });
            return {
              ...store,
              allocatedItems
            };
          }).filter(s => s.allocatedItems.length > 0);

          // Globally consolidated parsed data
          const consolidatedItems = [];
          items.forEach(item => {
            const allocations = wsQuantities[item.id] || {};
            const storeAllocations = [];
            let itemTotal = 0;

            Object.entries(allocations).forEach(([storeId, qtyStr]) => {
              const qty = Number(qtyStr || 0);
              if (qty > 0) {
                const storeName = stores.find(s => s.id === storeId)?.name || 'Unknown Store';
                const isCompleted = !!(completedMap[item.id]?.[storeId]);
                storeAllocations.push({ storeId, storeName, qty, isCompleted });
                itemTotal += qty;
              }
            });

            if (itemTotal > 0) {
              totalActiveItems++;
              if (item.unit === 'Weight') {
                overallSumWeight += itemTotal;
              } else {
                overallSumPieces += itemTotal;
              }

              consolidatedItems.push({
                id: item.id,
                name: item.name,
                unit: item.unit,
                unitLabel: item.unit === 'Weight' ? 'KG' : 'Pcs',
                total: itemTotal,
                storeAllocations
              });
            }
          });

          return (
            <div className="modal-overlay" style={{ zIndex: 4000 }}>
              <motion.div
                className="ws-analytics-modal"
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.98 }}
                transition={{ type: "spring", duration: 0.5 }}
              >
                {/* Modal Header */}
                <div className="ws-modal-header">
                  <div className="ws-modal-title-area">
                    <ClipboardList size={22} className="ws-modal-header-icon" />
                    <div>
                      <h2>Consolidated Analytics</h2>
                      <p>Worksheet for {previewSheet.date}</p>
                    </div>
                  </div>
                  <button className="ws-modal-close-btn" onClick={() => setPreviewSheet(null)}>
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="ws-modal-body">
                  {/* Quick Metrics row */}
                  <div className="ws-metrics-grid">
                    <div className="ws-metric-card">
                      <span className="ws-metric-label">Products Active</span>
                      <span className="ws-metric-value">{totalActiveItems}</span>
                      <span className="ws-metric-sub">Allocated items</span>
                    </div>
                    <div className="ws-metric-card">
                      <span className="ws-metric-label">Total Ghee Weight</span>
                      <span className="ws-metric-value">{overallSumWeight.toFixed(2)} <span className="ws-metric-unit">KG</span></span>
                      <span className="ws-metric-sub">Distributed weight</span>
                    </div>
                    <div className="ws-metric-card">
                      <span className="ws-metric-label">Total Piece Count</span>
                      <span className="ws-metric-value">{overallSumPieces} <span className="ws-metric-unit">Pcs</span></span>
                      <span className="ws-metric-sub">Distributed units</span>
                    </div>
                  </div>

                  {/* Columns for Store-Wise and Consolidated */}
                  <div className="ws-analytics-columns">
                    {/* Column 1: Store-wise Breakdowns */}
                    <div className="ws-analytics-column">
                      <div className="ws-column-header">
                        <Building size={16} />
                        <h3>Store-Wise Summaries</h3>
                      </div>
                      
                      {storeBreakdowns.length > 0 ? (
                        <div className="ws-column-scrollable">
                          {storeBreakdowns.map(sb => (
                            <div key={sb.id} className="ws-analytics-store-card">
                              <div className="ws-store-card-header">{sb.name}</div>
                              <div className="ws-store-card-list">
                                {sb.allocatedItems.map(item => (
                                  <div key={item.id} className="ws-store-card-item" style={{ background: item.isCompleted ? '#f0fdf4' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', margin: '4px 0', border: item.isCompleted ? '1px solid #bbf7d0' : 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span className="ws-item-name" style={{ textDecoration: item.isCompleted ? 'line-through' : 'none', textDecorationColor: '#94a3b8', fontSize: '12px', fontWeight: '600' }}>{item.name}</span>
                                      {item.isCompleted && (
                                        <span style={{ 
                                          background: '#10b981', 
                                          color: 'white', 
                                          fontSize: '9px', 
                                          fontWeight: '800', 
                                          padding: '1px 5px', 
                                          borderRadius: '10px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '2px'
                                        }}>
                                          ✓ Prepared
                                        </span>
                                      )}
                                    </div>
                                    <span className="ws-item-qty" style={{ fontSize: '12px', fontWeight: '700', color: item.isCompleted ? '#047857' : 'var(--primary-color)' }}>{item.qty} {item.unitLabel}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="ws-column-empty">No Store Allocations Found</div>
                      )}
                    </div>

                    {/* Column 2: Consolidated Inventory */}
                    <div className="ws-analytics-column">
                      <div className="ws-column-header">
                        <PackageCheck size={16} />
                        <h3>Consolidated Products</h3>
                      </div>

                      {consolidatedItems.length > 0 ? (
                        <div className="ws-column-scrollable">
                          {consolidatedItems.map(ci => (
                            <div key={ci.id} className="ws-analytics-product-card">
                              <div className="ws-product-card-header">
                                <span className="ws-product-name">{ci.name}</span>
                                <span className={`ws-unit-badge ${ci.unit === 'Weight' ? 'weight' : 'piece'}`}>
                                  {ci.total.toFixed(ci.unit === 'Weight' ? 2 : 0)} {ci.unitLabel}
                                </span>
                              </div>
                              <div className="ws-product-card-allocations">
                                {ci.storeAllocations.map(sa => (
                                  <div key={sa.storeId} className="ws-product-allocation-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed #f1f5f9' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span className="ws-alloc-store" style={{ textDecoration: sa.isCompleted ? 'line-through' : 'none', textDecorationColor: '#94a3b8', fontSize: '12px' }}>{sa.storeName}</span>
                                      {sa.isCompleted && (
                                        <span style={{ 
                                          background: '#d1fae5', 
                                          color: '#065f46', 
                                          fontSize: '8px', 
                                          fontWeight: '800', 
                                          padding: '0px 4px', 
                                          borderRadius: '8px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '1px'
                                        }}>
                                          ✓ Prepared
                                        </span>
                                      )}
                                    </div>
                                    <span className="ws-alloc-qty" style={{ fontSize: '12px', fontWeight: '600' }}>{sa.qty} {ci.unitLabel}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="ws-column-empty">No Product Allocations Found</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="ws-modal-footer">
                  <button className="ws-modal-btn secondary" onClick={() => setPreviewSheet(null)}>
                    Close Preview
                  </button>
                  <button className="ws-save-btn" style={{ height: '40px' }} onClick={() => setPrintTargetSheet(previewSheet)}>
                    <Printer size={18} />
                    Print Ticket
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Print Options Selection Modal */}
      <AnimatePresence>
        {printTargetSheet && (
          <div className="modal-overlay" style={{ zIndex: 6000 }} onClick={() => setPrintTargetSheet(null)}>
            <motion.div
              className="custom-modal ws-print-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ maxWidth: '420px', width: '90%' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                <Printer size={28} />
              </div>
              <h3 className="modal-title">Select Print Format</h3>
              <p className="modal-text" style={{ marginBottom: '20px' }}>Choose how you would like to print the worksheet for {printTargetSheet.date}:</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                <button
                  className="ws-print-option-card"
                  onClick={() => {
                    handlePrint(printTargetSheet, 'store');
                    setPrintTargetSheet(null);
                  }}
                >
                  <div className="ws-print-option-icon">
                    <Building size={20} />
                  </div>
                  <div>
                    <div className="ws-print-option-title">Store-Wise Print</div>
                    <div className="ws-print-option-desc">Prints items grouped individually under each branch store.</div>
                  </div>
                </button>

                <button
                  className="ws-print-option-card"
                  onClick={() => {
                    handlePrint(printTargetSheet, 'item');
                    setPrintTargetSheet(null);
                  }}
                >
                  <div className="ws-print-option-icon">
                    <PackageCheck size={20} />
                  </div>
                  <div>
                    <div className="ws-print-option-title">Item-Wise Print</div>
                    <div className="ws-print-option-desc">Prints globally consolidated sums and cumulative product counts.</div>
                  </div>
                </button>
              </div>

              <div className="modal-actions" style={{ marginTop: '24px' }}>
                <button className="modal-btn cancel" onClick={() => setPrintTargetSheet(null)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default StoreWorkSheet;
