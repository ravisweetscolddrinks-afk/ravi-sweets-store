import React, { useState, useEffect } from 'react';
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
  User,
  ArrowRight
} from 'lucide-react';
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
  getDocs
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './ManufacturingUnitDetails.css';

const ManufacturingUnitDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [unit, setUnit] = useState(null);
  const [orders, setOrders] = useState([]);
  const [packingUnits, setPackingUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPackingUnits = async () => {
      try {
        const snap = await getDocs(collection(db, 'packingUnits'));
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setPackingUnits(fetched);
      } catch (err) {
        console.error("Error fetching packing units:", err);
      }
    };
    fetchPackingUnits();
  }, []);

  useEffect(() => {
    const fetchUnit = async () => {
      try {
        const unitDoc = await getDoc(doc(db, 'manufacturing_units', id));
        if (unitDoc.exists()) {
          setUnit({ id: unitDoc.id, ...unitDoc.data() });
        } else {
          toast.error("Manufacturing unit not found");
          navigate('/manufacturing');
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
      
      // Filter orders that have at least one item from this manufacturing unit
      const unitOrders = allOrders.filter(order => 
        order.items.some(item => item.mUnitId === id)
      );
      
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
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  if (loading) {
    return <div className="mud-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>;
  }

  if (!unit) return null;

  return (
    <div className="mud-container">
      <button className="cd-back-btn" onClick={() => navigate('/manufacturing')}>
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
        <div className="mud-section-header">
          <h2><ShoppingBag size={20} /> Assigned Orders & Items</h2>
          <p>Displaying items that need preparation at this facility</p>
        </div>

        <div className="mud-orders-grid">
          {orders.length > 0 ? orders.map(order => {
            const pUnitName = packingUnits.find(pu => pu.id === order.pUnitId)?.name || '';
            return (
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

                {pUnitName && (
                  <div className="mud-customer-info" style={{ marginTop: '4px', color: '#059669', fontWeight: '700' }}>
                    <Package size={14} />
                    <span>Packing: <strong>{pUnitName}</strong></span>
                  </div>
                )}

              {order.mUnitDescription && (
                <div className="mud-unit-instructions">
                  <AlertCircle size={14} />
                  <p>{order.mUnitDescription}</p>
                </div>
              )}

              <div className="mud-items-list">
                {order.items.filter(item => item.mUnitId === id).map((item, idx) => {
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
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => updateItemStatus(order.id, originalIndex, item.status === 'preparation_complete' ? 'preparation_started' : 'preparation_complete')}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: '700',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              border: '1.5px solid ' + (item.status === 'preparation_complete' ? '#10b981' : '#edf2f7'),
                              background: item.status === 'preparation_complete' ? '#e6fdf5' : '#ffffff',
                              color: item.status === 'preparation_complete' ? '#047857' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              height: '28px',
                              lineHeight: '1'
                            }}
                          >
                            <CheckCircle2 size={12} style={{ color: item.status === 'preparation_complete' ? '#10b981' : 'inherit' }} />
                            Prep Complete
                          </button>
                          <button
                            onClick={() => updateItemStatus(order.id, originalIndex, item.status === 'moved_to_packing' ? 'preparation_started' : 'moved_to_packing')}
                            style={{
                              padding: '5px 10px',
                              fontSize: '11px',
                              fontWeight: '700',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              border: '1.5px solid ' + (item.status === 'moved_to_packing' ? '#3b82f6' : '#edf2f7'),
                              background: item.status === 'moved_to_packing' ? '#eff6ff' : '#ffffff',
                              color: item.status === 'moved_to_packing' ? '#1d4ed8' : '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              height: '28px',
                              lineHeight: '1'
                            }}
                          >
                            <ArrowRight size={12} style={{ color: item.status === 'moved_to_packing' ? '#3b82f6' : 'inherit' }} />
                            Move to Packing
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }) : (
            <div className="mud-empty-state">
              <Package size={48} />
              <h3>No Active Orders</h3>
              <p>There are no items currently assigned to this manufacturing unit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManufacturingUnitDetails;
