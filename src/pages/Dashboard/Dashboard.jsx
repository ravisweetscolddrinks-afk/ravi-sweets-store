import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  AlertCircle, 
  Calendar, 
  Store, 
  X, 
  Eye, 
  ArrowRight,
  CreditCard,
  Percent,
  FileText
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Dashboard.css';

// Logo for invoice preview fallback
import logo from '../../assets/logo.png';
const DEFAULT_ITEM_IMAGE = logo;

const Dashboard = () => {
  const [orders, setOrders] = useState([]);
  const [stores, setStores] = useState([]);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Selection
  const [selectedStoreFilter, setSelectedStoreFilter] = useState('All');
  const [activeStatusTab, setActiveStatusTab] = useState('All');
  
  // Modals / Drill-down details
  const [drilldownUrgency, setDrilldownUrgency] = useState(null); // 'red' | 'orange' | 'amber' | 'green' | null
  const [previewOrder, setPreviewOrder] = useState(null);
  const [previewTab, setPreviewTab] = useState('items');

  // Real-time listener for orders & stores
  useEffect(() => {
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Firestore orders error in Dashboard: ", err);
      toast.error("Failed to fetch real-time orders");
      setLoading(false);
    });

    const unsubStores = onSnapshot(collection(db, 'stores'), (snapshot) => {
      const fetchedStores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedStores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStores(fetchedStores);
    }, (err) => {
      console.error("Firestore stores error in Dashboard: ", err);
    });

    return () => {
      unsubOrders();
      unsubStores();
    };
  }, []);

  // Real-time listener for POS bills dynamically compiled for all stores
  useEffect(() => {
    if (stores.length === 0) return;

    // Set up subcollection listeners for each store's bills
    const unsubscribes = stores.map(store => {
      const billsQ = collection(db, 'stores', store.id, 'bills');
      return onSnapshot(billsQ, (snapshot) => {
        const storeBills = snapshot.docs.map(doc => ({
          id: doc.id,
          storeId: store.id,
          storeName: store.name,
          ...doc.data()
        }));

        setBills(prev => {
          const otherStoresBills = prev.filter(b => b.storeId !== store.id);
          return [...otherStoresBills, ...storeBills];
        });
      });
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [stores]);

  // --- 4-Color Urgency Countdowns Helper ---
  const getDeliveryTimeUrgency = (order) => {
    if (!order.deliveryDate) return 'green';

    const dateStr = order.deliveryDate; // YYYY-MM-DD
    const timeStr = order.deliveryTime || '00:00'; // HH:mm
    const deliveryDateTime = new Date(`${dateStr}T${timeStr}`);
    
    if (isNaN(deliveryDateTime.getTime())) return 'green';
    
    const now = new Date();
    const diffMs = deliveryDateTime - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    const statusClean = (order.status || '').toLowerCase().trim();
    const isDelivered = statusClean === 'delivered';
    const isReady = statusClean === 'ready for delivery' || statusClean === 'ready_for_delivery';
    
    if (isDelivered) {
      return 'green';
    }

    if (diffHours < 0) {
      // Overdue
      if (isReady) return 'orange'; // Ready but not delivered
      return 'red'; // Overdue and NOT ready
    }

    if (diffHours <= 2) {
      if (isReady) return 'orange'; // Ready but very close
      return 'red'; // Close to delivery but not ready!
    } else if (diffHours <= 6) {
      return 'orange'; // Warning
    } else if (diffHours <= 24) {
      return 'amber'; // Attention
    } else {
      return 'green'; // Safe / Plenty of time
    }
  };

  const getUrgencyLabel = (urgency) => {
    switch (urgency) {
      case 'red': return 'Critical (Not Ready & <2h or Overdue)';
      case 'orange': return 'Warning (2h - 6h or Ready Overdue)';
      case 'amber': return 'Attention Needed (6h - 24h)';
      case 'green': return 'On Track (>24h or Delivered)';
      default: return '';
    }
  };

  const getStatusLabel = (status) => {
    if (!status) return 'NEW';
    return status.replace(/_/g, ' ').toUpperCase();
  };

  // --- Filtering Logic ---
  const filteredOrders = orders.filter(o => 
    selectedStoreFilter === 'All' || o.storeId === selectedStoreFilter
  );

  const filteredBills = bills.filter(b => 
    selectedStoreFilter === 'All' || b.storeId === selectedStoreFilter
  );

  // Grouping orders by urgency
  const redOrders = filteredOrders.filter(o => getDeliveryTimeUrgency(o) === 'red');
  const orangeOrders = filteredOrders.filter(o => getDeliveryTimeUrgency(o) === 'orange');
  const amberOrders = filteredOrders.filter(o => getDeliveryTimeUrgency(o) === 'amber');
  const greenOrders = filteredOrders.filter(o => getDeliveryTimeUrgency(o) === 'green');

  // Status Tab filters
  const getTabOrders = () => {
    if (activeStatusTab === 'All') return filteredOrders;
    return filteredOrders.filter(o => {
      const statusClean = (o.status || 'new').toLowerCase().replace(/_/g, ' ').trim();
      return statusClean === activeStatusTab.toLowerCase().trim();
    });
  };

  // --- Financial Analytics (Including Store POS Bills!) ---
  const ordersRevenue = filteredOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const billsRevenue = filteredBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalRevenue = ordersRevenue + billsRevenue;

  const ordersPaid = filteredOrders.reduce((sum, o) => sum + (o.receivedAmount || 0), 0);
  const billsPaid = filteredBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0); // POS bills are fully paid
  const totalPaid = ordersPaid + billsPaid;

  const totalDue = Math.max(0, totalRevenue - totalPaid);

  // Store-wise revenue splits
  const storeRevenueMap = {};
  filteredOrders.forEach(o => {
    const sName = o.storeName || 'Unknown Store';
    storeRevenueMap[sName] = (storeRevenueMap[sName] || 0) + (o.totalAmount || 0);
  });
  filteredBills.forEach(b => {
    const sName = b.storeName || 'Unknown Store';
    storeRevenueMap[sName] = (storeRevenueMap[sName] || 0) + (b.totalAmount || 0);
  });

  const storeRevenueList = Object.entries(storeRevenueMap)
    .map(([name, val]) => ({ name, revenue: val }))
    .sort((a, b) => b.revenue - a.revenue);

  const maxStoreRevenue = storeRevenueList.length > 0 ? storeRevenueList[0].revenue : 1;

  // Payment mode splits (Including Store POS Bills!)
  let cashTotal = 0;
  let upiTotal = 0;
  let cardTotal = 0;

  filteredOrders.forEach(o => {
    const mode = (o.paymentMode || 'Cash').toLowerCase();
    const amt = o.receivedAmount || 0;
    if (mode === 'cash') cashTotal += amt;
    else if (mode === 'upi') upiTotal += amt;
    else if (mode === 'card') cardTotal += amt;
  });

  filteredBills.forEach(b => {
    const mode = (b.paymentMode || 'Cash').toLowerCase();
    const amt = b.totalAmount || 0;
    if (mode === 'cash') cashTotal += amt;
    else if (mode === 'upi') upiTotal += amt;
    else if (mode === 'card') cardTotal += amt;
  });

  const overallCollected = cashTotal + upiTotal + cardTotal || 1;

  if (loading) {
    return (
      <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loader"></div>
      </div>
    );
  }

  // Define drilldown lists
  const getDrilldownOrders = () => {
    if (drilldownUrgency === 'red') return redOrders;
    if (drilldownUrgency === 'orange') return orangeOrders;
    if (drilldownUrgency === 'amber') return amberOrders;
    if (drilldownUrgency === 'green') return greenOrders;
    return [];
  };

  return (
    <div className="dashboard-container">
      {/* Top Header */}
      <div className="db-header">
        <div className="db-title-area">
          <h1>Super Admin Dashboard</h1>
          <p>Real-time sweet sales performance, status tracking, and delivery timelines.</p>
        </div>
        
        <div className="db-controls">
          <div className="db-store-selector-wrapper">
            <label>Select Outlet Store</label>
            <select 
              className="db-store-select"
              value={selectedStoreFilter}
              onChange={(e) => {
                setSelectedStoreFilter(e.target.value);
              }}
            >
              <option value="All">All Stores</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Urgency Countdown Tiles Grid */}
      <div className="urgency-grid">
        {/* Red Tile */}
        <div className="urgency-tile tile-red" onClick={() => setDrilldownUrgency('red')}>
          <div className="tile-top">
            <div className="tile-icon-box">
              <AlertTriangle size={22} />
            </div>
            <ArrowRight size={16} />
          </div>
          <div className="tile-count">{redOrders.length}</div>
          <div className="tile-bottom">
            <span className="title">Critical Alert</span>
            <span className="subtitle">Not Ready & &lt;2h or Overdue</span>
          </div>
        </div>

        {/* Orange Tile */}
        <div className="urgency-tile tile-orange" onClick={() => setDrilldownUrgency('orange')}>
          <div className="tile-top">
            <div className="tile-icon-box">
              <Clock size={22} />
            </div>
            <ArrowRight size={16} />
          </div>
          <div className="tile-count">{orangeOrders.length}</div>
          <div className="tile-bottom">
            <span className="title">Warning Status</span>
            <span className="subtitle">2h - 6h or Ready Overdue</span>
          </div>
        </div>

        {/* Amber Tile */}
        <div className="urgency-tile tile-amber" onClick={() => setDrilldownUrgency('amber')}>
          <div className="tile-top">
            <div className="tile-icon-box">
              <AlertCircle size={22} />
            </div>
            <ArrowRight size={16} />
          </div>
          <div className="tile-count">{amberOrders.length}</div>
          <div className="tile-bottom">
            <span className="title">Needs Attention</span>
            <span className="subtitle">6h - 24h Remaining</span>
          </div>
        </div>

        {/* Green Tile */}
        <div className="urgency-tile tile-green" onClick={() => setDrilldownUrgency('green')}>
          <div className="tile-top">
            <div className="tile-icon-box">
              <CheckCircle size={22} />
            </div>
            <ArrowRight size={16} />
          </div>
          <div className="tile-count">{greenOrders.length}</div>
          <div className="tile-bottom">
            <span className="title">On Track</span>
            <span className="subtitle">&gt;24h Remaining or Delivered</span>
          </div>
        </div>
      </div>

      {/* Tabs list: Status wise orders */}
      <div className="status-orders-section">
        <div className="section-title-bar">
          <h2><ShoppingBag size={20} color="var(--primary-color)" /> Status Wise Orders Summary</h2>
          <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>({getTabOrders().length} Orders)</span>
        </div>

        <div className="status-tabs-row">
          {['All', 'New', 'In Progress', 'Ready for Delivery', 'Delivered'].map(status => (
            <button
              key={status}
              type="button"
              className={`status-tab-btn ${activeStatusTab === status ? 'active' : ''}`}
              onClick={() => setActiveStatusTab(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="db-orders-table-wrapper">
          <table className="db-orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Store Outlet</th>
                <th>Customer</th>
                <th>Target Date/Time</th>
                <th>Urgency</th>
                <th>Grand Total</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {getTabOrders().length > 0 ? (
                getTabOrders().map(o => {
                  const urgency = getDeliveryTimeUrgency(o);
                  const bal = Math.max(0, (o.totalAmount || 0) - (o.receivedAmount || 0));
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>#{o.orderId}</td>
                      <td>{o.storeName}</td>
                      <td>
                        <div style={{ fontWeight: '700' }}>{o.customerName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{o.customerPhone}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: '700' }}>
                          {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'N/A'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{o.deliveryTime || ''}</div>
                      </td>
                      <td>
                        <span className={`urgency-badge ${urgency}`}>
                          {urgency}
                        </span>
                      </td>
                      <td style={{ fontWeight: '700' }}>₹{o.totalAmount.toFixed(2)}</td>
                      <td style={{ fontWeight: '700', color: bal > 0.01 ? '#dc2626' : '#16a34a' }}>
                        ₹{bal.toFixed(2)}
                      </td>
                      <td>
                        <span className={`status-badge ${(o.status || 'new').toLowerCase().replace(/_/g, '-')}`} style={{ fontSize: '10px' }}>
                          {getStatusLabel(o.status)}
                        </span>
                      </td>
                      <td>
                        <button className="db-view-btn" onClick={() => setPreviewOrder(o)}>
                          <Eye size={13} /> View Invoice
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', opacity: 0.5 }}>
                    No matching orders found under this status tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Metrics Widgets */}
      <div className="financial-grid">
        <div className="financial-card">
          <div className="financial-icon-circle total">
            <ShoppingBag size={24} />
          </div>
          <div className="financial-details">
            <h4>Total Sales Volume</h4>
            <p>₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="financial-card">
          <div className="financial-icon-circle paid">
            <DollarSign size={24} />
          </div>
          <div className="financial-details">
            <h4>Collected Revenue</h4>
            <p>₹{totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="financial-card">
          <div className="financial-icon-circle due">
            <TrendingUp size={24} />
          </div>
          <div className="financial-details">
            <h4>Receivables Balance</h4>
            <p>₹{totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="analytics-grid">
        {/* Store wise revenue distribution */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3><Store size={18} color="var(--primary-color)" /> Outlet Store Sales Performance</h3>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Revenue Share</span>
          </div>
          
          <div className="store-analytics-list">
            {storeRevenueList.length > 0 ? (
              storeRevenueList.map((s, idx) => {
                const percentShare = ((s.revenue / totalRevenue) * 100) || 0;
                return (
                  <div key={idx} className="store-revenue-row">
                    <div className="store-revenue-meta">
                      <span className="name">{s.name}</span>
                      <span className="amount">₹{s.revenue.toLocaleString('en-IN')} ({percentShare.toFixed(1)}%)</span>
                    </div>
                    <div className="store-progress-track">
                      <div 
                        className="store-progress-fill" 
                        style={{ width: `${(s.revenue / maxStoreRevenue) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', opacity: 0.5 }}>
                No store sales recorded for the active filters.
              </div>
            )}
          </div>
        </div>

        {/* Payment mode analytics */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3><CreditCard size={18} color="var(--primary-color)" /> Payment Method Split</h3>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Collected Funds</span>
          </div>

          <div className="payment-analytics-list">
            {/* Cash split */}
            <div className="payment-mode-split">
              <div className="payment-split-left">
                <div className="financial-icon-circle paid" style={{ width: '36px', height: '36px' }}>
                  <DollarSign size={18} />
                </div>
                <span className="label">Cash Payments</span>
              </div>
              <div className="payment-split-right">
                <div className="amount">₹{cashTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <div className="percent">{((cashTotal / overallCollected) * 100).toFixed(1)}% split</div>
              </div>
            </div>

            {/* UPI split */}
            <div className="payment-mode-split">
              <div className="payment-split-left">
                <div className="financial-icon-circle total" style={{ width: '36px', height: '36px' }}>
                  <TrendingUp size={18} />
                </div>
                <span className="label">UPI / Digital Payments</span>
              </div>
              <div className="payment-split-right">
                <div className="amount">₹{upiTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <div className="percent">{((upiTotal / overallCollected) * 100).toFixed(1)}% split</div>
              </div>
            </div>

            {/* Card split */}
            <div className="payment-mode-split">
              <div className="payment-split-left">
                <div className="financial-icon-circle total" style={{ width: '36px', height: '36px', color: '#3b82f6', background: '#eff6ff' }}>
                  <CreditCard size={18} />
                </div>
                <span className="label">Credit/Debit Cards</span>
              </div>
              <div className="payment-split-right">
                <div className="amount">₹{cardTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <div className="percent">{((cardTotal / overallCollected) * 100).toFixed(1)}% split</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dialog Drill-down Modal (Urgency Lists) */}
      <AnimatePresence>
        {drilldownUrgency && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div 
              className="db-drilldown-modal animate-fade-in"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className={`db-drilldown-header ${drilldownUrgency}`}>
                <h2>
                  <Clock size={20} /> 
                  Urgency List: {getUrgencyLabel(drilldownUrgency)} ({getDrilldownOrders().length})
                </h2>
                <button className="db-modal-close-btn" onClick={() => setDrilldownUrgency(null)}>
                  <X size={20} />
                </button>
              </div>
              
              <div className="db-drilldown-body">
                <div className="db-orders-table-wrapper">
                  <table className="db-orders-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Outlet Store</th>
                        <th>Customer</th>
                        <th>Target Target</th>
                        <th>Grand Total</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getDrilldownOrders().length > 0 ? (
                        getDrilldownOrders().map(o => (
                          <tr key={o.id}>
                            <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>#{o.orderId}</td>
                            <td>{o.storeName}</td>
                            <td>
                              <div style={{ fontWeight: '700' }}>{o.customerName}</div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>{o.customerPhone}</div>
                            </td>
                            <td>{o.deliveryDate} at {o.deliveryTime || ''}</td>
                            <td style={{ fontWeight: '700' }}>₹{o.totalAmount.toFixed(2)}</td>
                            <td>
                              <span className={`status-badge ${(o.status || 'new').toLowerCase().replace(/_/g, '-')}`} style={{ fontSize: '10px' }}>
                                {getStatusLabel(o.status)}
                              </span>
                            </td>
                            <td>
                              <button 
                                className="db-view-btn" 
                                onClick={() => {
                                  setPreviewOrder(o);
                                }}
                              >
                                <Eye size={13} /> View Invoice
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', opacity: 0.5 }}>
                            No orders found matching this urgency countdown.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invoice Details Preview Modal */}
      <AnimatePresence>
        {previewOrder && (() => {
          const balanceDue = Number(previewOrder.totalAmount || 0) - Number(previewOrder.receivedAmount || 0);
          return (
            <div className="modal-overlay" style={{ zIndex: 4000 }}>
              <motion.div 
                className="custom-modal ord-preview-modal animate-fade-in"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                style={{ maxWidth: '600px', width: '90%' }}
              >
                <div className="ord-preview-header" style={{ marginBottom: '15px', paddingBottom: '10px' }}>
                  <h2>Order Invoice Detail</h2>
                  <button className="items-close-btn" onClick={() => setPreviewOrder(null)}><X size={24} /></button>
                </div>
                
                <div className="ord-preview-body">
                  <div className="ord-preview-top" style={{ marginBottom: '15px' }}>
                    <div>
                      <h3>Ravi Sweets</h3>
                      <p>{previewOrder.storeName}</p>
                      <p style={{ marginTop: '6px' }}><strong>Order:</strong> #{previewOrder.orderId}</p>
                      <p style={{ color: 'var(--primary-color)', fontWeight: '700', marginTop: '2px' }}>
                        <strong>Delivery Target:</strong> {new Date(previewOrder.deliveryDate).toLocaleDateString()} at {previewOrder.deliveryTime || ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <h3>Bill To</h3>
                      <p><strong>{previewOrder.customerName}</strong></p>
                      <p>{previewOrder.customerPhone}</p>
                    </div>
                  </div>

                  <div className="ord-preview-desc" style={{ marginBottom: '15px', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                    {previewOrder.globalDescription && <p style={{ margin: '4px 0' }}><strong>Global Note:</strong> {previewOrder.globalDescription}</p>}
                    {previewOrder.pUnitDescription && <p style={{ margin: '4px 0' }}><strong>Pack Note:</strong> {previewOrder.pUnitDescription}</p>}
                  </div>

                  {/* Tabs */}
                  <div className="ord-preview-tabs" style={{ display: 'flex', gap: '8px', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '8px', marginBottom: '12px' }}>
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'items' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('items')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        background: previewTab === 'items' ? '#7b2cbf' : 'transparent',
                        color: previewTab === 'items' ? '#ffffff' : '#64748b',
                        borderRadius: '6px',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Items Included
                    </button>
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'details' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('details')}
                      style={{
                        padding: '6px 12px',
                        border: 'none',
                        background: previewTab === 'details' ? '#7b2cbf' : 'transparent',
                        color: previewTab === 'details' ? '#ffffff' : '#64748b',
                        borderRadius: '6px',
                        fontWeight: '700',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Financial breakdown
                    </button>
                  </div>

                  {previewTab === 'items' ? (
                    <table className="ord-preview-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                          <th style={{ padding: '8px', fontSize: '11px', textAlign: 'left' }}>Item</th>
                          <th style={{ padding: '8px', fontSize: '11px', textAlign: 'center' }}>Qty</th>
                          <th style={{ padding: '8px', fontSize: '11px', textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewOrder.items.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px', fontSize: '13px' }}>{item.name}</td>
                            <td style={{ padding: '8px', fontSize: '13px', textAlign: 'center' }}>
                              {item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pcs`}
                            </td>
                            <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span>Subtotal (Excl. Tax):</span>
                        <span>₹{(previewOrder.totalAmount / 1.05).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span>GST (5%):</span>
                        <span>₹{(previewOrder.totalAmount - (previewOrder.totalAmount / 1.05)).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '800', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }}>
                        <span>GRAND TOTAL (Incl. Tax):</span>
                        <span>₹{previewOrder.totalAmount.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifycontent: 'space-between', fontSize: '13px', color: '#16a34a', fontWeight: '700', borderTop: '1px solid #cbd5e1', paddingTop: '6px' }}>
                        <span>Total Paid Collected:</span>
                        <span>₹{previewOrder.receivedAmount.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626', fontWeight: '700' }}>
                        <span>Remaining Outstanding:</span>
                        <span>₹{balanceDue.toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '20px', justifyContent: 'flex-end' }}>
                  <button className="modal-btn cancel" onClick={() => setPreviewOrder(null)}>Close</button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
