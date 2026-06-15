import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Store, 
  Phone, 
  MapPin, 
  Navigation, 
  Users, 
  ShoppingBag, 
  Plus, 
  X, 
  Trash2, 
  UserCheck,
  Search,
  Scale,
  Package,
  Map as MapIcon,
  Globe,
  MapPin as MapPinFilled,
  Layout as LayoutIcon,
  Target,
  FileText as FileIcon,
  Info,
  Printer,
  Minus,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import logo from '../../assets/logo.png';
const DEFAULT_ITEM_IMAGE = logo;


import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  serverTimestamp,
  where,
  updateDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StoreDetails.css';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';


const StoreDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'access', 'orders', 'billing'
  
  // Access State
  const [accessList, setAccessList] = useState([]);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessFormData, setAccessFormData] = useState({ name: '', phone: '' });
  const [submittingAccess, setSubmittingAccess] = useState(false);

  // Billing State
  const [storeItems, setStoreItems] = useState([]);
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingSearch, setBillingSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [showWeightModal, setShowWeightModal] = useState(null); 
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });
  const [bills, setBills] = useState([]);
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [posDiscount, setPosDiscount] = useState('');

  // Fetch Store Details
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', id));
        if (storeDoc.exists()) {
          setStore({ id: storeDoc.id, ...storeDoc.data() });
        } else {
          toast.error("Store not found");
          navigate('/stores');
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        toast.error("Failed to load store details");
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [id, navigate]);

  // Fetch Access List
  useEffect(() => {
    if (activeTab === 'access') {
      const q = query(collection(db, 'stores', id, 'access'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setAccessList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [id, activeTab]);

  // Fetch Bills
  useEffect(() => {
    if (activeTab === 'billing') {
      const q = query(collection(db, 'stores', id, 'bills'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [id, activeTab]);

  // Fetch Store Items
  useEffect(() => {
    const q = query(collection(db, 'items'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort items alphabetically locally
      fetchedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setStoreItems(fetchedItems);
    }, (error) => {
      console.error("Firestore items sub error in StoreDetails:", error);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Orders
  useEffect(() => {
    const q = query(
      collection(db, 'orders'), 
      where('storeId', '==', id)
      // orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedOrders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(fetchedOrders);
    });
    return () => unsubscribe();
  }, [id]);

  const handleAddAccess = async (e) => {
    e.preventDefault();
    setSubmittingAccess(true);
    try {
      await addDoc(collection(db, 'stores', id, 'access'), {
        ...accessFormData,
        createdAt: serverTimestamp()
      });
      toast.success("Access granted successfully");
      setShowAccessModal(false);
      setAccessFormData({ name: '', phone: '' });
    } catch (error) {
      toast.error("Failed to add access");
    } finally {
      setSubmittingAccess(false);
    }
  };

  const handleDeleteAccess = async (accessId) => {
    try {
      await deleteDoc(doc(db, 'stores', id, 'access', accessId));
      toast.success("Access revoked");
    } catch (error) {
      toast.error("Failed to revoke access");
    }
  };

  // Billing Logic
  const handleItemClick = (item) => {
    const existing = cart.find(c => c.id === item.id);
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      if (existing) {
        setWeightInput({ weight: existing.quantity, amount: existing.total });
      } else {
        setWeightInput({ weight: '', amount: '' });
      }
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const addToCart = (item, quantity, amount) => {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    if (existingIndex > -1 && item.unit !== 'Weight') {
      setCart(cart.map((c, i) => i === existingIndex ? { ...c, quantity: c.quantity + quantity, total: (c.quantity + quantity) * c.price } : c));
    } else if (existingIndex > -1 && item.unit === 'Weight') {
      // Update existing weight entry
      setCart(cart.map((c, i) => i === existingIndex ? { ...c, quantity, total: parseFloat(amount) } : c));
    } else {
      setCart([...cart, { 
        id: item.id, 
        name: item.name, 
        price: item.price, 
        unit: item.unit,
        quantity, 
        total: parseFloat(amount) 
      }]);
    }
    toast.success(`${item.name} updated`);
  };


  const updateQuantity = (itemId, delta, isWeight = false) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === itemId);
      if (!existing) return prev;
      
      if (delta === -1 && existing.quantity <= (isWeight ? 0.001 : 1)) {
        return prev.filter(c => c.id !== itemId);
      }

      return prev.map(c => {
        if (c.id === itemId) {
          const newQty = isWeight ? parseFloat(c.quantity) + (delta * 0.1) : c.quantity + delta;
          const newTotal = isWeight ? (newQty * c.price) : (newQty * c.price);
          return { ...c, quantity: isWeight ? newQty.toFixed(3) : newQty, total: newTotal };
        }
        return c;
      });
    });
  };


  const handlePrint = (bill) => {
    toast.success(`Printing Bill: ${bill.billId}`);
    // Future: Add real print logic
  };


  const handleWeightCalc = (type, value) => {
    const price = showWeightModal.price;
    if (type === 'weight') {
      const amt = (parseFloat(value) * price).toFixed(2);
      setWeightInput({ weight: value, amount: amt });
    } else {
      const wt = (parseFloat(value) / price).toFixed(3);
      setWeightInput({ weight: wt, amount: value });
    }
  };

  const confirmWeightAdd = () => {
    if (!weightInput.weight || !weightInput.amount) return;
    addToCart(showWeightModal, weightInput.weight, weightInput.amount);
    setShowWeightModal(null);
  };

  const generateBillId = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `SB${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const settleBill = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setSubmittingAccess(true);
    try {
      const billId = generateBillId();
      const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
      const discountVal = parseFloat(posDiscount) || 0;
      const totalAmt = Math.max(0, cartTotal - discountVal);
      const billData = {
        billId,
        storeId: id,
        storeName: store?.name || 'Ravi Sweets',
        items: cart,
        discount: discountVal,
        totalAmount: totalAmt,
        paymentMode,
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString()
      };
      await addDoc(collection(db, 'stores', id, 'bills'), billData);
      toast.success(`Bill Settled: ${billId}`);
      setCart([]);
      setPosDiscount('');
    } catch (error) {
      toast.error("Failed to settle bill");
    } finally {
      setSubmittingAccess(false);
    }
  };

  const toggleOrderAccordion = (id) => {
    setExpandedOrders(prev => prev.includes(id) ? prev.filter(oId => oId !== id) : [...prev, id]);
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

  const updateItemStatus = async (orderId, itemIndex, newStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const order = orders.find(o => o.id === orderId);
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
      toast.success("Item status updated");

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

  if (loading) {
    return <div className="store-details-container"><div className="loader"></div></div>;
  }

  if (!store) return null;

  return (
    <div className="store-details-container">
      <button className="header-back-btn" onClick={() => navigate('/stores')}>
        <ArrowLeft size={18} /> Back to Stores
      </button>

      <div className="store-details-header">
        <div className="header-left-group">
          <div className="store-main-icon">
            <Store size={32} />
          </div>
          <div className="header-main-info">
            <h1>{store.name}</h1>
            <div className="header-location">
              <MapPin size={14} /> {store.city}, {store.state}
            </div>
          </div>
        </div>
        <div className="store-status-card">
          <span>Store Status</span>
          <div className="status-active-badge">Active</div>
        </div>
      </div>

      <div className="sd-tabs-nav">
        <div className={`sd-tab-tile ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <div className="sd-tile-icon"><Info size={18} /></div>
          <span>Store Info</span>
        </div>
        <div className={`sd-tab-tile ${activeTab === 'access' ? 'active' : ''}`} onClick={() => setActiveTab('access')}>
          <div className="sd-tile-icon"><Users size={18} /></div>
          <span>Access Control</span>
        </div>
        <div className={`sd-tab-tile ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => setActiveTab('billing')}>
          <div className="sd-tile-icon"><FileIcon size={18} /></div>
          <span>Billing & POS</span>
        </div>
        <div className={`sd-tab-tile ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
          <div className="sd-tile-icon"><ShoppingBag size={18} /></div>
          <span>Orders</span>
        </div>
      </div>


      <div className="tab-content">
        {activeTab === 'info' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="info-cards-row">
              {/* Contact Card */}
              <div className="premium-info-card">
                <div className="card-top">
                  <div className="card-icon-box green">
                    <Phone size={22} />
                  </div>
                  <div className="card-label">
                    <h3>Contact Information</h3>
                    <p>Reachable via phone</p>
                  </div>
                </div>
                <div className="data-section green">
                  <div className="data-row">
                    <Phone size={20} />
                    <span>{store.phone}</span>
                  </div>
                </div>
              </div>

              {/* Location Card */}
              <div className="premium-info-card">
                <div className="card-top">
                  <div className="card-icon-box purple">
                    <MapPinFilled size={22} />
                  </div>
                  <div className="card-label">
                    <h3>Location Details</h3>
                    <p>Store address</p>
                  </div>
                </div>
                <div className="data-section purple">
                  <div className="data-row">
                    <Navigation size={18} />
                    <span>{store.name} Address</span>
                  </div>
                  <div className="data-row small">
                    <MapIcon size={14} />
                    <span>{store.city}, {store.state}</span>
                  </div>
                </div>
              </div>

              {/* GPS Card */}
              <div className="premium-info-card">
                <div className="card-top">
                  <div className="card-icon-box blue">
                    <Target size={22} />
                  </div>
                  <div className="card-label">
                    <h3>GPS Coordinates</h3>
                    <p>Store location on map</p>
                  </div>
                </div>
                <div className="data-section blue">
                  <div className="data-row small">
                    <span>Latitude</span>
                  </div>
                  <div className="data-row" style={{ marginBottom: '10px' }}>
                    <span>{store.latitude || '17.3850'}</span>
                  </div>
                  <div className="data-row small">
                    <span>Longitude</span>
                  </div>
                  <div className="data-row">
                    <span>{store.longitude || '78.4867'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Card */}
            <div className="map-card">
              <div className="map-card-info">
                <div className="map-card-header">
                  <div className="card-icon-box green" style={{ borderRadius: '12px' }}>
                    <MapIcon size={24} />
                  </div>
                  <div className="card-label">
                    <h3>Store Location</h3>
                    <p>Visual representation of store location</p>
                  </div>
                </div>
                <button className="map-btn-view">
                  <Globe size={18} /> View on Map
                </button>
              </div>
              <div className="map-visual">
                <div className="map-pin">
                  <MapPinFilled size={48} fill="currentColor" />
                </div>
              </div>
            </div>
          </motion.div>
        )}


        {activeTab === 'access' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Assigned Access ({accessList.length})</h2>
              <button className="add-access-btn" onClick={() => setShowAccessModal(true)}>
                <Plus size={18} /> Grant Access
              </button>
            </div>
            <div className="access-list">
              {accessList.map(access => (
                <div key={access.id} className="access-card">
                  <div className="access-info"><h4>{access.name}</h4><p>{access.phone}</p></div>
                  <button className="store-mini-btn delete" onClick={() => handleDeleteAccess(access.id)}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'billing' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Billing History</h2>
              <button className="add-access-btn" onClick={() => setShowBillingModal(true)}>
                <Plus size={18} /> Add Bill
              </button>
            </div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Mode</th>
                    <th>Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(bill => (
                    <tr key={bill.id}>
                      <td>{bill.billId}</td>
                      <td>{bill.date}</td>
                      <td>₹{bill.totalAmount.toFixed(2)}</td>
                      <td>{bill.paymentMode}</td>
                      <td>{bill.items.length} items</td>
                      <td>
                        <button className="store-mini-btn" onClick={() => handlePrint(bill)} title="Print Bill">
                          <Printer size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}


                  {bills.length === 0 && <tr><td colSpan="5" style={{textAlign:'center', padding: '40px'}}>No bills found.</td></tr>}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {activeTab === 'orders' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="access-header">
              <h2>Store Orders ({orders.length})</h2>
              <button className="add-access-btn" style={{ background: '#059669' }} onClick={() => navigate('/orders')}>
                <Plus size={18} /> New Order
              </button>
            </div>
            <div className="orders-table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <React.Fragment key={order.id}>
                      <tr className={expandedOrders.includes(order.id) ? "row-expanded" : ""}>
                        <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => toggleOrderAccordion(order.id)}>
                            {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            #{order.orderId}
                          </div>
                        </td>
                        <td>{order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'New'}</td>
                        <td>{order.customerName}</td>
                        <td style={{ fontWeight: '700' }}>₹{order.totalAmount.toFixed(2)}</td>
                        <td>
                          <span className={`status-badge ${order.status}`} style={{ fontSize: '10px' }}>
                            {order.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                      {expandedOrders.includes(order.id) && (
                        <tr className="ord-accordion-row">
                          <td colSpan="5" style={{ padding: 0 }}>
                            <div className="ord-accordion-content">
                              <h4 style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--primary-color)' }}>Order Items</h4>
                              <table className="ord-items-subtable">
                                <thead>
                                  <tr>
                                    <th>Item Name</th>
                                    <th>Description</th>
                                    <th>Quantity</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item, idx) => (
                                    <tr key={idx}>
                                      <td style={{ fontWeight: '700' }}>{item.name}</td>
                                      <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{item.description || '-'}</td>
                                      <td>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                                      <td style={{ fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                                      <td>
                                        <select 
                                          className="ord-item-status-select"
                                          value={item.status || 'preparation_started'}
                                          onChange={(e) => updateItemStatus(order.id, idx, e.target.value)}
                                        >
                                          <option value="preparation_started">Preparation Started</option>
                                          <option value="preparation_complete">Preparation Complete</option>
                                          <option value="moved_to_packing">Moved to Packing</option>
                                          <option value="packing_complete">Packing Complete</option>
                                          <option value="moved_to_store">Moved to Store</option>
                                          <option value="received_at_store">Received at Store</option>
                                          <option value="delivered">Delivered</option>
                                        </select>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>No orders found for this store.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {/* Access Modal */}
      <AnimatePresence>
        {showAccessModal && (
          <div className="modal-overlay">
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#E0F2FE', color: '#0284C7' }}><UserCheck size={32} /></div>
              <h3 className="modal-title">Grant Store Access</h3>
              <form onSubmit={handleAddAccess} className="access-modal-form">
                <div><label>Full Name</label><input type="text" value={accessFormData.name} onChange={(e) => setAccessFormData({...accessFormData, name: e.target.value})} required /></div>
                <div><label>Mobile Number</label><input type="tel" value={accessFormData.phone} onChange={(e) => setAccessFormData({...accessFormData, phone: e.target.value})} required /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowAccessModal(false)}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} disabled={submittingAccess}>
                    {submittingAccess ? <div className="loader"></div> : 'Save'}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Billing Modal */}
      <AnimatePresence>
        {showBillingModal && (
          <motion.div className="full-screen-modal" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}>
            <div className="billing-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <Store size={24} color="var(--primary-color)" />
                <div><h2>Store Billing - {store.name}</h2><p>Pos Terminal Active</p></div>
              </div>
              <button className="stores-close-btn" onClick={() => setShowBillingModal(false)}><X size={20} /></button>
            </div>
            <div className="billing-modal-content">
              <div className="billing-left-panel">
                <div className="stores-search-bar"><Search size={18} className="stores-search-icon" /><input type="text" placeholder="Search products..." value={billingSearch} onChange={(e) => setBillingSearch(e.target.value)} /></div>
                <div className="billing-item-list">
                  {storeItems.filter(i => (i.name || '').toLowerCase().includes(billingSearch.toLowerCase())).map(item => {
                    const inCart = cart.find(c => c.id === item.id);
                    return (
                      <div key={item.id} className="billing-item-card">
                        <div className="billing-item-img" onClick={() => handleItemClick(item)}>
                          <img 
                            src={(!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} 
                            alt={item.name} 
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = DEFAULT_ITEM_IMAGE;
                            }}
                          />
                          {inCart && (
                            <div className="item-cart-badge">{item.unit === 'Weight' ? inCart.quantity + 'kg' : inCart.quantity}</div>
                          )}
                        </div>
                        <div className="billing-item-info">
                          <h4>{item.name}</h4>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                            <p>₹{item.price}</p>
                            {item.unit === 'Piece' ? (
                              <div className="pos-qty-controls">
                                <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}><Minus size={14} /></button>
                                <span>{inCart ? inCart.quantity : 0}</span>
                                <button onClick={(e) => { e.stopPropagation(); inCart ? updateQuantity(item.id, 1) : handleItemClick(item); }}><Plus size={14} /></button>
                              </div>
                            ) : (
                              <button className="pos-weight-btn" onClick={() => handleItemClick(item)}><Scale size={14} /></button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
              <div className="billing-right-panel">
                <h3 style={{ marginBottom: '20px' }}><ShoppingBag size={20} /> Order Summary</h3>
                <div className="summary-items">
                  {cart.map((item, idx) => (
                    <div key={idx} className="summary-item-row">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>₹{item.price} / {item.unit === 'Weight' ? 'kg' : 'pc'}</div>
                      </div>
                      <div className="summary-qty-section">
                        {item.unit === 'Weight' ? (
                          <div className="pos-qty-controls">
                            <button onClick={() => handleItemClick(storeItems.find(si => si.id === item.id))} title="Edit Weight">
                              <Scale size={14} />
                            </button>
                            <span style={{ minWidth: '40px', textAlign: 'center' }}>{item.quantity}kg</span>
                            <button onClick={() => handleItemClick(storeItems.find(si => si.id === item.id))} title="Edit Weight">
                              <Plus size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="pos-qty-controls">
                            <button onClick={() => updateQuantity(item.id, -1)}><Minus size={14} /></button>
                            <span style={{ minWidth: '40px', textAlign: 'center' }}>{item.quantity}</span>
                            <button onClick={() => updateQuantity(item.id, 1)}><Plus size={14} /></button>
                          </div>
                        )}
                        <div style={{ fontWeight: '700', minWidth: '80px', textAlign: 'right' }}>₹{item.total.toFixed(2)}</div>
                        <button onClick={() => setCart(cart.filter((_, i) => i !== idx))} style={{ color: '#ef4444', background: 'none', marginLeft: '10px' }}><X size={16} /></button>
                      </div>

                    </div>
                  ))}
                </div>

                <div className="summary-total">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Discount (₹)</label>
                    <input 
                      type="number"
                      placeholder="0.00"
                      value={posDiscount}
                      onChange={(e) => setPosDiscount(e.target.value)}
                      style={{
                        height: '38px',
                        padding: '0 12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '700',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {(() => {
                    const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
                    const discountVal = parseFloat(posDiscount) || 0;
                    const totalAmt = Math.max(0, cartTotal - discountVal);
                    const subtotalVal = totalAmt / 1.05;
                    const gstVal = totalAmt - subtotalVal;

                    return (
                      <div className="st-pos-breakdown" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 0 10px 0', borderBottom: '1.5px dashed var(--border-color)', marginBottom: '15px' }}>
                        {discountVal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                            <span>Cart Total</span>
                            <span>₹{cartTotal.toFixed(2)}</span>
                          </div>
                        )}
                        {discountVal > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#dc2626', fontWeight: '700' }}>
                            <span>Discount</span>
                            <span>-₹{discountVal.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                          <span>Subtotal (Excl. Tax)</span>
                          <span>₹{subtotalVal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                          <span>GST (5%)</span>
                          <span>₹{gstVal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '20px', fontWeight: '800', marginTop: '5px' }}>
                          <span>Total</span>
                          <span style={{ color: 'var(--primary-color)' }}>₹{totalAmt.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="payment-modes">{['Cash', 'UPI', 'Card'].map(mode => <button key={mode} className={`mode-btn ${paymentMode === mode ? 'active' : ''}`} onClick={() => setPaymentMode(mode)}>{mode}</button>)}</div>
                  <button className="stores-btn-save" style={{ width: '100%', height: '54px', marginTop: '20px' }} onClick={settleBill} disabled={submittingAccess}>
                    {submittingAccess ? <div className="loader"></div> : 'Settle Bill'}
                  </button>

                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weight Modal */}
      <AnimatePresence>
        {showWeightModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}><Scale size={32} /></div>
              <h3 className="modal-title">Enter Weight/Amount</h3>
              <div className="access-modal-form">
                <div><label>Weight (kg)</label><input type="number" step="0.001" value={weightInput.weight} onChange={(e) => handleWeightCalc('weight', e.target.value)} /></div>
                <div style={{ textAlign: 'center' }}>OR</div>
                <div><label>Amount (₹)</label><input type="number" value={weightInput.amount} onChange={(e) => handleWeightCalc('amount', e.target.value)} /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button type="button" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} onClick={confirmWeightAdd}>Add</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreDetails;
