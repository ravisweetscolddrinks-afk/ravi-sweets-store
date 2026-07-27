import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  CreditCard, 
  Search, 
  Plus, 
  X, 
  Smartphone, 
  Clock, 
  CheckCircle, 
  HelpCircle,
  Receipt,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  AlertCircle,
  Maximize2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Payments.css';

// --- Sub-component to fetch and render installments history in accordion row ---
const PaymentHistoryAccordion = ({ order }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'orders', order.id, 'installments'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Fetch accordion history error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [order.id]);

  return (
    <div className="pay-history-accordion-content">
      <div className="accordion-title">
        <Clock size={14} style={{ marginRight: '6px' }} />
        <span>Payment History & Installment Logs</span>
      </div>
      
      {loading ? (
        <div className="accordion-loading">Loading installment history...</div>
      ) : history.length > 0 ? (
        <div className="accordion-timeline">
          {history.map((inst) => {
            const date = inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleDateString() : 'N/A';
            const time = inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div key={inst.id} className="accordion-timeline-item">
                <div className="timeline-dot"></div>
                <div className="timeline-info">
                  <div className="timeline-meta">
                    <span className="mode">{inst.paymentMode}</span>
                    <span className="date">{date} {time}</span>
                  </div>
                  <div className="timeline-amt">₹{inst.amount.toFixed(2)}</div>
                  <p className="notes">{inst.notes}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="accordion-empty">No payments logged yet for this order.</div>
      )}
    </div>
  );
};

const Payments = ({ storeId = null }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending', 'partial', 'completed'
  const [expandedOrders, setExpandedOrders] = useState([]);

  const toggleAccordion = (orderId) => {
    if (expandedOrders.includes(orderId)) {
      setExpandedOrders(expandedOrders.filter(id => id !== orderId));
    } else {
      setExpandedOrders([...expandedOrders, orderId]);
    }
  };
  
  // Add Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('UPI');
  const [payNotes, setPayNotes] = useState('');
  const [installments, setInstallments] = useState([]);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  // Full Screen Pending Breakdown Modal State
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [modalTab, setModalTab] = useState('orders'); // 'orders' or 'customers'
  const [modalSearch, setModalSearch] = useState('');
  const [expandedCustomerKey, setExpandedCustomerKey] = useState(null);

  // Memoized Order-Wise Pending List
  const orderPendingList = React.useMemo(() => {
    return orders
      .filter(o => (o.paymentStatus || 'Pending') !== 'Done' && (o.totalAmount - (o.receivedAmount || 0)) > 0.01)
      .sort((a, b) => (b.totalAmount - (b.receivedAmount || 0)) - (a.totalAmount - (a.receivedAmount || 0)));
  }, [orders]);

  // Memoized Customer-Wise Credit List
  const customerCreditList = React.useMemo(() => {
    const map = {};
    orders.forEach(order => {
      const remaining = order.totalAmount - (order.receivedAmount || 0);
      const isDone = (order.paymentStatus || 'Pending') === 'Done';
      if (!isDone && remaining > 0.01) {
        const key = (order.customerPhone || order.customerName || 'Unknown').trim();
        if (!map[key]) {
          map[key] = {
            key,
            customerName: order.customerName || 'Walk-in Customer',
            customerPhone: order.customerPhone || 'N/A',
            totalPending: 0,
            ordersCount: 0,
            orders: []
          };
        }
        map[key].totalPending += remaining;
        map[key].ordersCount += 1;
        map[key].orders.push(order);
      }
    });
    return Object.values(map).sort((a, b) => b.totalPending - a.totalPending);
  }, [orders]);

  // Total pending balance sum
  const totalPendingBalance = React.useMemo(() => {
    return orderPendingList.reduce((sum, o) => sum + (o.totalAmount - (o.receivedAmount || 0)), 0);
  }, [orderPendingList]);

  // Subscribe to all orders
  useEffect(() => {
    const q = query(
      collection(db, 'orders'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Filter by storeId if in Store Portal
      if (storeId) {
        setOrders(fetched.filter(o => o.storeId === storeId));
      } else {
        setOrders(fetched);
      }
      setLoading(false);
    }, (err) => {
      console.error("Fetch orders error:", err);
      toast.error("Failed to load orders");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [storeId]);

  // Fetch installments when an order is selected
  useEffect(() => {
    if (!selectedOrder) {
      setInstallments([]);
      return;
    }
    
    setInstallmentsLoading(true);
    const q = query(
      collection(db, 'orders', selectedOrder.id, 'installments'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setInstallments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setInstallmentsLoading(false);
    }, (err) => {
      console.error("Fetch installments error:", err);
      setInstallmentsLoading(false);
    });

    return () => unsubscribe();
  }, [selectedOrder]);

  // Open modal for a specific order
  const handleOpenPayModal = (order) => {
    setSelectedOrder(order);
    const remaining = order.totalAmount - (order.receivedAmount || 0);
    setPayAmount(remaining.toFixed(2));
    setPayMode('UPI');
    setPayNotes('');
    setShowPayModal(true);
  };

  // Close modal
  const handleClosePayModal = () => {
    setShowPayModal(false);
    setSelectedOrder(null);
    setPayAmount('');
    setPayNotes('');
  };

  // Handle saving the payment installment
  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;
    
    const amountVal = parseFloat(payAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      return toast.error("Please enter a valid payment amount");
    }

    const remaining = selectedOrder.totalAmount - (selectedOrder.receivedAmount || 0);
    if (amountVal > remaining + 0.01) {
      return toast.error(`Payment amount cannot exceed the remaining balance of ₹${remaining.toFixed(2)}`);
    }

    setSavingPayment(true);
    try {
      const orderRef = doc(db, 'orders', selectedOrder.id);
      const newReceived = (selectedOrder.receivedAmount || 0) + amountVal;
      let newStatus = 'Pending';
      if (newReceived >= selectedOrder.totalAmount - 0.01) {
        newStatus = 'Done';
      } else if (newReceived > 0) {
        newStatus = 'Partial';
      }

      // 1. Write the installment record
      await addDoc(collection(db, 'orders', selectedOrder.id, 'installments'), {
        amount: amountVal,
        paymentMode: payMode,
        notes: payNotes || 'Subsequent Installment',
        createdAt: serverTimestamp()
      });

      // 2. Update the main order fields
      await updateDoc(orderRef, {
        receivedAmount: newReceived,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp()
      });

      toast.success(`Payment of ₹${amountVal.toFixed(2)} recorded successfully!`);
      handleClosePayModal();
    } catch (error) {
      console.error("Save Payment Error:", error);
      toast.error("Failed to save payment installment");
    } finally {
      setSavingPayment(false);
    }
  };

  // Status badging helper
  const getPaymentStatusClass = (status) => {
    switch (status) {
      case 'Done': return 'status-completed';
      case 'Partial': return 'status-partial';
      default: return 'status-pending';
    }
  };

  const getPaymentStatusText = (status) => {
    switch (status) {
      case 'Done': return 'Completed';
      case 'Partial': return 'Partial';
      default: return 'Pending';
    }
  };

  // Tab Filtering Logic
  const filteredOrders = orders.filter(order => {
    const status = order.paymentStatus || 'Pending';
    
    // Tab check
    if (activeTab === 'pending' && status !== 'Pending') return false;
    if (activeTab === 'partial' && status !== 'Partial') return false;
    if (activeTab === 'completed' && status !== 'Done') return false;

    // Search check
    if (!searchQuery) return true;
    const queryLower = searchQuery.toLowerCase();
    return (
      (order.orderId || '').toLowerCase().includes(queryLower) ||
      (order.customerName || '').toLowerCase().includes(queryLower) ||
      (order.customerPhone || '').includes(searchQuery)
    );
  });

  return (
    <div className="pay-container">
      {/* Upper Statistics Grid */}
      <div className="pay-summary-grid">
        <div className="pay-summary-card total">
          <div className="card-info">
            <span className="title">Total Orders</span>
            <span className="value">{orders.length}</span>
            <span className="desc">Active and completed system orders</span>
          </div>
          <div className="card-icon"><Receipt size={24} /></div>
        </div>

        <div 
          className="pay-summary-card pending interactive" 
          onClick={() => setShowPendingModal(true)}
          style={{ cursor: 'pointer' }}
          title="Click to view full screen pending breakdown"
        >
          <div className="card-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="title">Pending Collection</span>
              <span className="clickable-chip"><Maximize2 size={11} /> View Breakdown</span>
            </div>
            <span className="value">
              ₹{totalPendingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="desc">{orderPendingList.length} pending orders &bull; {customerCreditList.length} customer credit accounts</span>
          </div>
          <div className="card-icon"><Clock size={24} /></div>
        </div>

        <div className="pay-summary-card completed">
          <div className="card-info">
            <span className="title">Collected Revenue</span>
            <span className="value">
              ₹{orders
                .reduce((sum, o) => sum + (o.receivedAmount || 0), 0)
                .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="desc">Total funds captured in system</span>
          </div>
          <div className="card-icon"><CheckCircle size={24} /></div>
        </div>
      </div>

      {/* Main Section */}
      <div className="pay-card">
        <div className="pay-card-header">
          <div>
            <h1>{storeId ? 'Store Payments' : 'Payment Ledger'}</h1>
            <p>Manage customer installments, outstanding collections, and credit histories</p>
          </div>
          
          <div className="pay-actions-wrapper">
            <div className="pay-search-box">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Search by ID, Name, or Mobile..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="pay-tabs">
          <button 
            className={`pay-tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Payments 
            <span className="count-badge">
              {orders.filter(o => (o.paymentStatus || 'Pending') === 'Pending').length}
            </span>
          </button>
          <button 
            className={`pay-tab-btn ${activeTab === 'partial' ? 'active' : ''}`}
            onClick={() => setActiveTab('partial')}
          >
            Partial Installments
            <span className="count-badge">
              {orders.filter(o => (o.paymentStatus || 'Pending') === 'Partial').length}
            </span>
          </button>
          <button 
            className={`pay-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed Payments
            <span className="count-badge">
              {orders.filter(o => (o.paymentStatus || 'Pending') === 'Done').length}
            </span>
          </button>
        </div>

        {/* Mobile Tab Dropdown Filter */}
        <div className="pay-tabs-dropdown-wrapper">
          <label htmlFor="pay-tab-select" className="pay-dropdown-label">Filter Payments</label>
          <select 
            id="pay-tab-select" 
            className="pay-tab-select"
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value)}
          >
            <option value="pending">
              Pending Payments ({orders.filter(o => (o.paymentStatus || 'Pending') === 'Pending').length})
            </option>
            <option value="partial">
              Partial Installments ({orders.filter(o => (o.paymentStatus || 'Pending') === 'Partial').length})
            </option>
            <option value="completed">
              Completed Payments ({orders.filter(o => (o.paymentStatus || 'Pending') === 'Done').length})
            </option>
          </select>
        </div>

        {/* Table View */}
        <div className="pay-table-wrapper">
          <table className="pay-table">
            <thead>
              <tr>
                <th className="col-id">Order ID</th>
                <th className="col-customer">Customer</th>
                {!storeId && <th className="col-store">Store Location</th>}
                <th className="col-total">Total Bill</th>
                <th className="col-paid">Paid So Far</th>
                <th className="col-remaining">Remaining Balance</th>
                <th className="col-status">Status</th>
                <th className="col-date">Order Date</th>
                <th className="col-actions" style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={storeId ? 8 : 9} className="pay-table-empty">
                    <div className="pay-spinner"></div>
                  </td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map(order => {
                  const paid = order.receivedAmount || 0;
                  const remaining = order.totalAmount - paid;
                  const orderDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'N/A';
                  const isExpanded = expandedOrders.includes(order.id);
                  
                  return (
                    <React.Fragment key={order.id}>
                      <tr className={`pay-row ${isExpanded ? 'row-expanded' : ''}`}>
                        <td className="order-id-cell">
                          <div 
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                            onClick={() => toggleAccordion(order.id)}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            #{order.orderId}
                          </div>
                        </td>
                        <td className="customer-cell">
                          <div className="cust-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>
                            <span className="name">{order.customerName}</span>
                            <span className="phone"><Smartphone size={12} style={{ marginRight: '4px' }} />{order.customerPhone}</span>
                          </div>
                        </td>
                        {!storeId && <td className="store-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>{order.storeName}</td>}
                        <td className="amount-cell total-bill-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>₹{order.totalAmount.toFixed(2)}</td>
                        <td className="amount-cell paid-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>₹{paid.toFixed(2)}</td>
                        <td className="amount-cell remaining-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>₹{remaining.toFixed(2)}</td>
                        <td className="status-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>
                          <span className={`pay-status-badge ${getPaymentStatusClass(order.paymentStatus || 'Pending')}`}>
                            {getPaymentStatusText(order.paymentStatus || 'Pending')}
                          </span>
                        </td>
                        <td className="date-cell" style={{ cursor: 'pointer' }} onClick={() => toggleAccordion(order.id)}>{orderDate}</td>
                        <td className="actions-cell">
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {order.paymentStatus !== 'Done' ? (
                              <button 
                                className="pay-add-btn" 
                                onClick={() => handleOpenPayModal(order)}
                              >
                                <CreditCard size={14} style={{ marginRight: '6px' }} /> Add Payment
                              </button>
                            ) : (
                              <button className="pay-paid-btn" onClick={() => toggleAccordion(order.id)} style={{ cursor: 'pointer' }}>
                                <CheckCircle size={14} style={{ marginRight: '6px' }} /> Fully Paid
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="pay-accordion-row">
                          <td colSpan={storeId ? 8 : 9} style={{ padding: '0 20px 20px 20px' }}>
                            <PaymentHistoryAccordion order={order} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={storeId ? 8 : 9} className="pay-table-empty">
                    <HelpCircle size={32} style={{ color: 'var(--text-secondary)', marginBottom: '10px' }} />
                    <p>No orders found matching the filter selection</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      <AnimatePresence>
        {showPayModal && selectedOrder && (
          <div className="pay-modal-overlay">
            <motion.div 
              className="pay-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="pay-modal-header">
                <div>
                  <h2>Add Payment Installment</h2>
                  <p>Order #{selectedOrder.orderId} &bull; {selectedOrder.customerName}</p>
                </div>
                <button onClick={handleClosePayModal} className="close-btn"><X size={22} /></button>
              </div>

              <div className="pay-modal-content">
                <form onSubmit={handleSavePayment} className="pay-form">
                  
                  {/* Financial Overview Cards */}
                  <div className="pay-overview-grid">
                    <div className="mini-card">
                      <span className="label">Total Amount</span>
                      <span className="val">₹{selectedOrder.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="mini-card paid">
                      <span className="label">Amount Paid</span>
                      <span className="val">₹{(selectedOrder.receivedAmount || 0).toFixed(2)}</span>
                    </div>
                    <div className="mini-card remaining">
                      <span className="label">Remaining Balance</span>
                      <span className="val">₹{(selectedOrder.totalAmount - (selectedOrder.receivedAmount || 0)).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="pay-form-row">
                    <div className="pay-group">
                      <label>Payment Amount to Add (₹)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        placeholder="e.g. 500" 
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                        required
                        max={selectedOrder.totalAmount - (selectedOrder.receivedAmount || 0)}
                        min="0.01"
                      />
                    </div>

                    <div className="pay-group">
                      <label>Payment Mode</label>
                      <div className="pay-mode-selector">
                        {['UPI', 'Cash', 'Card', 'NetBanking'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            className={`mode-btn ${payMode === mode ? 'active' : ''}`}
                            onClick={() => setPayMode(mode)}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pay-group" style={{ marginBottom: '25px' }}>
                    <label>Installment Notes / References</label>
                    <input 
                      type="text" 
                      placeholder="e.g. UPI Ref: 987654321, Second Installment" 
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                    />
                  </div>

                  <div className="pay-modal-footer">
                    <button type="button" className="btn-cancel" onClick={handleClosePayModal}>Cancel</button>
                    <button type="submit" className="btn-save" disabled={savingPayment}>
                      {savingPayment ? 'Processing...' : 'Record Payment'}
                    </button>
                  </div>
                </form>

                {/* Real-time Installments History Timeline */}
                <div className="pay-timeline-section">
                  <h3><Clock size={16} style={{ marginRight: '6px' }} /> Payment Log Timeline</h3>
                  <div className="pay-timeline-container">
                    {installmentsLoading ? (
                      <div className="timeline-empty">Loading history...</div>
                    ) : installments.length > 0 ? (
                      <div className="pay-timeline">
                        {installments.map((inst, index) => {
                          const date = inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleDateString() : 'N/A';
                          const time = inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                          
                          return (
                            <div key={inst.id} className="timeline-item">
                              <div className="timeline-badge"></div>
                              <div className="timeline-body">
                                <div className="timeline-header">
                                  <span className="mode">{inst.paymentMode}</span>
                                  <span className="amt">₹{inst.amount.toFixed(2)}</span>
                                </div>
                                <p className="notes">{inst.notes}</p>
                                <span className="time">{date} {time}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="timeline-empty">No payments logged yet for this order.</div>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Pending Balance & Customer Credit Modal */}
      <AnimatePresence>
        {showPendingModal && (
          <div className="pay-fs-overlay">
            <motion.div 
              className="pay-fs-modal"
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 15 }}
              transition={{ duration: 0.2 }}
            >
              {/* Top Executive Header */}
              <div className="pay-fs-header">
                <div className="pay-fs-header-title">
                  <div className="pay-fs-badge-icon"><AlertCircle size={22} /></div>
                  <div>
                    <h2>Pending Collection & Customer Credit</h2>
                    <p>Detailed view of all uncollected orders and customer credit accounts</p>
                  </div>
                </div>

                <div className="pay-fs-header-stats">
                  <div className="fs-stat-pill">
                    <span className="fs-stat-label">Total Outstanding</span>
                    <span className="fs-stat-val text-danger">₹{totalPendingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="fs-stat-pill">
                    <span className="fs-stat-label">Pending Orders</span>
                    <span className="fs-stat-val">{orderPendingList.length}</span>
                  </div>
                  <div className="fs-stat-pill">
                    <span className="fs-stat-label">Customers with Credit</span>
                    <span className="fs-stat-val">{customerCreditList.length}</span>
                  </div>
                </div>

                <button className="pay-fs-close-btn" onClick={() => setShowPendingModal(false)} title="Close Modal">
                  <X size={22} />
                </button>
              </div>

              {/* Sub-header Navigation & Search */}
              <div className="pay-fs-subnav">
                <div className="pay-fs-tabs">
                  <button 
                    className={`pay-fs-tab-btn ${modalTab === 'orders' ? 'active' : ''}`}
                    onClick={() => setModalTab('orders')}
                  >
                    <Receipt size={16} /> Order-Wise Pending ({orderPendingList.length})
                  </button>
                  <button 
                    className={`pay-fs-tab-btn ${modalTab === 'customers' ? 'active' : ''}`}
                    onClick={() => setModalTab('customers')}
                  >
                    <Users size={16} /> Customer-Wise Credit ({customerCreditList.length})
                  </button>
                </div>

                <div className="pay-fs-search">
                  <Search size={16} className="fs-search-icon" />
                  <input 
                    type="text" 
                    placeholder={modalTab === 'orders' ? "Search order ID, customer name or phone..." : "Search customer name or phone..."}
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                  />
                  {modalSearch && (
                    <button className="fs-clear-search" onClick={() => setModalSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Modal Content */}
              <div className="pay-fs-body">
                {modalTab === 'orders' ? (
                  /* TAB 1: ORDER-WISE PENDING */
                  <div className="pay-fs-content">
                    {(() => {
                      const filtered = orderPendingList.filter(o => {
                        if (!modalSearch) return true;
                        const q = modalSearch.toLowerCase();
                        return (
                          (o.orderId || '').toLowerCase().includes(q) ||
                          (o.customerName || '').toLowerCase().includes(q) ||
                          (o.customerPhone || '').includes(modalSearch) ||
                          (o.storeName || '').toLowerCase().includes(q)
                        );
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="pay-fs-empty">
                            <CheckCircle size={44} style={{ color: '#10b981', marginBottom: 10 }} />
                            <h3>No Pending Orders Found</h3>
                            <p>{modalSearch ? "No orders match your search query." : "All order accounts are fully paid and up to date!"}</p>
                          </div>
                        );
                      }

                      return (
                        <div className="pay-fs-table-wrapper">
                          <table className="pay-fs-table">
                            <thead>
                              <tr>
                                <th>Order ID</th>
                                <th>Customer Details</th>
                                {!storeId && <th>Store Location</th>}
                                <th>Total Bill</th>
                                <th>Paid So Far</th>
                                <th>Pending Balance</th>
                                <th>Payment Status</th>
                                <th>Order Date</th>
                                <th style={{ textAlign: 'center' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map(ord => {
                                const paid = ord.receivedAmount || 0;
                                const remaining = ord.totalAmount - paid;
                                const date = ord.createdAt?.toDate ? ord.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A';

                                return (
                                  <tr key={ord.id}>
                                    <td className="font-mono bold">#{ord.orderId}</td>
                                    <td>
                                      <div className="cust-cell">
                                        <span className="name">{ord.customerName || 'Walk-in Customer'}</span>
                                        <span className="phone"><Smartphone size={12} style={{ marginRight: 4 }} />{ord.customerPhone || 'N/A'}</span>
                                      </div>
                                    </td>
                                    {!storeId && <td>{ord.storeName}</td>}
                                    <td className="bold">₹{ord.totalAmount.toFixed(2)}</td>
                                    <td className="text-success">₹{paid.toFixed(2)}</td>
                                    <td className="text-danger bold" style={{ fontSize: '15px' }}>₹{remaining.toFixed(2)}</td>
                                    <td>
                                      <span className={`pay-status-badge ${getPaymentStatusClass(ord.paymentStatus || 'Pending')}`}>
                                        {getPaymentStatusText(ord.paymentStatus || 'Pending')}
                                      </span>
                                    </td>
                                    <td>{date}</td>
                                    <td style={{ textAlign: 'center' }}>
                                      <button 
                                        className="pay-add-btn"
                                        onClick={() => handleOpenPayModal(ord)}
                                      >
                                        <CreditCard size={14} style={{ marginRight: 6 }} /> Collect Payment
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  /* TAB 2: CUSTOMER-WISE CREDIT */
                  <div className="pay-fs-content">
                    {(() => {
                      const filteredCusts = customerCreditList.filter(c => {
                        if (!modalSearch) return true;
                        const q = modalSearch.toLowerCase();
                        return (
                          c.customerName.toLowerCase().includes(q) ||
                          c.customerPhone.includes(modalSearch)
                        );
                      });

                      if (filteredCusts.length === 0) {
                        return (
                          <div className="pay-fs-empty">
                            <CheckCircle size={44} style={{ color: '#10b981', marginBottom: 10 }} />
                            <h3>No Customer Credit Found</h3>
                            <p>{modalSearch ? "No customer matches your search query." : "All customer credit accounts are clear!"}</p>
                          </div>
                        );
                      }

                      return (
                        <div className="customer-credit-grid">
                          {filteredCusts.map(cust => {
                            const isExpanded = expandedCustomerKey === cust.key;

                            return (
                              <div key={cust.key} className={`customer-credit-card ${isExpanded ? 'expanded' : ''}`}>
                                <div 
                                  className="customer-credit-header"
                                  onClick={() => setExpandedCustomerKey(isExpanded ? null : cust.key)}
                                >
                                  <div className="customer-info-box">
                                    <div className="customer-avatar">
                                      <User size={22} />
                                    </div>
                                    <div>
                                      <h3 className="cust-name">{cust.customerName}</h3>
                                      <p className="cust-phone"><Smartphone size={12} /> {cust.customerPhone}</p>
                                    </div>
                                  </div>

                                  <div className="customer-balance-box">
                                    <div className="cust-pending-badge">
                                      <span className="label">{cust.ordersCount} Pending Order{cust.ordersCount > 1 ? 's' : ''}</span>
                                      <span className="balance-val">₹{cust.totalPending.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <button className="expand-toggle-btn">
                                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                    </button>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="customer-orders-dropdown">
                                    <div className="dropdown-title">
                                      <span>Pending Orders Owed by <strong>{cust.customerName}</strong> ({cust.ordersCount} item{cust.ordersCount > 1 ? 's' : ''})</span>
                                    </div>
                                    <table className="pay-fs-table subtable">
                                      <thead>
                                        <tr>
                                          <th>Order ID</th>
                                          <th>Total Bill</th>
                                          <th>Paid Amount</th>
                                          <th>Credit Pending</th>
                                          <th>Order Date</th>
                                          <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {cust.orders.map(ord => {
                                          const paid = ord.receivedAmount || 0;
                                          const remaining = ord.totalAmount - paid;
                                          const date = ord.createdAt?.toDate ? ord.createdAt.toDate().toLocaleDateString('en-IN') : 'N/A';

                                          return (
                                            <tr key={ord.id}>
                                              <td className="font-mono bold">#{ord.orderId}</td>
                                              <td>₹{ord.totalAmount.toFixed(2)}</td>
                                              <td className="text-success">₹{paid.toFixed(2)}</td>
                                              <td className="text-danger bold">₹{remaining.toFixed(2)}</td>
                                              <td>{date}</td>
                                              <td style={{ textAlign: 'right' }}>
                                                <button 
                                                  className="pay-add-btn"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenPayModal(ord);
                                                  }}
                                                >
                                                  <CreditCard size={13} style={{ marginRight: 4 }} /> Collect
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Payments;
