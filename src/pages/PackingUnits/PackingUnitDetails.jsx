import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Factory, 
  MapPin, 
  Building2, 
  ShoppingBag, 
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  User,
  Edit,
  Plus,
  Trash2,
  Printer,
  X,
  Search
} from 'lucide-react';
import { usePrinter } from '../../context/PrinterContext';
import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './PackingUnitDetails.css';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';


const PackingUnitDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Consume global printer context
  const {
    bluetoothConnected,
    connectedDevice,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

  // Editing Packing Details States
  const [editingOrderDetails, setEditingOrderDetails] = useState(null);
  const [boxes, setBoxes] = useState([{ boxNum: 1, contents: '' }]);
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [ordersFilter, setOrdersFilter] = useState('active'); // 'active' or 'history'
  const [historyDate, setHistoryDate] = useState('');
  const [storeFilter, setStoreFilter] = useState('All');
  const [itemFilter, setItemFilter] = useState('');
  const [orderFilter, setOrderFilter] = useState('');

  // Get unique stores from the orders assigned to this unit
  const uniqueStores = React.useMemo(() => {
    const storesSet = new Set();
    orders.forEach(order => {
      if (order.storeName) {
        storesSet.add(order.storeName);
      }
    });
    return Array.from(storesSet).sort();
  }, [orders]);

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

  // --- Print Operations ---
  const printDirectToQZ = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job to USB printer via QZ Tray...", { id: 'qz-print-job' });
    try {
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
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: #${order.orderId}\n`));
        bytes.push(...encoder.encode(`Date: ${new Date().toLocaleDateString()}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));
        
        if (notes) {
          bytes.push(...encoder.encode("--------------------------------\n"));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }
        
        bytes.push(...encoder.encode("--------------------------------\n"));
        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${unit?.name || id || 'Facility'}\n`));
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

  // --- Box Packing Handlers ---
  const handleOpenEditDetails = (order) => {
    setEditingOrderDetails(order);
    setPUnitDescription(order.pUnitDescription || '');
    
    // Check if the order already has dynamic boxes
    if (order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0) {
      setBoxes(order.boxes.map(b => ({ ...b })));
    } else if (order.boxContents) {
      setBoxes([{ boxNum: 1, contents: order.boxContents }]);
    } else {
      setBoxes([{ boxNum: 1, contents: '' }]);
    }
  };

  const handleAddBox = () => {
    setBoxes(prev => [...prev, { boxNum: prev.length + 1, contents: '' }]);
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
    if (bluetoothConnected) {
      printDirectToBluetooth(order, boxesList, notes);
    } else if (qzConnected && selectedQZPrinter) {
      printDirectToQZ(order, boxesList, notes);
    } else {
      handlePrintBoxes(order, boxesList, notes);
    }
  };

  const printDirectToBluetooth = async (order, boxesList, notes = '') => {
    toast.loading("Sending print job directly to Bluetooth thermal printer...", { id: 'bt-print-job' });

    try {
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
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...DOUBLE_SIZE);
        bytes.push(...encoder.encode(`BOX ${box.boxNum} OF ${boxesList.length}\n`));
        bytes.push(...NORMAL_SIZE);
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...LEFT);
        bytes.push(...encoder.encode(`Order ID: #${order.orderId}\n`));
        bytes.push(...encoder.encode(`Date: ${new Date().toLocaleDateString()}\n`));
        bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
        bytes.push(...encoder.encode(`Phone: ${order.customerPhone || 'N/A'}\n`));
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...encoder.encode("Items in Box:\n"));
        bytes.push(...encoder.encode(`${box.contents}\n`));
        
        if (notes) {
          bytes.push(...encoder.encode("--------------------------------\n"));
          bytes.push(...encoder.encode(`Note: ${notes}\n`));
        }
        
        bytes.push(...encoder.encode("--------------------------------\n"));
        
        bytes.push(...CENTER);
        bytes.push(...encoder.encode(`Packed by Unit: ${id || 'Facility'}\n`));
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
    if (bluetoothConnected) {
      toast.success(`Sending ${boxesList.length} box ticket rolls to ${connectedDevice}...`);
    }

    const printContent = `
      <html>
        <head>
          <title>Box Slips - Order #${order.orderId}</title>
          <style>
            @media print {
              @page { size: 58mm auto; margin: 0; }
              body { margin: 0; padding: 0; background: white; width: 58mm; }
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              width: 58mm;
              margin: 0 auto;
              padding: 8px;
              box-sizing: border-box;
              font-size: 11px;
              line-height: 1.3;
              color: #000;
            }
            .slip {
              border-bottom: 2px dashed #000;
              padding-bottom: 12px;
              margin-bottom: 12px;
              page-break-after: always;
            }
            .slip:last-child {
              border-bottom: none;
              page-break-after: avoid;
              margin-bottom: 0;
              padding-bottom: 0;
            }
            .title {
              font-size: 14px;
              font-weight: bold;
              text-align: center;
              text-transform: uppercase;
              margin: 4px 0 2px 0;
            }
            .subtitle {
              font-size: 9px;
              text-align: center;
              border-bottom: 1px solid #000;
              padding-bottom: 4px;
              margin-bottom: 6px;
            }
            .info-label {
              font-weight: bold;
            }
            .info-row {
              margin: 3px 0;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 6px 0;
            }
            .box-header {
              font-size: 13px;
              font-weight: bold;
              text-align: center;
              background: #000;
              color: #fff;
              padding: 4px;
              margin: 8px 0;
            }
            .box-desc {
              font-size: 11px;
              white-space: pre-wrap;
              background: #f4f4f5;
              padding: 6px;
              border-radius: 4px;
              margin-top: 4px;
              border: 1px solid #ddd;
            }
            .footer {
              text-align: center;
              font-size: 8px;
              margin-top: 12px;
              border-top: 1px solid #000;
              padding-top: 4px;
              color: #555;
            }
          </style>
        </head>
        <body>
          \${boxesList.map((box, index) => \`
            <div class="slip">
              <div class="title">Ravi Sweets</div>
              <div class="subtitle">Quality Sweets & Savouries</div>
              
              <div class="box-header">BOX \${box.boxNum} OF \${boxesList.length}</div>
              
              <div class="info-row"><span class="info-label">Order ID:</span> #\${order.orderId}</div>
              <div class="info-row"><span class="info-label">Date:</span> \${new Date().toLocaleDateString()}</div>
              
              <div class="divider"></div>
              
              <div class="info-row"><span class="info-label">Customer:</span> \${order.customerName}</div>
              <div class="info-row"><span class="info-label">Phone:</span> \${order.customerPhone || 'N/A'}</div>
              
              <div class="divider"></div>
              
              <div class="info-row"><span class="info-label">Items in Box:</span></div>
              <div class="box-desc">\${box.contents}</div>
              
              \${notes ? \`
                <div class="divider"></div>
                <div class="info-row"><span class="info-label">Note:</span> \${notes}</div>
              \` : ''}
              
              <div class="footer">
                <p>Packed by Packing Unit: \${unit?.name || 'Facility'}</p>
                <p>Thank you for your order!</p>
              </div>
            </div>
          \`).join('')}
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
  };

  useEffect(() => {
    const fetchUnit = async () => {
      try {
        const unitDoc = await getDoc(doc(db, 'packing_units', id));
        if (unitDoc.exists()) {
          setUnit({ id: unitDoc.id, ...unitDoc.data() });
        } else {
          toast.error("Packing unit not found");
          navigate('/packing');
        }
      } catch (error) {
        toast.error("Failed to load unit details");
      }
    };
    fetchUnit();
  }, [id, navigate]);

  useEffect(() => {
    // Fetch all orders and filter locally for items belonging to this unit
    // Alternatively, we could structure orders to be more queryable per item, 
    // but since items are nested in the order document, we filter locally.
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter orders that have at least one item assigned to this packing unit, or the order itself is assigned
      // Assuming packing unit is assigned at order level (pUnitId) or item level
      const unitOrders = allOrders.filter(order => order.pUnitId === id);
      
      setOrders(unitOrders);
      setLoading(false);
    }, (error) => {
      console.error("MU Orders subscription error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

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

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const updatedItems = order.items.map((item, idx) => {
        if (idx === itemIndex) {
          return { ...item, status: newStatus };
        }
        return { ...item };
      });
      const overallStatus = calculateOverallOrderStatus(updatedItems);
      await updateDoc(orderRef, { 
        items: updatedItems,
        status: overallStatus
      });
      toast.success("Item status updated");

      const statusChangedToReady = (!order.status || order.status !== 'Ready for Delivery') && overallStatus === 'Ready for Delivery';
      if (statusChangedToReady) {
        setTimeout(() => triggerWhatsAppOrderReady({
          ...order,
          items: updatedItems,
          status: overallStatus
        }), 500);
      }
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return <div className="mud-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>;
  }

  if (!unit) return null;

  // Filter active packing orders based on sweet packaging status
  const activeOrders = orders.filter(order => {
    if (!order.items || order.items.length === 0) return false;
    const hasPackingItem = order.items.some(i => i.status === 'moved_to_packing' || i.status === 'packing_complete');
    const allMovedToStore = order.items.every(i => i.status === 'moved_to_store' || i.status === 'delivered');
    return hasPackingItem && !allMovedToStore;
  });

  // Filter history orders based on selected date filter
  const historyOrders = orders.filter(order => {
    if (!historyDate) return true;
    const orderDateStr = order.deliveryDate || (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '');
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

  const displayedOrders = applyAllFilters(ordersFilter === 'active' ? activeOrders : historyOrders);

  return (
    <div className="mud-container">
      <button className="cd-back-btn" onClick={() => navigate('/packing')}>
        <ArrowLeft size={18} /> Back to Units
      </button>

      <div className="mud-header">
        <div className="mud-header-left">
          <div className="mud-main-icon">
            <Factory size={32} />
          </div>
          <div className="mud-header-info">
            <h1>{unit.name}</h1>
            <div className="mud-header-meta">
              <MapPin size={14} /> {unit.city}, {unit.state}
            </div>
          </div>
        </div>
        <div className="mud-status-card">
          <span>Unit Status</span>
          <div className="cd-active-badge">Operational</div>
        </div>
      </div>

      <div className="mud-content">
        <div className="mud-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h2><ShoppingBag size={20} /> Assigned Orders & Items</h2>
            <p>Displaying sweet packaging workflows for this unit</p>
          </div>
          
          {/* Sub-tab Toggle Group */}
          <div className="mud-tab-toggle-group" style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setOrdersFilter('active')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: ordersFilter === 'active' ? 'white' : 'transparent',
                color: ordersFilter === 'active' ? 'var(--primary-color)' : '#64748b',
                boxShadow: ordersFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              Active Packing ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setOrdersFilter('history')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '700',
                border: 'none',
                cursor: 'pointer',
                background: ordersFilter === 'history' ? 'white' : 'transparent',
                color: ordersFilter === 'history' ? 'var(--primary-color)' : '#64748b',
                boxShadow: ordersFilter === 'history' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              Packing History ({orders.length})
            </button>
          </div>
        </div>

        {/* Date Filter Bar for History */}
        {ordersFilter === 'history' && (
          <div className="mud-date-filter-bar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '15px',
            flexWrap: 'wrap',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '20px',
            marginTop: '10px'
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
        <div className="mud-filters-bar" style={{
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

        <div className="mud-orders-grid">
          {displayedOrders.length > 0 ? displayedOrders.map(order => (
            <div key={order.id} className="mud-order-card">
              <div className="mud-order-header">
                <div className="mud-order-main-info">
                  <span className="mud-order-id">#{order.orderId}</span>
                  <span className="mud-order-date">{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'New'}</span>
                </div>
                <div className={`mud-order-status-tag ${order.status}`}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
              
              <div className="mud-customer-info">
                <User size={14} />
                <span>{order.customerName}</span>
              </div>

              {/* Comprehensive Packing Details Card */}
              <div className="mud-packing-card animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Package size={14} /> PACKING SLIPS & BOXES
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {order.boxesPacked !== undefined && (
                      <button
                        type="button"
                        onClick={() => handlePrintTrigger(order, order.boxes || [{ boxNum: 1, contents: order.boxContents }], order.pUnitDescription)}
                        className="mud-mini-action-btn print"
                        title="Print Box Slips"
                      >
                        <Printer size={12} /> Print
                      </button>
                    )}
                    {ordersFilter !== 'history' && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditDetails(order)}
                        className="mud-mini-action-btn edit"
                        title="Edit Packing Box Details"
                      >
                        <Edit size={12} /> Edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="mud-packing-card-row">
                  <strong>Notes:</strong> {order.pUnitDescription || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>None specified</span>}
                </div>

                <div className="mud-packing-card-row">
                  <strong>Boxes Packed:</strong> {order.boxesPacked !== undefined ? `${order.boxesPacked} boxes` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not recorded</span>}
                </div>

                {order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0 ? (
                  <div className="mud-packing-boxes-list">
                    {order.boxes.map((box, bIdx) => (
                      <div key={bIdx} className="mud-packing-box-item animate-fade-in">
                        <strong>Box {box.boxNum}:</strong> <span>{box.contents}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  order.boxContents && (
                    <div className="mud-packing-card-row" style={{ marginTop: '5px' }}>
                      <strong>Contents:</strong> <span style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{order.boxContents}</span>
                    </div>
                  )
                )}
              </div>

              <div className="mud-items-list">
                {order.items.map((item, idx) => {
                  // Find original index in order.items for updates
                  const originalIndex = order.items.findIndex(i => i.id === item.id);
                  return (
                    <div key={idx} className="mud-item-row">
                      <div className="mud-item-main">
                        <Package size={16} className="item-icon" />
                        <div className="mud-item-name-qty">
                          <span className="name">{item.name}</span>
                          {item.description && <span className="desc">{item.description}</span>}
                          <span className="qty">{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`}</span>
                        </div>
                      </div>
                      
                      <div className="mud-item-status-ctrl">
                        {ordersFilter === 'history' ? (
                          <span className={`mud-static-status-badge ${item.status || 'preparation_started'}`} style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: '700',
                            background: '#f1f5f9',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                            display: 'inline-block'
                          }}>
                            {(item.status || 'preparation_started').replace(/_/g, ' ').toUpperCase()}
                          </span>
                        ) : (
                          <select 
                            className="mud-status-select"
                            value={item.status || 'preparation_started'}
                            onChange={(e) => updateItemStatus(order.id, originalIndex, e.target.value)}
                          >
                            <option value="preparation_started">Preparation Started</option>
                            <option value="preparation_complete">Preparation Complete</option>
                            <option value="moved_to_packing">Moved to Packing</option>
                            <option value="packing_complete">Packing Complete</option>
                            <option value="moved_to_store">Moved to Store</option>
                            <option value="received_at_store">Received at Store</option>
                            <option value="delivered">Delivered</option>
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="mud-empty-state">
              <Package size={48} />
              <h3>{ordersFilter === 'active' ? 'No Active Packing Orders' : 'No Order History'}</h3>
              <p>
                {ordersFilter === 'active' 
                  ? 'There are no active orders ready to be packed currently.' 
                  : historyDate 
                    ? `No orders found in history for ${new Date(historyDate).toLocaleDateString()}.` 
                    : 'No packaging records exist yet.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dynamic Packing Details Modal */}
      <AnimatePresence>
        {editingOrderDetails && (
          <div className="mud-modal-overlay">
            <motion.div 
              className="mud-modal-content"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="mud-modal-header">
                <h3>Packing Details - Order #{editingOrderDetails.orderId}</h3>
                <button type="button" className="mud-modal-close" onClick={() => setEditingOrderDetails(null)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSavePackingDetails} className="mud-modal-form">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '13px', fontWeight: '800', color: '#334155' }}>Configure Boxes *</label>
                    <button 
                      type="button" 
                      onClick={handleAddBox}
                      className="mud-add-box-btn"
                    >
                      <Plus size={14} style={{ marginRight: '4px' }} /> Add Box
                    </button>
                  </div>

                  <div className="mud-modal-boxes-container">
                    {boxes.map((box, index) => (
                      <div key={index} className="mud-modal-box-row animate-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)' }}>BOX #{box.boxNum}</span>
                          {boxes.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => handleRemoveBox(index)}
                              className="mud-remove-box-btn"
                              title="Remove box"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <textarea
                          required
                          rows={2}
                          placeholder={`Specify sweeets, quantities or items packed in Box #${box.boxNum}...`}
                          value={box.contents}
                          onChange={(e) => handleBoxContentsChange(index, e.target.value)}
                          className="mud-modal-textarea"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mud-modal-field">
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#334155', display: 'block', marginBottom: '6px' }}>Packing Instructions / Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Enter instructions, notes or packing details..."
                    value={pUnitDescription}
                    onChange={(e) => setPUnitDescription(e.target.value)}
                    className="mud-modal-textarea"
                  />
                </div>

                <div className="mud-modal-footer">
                  <button 
                    type="button" 
                    onClick={() => setEditingOrderDetails(null)} 
                    className="mud-modal-btn cancel"
                    disabled={savingDetails}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="mud-modal-btn save"
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

    </div>
  );
};

export default PackingUnitDetails;
