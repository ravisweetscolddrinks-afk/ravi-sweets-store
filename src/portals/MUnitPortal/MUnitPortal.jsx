import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import {
  BarChart3,
  ShoppingBag,
  ClipboardList,
  CheckCircle2,
  User,
  Clock,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronUp,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, onSnapshot, query, doc, updateDoc, getDocs, where, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './MUnitPortal.css';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';
import { sendEventNotification } from '../../utils/notificationService';


// Helper to convert "HH:MM" (24-hour) to "H:MM AM/PM" (12-hour)
const format12Hour = (time24) => {
  if (!time24 || typeof time24 !== 'string') return '';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  
  if (isNaN(hours)) return time24;
  
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  
  return `${hours}:${minutes} ${ampm}`;
};

const MUnitPortal = () => {
  const { id, tab } = useParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [packingUnits, setPackingUnits] = useState([]);
  const [selectedPUnitFilter, setSelectedPUnitFilter] = useState('All');

  // Today Worksheet states
  const [worksheetSubTab, setWorksheetSubTab] = useState('pending'); // 'pending' or 'completed'
  const [worksheetDate, setWorksheetDate] = useState(new Date().toISOString().split('T')[0]); // defaults to today's YYYY-MM-DD

  // Store Worksheet states
  const [mUnitWorksheetDate, setMUnitWorksheetDate] = useState(new Date().toISOString().split('T')[0]);
  const [mUnitWorksheetData, setMUnitWorksheetData] = useState(null);
  const [mUnitStores, setMUnitStores] = useState([]);
  const [mUnitItems, setMUnitItems] = useState([]);
  const [mUnitWorksheetLoading, setMUnitWorksheetLoading] = useState(false);
  const [storeWorksheetSubTab, setStoreWorksheetSubTab] = useState('pending'); // 'pending' or 'completed'

  // Fetch items & stores on mount / tab change
  useEffect(() => {
    if (tab === 'store-worksheet') {
      const fetchStoresAndItems = async () => {
        try {
          const [storesSnap, itemsSnap] = await Promise.all([
            getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
            getDocs(query(collection(db, 'items'), orderBy('name', 'asc')))
          ]);
          setMUnitStores(storesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setMUnitItems(itemsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Error fetching stores or items in MUnitPortal:", err);
          toast.error("Failed to load metadata.");
        }
      };
      fetchStoresAndItems();
    }
  }, [tab]);

  // Fetch/subscribe to the store worksheets for the selected date
  useEffect(() => {
    if (tab === 'store-worksheet' && mUnitWorksheetDate) {
      setMUnitWorksheetLoading(true);
      const q = query(collection(db, 'store_worksheets'), where('date', '==', mUnitWorksheetDate));

      const unsubscribe = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          setMUnitWorksheetData({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
          setMUnitWorksheetData(null);
        }
        setMUnitWorksheetLoading(false);
      }, (err) => {
        console.error("Error loading store worksheets in MUnitPortal:", err);
        setMUnitWorksheetLoading(false);
      });

      return () => unsubscribe();
    }
  }, [tab, mUnitWorksheetDate]);

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

  // Fetch Packing Units on mount for filters
  useEffect(() => {
    const fetchPackingUnits = async () => {
      try {
        const snap = await getDocs(collection(db, 'packing_units'));
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetched.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setPackingUnits(fetched);
      } catch (err) {
        console.error("Failed to load packing units in MUnitPortal:", err);
      }
    };
    fetchPackingUnits();
  }, []);

  const links = [
    { label: 'Today Worksheet', icon: <ClipboardList size={20} />, path: `/munit-portal/${id}/worksheet` },
    { label: 'Store Worksheet', icon: <ClipboardList size={20} />, path: `/munit-portal/${id}/store-worksheet` },
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/munit-portal/${id}/orders` },
    { label: 'Analytics', icon: <BarChart3 size={20} />, path: `/munit-portal/${id}/analytics` }
  ];

  if (!tab) return <Navigate to={`/munit-portal/${id}/worksheet`} replace />;

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

  // Group & Aggregate items for the worksheet based on tab (pending/completed) and worksheetDate
  const getWorksheetItems = (statusType) => {
    const groups = {};
    orders.forEach(order => {
      // Filter by Packing Unit
      if (selectedPUnitFilter !== 'All' && order.pUnitId !== selectedPUnitFilter) return;

      // Filter orders matching the selected date (Target Delivery Date, fallback to Creation Date)
      const orderDateStr = order.deliveryDate || (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '');
      if (!isSameDay(orderDateStr, worksheetDate)) return;

      if (order.items) {
        order.items.forEach((item, index) => {
          if (item.mUnitId === id) {
            const isPending = item.status === 'preparation_started' || !item.status;
            const isCompleted = item.status === 'preparation_complete' ||
              item.status === 'moved_to_packing' ||
              item.status === 'packing_complete' ||
              item.status === 'moved_to_store' ||
              item.status === 'delivered';

            const match = (statusType === 'pending' && isPending) || (statusType === 'completed' && isCompleted);

            if (match) {
              const key = item.name + '_' + (item.unit || 'Pieces');
              if (!groups[key]) {
                groups[key] = {
                  name: item.name,
                  unit: item.unit,
                  totalQty: 0,
                  description: item.description || '',
                  status: item.status,
                  linkedOrders: []
                };
              }
              groups[key].totalQty += Number(item.quantity || 0);
              groups[key].linkedOrders.push({
                orderDocId: order.id,
                orderId: order.orderId,
                serialNumber: order.serialNumber,
                itemIndex: index,
                quantity: item.quantity,
                customerName: order.customerName,
                createdAt: order.createdAt,
                itemDescription: item.description || '',
                mUnitDescription: order.mUnitDescription || '',
                deliveryDate: order.deliveryDate || '',
                deliveryTime: order.deliveryTime || ''
              });
            }
          }
        });
      }
    });
    return Object.values(groups);
  };

  // Mark grouped item as done
  const handleMarkItemDone = async (groupedItem) => {
    try {
      const promises = groupedItem.linkedOrders.map(async (link) => {
        const orderRef = doc(db, 'orders', link.orderDocId);
        const order = orders.find(o => o.id === link.orderDocId);
        if (!order) return;

        const newItems = [...order.items];
        if (newItems[link.itemIndex]) {
          newItems[link.itemIndex].status = 'preparation_complete';
        }
        return updateDoc(orderRef, { items: newItems });
      });

      await Promise.all(promises);
      toast.success(`Successfully completed ${groupedItem.name}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update items status");
    }
  };

  // Filter orders assigned to this manufacturing unit
  const getAssignedOrders = () => {
    return orders.filter(order =>
      order.items && order.items.some(item => item.mUnitId === id) &&
      (selectedPUnitFilter === 'All' || order.pUnitId === selectedPUnitFilter)
    );
  };

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

      // 🔔 Notify packing unit users when item is moved to packing
      if (newStatus === 'moved_to_packing' && order.pUnitId) {
        sendEventNotification('item_moved_to_packing', order.pUnitId, {
          orderId: order.orderId || orderDocId,
          itemName: updatedItem?.name || 'Item',
          quantity: `${updatedItem?.quantity || ''} ${updatedItem?.unit === 'Weight' ? 'kg' : 'pcs'}`,
          customerName: order.customerName || '',
          pUnitId: order.pUnitId
        });
      }

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

  // Toggle individual store allocation completion status in store worksheet
  const handleToggleStoreAllocation = async (itemId, storeId) => {
    if (!mUnitWorksheetData || !mUnitWorksheetData.id) {
      toast.error("Worksheet is not loaded or does not exist.");
      return;
    }

    try {
      const worksheetRef = doc(db, 'store_worksheets', mUnitWorksheetData.id);
      const currentCompleted = mUnitWorksheetData.completed || {};
      const itemCompleted = currentCompleted[itemId] || {};
      const isCurrentlyCompleted = !!itemCompleted[storeId];

      const updatedCompleted = {
        ...currentCompleted,
        [itemId]: {
          ...itemCompleted,
          [storeId]: !isCurrentlyCompleted
        }
      };

      await updateDoc(worksheetRef, { completed: updatedCompleted });
      toast.success(isCurrentlyCompleted ? "Allocation marked as pending" : "Allocation marked as completed!");
    } catch (err) {
      console.error("Error updating store worksheet allocation:", err);
      toast.error("Failed to update allocation status.");
    }
  };

  const toggleOrderAccordion = (orderDocId) => {
    setExpandedOrders(prev =>
      prev.includes(orderDocId) ? prev.filter(oId => oId !== orderDocId) : [...prev, orderDocId]
    );
  };

  const pendingWorksheetItems = getWorksheetItems('pending');
  const completedWorksheetItems = getWorksheetItems('completed');
  const activeWorksheetItems = worksheetSubTab === 'pending' ? pendingWorksheetItems : completedWorksheetItems;
  const assignedOrders = getAssignedOrders();

  const getMUnitWorksheetItems = (statusType) => {
    if (!mUnitWorksheetData || !mUnitWorksheetData.quantities) return [];

    const parsed = [];
    const globalQuantities = mUnitWorksheetData.quantities;
    const completedMap = mUnitWorksheetData.completed || {};

    mUnitItems.forEach(item => {
      if (item.mUnitId === id) {
        const allocations = globalQuantities[item.id] || {};
        const storeAllocations = [];
        let total = 0;

        Object.entries(allocations).forEach(([storeId, qty]) => {
          if (qty > 0) {
            const isCompleted = !!(completedMap[item.id]?.[storeId]);
            const match = (statusType === 'pending' && !isCompleted) || (statusType === 'completed' && isCompleted);

            if (match) {
              const storeName = mUnitStores.find(s => s.id === storeId)?.name || 'Unknown Store';
              storeAllocations.push({ storeId, storeName, qty, isCompleted });
              total += Number(qty);
            }
          }
        });

        if (storeAllocations.length > 0) {
          parsed.push({
            id: item.id,
            name: item.name,
            unit: item.unit,
            unitLabel: item.unit === 'Weight' ? 'KG' : 'Pcs',
            total,
            storeAllocations
          });
        }
      }
    });

    return parsed;
  };

  const pendingMUnitWorksheetItems = getMUnitWorksheetItems('pending');
  const completedMUnitWorksheetItems = getMUnitWorksheetItems('completed');
  const activeMUnitWorksheetItems = storeWorksheetSubTab === 'pending' ? pendingMUnitWorksheetItems : completedMUnitWorksheetItems;

  return (
    <PortalLayout title="Manufacturing Portal" links={links}>
      <div className="mu-portal-content">
        {loading ? (
          <div className="mu-loading-container">
            <div className="loader"></div>
            <p>Loading manufacturing dashboard...</p>
          </div>
        ) : (
          <>
            {/* --- TODAY WORKSHEET TAB --- */}
            {tab === 'worksheet' && (
              <div className="mu-worksheet-view animate-fade-in">

                {/* Header with Sub tabs and Date picker */}
                <div className="mu-view-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h2>Today Worksheet</h2>
                      <p className="mu-subtitle">Aggregated list of sweet items to prepare</p>
                    </div>

                    {/* Pending vs Completed Sub tabs */}
                    <div className="mu-sub-tabs">
                      <button
                        className={`mu-sub-tab-btn ${worksheetSubTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setWorksheetSubTab('pending')}
                      >
                        <Clock size={16} /> Pending ({pendingWorksheetItems.length})
                      </button>
                      <button
                        className={`mu-sub-tab-btn ${worksheetSubTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setWorksheetSubTab('completed')}
                      >
                        <CheckCircle2 size={16} /> Completed ({completedWorksheetItems.length})
                      </button>
                    </div>
                  </div>

                  {/* Worksheet Date Selector */}
                  <div className="mu-date-filter-bar">
                    <div className="mu-filter-left">
                      <Calendar size={18} className="mu-filter-cal-icon" />
                      <span className="mu-filter-label">Filter Worksheet Date:</span>
                      <input
                        type="date"
                        className="mu-date-picker-input"
                        value={worksheetDate}
                        onChange={(e) => setWorksheetDate(e.target.value)}
                      />
                    </div>
                    <button
                      className="mu-today-reset-btn"
                      onClick={() => setWorksheetDate(new Date().toISOString().split('T')[0])}
                    >
                      Select Today
                    </button>
                  </div>
                </div>

                {/* Packing Unit Filter Buttons */}
                <div className="mu-punit-filters" style={{ 
                  display: 'flex', 
                  gap: '10px', 
                  flexWrap: 'wrap', 
                  marginBottom: '24px', 
                  padding: '16px', 
                  background: '#f8fafc', 
                  borderRadius: '12px', 
                  border: '1px solid #edf2f7',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>
                    📦 Target Packing Unit:
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPUnitFilter('All')}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: '700',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      border: '1.5px solid ' + (selectedPUnitFilter === 'All' ? 'var(--primary-color)' : '#cbd5e1'),
                      background: selectedPUnitFilter === 'All' ? 'var(--primary-color)' : '#ffffff',
                      color: selectedPUnitFilter === 'All' ? '#ffffff' : '#475569',
                      boxShadow: selectedPUnitFilter === 'All' ? '0 2px 4px rgba(99, 102, 241, 0.2)' : 'none'
                    }}
                  >
                    All Packing Units
                  </button>
                  {packingUnits.map(pu => (
                    <button
                      key={pu.id}
                      type="button"
                      onClick={() => setSelectedPUnitFilter(pu.id)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontWeight: '700',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: '1.5px solid ' + (selectedPUnitFilter === pu.id ? 'var(--primary-color)' : '#cbd5e1'),
                        background: selectedPUnitFilter === pu.id ? 'var(--primary-color)' : '#ffffff',
                        color: selectedPUnitFilter === pu.id ? '#ffffff' : '#475569',
                        boxShadow: selectedPUnitFilter === pu.id ? '0 2px 4px rgba(99, 102, 241, 0.2)' : 'none'
                      }}
                    >
                      {pu.name}
                    </button>
                  ))}
                </div>

                {activeWorksheetItems.length === 0 ? (
                  <div className="mu-empty-state">
                    {worksheetSubTab === 'pending' ? (
                      <>
                        <CheckCircle2 size={48} className="mu-empty-icon" />
                        <h3>All Tasks Done!</h3>
                        <p>No pending sweet items for preparation on {new Date(worksheetDate).toLocaleDateString()}.</p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={48} className="mu-empty-icon" style={{ color: '#94a3b8' }} />
                        <h3>No Completed Sweets</h3>
                        <p>No sweets have been marked done for {new Date(worksheetDate).toLocaleDateString()} yet.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mu-worksheet-grid">
                    {activeWorksheetItems.map((groupedItem, idx) => (
                      <motion.div
                        key={idx}
                        className={`mu-worksheet-card ${worksheetSubTab === 'completed' ? 'completed-card' : ''}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                      >
                        <div className="mu-card-body">
                          <div className="mu-card-main-info">
                            <h3 className="mu-item-title">{groupedItem.name}</h3>
                            <span className="mu-item-qty">
                              {groupedItem.totalQty} {groupedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                            </span>
                          </div>

                          {/* {groupedItem.description && (
                            <p className="mu-item-description">💡 {groupedItem.description}</p>
                          )} */}

                          <div className="mu-card-orders-breakdown">
                            <span className="mu-breakdown-title">Source Orders:</span>
                            {worksheetSubTab === 'pending' ? (
                              <div className="mu-orders-checklist">
                                {groupedItem.linkedOrders.map((link, lIdx) => {
                                  const actualOrder = orders.find(o => o.id === link.orderDocId);
                                  const actualItem = actualOrder?.items?.[link.itemIndex];
                                  const currentStatus = actualItem?.status || 'preparation_started';
                                  const pUnit = packingUnits.find(pu => pu.id === actualOrder?.pUnitId);
                                  const pUnitName = pUnit ? pUnit.name : '';

                                  return (
                                    <div 
                                      key={lIdx} 
                                      className="mu-checklist-item" 
                                      title={`Customer: ${link.customerName}`} 
                                      style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'stretch', 
                                        gap: '10px',
                                        background: '#ffffff',
                                        border: '1px solid #edf2f7',
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        transition: 'all 0.2s ease'
                                      }}
                                    >
                                      {/* Top Row: Order Details */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e3a8a' }}>
                                              {link.serialNumber ? `S${link.serialNumber}-${link.orderId}` : `#${link.orderId}`}
                                            </span>
                                            <span style={{ 
                                              fontSize: '11px', 
                                              fontWeight: '800', 
                                              color: '#d97706', 
                                              background: '#fffbeb', 
                                              padding: '2px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #fef3c7'
                                            }}>
                                              {link.quantity} {groupedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                                            </span>
                                          </div>
                                          <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: '600' }}>
                                            👤 {link.customerName}
                                          </span>
                                          {pUnitName && (
                                            <span style={{ 
                                              fontSize: '11px', 
                                              fontWeight: '700', 
                                              color: '#059669', 
                                              background: '#ecfdf5', 
                                              padding: '2px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #d1fae5',
                                              width: 'fit-content',
                                              marginTop: '2px',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px'
                                            }}>
                                              📦 Packing: {pUnitName}
                                            </span>
                                          )}
                                        </div>

                                        {/* Date and Time Badges */}
                                        <div style={{ display: 'flex', gap: '6px', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                          <span style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '4px', 
                                            fontSize: '10px', 
                                            fontWeight: '700', 
                                            background: '#eff6ff', 
                                            color: '#1d4ed8', 
                                            padding: '3px 8px', 
                                            borderRadius: '6px',
                                            border: '1px solid #dbeafe',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            <Calendar size={11} /> {link.deliveryDate ? new Date(link.deliveryDate).toLocaleDateString() : 'No Date'}
                                          </span>
                                          {link.deliveryTime && (
                                            <span style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: '4px', 
                                              fontSize: '10px', 
                                              fontWeight: '700', 
                                              background: '#faf5ff', 
                                              color: '#7e22ce', 
                                              padding: '3px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #f3e8ff',
                                              whiteSpace: 'nowrap'
                                            }}>
                                              <Clock size={11} /> {format12Hour(link.deliveryTime)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Note section */}
                                      {(link.itemDescription || link.mUnitDescription) && (
                                        <div style={{ fontSize: '10.5px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '6px 10px', borderRadius: '8px', color: '#92400e', textAlign: 'left', lineHeight: '1.3' }}>
                                          {link.itemDescription && <div style={{ fontWeight: '700' }}>💡 Item Note: {link.itemDescription}</div>}
                                          {link.mUnitDescription && <div style={{ marginTop: link.itemDescription ? '4px' : '0', fontStyle: 'italic' }}>⚙️ Mfg Note: {link.mUnitDescription}</div>}
                                        </div>
                                      )}

                                      {/* Buttons at bottom spanning full width */}
                                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '10px', width: '100%' }}>
                                        <button
                                          onClick={() => handleUpdateSingleItemStatus(link.orderDocId, link.itemIndex, currentStatus === 'preparation_complete' ? 'preparation_started' : 'preparation_complete')}
                                          style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            border: '1.5px solid ' + (currentStatus === 'preparation_complete' ? '#10b981' : '#edf2f7'),
                                            background: currentStatus === 'preparation_complete' ? '#e6fdf5' : '#ffffff',
                                            color: currentStatus === 'preparation_complete' ? '#047857' : '#64748b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            boxShadow: currentStatus === 'preparation_complete' ? '0 2px 4px rgba(16, 185, 129, 0.1)' : 'none'
                                          }}
                                        >
                                          <CheckCircle2 size={13} style={{ color: currentStatus === 'preparation_complete' ? '#10b981' : 'inherit' }} />
                                          Prep Complete
                                        </button>
                                        <button
                                          onClick={() => handleUpdateSingleItemStatus(link.orderDocId, link.itemIndex, currentStatus === 'moved_to_packing' ? 'preparation_started' : 'moved_to_packing')}
                                          style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            border: '1.5px solid ' + (currentStatus === 'moved_to_packing' ? '#3b82f6' : '#edf2f7'),
                                            background: currentStatus === 'moved_to_packing' ? '#eff6ff' : '#ffffff',
                                            color: currentStatus === 'moved_to_packing' ? '#1d4ed8' : '#64748b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            boxShadow: currentStatus === 'moved_to_packing' ? '0 2px 4px rgba(59, 130, 246, 0.1)' : 'none'
                                          }}
                                        >
                                          <ArrowRight size={13} style={{ color: currentStatus === 'moved_to_packing' ? '#3b82f6' : 'inherit' }} />
                                          Move to Packing
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                                {groupedItem.linkedOrders.map((link, lIdx) => {
                                  const actualOrder = orders.find(o => o.id === link.orderDocId);
                                  const actualItem = actualOrder?.items?.[link.itemIndex];
                                  const currentStatus = actualItem?.status || 'preparation_complete';
                                  const pUnit = packingUnits.find(pu => pu.id === actualOrder?.pUnitId);
                                  const pUnitName = pUnit ? pUnit.name : '';

                                  return (
                                    <div 
                                      key={lIdx} 
                                      style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'stretch', 
                                        gap: '10px',
                                        background: '#ffffff',
                                        border: '1px solid #edf2f7',
                                        borderRadius: '12px',
                                        padding: '12px 14px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                        transition: 'all 0.2s ease'
                                      }}
                                    >
                                      {/* Top Row: Order Details */}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', gap: '10px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '13px', fontWeight: '800', color: '#1e3a8a' }}>
                                              {link.serialNumber ? `S${link.serialNumber}-${link.orderId}` : `#${link.orderId}`}
                                            </span>
                                            <span style={{ 
                                              fontSize: '11px', 
                                              fontWeight: '800', 
                                              color: '#d97706', 
                                              background: '#fffbeb', 
                                              padding: '2px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #fef3c7'
                                            }}>
                                              {link.quantity} {groupedItem.unit === 'Weight' ? 'kg' : 'pcs'}
                                            </span>
                                          </div>
                                          <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: '600' }}>
                                            👤 {link.customerName}
                                          </span>
                                          {pUnitName && (
                                            <span style={{ 
                                              fontSize: '11px', 
                                              fontWeight: '700', 
                                              color: '#059669', 
                                              background: '#ecfdf5', 
                                              padding: '2px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #d1fae5',
                                              width: 'fit-content',
                                              marginTop: '2px',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px'
                                            }}>
                                              📦 Packing: {pUnitName}
                                            </span>
                                          )}
                                        </div>

                                        {/* Date and Time Badges */}
                                        <div style={{ display: 'flex', gap: '6px', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                          <span style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '4px', 
                                            fontSize: '10px', 
                                            fontWeight: '700', 
                                            background: '#eff6ff', 
                                            color: '#1d4ed8', 
                                            padding: '3px 8px', 
                                            borderRadius: '6px',
                                            border: '1px solid #dbeafe',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            <Calendar size={11} /> {link.deliveryDate ? new Date(link.deliveryDate).toLocaleDateString() : 'No Date'}
                                          </span>
                                          {link.deliveryTime && (
                                            <span style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: '4px', 
                                              fontSize: '10px', 
                                              fontWeight: '700', 
                                              background: '#faf5ff', 
                                              color: '#7e22ce', 
                                              padding: '3px 8px', 
                                              borderRadius: '6px',
                                              border: '1px solid #f3e8ff',
                                              whiteSpace: 'nowrap'
                                            }}>
                                              <Clock size={11} /> {format12Hour(link.deliveryTime)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Note section */}
                                      {(link.itemDescription || link.mUnitDescription) && (
                                        <div style={{ fontSize: '10.5px', background: '#fffbeb', border: '1px solid #fef3c7', padding: '6px 10px', borderRadius: '8px', color: '#92400e', textAlign: 'left', lineHeight: '1.3' }}>
                                          {link.itemDescription && <div style={{ fontWeight: '700' }}>💡 Item Note: {link.itemDescription}</div>}
                                          {link.mUnitDescription && <div style={{ marginTop: link.itemDescription ? '4px' : '0', fontStyle: 'italic' }}>⚙️ Mfg Note: {link.mUnitDescription}</div>}
                                        </div>
                                      )}

                                      {/* Buttons at bottom spanning full width */}
                                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px', borderTop: '1px solid #f1f5f9', paddingTop: '10px', width: '100%' }}>
                                        <button
                                          onClick={() => handleUpdateSingleItemStatus(link.orderDocId, link.itemIndex, currentStatus === 'preparation_complete' ? 'preparation_started' : 'preparation_complete')}
                                          style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            border: '1.5px solid ' + (currentStatus === 'preparation_complete' ? '#10b981' : '#edf2f7'),
                                            background: currentStatus === 'preparation_complete' ? '#e6fdf5' : '#ffffff',
                                            color: currentStatus === 'preparation_complete' ? '#047857' : '#64748b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            boxShadow: currentStatus === 'preparation_complete' ? '0 2px 4px rgba(16, 185, 129, 0.1)' : 'none'
                                          }}
                                        >
                                          <CheckCircle2 size={13} style={{ color: currentStatus === 'preparation_complete' ? '#10b981' : 'inherit' }} />
                                          Prep Complete
                                        </button>
                                        <button
                                          onClick={() => handleUpdateSingleItemStatus(link.orderDocId, link.itemIndex, currentStatus === 'moved_to_packing' ? 'preparation_started' : 'moved_to_packing')}
                                          style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            fontSize: '12px',
                                            fontWeight: '700',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            border: '1.5px solid ' + (currentStatus === 'moved_to_packing' ? '#3b82f6' : '#edf2f7'),
                                            background: currentStatus === 'moved_to_packing' ? '#eff6ff' : '#ffffff',
                                            color: currentStatus === 'moved_to_packing' ? '#1d4ed8' : '#64748b',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            boxShadow: currentStatus === 'moved_to_packing' ? '0 2px 4px rgba(59, 130, 246, 0.1)' : 'none'
                                          }}
                                        >
                                          <ArrowRight size={13} style={{ color: currentStatus === 'moved_to_packing' ? '#3b82f6' : 'inherit' }} />
                                          Move to Packing
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mu-card-footer">
                          {worksheetSubTab === 'pending' ? (
                            <button
                              className="mu-btn-complete"
                              onClick={() => handleMarkItemDone(groupedItem)}
                            >
                              <CheckCircle2 size={16} /> Mark as Done
                            </button>
                          ) : (
                            <div className="mu-completed-stamp" style={{ background: '#DCFCE7', color: '#166534' }}>
                              <CheckCircle2 size={16} /> Preparation Completed
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* --- ASSIGNED ORDERS TAB --- */}
            {tab === 'orders' && (
              <div className="mu-orders-view animate-fade-in">
                <div className="mu-view-header">
                  <div>
                    <h2>Assigned Orders</h2>
                    <p className="mu-subtitle">All orders containing items assigned to your unit</p>
                  </div>
                  <span className="mu-badge">{assignedOrders.length} Total Orders</span>
                </div>

                {/* Packing Unit Filter Buttons */}
                <div className="mu-punit-filters" style={{ 
                  display: 'flex', 
                  gap: '10px', 
                  flexWrap: 'wrap', 
                  marginBottom: '24px', 
                  padding: '16px', 
                  background: '#f8fafc', 
                  borderRadius: '12px', 
                  border: '1px solid #edf2f7',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px', fontSize: '13px', fontWeight: '800', color: '#475569' }}>
                    📦 Target Packing Unit:
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPUnitFilter('All')}
                    style={{
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: '700',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      border: '1.5px solid ' + (selectedPUnitFilter === 'All' ? 'var(--primary-color)' : '#cbd5e1'),
                      background: selectedPUnitFilter === 'All' ? 'var(--primary-color)' : '#ffffff',
                      color: selectedPUnitFilter === 'All' ? '#ffffff' : '#475569',
                      boxShadow: selectedPUnitFilter === 'All' ? '0 2px 4px rgba(99, 102, 241, 0.2)' : 'none'
                    }}
                  >
                    All Packing Units
                  </button>
                  {packingUnits.map(pu => (
                    <button
                      key={pu.id}
                      type="button"
                      onClick={() => setSelectedPUnitFilter(pu.id)}
                      style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontWeight: '700',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: '1.5px solid ' + (selectedPUnitFilter === pu.id ? 'var(--primary-color)' : '#cbd5e1'),
                        background: selectedPUnitFilter === pu.id ? 'var(--primary-color)' : '#ffffff',
                        color: selectedPUnitFilter === pu.id ? '#ffffff' : '#475569',
                        boxShadow: selectedPUnitFilter === pu.id ? '0 2px 4px rgba(99, 102, 241, 0.2)' : 'none'
                      }}
                    >
                      {pu.name}
                    </button>
                  ))}
                </div>

                {assignedOrders.length === 0 ? (
                  <div className="mu-empty-state">
                    <ShoppingBag size={48} className="mu-empty-icon" />
                    <h3>No Assigned Orders</h3>
                    <p>There are no orders assigned to this manufacturing unit yet.</p>
                  </div>
                ) : (
                  <div className="mu-orders-table-wrapper">
                    <table className="mu-orders-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Customer</th>
                          <th>My Items</th>
                          <th>Delivery Details</th>
                          <th style={{ textAlign: 'center' }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedOrders.map(order => {
                          const myItemsCount = order.items.filter(i => i.mUnitId === id).length;
                          const isExpanded = expandedOrders.includes(order.id);

                          return (
                            <React.Fragment key={order.id}>
                              <tr className={isExpanded ? "row-expanded" : ""}>
                                <td className="mu-order-id-cell" onClick={() => toggleOrderAccordion(order.id)}>
                                  <div className="mu-id-wrapper">
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    <span>
                                      {order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className="mu-customer-info">
                                    <span className="name">{order.customerName}</span>
                                    <span className="phone">{order.customerPhone}</span>
                                    {packingUnits.find(pu => pu.id === order.pUnitId)?.name && (
                                      <span style={{
                                        fontSize: '11px',
                                        fontWeight: '700',
                                        color: '#059669',
                                        background: '#ecfdf5',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid #d1fae5',
                                        width: 'fit-content',
                                        marginTop: '3px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px'
                                      }}>
                                        📦 {packingUnits.find(pu => pu.id === order.pUnitId)?.name}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                                  {myItemsCount} / {order.items.length} items
                                </td>
                                <td style={{ fontSize: '13px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                                    <span style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '4px', 
                                      fontSize: '11px', 
                                      fontWeight: '700', 
                                      background: '#eff6ff', 
                                      color: '#1d4ed8', 
                                      padding: '3px 8px', 
                                      borderRadius: '6px',
                                      border: '1px solid #dbeafe',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      <Calendar size={12} /> {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'No Date'}
                                    </span>
                                    {order.deliveryTime && (
                                      <span style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        fontSize: '11px', 
                                        fontWeight: '700', 
                                        background: '#faf5ff', 
                                        color: '#7e22ce', 
                                        padding: '3px 8px', 
                                        borderRadius: '6px',
                                        border: '1px solid #f3e8ff',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        <Clock size={12} /> {format12Hour(order.deliveryTime)}
                                      </span>
                                    )}
                                    <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '2px' }}>
                                      Ordered: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Pending'}
                                    </span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button className="mu-btn-toggle" onClick={() => toggleOrderAccordion(order.id)}>
                                    <Eye size={16} /> {isExpanded ? 'Hide' : 'View'}
                                  </button>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="mu-accordion-row">
                                  <td colSpan="5">
                                    <div className="mu-accordion-content">
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                                        <h4 style={{ margin: 0 }}>My Assigned Items to Prepare</h4>
                                        <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#ecfdf5', border: '1px solid #d1fae5', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', color: '#065f46' }}>
                                            📦 Packing Unit: {packingUnits.find(pu => pu.id === order.pUnitId)?.name || 'Unknown'}
                                          </span>
                                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#eff6ff', border: '1px solid #dbeafe', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', color: '#1d4ed8' }}>
                                            <Calendar size={13} /> Target: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'No Date'}
                                          </span>
                                          {order.deliveryTime && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#faf5ff', border: '1px solid #f3e8ff', padding: '4px 8px', borderRadius: '6px', fontWeight: '700', color: '#7e22ce' }}>
                                              <Clock size={13} /> Time: {format12Hour(order.deliveryTime)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <table className="mu-subtable">
                                        <thead>
                                          <tr>
                                            <th>Item Name</th>
                                            <th>Description</th>
                                            <th>Quantity</th>
                                            <th>Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {order.items.map((item, idx) => {
                                            if (item.mUnitId !== id) return null;

                                            return (
                                              <tr key={idx}>
                                                <td style={{ fontWeight: '700' }}>{item.name}</td>
                                                <td style={{ fontSize: '12px', color: '#64748b' }}>{item.description || '-'}</td>
                                                <td>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                                                <td>
                                                  <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                      onClick={() => handleUpdateSingleItemStatus(order.id, idx, item.status === 'preparation_complete' ? 'preparation_started' : 'preparation_complete')}
                                                      style={{
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        border: '1.5px solid ' + (item.status === 'preparation_complete' ? '#059669' : '#e2e8f0'),
                                                        background: item.status === 'preparation_complete' ? '#d1fae5' : 'white',
                                                        color: item.status === 'preparation_complete' ? '#065f46' : '#64748b'
                                                      }}
                                                    >
                                                      Prep Complete
                                                    </button>
                                                    <button
                                                      onClick={() => handleUpdateSingleItemStatus(order.id, idx, item.status === 'moved_to_packing' ? 'preparation_started' : 'moved_to_packing')}
                                                      style={{
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        borderRadius: '8px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        border: '1.5px solid ' + (item.status === 'moved_to_packing' ? '#2563eb' : '#e2e8f0'),
                                                        background: item.status === 'moved_to_packing' ? '#dbeafe' : 'white',
                                                        color: item.status === 'moved_to_packing' ? '#1e40af' : '#64748b'
                                                      }}
                                                    >
                                                      Move to Packing
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* --- STORE WORKSHEET TAB --- */}
            {tab === 'store-worksheet' && (
              <div className="mu-store-worksheet-view animate-fade-in">
                <div className="mu-view-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                      <h2>Store Wise Worksheet</h2>
                      <p className="mu-subtitle">Production targets allocated across retail store outlets</p>
                    </div>

                    {/* Pending vs Completed Sub tabs */}
                    <div className="mu-sub-tabs">
                      <button
                        className={`mu-sub-tab-btn ${storeWorksheetSubTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setStoreWorksheetSubTab('pending')}
                      >
                        <Clock size={16} /> Pending ({pendingMUnitWorksheetItems.length})
                      </button>
                      <button
                        className={`mu-sub-tab-btn ${storeWorksheetSubTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setStoreWorksheetSubTab('completed')}
                      >
                        <CheckCircle2 size={16} /> Completed ({completedMUnitWorksheetItems.length})
                      </button>
                    </div>
                  </div>

                  <div className="mu-date-filter-bar">
                    <div className="mu-filter-left">
                      <Calendar size={18} className="mu-filter-cal-icon" />
                      <span className="mu-filter-label">Worksheet Date:</span>
                      <input
                        type="date"
                        className="mu-date-picker-input"
                        value={mUnitWorksheetDate}
                        onChange={(e) => setMUnitWorksheetDate(e.target.value)}
                      />
                    </div>
                    <button
                      className="mu-today-reset-btn"
                      onClick={() => setMUnitWorksheetDate(new Date().toISOString().split('T')[0])}
                    >
                      Select Today
                    </button>
                  </div>
                </div>

                {mUnitWorksheetLoading ? (
                  <div className="mu-loading-container" style={{ textAlign: 'center', padding: '60px 0' }}>
                    <div className="loader" style={{ margin: '0 auto 15px auto' }}></div>
                    <p style={{ color: '#64748b' }}>Loading worksheet...</p>
                  </div>
                ) : activeMUnitWorksheetItems.length > 0 ? (
                  <div className="mu-worksheet-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
                    {activeMUnitWorksheetItems.map((item, idx) => (
                      <motion.div
                        key={item.id}
                        className={`mu-worksheet-card ${storeWorksheetSubTab === 'completed' ? 'completed-card' : ''}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}
                      >
                        <div className="mu-card-body">
                          <div className="mu-card-main-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 className="mu-item-title" style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', margin: 0 }}>{item.name}</h3>
                            <span className="mu-item-qty" style={{ background: storeWorksheetSubTab === 'completed' ? '#d1fae5' : '#fef3c7', color: storeWorksheetSubTab === 'completed' ? '#065f46' : '#92400e', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '800' }}>
                              {item.total.toFixed(item.unit === 'Weight' ? 2 : 0)} {item.unitLabel}
                            </span>
                          </div>

                          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Store Breakdown:</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {item.storeAllocations.map(sa => {
                                const isCompleted = sa.isCompleted;
                                return (
                                  <div
                                    key={sa.storeId}
                                    className={`mu-store-allocation-row ${isCompleted ? 'completed' : ''}`}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      background: isCompleted ? '#f0fdf4' : '#f8fafc',
                                      padding: '10px 14px',
                                      borderRadius: '10px',
                                      border: isCompleted ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                      opacity: isCompleted ? 0.9 : 1,
                                      transition: 'all 0.2s ease',
                                      gap: '15px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                                      <span style={{
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        color: isCompleted ? '#166534' : '#334155',
                                        textDecoration: isCompleted ? 'line-through' : 'none',
                                        textDecorationColor: '#cbd5e1',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                      }} title={sa.storeName}>
                                        {sa.storeName}
                                      </span>
                                    </div>
                                    <span style={{
                                      fontSize: '12px',
                                      fontWeight: '800',
                                      color: isCompleted ? '#047857' : '#d97706',
                                      background: isCompleted ? '#e6fbf1' : '#fffbeb',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      border: isCompleted ? '1px solid #a7f3d0' : '1px solid #fef3c7',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      {sa.qty} {item.unitLabel}
                                    </span>
                                    <button
                                      onClick={() => handleToggleStoreAllocation(item.id, sa.storeId)}
                                      className="mu-checklist-check-btn"
                                      style={{
                                        borderColor: isCompleted ? '#f59e0b' : '#10b981',
                                        color: isCompleted ? '#f59e0b' : '#10b981',
                                        background: 'white',
                                        padding: '4px 10px',
                                        height: '28px',
                                        fontSize: '11px',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={isCompleted ? "Mark allocation as pending" : "Mark allocation as completed"}
                                    >
                                      <CheckCircle2 size={12} />
                                      <span>{isCompleted ? 'Undo' : 'Done'}</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="mu-empty-state">
                    {storeWorksheetSubTab === 'pending' ? (
                      <>
                        <CheckCircle2 size={48} className="mu-empty-icon" />
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>All Allocations Done!</h3>
                        <p style={{ color: '#64748b' }}>No pending store allocations for {new Date(mUnitWorksheetDate).toLocaleDateString()}.</p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={48} className="mu-empty-icon" style={{ color: '#94a3b8' }} />
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>No Completed Allocations</h3>
                        <p style={{ color: '#64748b' }}>No allocations have been marked done for {new Date(mUnitWorksheetDate).toLocaleDateString()} yet.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'analytics' && (
              <div className="mu-analytics-view animate-fade-in">
                <h2>Manufacturing Analytics</h2>
                <div className="mu-placeholder-card">
                  Analytics dashboard for manufacturing unit: <b>{id}</b> is currently under development.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
};

export default MUnitPortal;
