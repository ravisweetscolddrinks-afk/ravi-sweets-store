import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Phone, 
  MapPin, 
  ShoppingBag, 
  Plus, 
  Info,
  ShoppingCart,
  Heart,
  Home,
  Mail,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  where,
  updateDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';
import { generateGSTInvoice } from '../../utils/invoice';


const CustomerDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info'); // 'info', 'orders', 'cart', 'wishlist', 'addresses'
  const [expandedOrders, setExpandedOrders] = useState([]);

  useEffect(() => {
    let unsubscribeOrders = () => {};

    const loadData = async () => {
      try {
        // 1. Fetch Customer Info
        const customerDoc = await getDoc(doc(db, 'customers', id));
        if (customerDoc.exists()) {
          setCustomer({ id: customerDoc.id, ...customerDoc.data() });
        } else {
          toast.error("Customer not found");
          navigate('/customers');
          setLoading(false);
          return;
        }

        // 2. Subscribe to Orders
        const q = query(
          collection(db, 'orders'), 
          where('customerId', '==', id)
          // orderBy('createdAt', 'desc') // Temporarily commented to check index issue
        );
        
        unsubscribeOrders = onSnapshot(q, (snapshot) => {
          const fetchedOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Sort manually if index is missing for orderBy
          fetchedOrders.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setOrders(fetchedOrders);
          setLoading(false);
        }, (error) => {
          console.error("Orders sync error:", error);
          toast.error("Failed to sync orders");
          setLoading(false);
        });

      } catch (error) {
        console.error("Data load error:", error);
        toast.error("An error occurred while loading data");
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubscribeOrders();
    };
  }, [id, navigate]);

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
    return <div className="cd-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>;
  }

  if (!customer) return null;

  return (
    <div className="cd-container">
      <button className="cd-back-btn" onClick={() => navigate('/customers')}>
        <ArrowLeft size={18} /> Back to Customers
      </button>

      <div className="cd-header">
        <div className="cd-header-left">
          <div className="cd-main-icon">
            <User size={32} />
          </div>
          <div className="cd-header-info">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {customer.firstName} {customer.lastName}
              {customer.isB2B && (
                <span 
                  className="cust-type-badge" 
                  style={{ background: '#E0F2FE', color: '#0369A1', fontSize: '11px', padding: '4px 10px', borderRadius: '6px' }}
                >
                  B2B
                </span>
              )}
            </h1>
            <div className="cd-header-meta">
              <Phone size={14} /> {customer.mobileNumber}
            </div>
          </div>
        </div>
        <div className="cd-status-card">
          <span>Customer Status</span>
          <div className="cd-active-badge">Active</div>
        </div>
      </div>

      <div className="cd-tabs-nav">
        <div className={`cd-tab-tile ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
          <div className="cd-tile-icon"><Info size={18} /></div>
          <span>Info</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
          <div className="cd-tile-icon"><ShoppingBag size={18} /></div>
          <span>Orders</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'cart' ? 'active' : ''}`} onClick={() => setActiveTab('cart')}>
          <div className="cd-tile-icon"><ShoppingCart size={18} /></div>
          <span>Cart</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'wishlist' ? 'active' : ''}`} onClick={() => setActiveTab('wishlist')}>
          <div className="cd-tile-icon"><Heart size={18} /></div>
          <span>Wishlist</span>
        </div>
        <div className={`cd-tab-tile ${activeTab === 'addresses' ? 'active' : ''}`} onClick={() => setActiveTab('addresses')}>
          <div className="cd-tile-icon"><Home size={18} /></div>
          <span>Addresses</span>
        </div>
      </div>

      <div className="cd-tab-content">
        <AnimatePresence mode="wait">
          {activeTab === 'info' && (
            <motion.div 
              key="info"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-info-grid"
            >
              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon green"><User size={20} /></div>
                  <h3>Personal Details</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>First Name</label>
                    <span>{customer.firstName}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Last Name</label>
                    <span>{customer.lastName}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Mobile Number</label>
                    <span>{customer.mobileNumber}</span>
                  </div>
                  {customer.isB2B && (
                    <>
                      <div className="cd-info-row">
                        <label>Business Name</label>
                        <span style={{ fontWeight: '700' }}>{customer.businessName}</span>
                      </div>
                      <div className="cd-info-row">
                        <label>GST Number</label>
                        <span style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{customer.gstNumber}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon blue"><MapPin size={20} /></div>
                  <h3>Address Details</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>City</label>
                    <span>{customer.city || 'N/A'}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>State</label>
                    <span>{customer.state || 'N/A'}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Full Address</label>
                    <span>{customer.address || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="cd-info-card">
                <div className="cd-card-header">
                  <div className="cd-card-icon purple"><Clock size={20} /></div>
                  <h3>System Info</h3>
                </div>
                <div className="cd-card-body">
                  <div className="cd-info-row">
                    <label>Customer ID</label>
                    <span className="cd-id-text">{customer.id}</span>
                  </div>
                  <div className="cd-info-row">
                    <label>Registered On</label>
                    <span>{customer.createdAt?.toDate ? customer.createdAt.toDate().toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Orders History</h2>
                <button className="cd-btn-primary" onClick={() => navigate('/orders')}><Plus size={18} /> New Order</button>
              </div>
              
              {orders.length > 0 ? (
                <div className="cd-table-wrapper">
                  <table className="cd-table">
                    <thead>
                      <tr>
                        <th>Order ID</th>
                        <th>Date</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Action</th>
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
                            <td>{order.items.length} Items</td>
                            <td style={{ fontWeight: '700' }}>₹{order.totalAmount.toFixed(2)}</td>
                            <td>
                              <span className={`status-badge ${order.status}`} style={{ fontSize: '10px' }}>
                                {order.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td>
                              {(customer.isB2B || order.isB2B) && (
                                <button
                                  className="cd-btn-primary"
                                  style={{ padding: '4px 8px', fontSize: '11px', height: '24px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const enrichedOrder = {
                                      ...order,
                                      customerName: `${customer.firstName} ${customer.lastName}`,
                                      customerPhone: customer.mobileNumber,
                                      businessName: order.businessName || customer.businessName,
                                      gstNumber: order.gstNumber || customer.gstNumber,
                                      address: order.address || customer.address,
                                      city: order.city || customer.city,
                                      state: order.state || customer.state,
                                    };
                                    generateGSTInvoice(enrichedOrder);
                                  }}
                                  title="Generate GST Invoice"
                                >
                                  Invoice
                                </button>
                              )}
                            </td>
                          </tr>
                          {expandedOrders.includes(order.id) && (
                            <tr className="ord-accordion-row">
                              <td colSpan="6" style={{ padding: 0 }}>
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
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="cd-empty-state">
                  <ShoppingBag size={48} />
                  <p>No orders found for this customer.</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'cart' && (
            <motion.div 
              key="cart"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Shopping Cart</h2>
              </div>
              <div className="cd-empty-state">
                <ShoppingCart size={48} />
                <p>The customer's cart is empty.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'wishlist' && (
            <motion.div 
              key="wishlist"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Wishlist Items</h2>
              </div>
              <div className="cd-empty-state">
                <Heart size={48} />
                <p>The customer's wishlist is empty.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'addresses' && (
            <motion.div 
              key="addresses"
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="cd-placeholder-view"
            >
              <div className="cd-view-header">
                <h2>Saved Addresses</h2>
                <button className="cd-btn-primary"><Plus size={18} /> Add Address</button>
              </div>
              <div className="cd-empty-state">
                <Home size={48} />
                <p>No additional addresses found.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default CustomerDetails;
