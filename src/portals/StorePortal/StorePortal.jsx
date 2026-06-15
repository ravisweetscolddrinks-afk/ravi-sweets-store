import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { buildBillESCPOS, buildOrderESCPOS } from '../../utils/qzTray';
import { usePrinter } from '../../context/PrinterContext';
import logo from '../../assets/logo.png';
import { db } from '../../config/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  deleteDoc 
} from 'firebase/firestore';
import { 
  ShoppingBag, 
  Users, 
  CreditCard, 
  ChevronDown, 
  ChevronUp, 
  Printer, 
  Search, 
  Scale, 
  Minus, 
  Plus, 
  X, 
  Sparkles, 
  Phone, 
  MapPin, 
  User, 
  Check, 
  ArrowRight,
  TrendingUp,
  Receipt,
  FileText,
  AlertCircle,
  Calendar,
  Bluetooth,
  Trash2,
  Edit,
  Store,
  Package,
  Eye,
  Usb,
  RefreshCw,
  CheckCircle2,
  WifiOff,
  ClipboardList,
  Save,
  History,
  ChevronRight,
  QrCode,
  Camera
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StorePortal.css';
import '../../pages/Orders/Orders.css';
import Payments from '../../pages/Payments/Payments';
import { triggerWhatsAppOrderReady, triggerWhatsAppOrderConfirmation } from '../../utils/whatsapp';
import { sendEventNotification } from '../../utils/notificationService';


// --- Custom Searchable Dropdown ---
const CustomDropdown = ({ label, options, onSelect, selectedValue, placeholder, icon: Icon, onCreateClick, hasError, errorMsg }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    (opt.name || opt.firstName + ' ' + opt.lastName || '').toLowerCase().includes(search.toLowerCase()) ||
    (opt.mobileNumber || opt.phone || '').includes(search)
  );

  const selectedOption = options.find(opt => opt.id === selectedValue);

  return (
    <div className="ord-dropdown" ref={dropdownRef}>
      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>{label}</label>
      <div 
        className="ord-dropdown-trigger" 
        onClick={() => setIsOpen(!isOpen)}
        style={hasError ? { border: '1.5px solid #dc2626' } : {}}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Icon size={18} color="var(--primary-color)" />
          <span>
            {selectedOption 
              ? (selectedOption.name || selectedOption.firstName + ' ' + selectedOption.lastName) 
              : placeholder}
          </span>
        </div>
        <ChevronDown size={18} />
      </div>
      {hasError && (
        <span style={{ color: '#dc2626', fontSize: '11px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
          {errorMsg}
        </span>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="ord-dropdown-popover"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="ord-dropdown-search">
              <input 
                type="text" 
                placeholder="Search..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="ord-dropdown-list">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div 
                    key={opt.id} 
                    className="ord-dropdown-item"
                    onClick={() => {
                      onSelect(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <span className="name">{opt.name || opt.firstName + ' ' + opt.lastName}</span>
                    <span className="sub">{opt.mobileNumber || opt.phone || opt.city}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '15px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>No results found</div>
                  {onCreateClick && (
                    <button 
                      type="button"
                      className="ord-create-customer-dropdown-btn"
                      onClick={() => {
                        onCreateClick(search);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      style={{
                        background: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      + Create Customer
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DEFAULT_ITEM_IMAGE = logo;

// --- Accordion Payment Section Component with Inline Form ---
const AccordionPaymentSection = ({ order, isMobile = false }) => {
  const [timeline, setTimeline] = useState([]);
  const [loadingInst, setLoadingInst] = useState(true);
  const [addPayAmount, setAddPayAmount] = useState('');
  const [addPayMode, setAddPayMode] = useState('UPI');
  const [addPayNotes, setAddPayNotes] = useState('');
  const [addingPayment, setAddingPayment] = useState(false);

  const fetchTimeline = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'orders', order.id, 'installments'), orderBy('createdAt', 'asc')));
      setTimeline(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingInst(false);
    } catch (err) {
      console.error("Failed to load accordion installments:", err);
      setLoadingInst(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchTimeline();
    return () => { active = false; };
  }, [order.id]);

  const balanceDue = Number(order.totalAmount || 0) - Number(order.receivedAmount || 0);

  useEffect(() => {
    if (balanceDue > 0.01) {
      setAddPayAmount(balanceDue.toFixed(2));
    } else {
      setAddPayAmount('');
    }
  }, [order.id, order.receivedAmount]);

  const handleAddPaymentSubmit = async (e) => {
    e.preventDefault();
    const amountVal = parseFloat(addPayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }
    if (amountVal > balanceDue + 0.01) {
      toast.error(`Payment amount cannot exceed the remaining balance of ₹${balanceDue.toFixed(2)}`);
      return;
    }

    setAddingPayment(true);
    try {
      const orderRef = doc(db, 'orders', order.id);
      const newReceived = (order.receivedAmount || 0) + amountVal;
      let newStatus = 'Pending';
      if (newReceived >= order.totalAmount - 0.01) {
        newStatus = 'Done';
      } else if (newReceived > 0) {
        newStatus = 'Partial';
      }

      await addDoc(collection(db, 'orders', order.id, 'installments'), {
        amount: amountVal,
        paymentMode: addPayMode,
        notes: addPayNotes || 'Subsequent Installment',
        createdAt: serverTimestamp()
      });

      await updateDoc(orderRef, {
        receivedAmount: newReceived,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp()
      });

      toast.success(`Payment of ₹${amountVal.toFixed(2)} recorded successfully!`);
      setAddPayNotes('');
      fetchTimeline();
    } catch (error) {
      console.error("Save Accordion Payment Error:", error);
      toast.error("Failed to save payment installment");
    } finally {
      setAddingPayment(false);
    }
  };

  if (isMobile) {
    return (
      <div className="ord-tab-panel animate-fade-in" style={{ fontSize: '12px' }}>
        <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
          <div className="ord-payment-summary-card" style={{ padding: '8px 4px' }}>
            <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Bill</h4>
            <p style={{ fontSize: '13px', fontWeight: '800' }}>₹{order.totalAmount.toFixed(0)}</p>
          </div>
          <div className="ord-payment-summary-card" style={{ padding: '8px 4px' }}>
            <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Paid</h4>
            <p style={{ fontSize: '13px', fontWeight: '800' }}>₹{order.receivedAmount.toFixed(0)}</p>
          </div>
          <div className={`ord-payment-summary-card due ${balanceDue <= 0 ? 'paid' : ''}`} style={{ padding: '8px 4px' }}>
            <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Due</h4>
            <p style={{ fontSize: '13px', fontWeight: '800' }}>₹{Math.max(0, balanceDue).toFixed(0)}</p>
          </div>
        </div>

        {balanceDue > 0.01 && (
          <form onSubmit={handleAddPaymentSubmit} style={{ marginTop: '0', marginBottom: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '11px', fontWeight: '800', marginBottom: '8px', color: 'var(--primary-color)', marginTop: '0' }}>Record New Payment</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    required
                    value={addPayAmount}
                    onChange={(e) => setAddPayAmount(e.target.value)}
                    max={balanceDue}
                    min="0.01"
                    style={{
                      height: '32px',
                      padding: '0 8px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      boxSizing: 'border-box',
                      width: '100%',
                      background: '#FFFFFF'
                    }}
                  />
                </div>
                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                  <div style={{ display: 'flex', gap: '3px', height: '32px' }}>
                    {['UPI', 'Cash', 'Card'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setAddPayMode(mode)}
                        style={{
                          flex: 1,
                          border: '1px solid ' + (addPayMode === mode ? 'var(--primary-color)' : 'var(--border-color)'),
                          background: addPayMode === mode ? 'var(--primary-color)' : '#FFFFFF',
                          color: addPayMode === mode ? '#FFFFFF' : 'var(--text-secondary)',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          padding: 0
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-secondary)' }}>Notes / Reference</label>
                <input
                  type="text"
                  placeholder="Reference note"
                  value={addPayNotes}
                  onChange={(e) => setAddPayNotes(e.target.value)}
                  style={{
                    height: '32px',
                    padding: '0 8px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    boxSizing: 'border-box',
                    width: '100%',
                    background: '#FFFFFF'
                  }}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingPayment}
              style={{
                width: '100%',
                height: '32px',
                background: 'var(--primary-color)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              {addingPayment ? (
                <div className="loader" style={{ width: '12px', height: '12px', borderTopColor: '#fff' }}></div>
              ) : (
                <>
                  <Plus size={12} /> Record Payment
                </>
              )}
            </button>
          </form>
        )}

        <div className="ord-installment-section">
          <h3 style={{ fontSize: '12px', marginBottom: '8px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '4px' }}>Installments</h3>
          <div className="ord-installment-timeline" style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {loadingInst ? (
              <div style={{ padding: '10px', textAlign: 'center', fontSize: '11px', color: '#64748b' }}>Loading timeline...</div>
            ) : timeline.length > 0 ? (
              timeline.map((inst, idx) => (
                <div key={inst.id || idx} className="ord-installment-card" style={{ padding: '6px 10px', margin: '4px 0', fontSize: '11px' }}>
                  <div className="ord-inst-left">
                    <span className="ord-inst-date" style={{ fontSize: '9px' }}>
                      {inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      }) : 'Just now'}
                    </span>
                    {inst.notes && <span className="ord-inst-note" style={{ fontSize: '10px' }}>{inst.notes}</span>}
                  </div>
                  <div className="ord-inst-right">
                    <span className="ord-inst-amount">₹{Number(inst.amount).toFixed(2)}</span>
                    <div>
                      <span className="ord-inst-mode" style={{ fontSize: '9px', padding: '1px 3px' }}>{inst.paymentMode || 'UPI'}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="ord-timeline-empty" style={{ fontSize: '11px', padding: '8px' }}>
                No installment payments recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop view
  return (
    <div className="ord-tab-panel animate-fade-in" style={{ padding: '10px 0' }}>
      <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '20px' }}>
        <div className="ord-payment-summary-card" style={{ padding: '12px' }}>
          <h4 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>Total Bill</h4>
          <p style={{ fontSize: '16px' }}>₹{order.totalAmount.toFixed(2)}</p>
        </div>
        <div className="ord-payment-summary-card" style={{ padding: '12px' }}>
          <h4 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>Total Paid</h4>
          <p style={{ fontSize: '16px' }}>₹{order.receivedAmount.toFixed(2)}</p>
        </div>
        <div className={`ord-payment-summary-card due ${balanceDue <= 0 ? 'paid' : ''}`} style={{ padding: '12px' }}>
          <h4 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>Balance Due</h4>
          <p style={{ fontSize: '16px' }}>₹{Math.max(0, balanceDue).toFixed(2)}</p>
        </div>
      </div>

      {/* Inline Installment Form */}
      {balanceDue > 0.01 && (
        <form onSubmit={handleAddPaymentSubmit} style={{ marginTop: '0', marginBottom: '24px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--primary-color)', marginTop: '0' }}>Record New Payment</h4>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                required
                value={addPayAmount}
                onChange={(e) => setAddPayAmount(e.target.value)}
                max={balanceDue}
                min="0.01"
                style={{
                  height: '36px',
                  padding: '0 10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '700',
                  boxSizing: 'border-box',
                  width: '100%',
                  background: '#FFFFFF'
                }}
              />
            </div>
            <div style={{ flex: 1.5, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
              <div style={{ display: 'flex', gap: '4px', height: '36px' }}>
                {['UPI', 'Cash', 'Card'].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAddPayMode(mode)}
                    style={{
                      flex: 1,
                      border: '1.5px solid ' + (addPayMode === mode ? 'var(--primary-color)' : 'var(--border-color)'),
                      background: addPayMode === mode ? 'var(--primary-color)' : '#FFFFFF',
                      color: addPayMode === mode ? '#FFFFFF' : 'var(--text-secondary)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Notes / Reference</label>
              <input
                type="text"
                placeholder="e.g. UPI ID or Installment note"
                value={addPayNotes}
                onChange={(e) => setAddPayNotes(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  width: '100%',
                  background: '#FFFFFF'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={addingPayment}
              style={{
                flex: 1,
                minWidth: '120px',
                height: '36px',
                background: 'var(--primary-color)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '800',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              {addingPayment ? (
                <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff' }}></div>
              ) : (
                <>
                  <Plus size={14} /> Record Payment
                </>
              )}
            </button>
          </div>
        </form>
      )}

      <div className="ord-installment-section">
        <h3 style={{ fontSize: '13px', marginBottom: '10px' }}>Installment Timeline</h3>
        <div className="ord-installment-timeline" style={{ maxHeight: '180px', overflowY: 'auto' }}>
          {loadingInst ? (
            <div style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>Loading timeline...</div>
          ) : timeline.length > 0 ? (
            timeline.map((inst, idx) => (
              <div key={inst.id || idx} className="ord-installment-card" style={{ padding: '8px 12px', margin: '4px 0', fontSize: '12px' }}>
                <div className="ord-inst-left">
                  <span className="ord-inst-date" style={{ fontSize: '10px' }}>
                    {inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    }) : 'Just now'}
                  </span>
                  {inst.notes && <span className="ord-inst-note" style={{ fontSize: '11px' }}>{inst.notes}</span>}
                </div>
                <div className="ord-inst-right">
                  <span className="ord-inst-amount">₹{Number(inst.amount).toFixed(2)}</span>
                  <div>
                    <span className="ord-inst-mode" style={{ fontSize: '10px', padding: '2px 4px' }}>{inst.paymentMode || 'UPI'}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="ord-timeline-empty" style={{ fontSize: '12px', padding: '10px' }}>
              No installment payments recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StorePortal = () => {
  const { id, tab } = useParams();
  const navigate = useNavigate();
  const printerCharacteristicRef = useRef(null);

  // Store metadata
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  // Orders State
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [previewOrder, setPreviewOrder] = useState(null);

  // Accordion Tabs & Preview states for Sync
  const [accordionTabs, setAccordionTabs] = useState({}); // { [orderId]: 'items' | 'payment' | 'packing' }
  const getAccordionTab = (orderId) => accordionTabs[orderId] || 'items';
  const setAccordionTab = (orderId, tabName) => setAccordionTabs(prev => ({ ...prev, [orderId]: tabName }));

  const [previewTab, setPreviewTab] = useState('items');
  const [previewInstallments, setPreviewInstallments] = useState([]);
  const [addPayAmount, setAddPayAmount] = useState('');
  const [addPayMode, setAddPayMode] = useState('UPI');
  const [addPayNotes, setAddPayNotes] = useState('');
  const [addingPayment, setAddingPayment] = useState(false);

  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');
  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState(id || 'All');
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getTomorrowStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (previewOrder) {
      const remaining = previewOrder.totalAmount - (previewOrder.receivedAmount || 0);
      setAddPayAmount(remaining > 0 ? remaining.toFixed(2) : '');
      setAddPayMode('UPI');
      setAddPayNotes('');

      const fetchInstallments = async () => {
        try {
          const snap = await getDocs(query(collection(db, 'orders', previewOrder.id, 'installments'), orderBy('createdAt', 'asc')));
          setPreviewInstallments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (err) {
          console.error("Failed to load installments:", err);
          setPreviewInstallments([]);
        }
      };
      fetchInstallments();
    } else {
      setPreviewInstallments([]);
    }
  }, [previewOrder]);

  const handleAddPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!previewOrder) return;

    const amountVal = parseFloat(addPayAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    const remaining = previewOrder.totalAmount - (previewOrder.receivedAmount || 0);
    if (amountVal > remaining + 0.01) {
      toast.error(`Payment amount cannot exceed the remaining balance of ₹${remaining.toFixed(2)}`);
      return;
    }

    setAddingPayment(true);
    try {
      const orderRef = doc(db, 'orders', previewOrder.id);
      const newReceived = (previewOrder.receivedAmount || 0) + amountVal;
      let newStatus = 'Pending';
      if (newReceived >= previewOrder.totalAmount - 0.01) {
        newStatus = 'Done';
      } else if (newReceived > 0) {
        newStatus = 'Partial';
      }

      // 1. Write the installment record
      await addDoc(collection(db, 'orders', previewOrder.id, 'installments'), {
        amount: amountVal,
        paymentMode: addPayMode,
        notes: addPayNotes || 'Subsequent Installment',
        createdAt: serverTimestamp()
      });

      // 2. Update parent order in Firestore
      await updateDoc(orderRef, {
        receivedAmount: newReceived,
        paymentStatus: newStatus,
        updatedAt: serverTimestamp()
      });

      // 3. Responsive state update
      setPreviewOrder(prev => ({
        ...prev,
        receivedAmount: newReceived,
        paymentStatus: newStatus
      }));

      toast.success(`Payment of ₹${amountVal.toFixed(2)} recorded successfully!`);
    } catch (error) {
      console.error("Save Preview Payment Error:", error);
      toast.error("Failed to save payment installment");
    } finally {
      setAddingPayment(false);
    }
  };

  // Customers State
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(true);

  // Billing & POS State
  const [billingSubTab, setBillingSubTab] = useState('pos'); // 'pos' or 'bills'
  const [billsFilterDate, setBillsFilterDate] = useState(new Date().toISOString().split('T')[0]); // defaults to today's date YYYY-MM-DD
  const [storeItems, setStoreItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [cart, setCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState('UPI');
  const [posDiscount, setPosDiscount] = useState('');
  const [billingSearch, setBillingSearch] = useState('');
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });
  const [submittingBill, setSubmittingBill] = useState(false);
  const [selectedReceiptBill, setSelectedReceiptBill] = useState(null); // receipt preview modal

  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    connectedDevice,
    qzConnected,
    qzPrinters,
    selectedQZPrinter,
    isScanningBt,
    btDevices,
    connectingBtDevice,
    showBluetoothModal,
    showQZModal,
    qzConnecting,
    setShowBluetoothModal,
    setShowQZModal,
    handleBluetoothConnect,
    restartBtScan,
    connectBtDevice,
    disconnectPrinter,
    connectQZTray,
    confirmQZPrinter,
    disconnectQZTray,
    printRawBLE,
    printRawUSB,
    setSelectedQZPrinter,
    showQZSetupGuide,
    setShowQZSetupGuide
  } = usePrinter();

  // --- ADD ORDER FUNCTIONALITY STATES ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('items'); // 'items' or 'summary'

  const [orderCustomers, setOrderCustomers] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [orderPUnits, setOrderPUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedPUnit, setSelectedPUnit] = useState('');
  const [globalDescription, setGlobalDescription] = useState('');
  const [mUnitDescription, setMUnitDescription] = useState('');
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [orderPaymentMode, setOrderPaymentMode] = useState('Cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [orderDiscount, setOrderDiscount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [orderCart, setOrderCart] = useState([]);
  const [formErrors, setFormErrors] = useState({});

  // Weight calculator for Order flow
  const [showOrderWeightModal, setShowOrderWeightModal] = useState(null);
  const [orderWeightInput, setOrderWeightInput] = useState({ weight: '', amount: '', description: '' });
  const [savingOrder, setSavingOrder] = useState(false);

  // Customer creation for Order flow
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [customerFormData, setCustomerFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    address: '',
    city: '',
    state: ''
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Store Worksheet tab states
  const [wsTab, setWsTab] = useState('active'); // 'active' or 'history'
  const [wsDate, setWsDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [wsQuantities, setWsQuantities] = useState({}); // { [itemId]: quantity }
  const [wsHistory, setWsHistory] = useState([]);
  const [wsItems, setWsItems] = useState([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsHistoryLoading, setWsHistoryLoading] = useState(false);
  const [wsSaving, setWsSaving] = useState(false);
  const [wsPreviewSheet, setWsPreviewSheet] = useState(null);
  const [activeWorksheet, setActiveWorksheet] = useState(null);
  const [wsSearch, setWsSearch] = useState('');

  // Store Scan QR Box states
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanSuccessBox, setScanSuccessBox] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const scanInputRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  // Synth pleasant chimes for hardware scanners
  const playSuccessSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc1 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 523.25; // C5
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc1.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.3);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 659.25; // E5
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.35);
      }, 90);
    } catch (e) {
      console.warn("AudioContext failed to initialize:", e);
    }
  };

  const playErrorSound = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 160;
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {}
  };

  // Unified Scanner Payload Database Processor
  const processScanPayload = async (payloadText) => {
    const cleanInput = payloadText.trim();
    if (!cleanInput) return false;

    setScanLoading(true);
    setScanError(null);
    setScanSuccessBox(null);

    let orderId = '';
    let boxId = '';

    try {
      const match = cleanInput.match(/\/scan-box\/([^\/]+)\/([^\/]+)/);
      if (match) {
        orderId = match[1];
        boxId = match[2];
      } else {
        const parts = cleanInput.split('/');
        if (parts.length >= 2) {
          orderId = parts[parts.length - 2];
          boxId = parts[parts.length - 1];
        } else {
          throw new Error("Invalid scanned content. Expected scan URL or Order/Box path.");
        }
      }

      if (!orderId || !boxId) {
        throw new Error("Missing Order ID or Box ID inside scanned content.");
      }

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error(`Order #${orderId} not found in database.`);
      }

      const order = { id: orderSnap.id, ...orderSnap.data() };

      if (!order.boxes || !Array.isArray(order.boxes)) {
        throw new Error("No boxes are recorded on this order.");
      }

      const boxIndex = order.boxes.findIndex(b => b.id === boxId);
      if (boxIndex === -1) {
        throw new Error("Scanned Box ID does not match any box in this order.");
      }

      const targetBox = order.boxes[boxIndex];

      if (targetBox.status === 'received_at_store' || targetBox.received) {
        setScanSuccessBox({
          boxNum: targetBox.boxNum,
          contents: targetBox.contents,
          orderId: order.orderId,
          serialNumber: order.serialNumber,
          alreadyReceived: true
        });
        playSuccessSound();
        toast.success(`Box #${targetBox.boxNum} is already received!`);
        return true;
      }

      const updatedBoxes = order.boxes.map((b, idx) => {
        if (idx === boxIndex) {
          return {
            ...b,
            received: true,
            status: 'received_at_store',
            receivedAt: new Date().toISOString()
          };
        }
        return b;
      });

      const allBoxesScanned = updatedBoxes.every(b => b.received === true || b.status === 'received_at_store');
      
      let updatedItems = order.items;
      let overallStatus = order.status || 'new';

      if (allBoxesScanned) {
        updatedItems = order.items.map(item => ({
          ...item,
          status: 'received_at_store'
        }));
        overallStatus = 'Ready for Delivery';

        // Trigger WhatsApp notification for Order Ready template
        const fullOrderForNotify = {
          ...order,
          boxes: updatedBoxes,
          items: updatedItems,
          status: overallStatus
        };
        setTimeout(() => triggerWhatsAppOrderReady(fullOrderForNotify), 500);
      }

      await updateDoc(orderRef, {
        boxes: updatedBoxes,
        items: updatedItems,
        status: overallStatus,
        updatedAt: serverTimestamp()
      });

      const successInfo = {
        boxNum: targetBox.boxNum,
        contents: targetBox.contents,
        orderId: order.orderId,
        serialNumber: order.serialNumber,
        scannedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      const scannedCount = updatedBoxes.filter(b => b.received || b.status === 'received_at_store').length;
      const totalCount = updatedBoxes.length;

      setScanSuccessBox(successInfo);
      setRecentScans(prev => [successInfo, ...prev]);
      playSuccessSound();

      if (allBoxesScanned) {
        toast.success(`All ${totalCount} boxes scanned! Order #${order.orderId} is now Ready for Delivery!`);
      } else {
        toast.success(`Box #${targetBox.boxNum} received! (${scannedCount}/${totalCount} boxes scanned)`);
      }
      return true;

    } catch (err) {
      console.error("Scan Processing Error:", err);
      setScanError(err.message || "Failed to process box scan.");
      playErrorSound();
      toast.error(err.message || "Failed to process scan.");
      return false;
    } finally {
      setScanLoading(false);
    }
  };

  // Automatically trigger camera QR scanner when scan tab mounts and store loads
  useEffect(() => {
    if (tab === 'scan' && !loading) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [tab, loading]);

  // Keep scanner focused globally to intercept typing gun inputs
  const handleScanPageClick = () => {
    if (tab === 'scan' && scanInputRef.current && !cameraActive) {
      scanInputRef.current.focus();
    }
  };

  const handleScanSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanInput = scanInput.trim();
    if (!cleanInput) return;

    await processScanPayload(cleanInput);
    setScanInput('');
    setTimeout(() => {
      if (scanInputRef.current) scanInputRef.current.focus();
    }, 100);
  };

  // Camera QR Scanner Lifecycle Controllers
  const startCamera = async () => {
    setCameraActive(true);
    setScanError(null);
    setScanSuccessBox(null);
    
    // Dynamic import to support client-side bundling safely
    const { Html5Qrcode } = await import('html5-qrcode');
    
    setTimeout(async () => {
      try {
        const html5QrCode = new Html5Qrcode("st-camera-reader");
        html5QrCodeRef.current = html5QrCode;
        
        const config = { 
          fps: 10, 
          qrbox: (width, height) => {
            const size = Math.min(width, height) * 0.7;
            return { width: size, height: size };
          } 
        };
        
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            // Stop camera and process payload
            await stopCamera();
            await processScanPayload(decodedText);
          },
          (errorMessage) => {
            // silent during frame drops
          }
        );
      } catch (err) {
        console.error("Camera access failure:", err);
        setScanError("Failed to access camera. Make sure webcam/camera permissions are granted.");
        setCameraActive(false);
        playErrorSound();
        
        // Focus the barcode gun input as fallback
        setTimeout(() => {
          if (scanInputRef.current) {
            scanInputRef.current.focus();
          }
        }, 100);
      }
    }, 200);
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        console.error("Failed to stop camera:", e);
      }
      html5QrCodeRef.current = null;
    }
    setCameraActive(false);
    
    // Focus the barcode gun input when the camera modal is closed/cancelled
    setTimeout(() => {
      if (scanInputRef.current) {
        scanInputRef.current.focus();
      }
    }, 100);
  };



  // Store Worksheet - Fetch Items on tab active
  useEffect(() => {
    if (tab === 'worksheet') {
      const fetchItemsForWorksheet = async () => {
        setWsLoading(true);
        try {
          const itemsSnap = await getDocs(query(collection(db, 'items'), orderBy('name', 'asc')));
          const fetchedItems = itemsSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(item => item.showInWorksheet !== false);
          setWsItems(fetchedItems);
        } catch (err) {
          console.error("Error fetching items for worksheet:", err);
          toast.error("Failed to load catalog items.");
        } finally {
          setWsLoading(false);
        }
      };
      fetchItemsForWorksheet();
    }
  }, [tab]);

  // Fetch/subscribe to the worksheet for the selected date reactively
  useEffect(() => {
    if (tab === 'worksheet' && wsDate) {
      const q = query(collection(db, 'store_worksheets'), where('date', '==', wsDate));
      
      const unsubscribe = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          setActiveWorksheet({ id: snap.docs[0].id, ...docData });
          
          const globalQuantities = docData.quantities || {};
          const storeQuantities = {};
          Object.entries(globalQuantities).forEach(([itemId, storeQtyMap]) => {
            if (storeQtyMap && storeQtyMap[id] !== undefined) {
              storeQuantities[itemId] = storeQtyMap[id];
            }
          });
          setWsQuantities(storeQuantities);
        } else {
          setActiveWorksheet(null);
          setWsQuantities({});
        }
      }, (err) => {
        console.error("Error subscribing to worksheet in StorePortal:", err);
      });

      return () => unsubscribe();
    }
  }, [tab, wsDate, id]);

  // Fetch worksheet history for this store
  const fetchWorksheetHistory = async () => {
    setWsHistoryLoading(true);
    try {
      const q = query(collection(db, 'store_worksheets'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const allHistory = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const filteredHistory = allHistory.filter(sheet => {
        const globalQuantities = sheet.quantities || {};
        return Object.values(globalQuantities).some(storeQtyMap => storeQtyMap && storeQtyMap[id] > 0);
      });
      setWsHistory(filteredHistory);
    } catch (err) {
      console.error("Error fetching worksheet history:", err);
      toast.error("Failed to load history.");
    } finally {
      setWsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'worksheet' && wsTab === 'history') {
      fetchWorksheetHistory();
    }
  }, [tab, wsTab]);

  const handleWorksheetQtyChange = (itemId, value) => {
    const val = value === '' ? '' : parseFloat(value);
    setWsQuantities(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  const handleSaveWorksheet = async () => {
    if (!wsDate) {
      toast.error("Please select a date.");
      return;
    }

    setWsSaving(true);
    try {
      const q = query(collection(db, 'store_worksheets'), where('date', '==', wsDate));
      const snap = await getDocs(q);
      
      let mergedQuantities = {};
      let docId = null;

      if (!snap.empty) {
        docId = snap.docs[0].id;
        mergedQuantities = snap.docs[0].data().quantities || {};
      }

      wsItems.forEach(item => {
        const qty = wsQuantities[item.id];
        
        if (qty === '' || qty === 0 || isNaN(qty) || qty === undefined) {
          if (mergedQuantities[item.id]) {
            delete mergedQuantities[item.id][id];
            if (Object.keys(mergedQuantities[item.id]).length === 0) {
              delete mergedQuantities[item.id];
            }
          }
        } else {
          if (!mergedQuantities[item.id]) {
            mergedQuantities[item.id] = {};
          }
          mergedQuantities[item.id][id] = Number(qty);
        }
      });

      const worksheetPayload = {
        date: wsDate,
        quantities: mergedQuantities,
        updatedAt: serverTimestamp()
      };

      if (docId) {
        await updateDoc(doc(db, 'store_worksheets', docId), worksheetPayload);
        toast.success(`Store worksheet for ${wsDate} updated successfully!`);
      } else {
        await addDoc(collection(db, 'store_worksheets'), {
          ...worksheetPayload,
          createdAt: serverTimestamp()
        });
        toast.success(`Store worksheet for ${wsDate} saved successfully!`);
      }
    } catch (err) {
      console.error("Error saving store worksheet:", err);
      toast.error("Failed to save worksheet.");
    } finally {
      setWsSaving(false);
    }
  };

  const links = [
    { label: 'Orders', icon: <ShoppingBag size={20} />, path: `/store-portal/${id}/orders` },
    { label: 'Customers', icon: <Users size={20} />, path: `/store-portal/${id}/customers` },
    { label: 'Payments', icon: <CreditCard size={20} />, path: `/store-portal/${id}/payments` },
    { label: 'Store Worksheet', icon: <ClipboardList size={20} />, path: `/store-portal/${id}/worksheet` },
    { label: 'Billing & POS', icon: <CreditCard size={20} />, path: `/store-portal/${id}/billing` },
    { label: 'Scan Box', icon: <QrCode size={20} />, path: `/store-portal/${id}/scan` }
  ];

  // Helper function to match dates across local format variations securely
  const isSameDay = (billDateStr, selectedDateStr) => {
    if (!billDateStr || !selectedDateStr) return false;
    
    // selectedDateStr is always YYYY-MM-DD
    const [selYear, selMonth, selDay] = selectedDateStr.split('-').map(Number);
    
    try {
      // 1. Slash format (DD/MM/YYYY or MM/DD/YYYY)
      if (billDateStr.includes('/')) {
        const parts = billDateStr.split('/');
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
      if (billDateStr.includes('-')) {
        const parts = billDateStr.split('-');
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
      const parsed = new Date(billDateStr);
      if (!isNaN(parsed.getTime())) {
        return parsed.getFullYear() === selYear && 
               parsed.getMonth() === (selMonth - 1) && 
               parsed.getDate() === selDay;
      }
    } catch (e) {
      console.error("Error parsing bill date:", e);
    }
    return false;
  };

  // Fetch Store Profile
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const storeDoc = await getDoc(doc(db, 'stores', id));
        if (storeDoc.exists()) {
          setStore({ id: storeDoc.id, ...storeDoc.data() });
        } else {
          toast.error("Store profile not found");
          navigate('/onboarding');
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load store profile");
      } finally {
        setLoading(false);
      }
    };
    fetchStore();
  }, [id, navigate]);

  // Fetch All Stores for Filter
  useEffect(() => {
    const fetchAllStores = async () => {
      try {
        console.log("StorePortal: Fetching all stores...");
        const snap = await getDocs(collection(db, 'stores'));
        const fetchedStores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetchedStores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        console.log("StorePortal: Fetched stores successfully:", fetchedStores);
        setStores(fetchedStores);
      } catch (error) {
        console.error("Failed to load all stores in StorePortal:", error);
        toast.error("Failed to load stores: " + error.message);
      }
    };
    fetchAllStores();
  }, []);

  // Fetch Orders of the Store
  useEffect(() => {
    if (tab === 'orders') {
      const q = query(
        collection(db, 'orders')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetched.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setOrders(fetched);
      });
      return () => unsubscribe();
    }
  }, [tab]);

  // Fetch Customers List (Read-Only)
  useEffect(() => {
    if (tab === 'customers') {
      setCustomersLoading(true);
      const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCustomersLoading(false);
      });
      return () => unsubscribe();
    }
  }, [tab]);

  // Fetch Store Items & Bills for Billing Tab
  useEffect(() => {
    if (tab === 'billing') {
      console.log("Subscribing to global items in StorePortal...");
      const itemsQ = query(collection(db, 'items'));
      const itemsUnsubscribe = onSnapshot(itemsQ, (snapshot) => {
        const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort items alphabetically by name locally to avoid Firestore indexing drops
        fetchedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        console.log("Fetched items in StorePortal:", fetchedItems.length);
        setStoreItems(fetchedItems);
      }, (error) => {
        console.error("Firestore items sub error in StorePortal:", error);
        toast.error("Failed to load catalog items.");
      });

      const billsQ = query(collection(db, 'stores', id, 'bills'), orderBy('createdAt', 'desc'));
      const billsUnsubscribe = onSnapshot(billsQ, (snapshot) => {
        setBills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        console.error("Firestore bills sub error in StorePortal:", error);
      });

      return () => {
        itemsUnsubscribe();
        billsUnsubscribe();
      };
    }
  }, [id, tab]);

  // --- FETCH DATA FOR ADD ORDER MODAL ---
  useEffect(() => {
    if (showAddModal) {
      const fetchModalData = async () => {
        try {
          const [custSnap, itemSnap, puSnap, catSnap] = await Promise.all([
            getDocs(query(collection(db, 'customers'), orderBy('firstName', 'asc'))),
            getDocs(query(collection(db, 'items'))),
            getDocs(query(collection(db, 'packing_units'), orderBy('name', 'asc'))),
            getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
          ]);

          const fetchedCustomers = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          fetchedCustomers.sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
          setOrderCustomers(fetchedCustomers);

          const fetchedItems = itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          fetchedItems.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          setOrderItems(fetchedItems);

          setOrderPUnits(puSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setCategories(catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching modal data:", error);
          toast.error("Failed to load customer or item list.");
        }
      };
      fetchModalData();
    }
  }, [showAddModal]);

  if (!tab) return <Navigate to={`/store-portal/${id}/orders`} replace />;

  if (loading) {
    return (
      <PortalLayout title="Store Portal" links={links}>
        <div className="st-portal-loading"><div className="loader"></div></div>
      </PortalLayout>
    );
  }

  // --- Accordion Controls for Orders ---
  const toggleOrderAccordion = (orderId) => {
    setExpandedOrders(prev => prev.includes(orderId) ? prev.filter(oId => oId !== orderId) : [...prev, orderId]);
  };

  const calculateOverallOrderStatus = (items) => {
    if (!items || items.length === 0) return 'new';
    
    const getStatus = (item) => (item.status || 'preparation_started').toLowerCase().trim();
    
    // Check if ALL items are delivered
    const allDelivered = items.every(item => getStatus(item) === 'delivered');
    if (allDelivered) return 'Delivered';
    
    // Check if ALL items are at least received_at_store
    const allReceived = items.every(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (allReceived) return 'Ready for Delivery';
    
    // Check if SOME items are at least received_at_store
    const someReceived = items.some(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (someReceived) return 'Partially Ready for Delivery';
    
    // Check if ALL items are at least moved_to_store
    const allMoved = items.every(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (allMoved) return 'Moved to Store';
    
    // Check if SOME items are at least moved_to_store
    const someMoved = items.some(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (someMoved) return 'Partially Moved to Store';
    
    // Check if ANY item has progressed beyond preparation_started (or new/empty status)
    const hasProgressed = items.some(item => {
      const st = getStatus(item);
      return st !== 'preparation_started' && st !== 'new' && st !== '';
    });
    
    if (hasProgressed) return 'In Progress';
    
    return 'new';
  };

  const getStatusLabel = (status) => {
    if (!status) return 'NEW';
    return status.replace(/_/g, ' ').toUpperCase();
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
      toast.success("Item preparation status updated!");

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
      toast.error("Failed to update item status");
    }
  };

  // --- ADD ORDER CART & CHECKOUT OPERATIONS ---
  const handleItemClickOrder = (item) => {
    const existing = orderCart.find(c => c.id === item.id);
    if (item.unit === 'Weight') {
      setShowOrderWeightModal(item);
      setOrderWeightInput({
        weight: existing ? existing.quantity.toString() : '',
        amount: existing ? existing.total.toString() : '',
        description: existing ? existing.description || '' : ''
      });
    } else {
      addToCartOrder(item, 1, item.price);
    }
  };

  const handleOrderWeightCalc = (type, value, price) => {
    if (type === 'weight') {
      const amt = (parseFloat(value) * price).toFixed(2);
      setOrderWeightInput(prev => ({ ...prev, weight: value, amount: isNaN(amt) ? '' : amt }));
    } else {
      const wt = (parseFloat(value) / price).toFixed(3);
      setOrderWeightInput(prev => ({ ...prev, weight: isNaN(wt) ? '' : wt, amount: value }));
    }
  };

  const confirmOrderWeightAdd = () => {
    if (!orderWeightInput.weight || !orderWeightInput.amount) {
      toast.error("Please enter weight or amount");
      return;
    }
    addToCartOrder(showOrderWeightModal, orderWeightInput.weight, orderWeightInput.amount, orderWeightInput.description);
    setShowOrderWeightModal(null);
  };

  const addToCartOrder = (item, quantity, total, itemDescription = '') => {
    setOrderCart(prev => {
      const existingIndex = prev.findIndex(c => c.id === item.id);
      if (existingIndex > -1) {
        const newCart = [...prev];
        if (item.unit !== 'Weight') {
          newCart[existingIndex].quantity += Number(quantity);
          newCart[existingIndex].total = newCart[existingIndex].quantity * item.price;
        } else {
          newCart[existingIndex].quantity = Number(quantity);
          newCart[existingIndex].total = Number(total);
          newCart[existingIndex].description = itemDescription;
        }
        return newCart;
      } else {
        return [...prev, {
          id: item.id,
          name: item.name,
          price: item.price,
          unit: item.unit,
          quantity: Number(quantity),
          total: Number(total),
          description: itemDescription,
          mUnitId: item.mUnitId || '',
          status: 'preparation_started'
        }];
      }
    });
    toast.success(`${item.name} added`);
  };

  const updateCartQuantityOrder = (id, delta) => {
    setOrderCart(prev => prev.map(c => {
      if (c.id === id) {
        const newQty = c.quantity + delta;
        if (newQty < 1) return c;
        return { ...c, quantity: newQty, total: newQty * c.price };
      }
      return c;
    }));
  };

  const handleEditCartItemOrder = (item) => {
    const originalItem = orderItems.find(i => i.id === item.id);
    if (!originalItem) return;
    setShowOrderWeightModal(originalItem);
    setOrderWeightInput({
      weight: item.quantity.toString(),
      amount: item.total.toString(),
      description: item.description || ''
    });
  };

  const removeFromCartOrder = (id) => {
    setOrderCart(prev => prev.filter(c => c.id !== id));
  };

  const getNextOrderSequenceForDeliveryDate = async (storeId, deliveryDate) => {
    try {
      if (!deliveryDate) return 1;
      const q = query(
        collection(db, 'orders'),
        where('deliveryDate', '==', deliveryDate)
      );
      const snapshot = await getDocs(q);
      let maxSeq = 0;
      snapshot.docs.forEach(doc => {
        const orderData = doc.data();
        if (orderData.storeId === storeId) {
          const serial = orderData.serialNumber;
          if (typeof serial === 'number' && serial > maxSeq) {
            maxSeq = serial;
          }
        }
      });
      return maxSeq + 1;
    } catch (err) {
      console.error("Error calculating sequence for delivery date in StorePortal:", err);
      return 1;
    }
  };

  const generateOrderId = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const DD = pad(now.getDate());
    const MM = pad(now.getMonth() + 1);
    const YY = now.getFullYear().toString().slice(-2);
    const HH = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const SS = pad(now.getSeconds());
    return `${DD}${MM}${YY}${HH}${mm}${SS}`;
  };

  const resetFormOrder = () => {
    setSelectedCustomer('');
    setSelectedPUnit('');
    setGlobalDescription('');
    setMUnitDescription('');
    setPUnitDescription('');
    setOrderCart([]);
    setOrderPaymentMode('Cash');
    setReceivedAmount('');
    setOrderDiscount('');
    setDeliveryDate('');
    setDeliveryTime('');
    setEditingOrderId(null);
    setItemSearchQuery('');
    setSelectedCategoryFilter('All');
    setActiveModalTab('items');
    setFormErrors({});
  };


  const saveOrder = async () => {
    const errors = {};
    if (!selectedCustomer) errors.customer = "Customer is required";
    if (!selectedPUnit) errors.pUnit = "Packing Unit is required";
    if (!deliveryDate) errors.deliveryDate = "Delivery Date is required";
    if (!deliveryTime) errors.deliveryTime = "Delivery Time is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActiveModalTab('items');
      toast.error("Please fill in all mandatory fields");
      return;
    }

    if (orderCart.length === 0) return toast.error("Order cart is empty");

    setFormErrors({});
    setSavingOrder(true);
    try {
      let orderId = '';
      let serialNumber = 1;
      if (editingOrderId) {
        const existingOrder = orders.find(o => o.id === editingOrderId);
        orderId = existingOrder?.orderId || generateOrderId();
        serialNumber = existingOrder?.serialNumber || 1;
      } else {
        const seq = await getNextOrderSequenceForDeliveryDate(id, deliveryDate);
        orderId = generateOrderId();
        serialNumber = seq;
      }
      const customer = orderCustomers.find(c => c.id === selectedCustomer);
      const cartTotalAmt = orderCart.reduce((sum, item) => sum + item.total, 0);
      const discountVal = parseFloat(orderDiscount) || 0;
      const totalAmt = Math.max(0, cartTotalAmt - discountVal);
      const recAmtVal = parseFloat(receivedAmount) || 0;
      let payStatus = 'Pending';
      if (recAmtVal > 0) {
        if (recAmtVal >= totalAmt) {
          payStatus = 'Done';
        } else {
          payStatus = 'Partial';
        }
      }

      const orderData = {
        orderId,
        serialNumber,
        customerId: selectedCustomer,
        customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
        customerPhone: customer.mobileNumber,
        isB2B: customer.isB2B || false,
        businessName: customer.businessName || '',
        gstNumber: customer.gstNumber || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        storeId: id,
        storeName: store?.name || 'Ravi Sweets',
        pUnitId: selectedPUnit,
        globalDescription,
        mUnitDescription,
        pUnitDescription,
        items: orderCart,
        discount: discountVal,
        totalAmount: totalAmt,
        receivedAmount: recAmtVal,
        paymentStatus: payStatus,
        paymentMode: orderPaymentMode,
        deliveryDate,
        deliveryTime,
        status: calculateOverallOrderStatus(orderCart),
        createdAt: editingOrderId ? (orders.find(o => o.id === editingOrderId)?.createdAt || serverTimestamp()) : serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const oldOrder = editingOrderId ? orders.find(o => o.id === editingOrderId) : null;
      const statusChangedToReady = (!oldOrder || oldOrder.status !== 'Ready for Delivery') && orderData.status === 'Ready for Delivery';

      if (editingOrderId) {
        await updateDoc(doc(db, 'orders', editingOrderId), orderData);
        toast.success(`Order #${orderId} updated successfully!`);
      } else {
        const orderRef = await addDoc(collection(db, 'orders'), orderData);
        if (recAmtVal > 0) {
          await addDoc(collection(db, 'orders', orderRef.id, 'installments'), {
            amount: recAmtVal,
            paymentMode: orderPaymentMode,
            notes: 'Initial Down Payment',
            createdAt: serverTimestamp()
          });
        }
        toast.success(`Order #${orderId} placed successfully!`);
        setTimeout(() => triggerWhatsAppOrderConfirmation({ id: orderRef.id, ...orderData }), 500);

        // Send notifications to all unique manufacturing units associated with the order items
        try {
          const uniqueMUnitIds = [...new Set(orderCart.map(item => item.mUnitId).filter(Boolean))];
          uniqueMUnitIds.forEach(mUnitId => {
            sendEventNotification('order_assigned_to_munit', mUnitId, {
              orderId: orderId,
              customerName: orderData.customerName || 'Customer',
              mUnitId: mUnitId
            });
          });
        } catch (err) {
          console.error("Failed to send order creation notification:", err);
        }
      }

      if (statusChangedToReady) {
        setTimeout(() => triggerWhatsAppOrderReady(orderData), 500);
      }

      setShowAddModal(false);
      resetFormOrder();
    } catch (error) {
      console.error("Save Order Error:", error);
      toast.error("Failed to save customer order");
    } finally {
      setSavingOrder(false);
    }
  };

  const handleOpenCreateCustomer = (searchVal) => {
    let initialPhone = '';
    let initialFirstName = '';
    
    if (/^\d+$/.test(searchVal)) {
      initialPhone = searchVal;
    } else {
      initialFirstName = searchVal;
    }

    setCustomerFormData({
      firstName: initialFirstName,
      lastName: '',
      mobileNumber: initialPhone,
      address: '',
      city: '',
      state: '',
      isB2B: false,
      businessName: '',
      gstNumber: ''
    });
    setShowCreateCustomerModal(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerFormData.firstName || !customerFormData.lastName || !customerFormData.mobileNumber) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (customerFormData.isB2B && (!customerFormData.businessName || !customerFormData.gstNumber)) {
      toast.error("Business Name and GST Number are required for B2B customers");
      return;
    }
    setSavingCustomer(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customerFormData,
        createdAt: serverTimestamp()
      });
      
      const newCust = {
        id: docRef.id,
        ...customerFormData
      };
      
      setOrderCustomers(prev => [newCust, ...prev].sort((a, b) => a.firstName.localeCompare(b.firstName)));
      setSelectedCustomer(docRef.id);
      
      toast.success("Customer created and selected!");
      setShowCreateCustomerModal(false);
    } catch (error) {
      console.error("Failed to save customer:", error);
      toast.error("Error creating customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleEditOrder = (order) => {
    setSelectedCustomer(order.customerId);
    setSelectedPUnit(order.pUnitId || '');
    setGlobalDescription(order.globalDescription || '');
    setMUnitDescription(order.mUnitDescription || '');
    setPUnitDescription(order.pUnitDescription || '');
    setOrderPaymentMode(order.paymentMode || 'Cash');
    setReceivedAmount(order.receivedAmount !== undefined ? order.receivedAmount.toString() : '');
    setOrderDiscount(order.discount !== undefined ? order.discount.toString() : '');
    setDeliveryDate(order.deliveryDate || '');
    setDeliveryTime(order.deliveryTime || '');
    setOrderCart(order.items || []);
    setEditingOrderId(order.id);
    setShowAddModal(true);
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm("Are you sure you want to permanently delete this order?")) {
      try {
        await deleteDoc(doc(db, 'orders', orderId));
        toast.success("Order deleted successfully");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete order");
      }
    }
  };

  const handlePrintOrderReceipt = (order) => {
    const divider = '--------------------------------';
    const printContent = `
      <html>
        <head>
          <title>Order - ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm 3mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              width: 72mm;
              max-width: 72mm;
              margin: 0 auto;
              padding: 0;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .store-name { font-size: 16px; font-weight: bold; text-align: center; margin: 4px 0 2px; }
            .store-sub { font-size: 11px; text-align: center; margin-bottom: 6px; }
            .divider { border: none; border-top: 1px dashed #000; margin: 5px 0; }
            .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 1px 0; }
            table { width: 100%; border-collapse: collapse; margin: 4px 0; }
            th { font-size: 11px; font-weight: bold; text-align: left; padding: 2px 1px; border-bottom: 1px dashed #000; }
            th.right, td.right { text-align: right; }
            td { font-size: 11px; padding: 2px 1px; border-bottom: 1px dashed #eee; vertical-align: top; }
            .total-section { margin-top: 6px; }
            .total-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; padding: 3px 0; border-top: 1px solid #000; }
            .footer { text-align: center; font-size: 11px; margin-top: 8px; }
            @media print {
              body { width: 72mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="center" style="margin-bottom: 4px;">
            <img src="${logo}" alt="Logo" style="max-height: 40px; width: auto; object-fit: contain;" />
          </div>
          <div class="store-name">RAVI SWEETS</div>
          <div class="store-sub">${order.storeName || 'Store'}</div>
          <div class="store-sub">Quality Sweets & Savouries</div>
          <hr class="divider">
          <div class="info-row"><span><b>Order#:</b> ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : order.orderId}</span><span>${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN') : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-IN') : '')}</span></div>
          <div class="info-row"><span><b>Customer:</b> ${order.customerName}</span></div>
          <div class="info-row"><span><b>Phone:</b> ${order.customerPhone}</span></div>
          ${order.deliveryDate ? `<div class="info-row"><span><b>Delivery:</b> ${order.deliveryDate} ${order.deliveryTime || ''}</span></div>` : ''}
          <hr class="divider">
          <table>
            <thead>
              <tr>
                <th style="width:50%">Item</th>
                <th class="right" style="width:25%">Qty</th>
                <th class="right" style="width:25%">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td class="right">${item.unit === 'Weight' ? item.quantity + 'kg' : item.quantity + 'pc'}</td>
                  <td class="right">Rs.${Number(item.total).toFixed(0)}</td>
                </tr>
                ${item.description ? `<tr><td colspan="3" style="font-size:10px;color:#555;padding-left:4px;">  ${item.description}</td></tr>` : ''}
              `).join('')}
            </tbody>
          </table>
          <hr class="divider">
          ${Number(order.discount || 0) > 0 ? `
            <div class="info-row" style="font-size:11px;"><span>Cart Total:</span><span>Rs.${(Number(order.totalAmount || 0) + Number(order.discount || 0)).toFixed(2)}</span></div>
            <div class="info-row" style="font-size:11px; color: #dc2626;"><span>Discount:</span><span>-Rs.${Number(order.discount || 0).toFixed(2)}</span></div>
          ` : ''}
          <div class="info-row" style="font-size:11px;"><span>Subtotal (Excl. Tax):</span><span>Rs.${(Number(order.totalAmount || 0) / 1.05).toFixed(2)}</span></div>
          <div class="info-row" style="font-size:11px;"><span>GST (5%):</span><span>Rs.${(Number(order.totalAmount || 0) - (Number(order.totalAmount || 0) / 1.05)).toFixed(2)}</span></div>
          <div class="total-row"><span>GRAND TOTAL</span><span>Rs.${Number(order.totalAmount).toFixed(2)}</span></div>
          <div class="info-row" style="font-size:11px;"><span>Received:</span><span>Rs.${Number(order.receivedAmount || 0).toFixed(2)}</span></div>
          <div class="info-row" style="font-size:11px; font-weight: bold;"><span>Balance Due:</span><span>Rs.${(Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)).toFixed(2)}</span></div>
          <hr class="divider">
          <div class="footer">Thank you for your business!</div>
          <div class="footer">Please visit again.</div>
          <br>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=420,height=700');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 400);
  };

  const printOrderDirectToBluetooth = async (order) => {
    toast.loading("Sending order directly to Bluetooth thermal printer...", { id: 'bt-order-print-job' });

    try {
      const encoder = new TextEncoder();
      
      // ESC/POS Commands
      const INIT = new Uint8Array([0x1b, 0x40]);
      const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
      const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
      const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
      const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
      const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
      const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
      
      let bytes = [];
      
      bytes.push(...INIT);
      
      // Header
      bytes.push(...CENTER);
      bytes.push(...DOUBLE_SIZE);
      bytes.push(...encoder.encode("RAVI SWEETS\n"));
      bytes.push(...NORMAL_SIZE);
      bytes.push(...encoder.encode(`${order.storeName || 'Outlet Store'}\n`));
      bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Order Details
      bytes.push(...LEFT);
      bytes.push(...encoder.encode(`Order ID: ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}\n`));
      bytes.push(...encoder.encode(`Customer: ${order.customerName}\n`));
      bytes.push(...encoder.encode(`Phone: ${order.customerPhone}\n`));
      bytes.push(...encoder.encode(`Date: ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : '')}\n`));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Table Header
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("Item            Qty      Total  \n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Items list
      order.items.forEach(item => {
        const qtyPart = (item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pc`).padEnd(8, ' ');
        const pricePart = `Rs.${Number(item.total).toFixed(0)}`.padStart(8, ' ');

        const maxNameLen = 14;
        let namePart1 = item.name;
        let namePart2 = '';

        if (namePart1.length > maxNameLen) {
          namePart1 = item.name.substring(0, maxNameLen);
          namePart2 = item.name.substring(maxNameLen);
        }

        bytes.push(...encoder.encode(`${namePart1.padEnd(14, ' ')} ${qtyPart} ${pricePart}\n`));

        while (namePart2.length > 0) {
          const chunk = namePart2.substring(0, maxNameLen);
          bytes.push(...encoder.encode(`${chunk.padEnd(14, ' ')} ${"".padEnd(8, ' ')} ${"".padStart(8, ' ')}\n`));
          namePart2 = namePart2.substring(maxNameLen);
        }
      });

      bytes.push(...encoder.encode("--------------------------------\n"));

      // Totals with GST details
      const totalVal = Number(order.totalAmount || 0);
      const discountVal = Number(order.discount || 0);
      const grossTotal = totalVal + discountVal;
      const subtotalVal = totalVal / 1.05;
      const gstVal = totalVal - subtotalVal;
      const advStr = `Rs.${Number(order.receivedAmount || 0).toFixed(2)}`;
      const balStr = `Rs.${(totalVal - Number(order.receivedAmount || 0)).toFixed(2)}`;

      if (discountVal > 0) {
        bytes.push(...encoder.encode(`${"Cart Total:".padEnd(22, ' ')}${`Rs.${grossTotal.toFixed(2)}`.padStart(10, ' ')}\n`));
        bytes.push(...encoder.encode(`${"Discount:".padEnd(22, ' ')}${`-Rs.${discountVal.toFixed(2)}`.padStart(10, ' ')}\n`));
      }
      bytes.push(...encoder.encode(`Subtotal: ${`Rs.${subtotalVal.toFixed(2)}`.padStart(22, ' ')}\n`));
      bytes.push(...encoder.encode(`GST (5%): ${`Rs.${gstVal.toFixed(2)}`.padStart(22, ' ')}\n`));
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode(`GRAND TOTAL: ${`Rs.${totalVal.toFixed(2)}`.padStart(19, ' ')}\n`));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode(`Advance Paid: ${advStr.padStart(18, ' ')}\n`));
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode(`Balance Due: ${balStr.padStart(20, ' ')}\n`));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Footer
      bytes.push(...CENTER);
      bytes.push(...encoder.encode("Thank you for your business!\n"));
      bytes.push(...encoder.encode("Please visit again.\n\n"));
      
      const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
      bytes.push(...CUT);

      const dataArray = new Uint8Array(bytes);
      
      await printRawBLE(dataArray);
      
      toast.dismiss('bt-order-print-job');
      toast.success("Order receipt printed successfully!");
    } catch (err) {
      console.error("Direct BLE order print error: ", err);
      toast.dismiss('bt-order-print-job');
      toast.error("Failed to print directly. Opening system print fallback...");
      handlePrintOrderReceipt(order);
    }
  };

  const handlePrintOrder = async (order) => {
    // Priority 1: Bluetooth BLE direct
    if (bluetoothConnected) {
      printOrderDirectToBluetooth(order);
      return;
    }
    // Priority 2: QZ Tray USB
    if (qzConnected && selectedQZPrinter) {
      try {
        const bytes = buildOrderESCPOS(order);
        await printRawUSB(bytes);
        toast.success("Order printed successfully (USB)!");
        return;
      } catch (err) {
        console.error('QZ Print error:', err);
        let errorMsg = "USB print failed";
        if (err.message && err.message.includes("not accepting job")) {
          errorMsg = "Printer is offline or paused. Please check Windows Print Queue settings";
        } else if (err.message) {
          errorMsg = err.message;
        }
        toast.error(`${errorMsg}. Opening system print fallback...`, { duration: 6000 });
        handlePrintOrderReceipt(order);
      }
    }
    // Priority 3: System print dialog (80mm HTML)
    handlePrintOrderReceipt(order);
  };

  // --- POS Billing Logic ---
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
    toast.success(`${item.name} added to cart`);
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
          const newTotal = newQty * c.price;
          return { ...c, quantity: isWeight ? newQty.toFixed(3) : newQty, total: newTotal };
        }
        return c;
      });
    });
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
    if (cart.length === 0) return toast.error("Your cart is empty");
    setSubmittingBill(true);
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
      toast.success(`Bill settled successfully: ${billId}`);
      
      setCart([]);
      setPosDiscount('');
      setSelectedReceiptBill(billData);
    } catch (error) {
      console.error(error);
      toast.error("Failed to settle bill");
    } finally {
      setSubmittingBill(false);
    }
  };

  const handlePrintReceipt = (bill) => {
    // If Bluetooth Printer is active, simulate command printing before standard layout fallback
    if (bluetoothConnected) {
      toast.success(`Sending ticket roll data to ${connectedDevice}...`);
    }

    const printContent = `
      <html>
        <head>
          <title>Invoice - ${bill.billId}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 4mm 3mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              width: 72mm;
              max-width: 72mm;
              margin: 0 auto;
              padding: 0;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .store-name { font-size: 16px; font-weight: bold; text-align: center; margin: 4px 0 2px; }
            .store-sub { font-size: 11px; text-align: center; margin-bottom: 3px; }
            .divider { border: none; border-top: 1px dashed #000; margin: 5px 0; }
            .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 1px 0; }
            table { width: 100%; border-collapse: collapse; margin: 4px 0; }
            th { font-size: 11px; font-weight: bold; text-align: left; padding: 2px 1px; border-bottom: 1px dashed #000; }
            th.right, td.right { text-align: right; }
            td { font-size: 11px; padding: 2px 1px; border-bottom: 1px dashed #eee; }
            .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
            .footer { text-align: center; font-size: 11px; margin-top: 6px; }
            @media print {
              body { width: 72mm; }
            }
          </style>
        </head>
        <body>
          <div class="store-name">RAVI SWEETS</div>
          <div class="store-sub">${bill.storeName || 'Outlet Store'}</div>
          <div class="store-sub">Quality Sweets & Savouries</div>
          <hr class="divider">
          <div class="info-row"><span><b>Bill#:</b> ${bill.billId}</span><span>${bill.date}</span></div>
          <div class="info-row"><span><b>Payment:</b> ${bill.paymentMode}</span><span><b>Status:</b> Paid</span></div>
          <hr class="divider">
          <table>
            <thead>
              <tr>
                <th style="width:50%">Item</th>
                <th class="right" style="width:15%">Qty</th>
                <th class="right" style="width:17%">Rate</th>
                <th class="right" style="width:18%">Amt</th>
              </tr>
            </thead>
            <tbody>
              ${bill.items.map(item => `
                <tr>
                  <td>${item.name}</td>
                  <td class="right">${item.unit === 'Weight' ? item.quantity + 'kg' : item.quantity + 'pc'}</td>
                  <td class="right">Rs.${Number(item.price).toFixed(0)}</td>
                  <td class="right">Rs.${Number(item.total).toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <hr class="divider">
          ${Number(bill.discount || 0) > 0 ? `
            <div class="info-row"><span>Cart Total</span><span>Rs.${(Number(bill.totalAmount) + Number(bill.discount)).toFixed(2)}</span></div>
            <div class="info-row" style="color: #dc2626;"><span>Discount</span><span>-Rs.${Number(bill.discount).toFixed(2)}</span></div>
          ` : ''}
          <div class="info-row"><span>Subtotal (Excl. Tax)</span><span>Rs.${(Number(bill.totalAmount) / 1.05).toFixed(2)}</span></div>
          <div class="info-row"><span>GST (5%)</span><span>Rs.${(Number(bill.totalAmount) - (Number(bill.totalAmount) / 1.05)).toFixed(2)}</span></div>
          <hr class="divider">
          <div class="total-row"><span>GRAND TOTAL</span><span>Rs.${Number(bill.totalAmount).toFixed(2)}</span></div>
          <hr class="divider">
          <div class="footer">Thank you for shopping!</div>
          <div class="footer">Please visit again.</div>
          <br>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=420,height=700');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const handlePrintTrigger = async (bill) => {
    // Priority 1: Bluetooth BLE direct
    if (bluetoothConnected) {
      printDirectToBluetooth(bill);
      return;
    }
    // Priority 2: QZ Tray USB
    if (qzConnected && selectedQZPrinter) {
      try {
        const bytes = buildBillESCPOS(bill);
        await printRawUSB(bytes);
        toast.success("Printed bill successfully (USB)!");
        return;
      } catch (err) {
        console.error('QZ print error:', err);
        let errorMsg = "USB print failed";
        if (err.message && err.message.includes("not accepting job")) {
          errorMsg = "Printer is offline or paused. Please check Windows Print Queue settings";
        } else if (err.message) {
          errorMsg = err.message;
        }
        toast.error(`${errorMsg}. Opening system print fallback...`, { duration: 6000 });
        handlePrintReceipt(bill);
      }
    }
    // Priority 3: System print dialog (80mm HTML)
    handlePrintReceipt(bill);
  };

  const printDirectToBluetooth = async (bill) => {
    toast.loading("Sending receipt directly to Bluetooth thermal printer...", { id: 'bt-print-job' });

    try {
      const encoder = new TextEncoder();
      
      // ESC/POS Commands
      const INIT = new Uint8Array([0x1b, 0x40]);
      const CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
      const LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
      const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
      const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
      const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
      const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
      
      let bytes = [];
      
      bytes.push(...INIT);
      
      // Header
      bytes.push(...CENTER);
      bytes.push(...DOUBLE_SIZE);
      bytes.push(...encoder.encode("RAVI SWEETS\n"));
      bytes.push(...NORMAL_SIZE);
      bytes.push(...encoder.encode(`${bill.storeName || 'Outlet Store'}\n`));
      bytes.push(...encoder.encode("Quality Sweets & Savouries\n"));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Meta
      bytes.push(...LEFT);
      bytes.push(...encoder.encode(`Bill ID: ${bill.billId}\n`));
      bytes.push(...encoder.encode(`Date: ${bill.date || new Date().toLocaleDateString()}\n`));
      bytes.push(...encoder.encode(`Payment: ${bill.paymentMode || 'Cash'}\n`));
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Table Header
      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode("Item            Qty      Total  \n"));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Items list
      bill.items.forEach(item => {
        const qtyPart = (item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pc`).padEnd(8, ' ');
        const pricePart = `Rs.${Number(item.total).toFixed(0)}`.padStart(8, ' ');
        
        if (item.name.length > 14) {
          // Print full name on its own line
          bytes.push(...encoder.encode(`${item.name}\n`));
          // Print quantity and price total aligned on the next line
          const spacesPart = "".padEnd(14, ' ');
          bytes.push(...encoder.encode(`${spacesPart} ${qtyPart} ${pricePart}\n`));
        } else {
          // Print name, quantity and price total aligned on a single line
          const namePart = item.name.padEnd(14, ' ');
          bytes.push(...encoder.encode(`${namePart} ${qtyPart} ${pricePart}\n`));
        }
      });
      
      // Grand Total with GST Details
      const totalVal = Number(bill.totalAmount || 0);
      const discountVal = Number(bill.discount || 0);
      const grossTotal = totalVal + discountVal;
      const subtotalVal = totalVal / 1.05;
      const gstVal = totalVal - subtotalVal;

      const subtotalStr = `Rs.${subtotalVal.toFixed(2)}`;
      const gstStr = `Rs.${gstVal.toFixed(2)}`;
      const grandTotalStr = `Rs.${totalVal.toFixed(2)}`;

      if (discountVal > 0) {
        bytes.push(...encoder.encode(`${"Cart Total:".padEnd(22, ' ')}${`Rs.${grossTotal.toFixed(2)}`.padStart(10, ' ')}\n`));
        bytes.push(...encoder.encode(`${"Discount:".padEnd(22, ' ')}${`-Rs.${discountVal.toFixed(2)}`.padStart(10, ' ')}\n`));
      }
      bytes.push(...encoder.encode(`Subtotal (Excl. Tax): ${subtotalStr.padStart(10, ' ')}\n`));
      bytes.push(...encoder.encode(`GST (5%):             ${gstStr.padStart(10, ' ')}\n`));
      bytes.push(...encoder.encode("--------------------------------\n"));

      bytes.push(...BOLD_ON);
      bytes.push(...encoder.encode(`GRAND TOTAL: ${grandTotalStr.padStart(19, ' ')}\n`));
      bytes.push(...BOLD_OFF);
      bytes.push(...encoder.encode("--------------------------------\n"));
      
      // Footer
      bytes.push(...CENTER);
      bytes.push(...encoder.encode("Thank you for shopping!\n"));
      bytes.push(...encoder.encode("Please visit again.\n\n"));
      
      const CUT = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);
      bytes.push(...CUT);

      const dataArray = new Uint8Array(bytes);
      
      await printRawBLE(dataArray);
      
      toast.dismiss('bt-print-job');
      toast.success("Receipt printed successfully!");
    } catch (err) {
      console.error("Direct BLE receipt print error: ", err);
      toast.dismiss('bt-print-job');
      toast.error("Failed to print directly. Opening system print fallback...");
      handlePrintReceipt(bill);
    }
  };


  // --- Filtering Methods ---
  const filteredOrders = orders.filter(ord => {
    const matchesSearch = 
      (ord.orderId || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
      (ord.customerName || '').toLowerCase().includes(orderSearch.toLowerCase()) ||
      (ord.customerPhone || '').includes(orderSearch);

    const matchesDate = !deliveryDateFilter || ord.deliveryDate === deliveryDateFilter;
    const matchesStatus = statusFilter === 'All' || (ord.status || 'new').toLowerCase().trim() === statusFilter.toLowerCase().trim();
    const matchesPaymentStatus = paymentStatusFilter === 'All' || (ord.paymentStatus || 'Pending').toLowerCase().trim() === paymentStatusFilter.toLowerCase().trim();
    const matchesStore = storeFilter === 'All' || ord.storeId === storeFilter;

    return matchesSearch && matchesDate && matchesStatus && matchesPaymentStatus && matchesStore;
  });

  const filteredCustomers = customers.filter(cust => 
    `${cust.firstName} ${cust.lastName || ''}`.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (cust.mobileNumber || '').includes(customerSearch)
  );

  // Filter bills by the selected date input (defaults to today's date YYYY-MM-DD)
  const filteredBills = bills.filter(bill => {
    const formattedBillDate = bill.date || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString() : '');
    return isSameDay(formattedBillDate, billsFilterDate);
  });

  const filteredItemsForOrder = orderItems.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(itemSearchQuery.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'All' || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const filteredWsItems = wsItems.filter(item =>
    (item.name || '').toLowerCase().includes(wsSearch.toLowerCase())
  );

  const orderCartTotalAmt = orderCart.reduce((sum, item) => sum + item.total, 0);
  const orderDiscountVal = parseFloat(orderDiscount) || 0;
  const orderTotalAmount = Math.max(0, orderCartTotalAmt - orderDiscountVal);
  const orderRecAmt = parseFloat(receivedAmount) || 0;
  let orderPaymentStatus = 'Pending';
  if (orderRecAmt > 0) {
    if (orderRecAmt >= orderTotalAmount) {
      orderPaymentStatus = 'Done';
    } else {
      orderPaymentStatus = 'Partial';
    }
  }

  return (
    <PortalLayout title="Store Portal" links={links}>
      <div className="st-portal-content">
        
        {/* --- ORDERS VIEW --- */}
        {tab === 'orders' && (
          <div className="st-orders-view animate-fade-in">
            <div className="st-view-header">
              <div>
                <h2>Store Orders ({orders.length})</h2>
                <p className="st-view-desc">Monitor prep status and delivery schedules for this outlet</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div className="st-search-wrapper">
                  <Search size={18} className="st-search-icon" />
                  <input 
                    type="text" 
                    placeholder="Search by Order ID or Customer..." 
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>
                {/* Bluetooth Printer Button */}
                <button 
                  className="st-compact-bluetooth" 
                  onClick={bluetoothConnected ? disconnectPrinter : handleBluetoothConnect}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: bluetoothConnected ? '#f0fdf4' : '#f1f5f9',
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid ' + (bluetoothConnected ? '#bbf7d0' : '#cbd5e1'),
                    color: bluetoothConnected ? '#16a34a' : '#475569',
                    fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                    transition: 'all 0.2s ease', height: '42px', boxSizing: 'border-box'
                  }}
                  title={bluetoothConnected ? `BT Connected: ${connectedDevice}. Click to disconnect.` : 'Connect Bluetooth Thermal Printer'}
                >
                  <Bluetooth size={16} className={bluetoothConnected ? 'connected' : 'disconnected'} />
                  <span>{bluetoothConnected ? 'BT Connected' : 'BT Printer'}</span>
                </button>
                {/* QZ Tray USB Printer Button */}
                <button
                  onClick={qzConnected ? () => setShowQZModal(true) : connectQZTray}
                  disabled={qzConnecting}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: qzConnected ? '#eff6ff' : qzConnecting ? '#fefce8' : '#f1f5f9',
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid ' + (qzConnected ? '#bfdbfe' : qzConnecting ? '#fde68a' : '#cbd5e1'),
                    color: qzConnected ? '#2563eb' : qzConnecting ? '#b45309' : '#475569',
                    fontSize: '12px', fontWeight: '700',
                    cursor: qzConnecting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease', height: '42px', boxSizing: 'border-box',
                    opacity: qzConnecting ? 0.85 : 1
                  }}
                  title={qzConnected ? `USB: ${selectedQZPrinter || 'No printer selected'}` : 'Connect USB Thermal Printer via QZ Tray'}
                >
                  {qzConnecting ? <RefreshCw size={15} className="spin-icon" /> : <Usb size={15} />}
                  <span>{qzConnecting ? `Connecting... ${qzConnectTimer}s` : qzConnected ? 'USB Connected' : 'USB Printer'}</span>
                </button>
                <button className="add-order-btn" style={{ height: '42px' }} onClick={() => {
                  resetFormOrder();
                  setShowAddModal(true);
                }}>
                  <Plus size={20} /> Create New Order
                </button>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="ord-table-wrapper">
              <div style={{ 
                padding: '16px 20px', 
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '15px'
              }}>
                <div className="items-search-bar" style={{ maxWidth: '350px', flex: 1, margin: 0 }}>
                  <Search size={18} className="items-search-icon" />
                  <input
                    type="text"
                    placeholder="Search by Order ID or Customer..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="new">New</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Partially Moved to Store">Partially Moved to Store</option>
                    <option value="Moved to Store">Moved to Store</option>
                    <option value="Partially Ready for Delivery">Partially Ready for Delivery</option>
                    <option value="Ready for Delivery">Ready for Delivery</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment:</span>
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="All">All Payments</option>
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial</option>
                    <option value="Done">Done</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>Store:</span>
                  <select
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      backgroundColor: '#ffffff',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="All">All Stores</option>
                    {stores.map(st => (
                      <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                  </select>
                </div>

                <div className="ord-date-filter-container" style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} color="var(--primary-color)" /> Delivery Date:
                    </span>
                    <input
                      type="date"
                      value={deliveryDateFilter}
                      onChange={(e) => setDeliveryDateFilter(e.target.value)}
                      style={{
                        height: '38px',
                        padding: '0 12px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        backgroundColor: '#ffffff',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        fontWeight: '600'
                      }}
                    />
                  </div>
                  
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setDeliveryDateFilter(getTodayStr())}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid ' + (deliveryDateFilter === getTodayStr() ? 'var(--primary-color)' : 'var(--border-color)'),
                        background: deliveryDateFilter === getTodayStr() ? 'var(--primary-color)' : '#f8fafc',
                        color: deliveryDateFilter === getTodayStr() ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryDateFilter(getTomorrowStr())}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        border: '1px solid ' + (deliveryDateFilter === getTomorrowStr() ? 'var(--primary-color)' : 'var(--border-color)'),
                        background: deliveryDateFilter === getTomorrowStr() ? 'var(--primary-color)' : '#f8fafc',
                        color: deliveryDateFilter === getTomorrowStr() ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Tomorrow
                    </button>
                    {deliveryDateFilter && (
                      <button
                        type="button"
                        onClick={() => setDeliveryDateFilter('')}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '20px',
                          border: '1px dashed var(--error-color)',
                          background: '#fef2f2',
                          color: 'var(--error-color)',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <X size={12} /> Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <table className="ord-list-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Customer</th>
                    <th>Store</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map(order => (
                      <React.Fragment key={order.id}>
                        <tr className={expandedOrders.includes(order.id) ? "row-expanded" : ""}>
                          <td className="ord-id-cell">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => toggleOrderAccordion(order.id)}>
                              {expandedOrders.includes(order.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              {order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}
                            </div>
                          </td>
                          <td>
                            <div className="ord-customer-cell">
                              <span className="name">{order.customerName}</span>
                              <span className="phone">{order.customerPhone}</span>
                            </div>
                          </td>
                          <td>{order.storeName}</td>
                          <td>{order.items.length} Items</td>
                          <td style={{ fontWeight: '700' }}>₹{order.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`ord-status-badge ${order.paymentStatus || 'Pending'}`}>
                              {order.paymentStatus || 'Pending'}
                            </span>
                          </td>
                          <td>
                            <span className={`ord-status-badge ${(order.status || 'new').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')}`}>
                              {getStatusLabel(order.status)}
                            </span>
                          </td>
                          <td style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {order.deliveryDate ? (
                              <div>
                                <strong style={{ color: 'var(--text-primary)' }}>{new Date(order.deliveryDate).toLocaleDateString()}</strong>
                                <div style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '600', marginTop: '2px' }}>{order.deliveryTime || ''}</div>
                              </div>
                            ) : (
                              order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Pending'
                            )}
                          </td>
                          <td>
                            <div className="ord-actions-cell" style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                              <button className="ord-action-btn view" title="Preview" onClick={() => { setPreviewTab('items'); setPreviewOrder(order); }}><Eye size={16} /></button>
                              <button className="ord-action-btn print" title="Print" onClick={() => handlePrintOrder(order)}><Printer size={16} /></button>
                            </div>
                          </td>
                        </tr>
                        
                        {expandedOrders.includes(order.id) && (
                          <tr className="ord-accordion-row">
                            <td colSpan="9" style={{ padding: 0 }}>
                              <div className="ord-accordion-content" style={{ padding: '20px 40px' }}>
                                {/* Tabs Header inside Accordion */}
                                <div className="ord-preview-tabs" style={{ marginBottom: '15px' }}>
                                  <button
                                    type="button"
                                    className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'items' ? 'active' : ''}`}
                                    onClick={() => setAccordionTab(order.id, 'items')}
                                    style={{ fontSize: '13px', padding: '8px 12px' }}
                                  >
                                    Items Included
                                  </button>
                                  <button
                                    type="button"
                                    className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'packing' ? 'active' : ''}`}
                                    onClick={() => setAccordionTab(order.id, 'packing')}
                                    style={{ fontSize: '13px', padding: '8px 12px' }}
                                  >
                                    Packing Details
                                  </button>
                                  <button
                                    type="button"
                                    className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'payment' ? 'active' : ''}`}
                                    onClick={() => setAccordionTab(order.id, 'payment')}
                                    style={{ fontSize: '13px', padding: '8px 12px' }}
                                  >
                                    Payment History
                                  </button>
                                </div>

                                {/* Tab Panel: Items Included */}
                                {getAccordionTab(order.id) === 'items' && (
                                  <div className="ord-tab-panel animate-fade-in" style={{ padding: '10px 0' }}>
                                    <h4 style={{ fontSize: '13px', marginBottom: '10px', color: 'var(--primary-color)' }}>Order Items</h4>
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
                                )}

                                {/* Tab Panel: Packing Details */}
                                {getAccordionTab(order.id) === 'packing' && (
                                  <div className="ord-tab-panel animate-fade-in" style={{ padding: '10px 0' }}>
                                    <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '20px', gap: '15px' }}>
                                      <div className="ord-payment-summary-card" style={{ padding: '12px' }}>
                                        <h4 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>Boxes Packed</h4>
                                        <p style={{ fontSize: '16px' }}>{order.boxesPacked !== undefined ? `${order.boxesPacked} Boxes` : 'Not Packed yet'}</p>
                                      </div>
                                      <div className="ord-payment-summary-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                        <h4 style={{ fontSize: '10px', margin: '0 0 4px 0' }}>Packing Instructions / Notes</h4>
                                        <p style={{ fontSize: '12px', fontWeight: '600', color: '#475569', margin: '2px 0 0 0' }}>
                                          {order.pUnitDescription || 'None specified'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="ord-installment-section">
                                      <h3 style={{ fontSize: '13px', marginBottom: '10px' }}>Packed Boxes Contents</h3>
                                      <div className="ord-installment-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                                        {order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0 ? (
                                          order.boxes.map((box, bIdx) => {
                                            const isReceived = box.received === true || box.status === 'received_at_store';
                                            return (
                                              <div 
                                                key={bIdx} 
                                                className="ord-installment-card" 
                                                style={{ 
                                                  padding: '10px 12px', 
                                                  background: isReceived ? '#f0fdf4' : '#faf5ff', 
                                                  border: isReceived ? '1.5px solid #10b981' : '1px solid #f3e8ff', 
                                                  display: 'block', 
                                                  textAlign: 'left',
                                                  borderRadius: '8px',
                                                  boxShadow: isReceived ? '0 0 10px rgba(16, 185, 129, 0.1)' : 'none',
                                                  transition: 'all 0.3s ease'
                                                }}
                                              >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '10px', fontWeight: '800', color: isReceived ? '#10b981' : 'var(--primary-color)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                      📦 BOX #{box.boxNum}
                                                    </span>
                                                    {isReceived && (
                                                      <span style={{ fontSize: '9px', fontWeight: '800', color: '#10b981', background: '#d1fae5', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                                        ✓ RECEIVED
                                                      </span>
                                                    )}
                                                  </div>
                                                  <span style={{ fontSize: '12px', fontWeight: '600', color: isReceived ? '#14532d' : '#1e293b', whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                                                    {box.contents}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })
                                        ) : order.boxContents ? (
                                          <div className="ord-installment-card" style={{ padding: '10px 12px', background: '#faf5ff', border: '1px solid #f3e8ff', display: 'block', textAlign: 'left' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--primary-color)', textTransform: 'uppercase' }}>
                                                📦 Dynamic Box Contents
                                              </span>
                                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#1e293b', whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                                                {order.boxContents}
                                              </span>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="ord-timeline-empty" style={{ fontSize: '12px', padding: '15px' }}>
                                            No packing details or boxes recorded yet for this order.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Tab Panel: Payment Timeline */}
                                {getAccordionTab(order.id) === 'payment' && (
                                  <AccordionPaymentSection order={order} />
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                        <Calendar size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--primary-color)' }} />
                        <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>No Orders Found</div>
                        <div style={{ fontSize: '12px' }}>Try clearing the filters or selecting another delivery date.</div>
                        {(orderSearch || deliveryDateFilter || statusFilter !== 'All' || paymentStatusFilter !== 'All' || storeFilter !== id) && (
                          <button
                            type="button"
                            onClick={() => {
                              setOrderSearch('');
                              setDeliveryDateFilter('');
                              setStatusFilter('All');
                              setPaymentStatusFilter('All');
                              setStoreFilter(id);
                            }}
                            style={{
                              marginTop: '15px',
                              padding: '6px 16px',
                              background: 'var(--primary-color)',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              color: '#ffffff'
                            }}
                          >
                            Clear All Filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Card View (Omit Edit & Delete) */}
            <div className="ord-mobile-cards-list">
              {filteredOrders.length > 0 ? (
                filteredOrders.map(order => {
                  const isExpanded = expandedOrders.includes(order.id);
                  return (
                    <div key={order.id} className={`ord-mobile-card ${isExpanded ? 'expanded' : ''}`}>
                      {/* Card Header */}
                      <div className="ord-mobile-card-header" onClick={() => toggleOrderAccordion(order.id)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          <span className="ord-mobile-id">{order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}</span>
                        </div>
                        <span className={`ord-status-badge ${(order.status || 'new').toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>

                      {/* Card Body */}
                      <div className="ord-mobile-card-body">
                        <div className="ord-mobile-row">
                          <span className="label">Customer:</span>
                          <span className="val bold">{order.customerName}</span>
                        </div>
                        <div className="ord-mobile-row">
                          <span className="label">Phone:</span>
                          <span className="val">{order.customerPhone}</span>
                        </div>
                        <div className="ord-mobile-row">
                          <span className="label">Outlet:</span>
                          <span className="val">{order.storeName}</span>
                        </div>
                        <div className="ord-mobile-row">
                          <span className="label">Total Amount:</span>
                          <span className="val bold accent-color" style={{ color: 'var(--primary-color)' }}>₹{order.totalAmount.toFixed(2)}</span>
                        </div>
                        <div className="ord-mobile-row">
                          <span className="label">Payment:</span>
                          <span className={`ord-status-badge ${order.paymentStatus || 'Pending'}`}>
                            {order.paymentStatus || 'Pending'}
                          </span>
                        </div>
                        <div className="ord-mobile-row">
                          <span className="label">Delivery Date:</span>
                          <span className="val">
                            {order.deliveryDate ? (
                              <>
                                <strong>{new Date(order.deliveryDate).toLocaleDateString()}</strong>
                                <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '700', marginLeft: '6px' }}>
                                  {order.deliveryTime || ''}
                                </span>
                              </>
                            ) : (
                              'Pending'
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Card Actions - strictly omit Edit and Delete */}
                      <div className="ord-mobile-card-actions">
                        <button className="ord-mobile-action-btn view" title="Preview" onClick={() => { setPreviewTab('items'); setPreviewOrder(order); }}><Eye size={14} /> Preview</button>
                        <button className="ord-mobile-action-btn print" title="Print" onClick={() => handlePrintOrder(order)}><Printer size={14} /> Print</button>
                      </div>

                      {/* Accordion / Expanded Details */}
                      {isExpanded && (
                        <div className="ord-mobile-card-accordion animate-fade-in" style={{ padding: '12px 14px' }}>
                          {/* Tabs Header inside Mobile Accordion */}
                          <div className="ord-preview-tabs" style={{ marginBottom: '12px', overflowX: 'auto', display: 'flex', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'items' ? 'active' : ''}`}
                              onClick={() => setAccordionTab(order.id, 'items')}
                              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
                            >
                              Items Included
                            </button>
                            <button
                              type="button"
                              className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'packing' ? 'active' : ''}`}
                              onClick={() => setAccordionTab(order.id, 'packing')}
                              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
                            >
                              Packing
                            </button>
                            <button
                              type="button"
                              className={`ord-preview-tab-btn ${getAccordionTab(order.id) === 'payment' ? 'active' : ''}`}
                              onClick={() => setAccordionTab(order.id, 'payment')}
                              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
                            >
                              Payment
                            </button>
                          </div>

                          {/* Tab Panel: Items Included */}
                          {getAccordionTab(order.id) === 'items' && (
                            <div className="ord-tab-panel animate-fade-in">
                              <h4>Order Items</h4>
                              <div style={{ overflowX: 'auto' }}>
                                <table className="ord-items-subtable">
                                  <thead>
                                    <tr>
                                      <th>Item Name</th>
                                      <th>Qty</th>
                                      <th>Amount</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {order.items.map((item, idx) => (
                                      <tr key={idx}>
                                        <td style={{ fontWeight: '700' }}>
                                          {item.name}
                                          {item.description && (
                                            <div style={{ fontSize: '11px', color: '#f59e0b', fontStyle: 'italic', marginTop: '2px' }}>
                                              Note: {item.description}
                                            </div>
                                          )}
                                        </td>
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
                            </div>
                          )}

                          {/* Tab Panel: Packing Details */}
                          {getAccordionTab(order.id) === 'packing' && (
                            <div className="ord-tab-panel animate-fade-in" style={{ fontSize: '12px' }}>
                              <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '12px', gap: '8px' }}>
                                <div className="ord-payment-summary-card" style={{ padding: '8px' }}>
                                  <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Boxes</h4>
                                  <p style={{ fontSize: '13px', fontWeight: '800' }}>{order.boxesPacked !== undefined ? `${order.boxesPacked} Boxes` : 'Not Packed yet'}</p>
                                </div>
                                <div className="ord-payment-summary-card" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                  <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Packing Notes</h4>
                                  <p style={{ fontSize: '11px', fontWeight: '600', color: '#475569', margin: '2px 0 0 0', lineHeight: '1.2' }}>
                                    {order.pUnitDescription || 'None'}
                                  </p>
                                </div>
                              </div>

                              <div className="ord-installment-section">
                                <h3 style={{ fontSize: '12px', marginBottom: '8px', borderBottom: '1px dashed #e2e8f0', paddingBottom: '4px' }}>Boxes Contents</h3>
                                <div className="ord-installment-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                                  {order.boxes && Array.isArray(order.boxes) && order.boxes.length > 0 ? (
                                    order.boxes.map((box, bIdx) => {
                                      const isReceived = box.received === true || box.status === 'received_at_store';
                                      return (
                                        <div 
                                          key={bIdx} 
                                          className="ord-installment-card" 
                                          style={{ 
                                            padding: '8px 10px', 
                                            background: isReceived ? '#f0fdf4' : '#faf5ff', 
                                            border: isReceived ? '1.5px solid #10b981' : '1px solid #f3e8ff', 
                                            display: 'block', 
                                            textAlign: 'left',
                                            borderRadius: '8px',
                                            boxShadow: isReceived ? '0 0 8px rgba(16, 185, 129, 0.1)' : 'none',
                                            transition: 'all 0.3s ease'
                                          }}
                                        >
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ fontSize: '9px', fontWeight: '800', color: isReceived ? '#10b981' : 'var(--primary-color)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                📦 BOX #{box.boxNum}
                                              </span>
                                              {isReceived && (
                                                <span style={{ fontSize: '8px', fontWeight: '800', color: '#10b981', background: '#d1fae5', padding: '1px 4px', borderRadius: '3px', textTransform: 'uppercase' }}>
                                                  ✓ RECEIVED
                                                </span>
                                              )}
                                            </div>
                                            <span style={{ fontSize: '11px', fontWeight: '600', color: isReceived ? '#14532d' : '#1e293b', whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                                              {box.contents}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })
                                  ) : order.boxContents ? (
                                    <div className="ord-installment-card" style={{ padding: '8px 10px', background: '#faf5ff', border: '1px solid #f3e8ff', display: 'block', textAlign: 'left' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <span style={{ fontSize: '9px', fontWeight: '800', color: 'var(--primary-color)', textTransform: 'uppercase' }}>
                                          📦 Dynamic Box Contents
                                        </span>
                                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#1e293b', whiteSpace: 'pre-wrap', marginTop: '2px' }}>
                                          {order.boxContents}
                                        </span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="ord-timeline-empty" style={{ fontSize: '11px', padding: '12px' }}>
                                      No packing details or boxes recorded yet.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Tab Panel: Payment Timeline */}
                          {getAccordionTab(order.id) === 'payment' && (
                            <AccordionPaymentSection order={order} isMobile={true} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', background: '#ffffff', borderRadius: '12px' }}>
                  <Calendar size={32} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--primary-color)' }} />
                  <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>No Orders Found</div>
                  <div style={{ fontSize: '12px' }}>Try clearing the filters or selecting another delivery date.</div>
                  {(orderSearch || deliveryDateFilter || statusFilter !== 'All' || paymentStatusFilter !== 'All' || storeFilter !== id) && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearch('');
                        setDeliveryDateFilter('');
                        setStatusFilter('All');
                        setPaymentStatusFilter('All');
                        setStoreFilter(id);
                      }}
                      style={{
                        marginTop: '15px',
                        padding: '6px 16px',
                        background: 'var(--primary-color)',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        color: '#ffffff'
                      }}
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PAYMENTS VIEW --- */}
        {tab === 'payments' && (
          <div className="animate-fade-in">
            <Payments storeId={id} />
          </div>
        )}

        {/* --- CUSTOMERS VIEW (READ-ONLY) --- */}
        {tab === 'customers' && (
          <div className="st-customers-view">
            <div className="st-view-header">
              <div>
                <h2>Customer Directory</h2>
                <p className="st-view-desc">View and search our registered customer contacts</p>
              </div>
              <div className="st-search-wrapper">
                <Search size={18} className="st-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search customers..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
              </div>
            </div>

            {customersLoading ? (
              <div className="st-portal-loading"><div className="loader"></div></div>
            ) : (
              <div className="st-customers-grid">
                {filteredCustomers.map(cust => (
                  <div key={cust.id} className="st-customer-card">
                    <div className="st-cust-avatar">
                      <User size={20} />
                    </div>
                    <div className="st-cust-details">
                      <h3>{cust.firstName} {cust.lastName || ''}</h3>
                      <div className="st-cust-meta">
                        <Phone size={13} />
                        <span>{cust.mobileNumber}</span>
                      </div>
                      {cust.city && (
                        <div className="st-cust-meta">
                          <MapPin size={13} />
                          <span>{cust.city}, {cust.state}</span>
                        </div>
                      )}
                    </div>
                    <div className="st-cust-badge">
                      <span>Regular</span>
                    </div>
                  </div>
                ))}
                {filteredCustomers.length === 0 && (
                  <div className="st-empty-state" style={{ gridColumn: '1 / -1' }}>
                    <Users size={48} />
                    <h3>No Customers Registered</h3>
                    <p>When customers sign up on the POS or online shop, they will appear here.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- STORE WORKSHEET VIEW --- */}
        {tab === 'worksheet' && (
          <div className="st-worksheet-view animate-fade-in">
            <div className="st-view-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                  <h2>Store Work Sheet</h2>
                  <p className="st-view-desc">Submit sweet and savory stock requirements for your outlet</p>
                </div>
                
                <div className="st-sub-tabs">
                  <button 
                    className={`st-sub-tab-btn ${wsTab === 'active' ? 'active' : ''}`}
                    onClick={() => setWsTab('active')}
                  >
                    <ClipboardList size={16} /> Active Sheet
                  </button>
                  <button 
                    className={`st-sub-tab-btn ${wsTab === 'history' ? 'active' : ''}`}
                    onClick={() => setWsTab('history')}
                  >
                    <History size={16} /> History Log
                  </button>
                </div>
              </div>

              {wsTab === 'active' && (
                <div className="st-date-filter-bar">
                  <div className="st-filter-left">
                    <Calendar size={18} className="st-filter-cal-icon" />
                    <span className="st-filter-label">Allocation Date:</span>
                    <input 
                      type="date" 
                      className="st-date-picker-input"
                      value={wsDate} 
                      onChange={(e) => setWsDate(e.target.value)} 
                    />
                  </div>
                  
                  <div className="st-search-wrapper" style={{ width: '280px', margin: 0 }}>
                    <Search size={18} className="st-search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search items by name..." 
                      value={wsSearch}
                      onChange={(e) => setWsSearch(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {wsTab === 'active' ? (
              wsLoading ? (
                <div className="st-portal-loading"><div className="loader"></div></div>
              ) : wsItems.length > 0 ? (
                <>
                  <div className="st-table-wrapper" style={{ marginTop: '20px' }}>
                    <table className="st-table">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th>Unit Type</th>
                          <th style={{ width: '220px' }}>Requested Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWsItems.length > 0 ? (
                          filteredWsItems.map(item => {
                            const unitLabel = item.unit === 'Weight' ? 'KG' : 'Pieces';
                            const unitPlaceholder = item.unit === 'Weight' ? '0.00' : '0';
                            const itemQty = wsQuantities[item.id] ?? '';

                            const isAllocationCompleted = !!(activeWorksheet?.completed?.[item.id]?.[id]);

                            return (
                              <tr key={item.id} style={{ background: isAllocationCompleted ? '#f0fdf4' : 'none', transition: 'all 0.2s ease' }}>
                                <td style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <span>{item.name}</span>
                                  {isAllocationCompleted && (
                                    <span style={{ 
                                      background: '#10b981', 
                                      color: 'white', 
                                      fontSize: '10px', 
                                      fontWeight: '800', 
                                      padding: '2px 8px', 
                                      borderRadius: '20px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}>
                                      <CheckCircle2 size={10} /> Prepared
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <span className={`ws-unit-badge ${item.unit === 'Weight' ? 'weight' : 'piece'}`}>
                                    {unitLabel}
                                  </span>
                                </td>
                                <td>
                                  <div className="ws-qty-input-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                      type="number"
                                      className="ws-qty-input"
                                      value={itemQty}
                                      placeholder={unitPlaceholder}
                                      onChange={(e) => handleWorksheetQtyChange(item.id, e.target.value)}
                                      min="0"
                                      step={item.unit === 'Weight' ? '0.01' : '1'}
                                      disabled={isAllocationCompleted}
                                    />
                                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '700' }}>{item.unit === 'Weight' ? 'KG' : 'Pcs'}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <Search size={24} style={{ color: '#94a3b8' }} />
                                <span style={{ fontWeight: 600 }}>No worksheet items match "{wsSearch}"</span>
                                <button 
                                  onClick={() => setWsSearch('')} 
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563eb',
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

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '15px' }}>
                    <button 
                      onClick={handleSaveWorksheet} 
                      className="st-print-invoice-btn" 
                      style={{ background: 'var(--accent-color)', color: 'black', height: '42px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}
                      disabled={wsSaving}
                    >
                      <Save size={16} /> {wsSaving ? 'Saving...' : 'Save Allocation Sheet'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="st-empty-state">
                  <Package size={48} />
                  <h3>No Products Available</h3>
                  <p>Register items under the items module in Super Admin to configure requirements.</p>
                </div>
              )
            ) : (
              /* HISTORY VIEW */
              wsHistoryLoading ? (
                <div className="st-portal-loading"><div className="loader"></div></div>
              ) : wsHistory.length > 0 ? (
                <div className="st-history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
                  {wsHistory.map(sheet => {
                    const storeAllocatedCount = Object.entries(sheet.quantities || {}).filter(([_, storeQtyMap]) => storeQtyMap && storeQtyMap[id] > 0).length;
                    
                    return (
                      <div 
                        key={sheet.id} 
                        className="ws-history-card" 
                        onClick={() => {
                          // Simple preview inside a modal
                          setWsPreviewSheet(sheet);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span className="date-text">
                            <Calendar size={16} />
                            {sheet.date}
                          </span>
                          <ChevronRight size={16} color="#94a3b8" />
                        </div>
                        <div className="count-label">
                          Products Allocated: <span className="count-val">{storeAllocatedCount}</span> Items
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="st-empty-state">
                  <ClipboardList size={48} />
                  <h3>No Past Sheets Found</h3>
                  <p>Save active stock sheets to view them here in the log.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* --- BILLING & POS VIEW (WITH SUB TABS) --- */}
        {tab === 'billing' && (
          <div className="st-billing-view">
            
            {/* View Header with Sub Navigation Tabs */}
            <div className="st-view-header" style={{ marginBottom: '20px' }}>
              <div>
                <h2>Billing & POS Terminal</h2>
                <p className="st-view-desc">Settle walk-in bills and view past store invoice records</p>
              </div>
              <div className="st-sub-tabs">
                <button 
                  className={`st-sub-tab-btn ${billingSubTab === 'pos' ? 'active' : ''}`}
                  onClick={() => setBillingSubTab('pos')}
                >
                  <CreditCard size={16} /> POS Terminal
                </button>
                <button 
                  className={`st-sub-tab-btn ${billingSubTab === 'bills' ? 'active' : ''}`}
                  onClick={() => setBillingSubTab('bills')}
                >
                  <Receipt size={16} /> Bills History
                </button>
              </div>
            </div>

            {/* Printer Connection Banner */}
            <div className="pu-bt-banner animate-fade-in" style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 16px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                {/* Bluetooth Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: bluetoothConnected ? '#22c55e' : '#cbd5e1', boxShadow: bluetoothConnected ? '0 0 8px #22c55e' : 'none', flexShrink: 0 }}></div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                    BT: {bluetoothConnected ? connectedDevice : 'Not Connected'}
                  </span>
                </div>
                {/* Divider */}
                <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }}></div>
                {/* QZ USB Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: qzConnected ? '#3b82f6' : '#cbd5e1', boxShadow: qzConnected ? '0 0 8px #3b82f6' : 'none', flexShrink: 0 }}></div>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>
                    USB: {qzConnected ? (selectedQZPrinter || 'No printer selected') : 'Not Connected'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* BT Button */}
                {bluetoothConnected ? (
                  <button type="button" onClick={disconnectPrinter}
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Bluetooth size={12} /> Disconnect BT
                  </button>
                ) : (
                  <button type="button" onClick={handleBluetoothConnect}
                    style={{ background: 'var(--primary-color)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Bluetooth size={12} /> Connect BT
                  </button>
                )}
                {/* QZ USB Button */}
                {qzConnected ? (
                  <button type="button" onClick={() => setShowQZModal(true)}
                    style={{ background: '#2563eb', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Usb size={12} /> Change USB Printer
                  </button>
                ) : (
                  <button type="button" onClick={connectQZTray} disabled={qzConnecting}
                    style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: '700', cursor: qzConnecting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: qzConnecting ? 0.7 : 1 }}>
                    {qzConnecting ? <RefreshCw size={12} className="spin-icon" /> : <Usb size={12} />}
                    {qzConnecting ? 'Connecting...' : 'Connect USB'}
                  </button>
                )}
              </div>
            </div>

            {/* --- SUB TAB 1: POS BILLING FUNCTIONALITY --- */}
            {billingSubTab === 'pos' && (
              <div className="st-pos-layout">
                {/* POS Catalogue Panel */}
                <div className="st-pos-catalogue">
                  <div className="st-catalogue-header">
                    <h3>Product Catalogue</h3>
                    <div className="st-pos-search">
                      <Search size={16} />
                      <input 
                        type="text" 
                        placeholder="Search products..." 
                        value={billingSearch}
                        onChange={(e) => setBillingSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="st-catalogue-grid">
                    {storeItems
                      .filter(i => (i.name || '').toLowerCase().includes(billingSearch.toLowerCase()))
                      .map(item => {
                        const inCart = cart.find(c => c.id === item.id);
                        return (
                          <div key={item.id} className="st-pos-item-card">
                            <div className="st-pos-item-img" onClick={() => handleItemClick(item)}>
                              <img 
                                src={(!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} 
                                alt={item.name} 
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = DEFAULT_ITEM_IMAGE;
                                }}
                              />
                              {inCart && (
                                <div className="st-cart-badge">
                                  {item.unit === 'Weight' ? `${inCart.quantity}kg` : inCart.quantity}
                                </div>
                              )}
                            </div>
                            <div className="st-pos-item-info">
                              <h4>{item.name}</h4>
                              <div className="st-pos-item-footer">
                                <span className="price">₹{item.price} <small>/{item.unit === 'Weight' ? 'kg' : 'pc'}</small></span>
                                {item.unit === 'Piece' ? (
                                  <div className="st-pos-qty-controls">
                                    <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, -1); }}><Minus size={12} /></button>
                                    <span>{inCart ? inCart.quantity : 0}</span>
                                    <button onClick={(e) => { e.stopPropagation(); inCart ? updateQuantity(item.id, 1) : handleItemClick(item); }}><Plus size={12} /></button>
                                  </div>
                                ) : (
                                  <button className="st-pos-weight-btn" onClick={() => handleItemClick(item)}>
                                    <Scale size={12} /> Scale
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {storeItems.length === 0 && (
                      <div className="st-empty-catalog" style={{ gridColumn: '1 / -1' }}>
                        <AlertCircle size={32} />
                        <p>No store products configured.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* POS Summary Panel */}
                <div className="st-pos-summary">
                  <div className="st-summary-header" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3>Current Shopping Cart</h3>
                      
                      {/* Printer Status Triggers */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div className="st-compact-bluetooth" onClick={bluetoothConnected ? disconnectPrinter : handleBluetoothConnect} style={{ cursor: 'pointer' }}>
                          <Bluetooth size={13} className={bluetoothConnected ? 'connected' : 'disconnected'} />
                          <span style={{ fontSize: '10px', fontWeight: '700', color: bluetoothConnected ? '#10b981' : '#64748b' }}>
                            {bluetoothConnected ? 'BT On' : 'BT'}
                          </span>
                        </div>
                        <div className="st-compact-bluetooth"
                          onClick={qzConnected ? () => setShowQZModal(true) : connectQZTray}
                          style={{ cursor: qzConnecting ? 'wait' : 'pointer', background: qzConnected ? '#eff6ff' : undefined, border: qzConnected ? '1px solid #bfdbfe' : undefined }}>
                          {qzConnecting ? <RefreshCw size={12} className="spin-icon" /> : <Usb size={12} style={{ color: qzConnected ? '#2563eb' : '#64748b' }} />}
                          <span style={{ fontSize: '10px', fontWeight: '700', color: qzConnected ? '#2563eb' : '#64748b' }}>
                            {qzConnecting ? '...' : qzConnected ? 'USB On' : 'USB'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Active Printer Banner */}
                    {(bluetoothConnected || qzConnected) && (
                      <div className="st-bluetooth-banner" style={{ background: bluetoothConnected ? '#f0fdf4' : '#eff6ff', borderColor: bluetoothConnected ? '#bbf7d0' : '#bfdbfe' }}>
                        <div className="st-banner-left">
                          {bluetoothConnected ? <Bluetooth size={12} color="#16a34a" /> : <Usb size={12} color="#2563eb" />}
                          <span style={{ color: bluetoothConnected ? '#16a34a' : '#2563eb' }}>
                            {bluetoothConnected ? `BT: ${connectedDevice}` : `USB: ${selectedQZPrinter || 'No printer'}`}
                          </span>
                        </div>
                        <button
                          onClick={bluetoothConnected ? disconnectPrinter : disconnectQZTray}
                          className="st-banner-disconnect-btn">
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="st-summary-items">
                    {cart.map((item, idx) => (
                      <div key={idx} className="st-summary-row">
                        <div className="st-summary-details">
                          <span className="name">{item.name}</span>
                          <span className="price-sub">₹{item.price} / {item.unit === 'Weight' ? 'kg' : 'pc'}</span>
                        </div>
                        <div className="st-summary-actions">
                          {item.unit === 'Weight' ? (
                            <div className="st-pos-qty-controls">
                              <button onClick={() => handleItemClick(storeItems.find(si => si.id === item.id))} title="Edit Weight"><Scale size={12} /></button>
                              <span>{item.quantity}kg</span>
                            </div>
                          ) : (
                            <div className="st-pos-qty-controls">
                              <button onClick={() => updateQuantity(item.id, -1)}><Minus size={12} /></button>
                              <span>{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)}><Plus size={12} /></button>
                            </div>
                          )}
                          <span className="total">₹{item.total.toFixed(2)}</span>
                          <button className="remove-btn" onClick={() => setCart(cart.filter((_, i) => i !== idx))}><X size={14} /></button>
                        </div>
                      </div>
                    ))}
                    {cart.length === 0 && (
                      <div className="st-empty-cart">
                        <ShoppingBag size={32} />
                        <p>Your shopping cart is empty.</p>
                      </div>
                    )}
                  </div>

                  <div className="st-summary-settle">
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
                      const posSubtotal = totalAmt / 1.05;
                      const posGst = totalAmt - posSubtotal;

                      return (
                        <>
                          <div className="st-pos-breakdown" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '0 0 10px 0', borderBottom: '1.5px dashed #cbd5e1', marginBottom: '10px' }}>
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
                              <span>₹{posSubtotal.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', fontWeight: '700' }}>
                              <span>GST (5%)</span>
                              <span>₹{posGst.toFixed(2)}</span>
                            </div>
                          </div>

                          <div className="total-display" style={{ marginBottom: '15px' }}>
                            <span>Grand Total (Incl. Tax)</span>
                            <span className="amt">₹{totalAmt.toFixed(2)}</span>
                          </div>
                        </>
                      );
                    })()}

                    <div className="payment-select">
                      {['UPI', 'Cash', 'Card'].map(mode => (
                        <button 
                          key={mode} 
                          className={`pay-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                          onClick={() => setPaymentMode(mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <button 
                      className="st-settle-btn" 
                      onClick={settleBill} 
                      disabled={submittingBill || cart.length === 0}
                    >
                      {submittingBill ? <div className="loader"></div> : 'Settle Bill & Settle'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* --- SUB TAB 2: BILLS LIST WITH TODAY DATE FILTER DEFAULT --- */}
            {billingSubTab === 'bills' && (
              <div className="st-billing-history-tab">
                {/* Date Filter Bar */}
                <div className="st-date-filter-bar">
                  <div className="st-filter-left">
                    <Calendar size={18} className="st-filter-cal-icon" />
                    <span className="st-filter-label">Filter Bills by Date:</span>
                    <input 
                      type="date" 
                      className="st-date-picker-input"
                      value={billsFilterDate} 
                      onChange={(e) => setBillsFilterDate(e.target.value)} 
                  />
                  </div>
                  <button 
                    className="st-today-reset-btn"
                    onClick={() => setBillsFilterDate(new Date().toISOString().split('T')[0])}
                  >
                    Reset to Today
                  </button>
                </div>

                <div className="st-table-wrapper">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>Bill ID</th>
                        <th>Settled Date</th>
                        <th>Amount Total</th>
                        <th>Payment Mode</th>
                        <th>Total Items</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBills.map(bill => (
                        <tr key={bill.id}>
                          <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{bill.billId}</td>
                          <td>{bill.date}</td>
                          <td style={{ fontWeight: '700' }}>₹{bill.totalAmount.toFixed(2)}</td>
                          <td>
                            <span className={`payment-mode-badge ${bill.paymentMode}`}>
                              {bill.paymentMode}
                            </span>
                          </td>
                          <td>{bill.items.length} items</td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              className="st-mini-print-btn" 
                              onClick={() => handlePrintTrigger(bill)}
                              title="Print Invoice Receipt"
                            >
                              <Printer size={15} /> Print Receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredBills.length === 0 && (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '50px 40px', color: '#64748b' }}>
                            <AlertCircle size={32} style={{ margin: '0 auto 10px auto', color: '#94a3b8' }} />
                            <p style={{ fontWeight: '600' }}>No bills found for date: {new Date(billsFilterDate).toLocaleDateString()}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}

        {/* --- SCAN BOX WORKFLOW VIEW --- */}
        {tab === 'scan' && (
          <div className="st-scan-view animate-fade-in" onClick={handleScanPageClick}>
            <div className="st-view-header">
              <div>
                <h2>Handheld QR Scanner Terminal</h2>
                <p className="st-view-desc">Scan box QR codes using physical handheld scanner guns to mark them received at this outlet.</p>
              </div>
            </div>

            <div className="st-scan-container">
              {/* Left Column: Scanner Terminal */}
              <div className="st-scan-card st-scan-terminal-card">
                <div className="st-scan-target">
                  <div className="st-scan-radar">
                    <div className="st-scan-circle st-circle-1"></div>
                    <div className="st-scan-circle st-circle-2"></div>
                    <div className="st-scan-laser"></div>
                    <QrCode size={64} className="st-scan-qr-icon" />
                  </div>
                </div>

                <div className="st-scan-status-badge">
                  <div className="st-pulse-dot"></div>
                  <span>AWAITING BARCODE GUN SCAN</span>
                </div>

                <form onSubmit={handleScanSubmit} className="st-scan-form">
                  <input
                    ref={scanInputRef}
                    type="text"
                    className={`st-scan-input-capture ${scanError ? 'error' : scanSuccessBox ? 'success' : ''}`}
                    placeholder="Aim scanner at box QR and pull trigger..."
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    disabled={scanLoading}
                    autoComplete="off"
                  />
                  <p className="st-scan-tip">
                    ℹ️ Keeps keyboard focus automatically. Click anywhere on this page to restore focus.
                  </p>
                </form>

                <div style={{ margin: '15px 0', width: '100%', height: '1.5px', background: '#e2e8f0' }}></div>

                <button
                  type="button"
                  className="st-open-camera-btn"
                  onClick={startCamera}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    maxWidth: '420px',
                    height: '46px',
                    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontWeight: '800',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(109, 40, 217, 0.2)',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                >
                  <Camera size={18} /> Open Camera Scanner
                </button>

                {scanLoading && (
                  <div className="st-scan-loading-spinner-container">
                    <RefreshCw size={24} className="spin-icon text-primary" style={{ color: 'var(--primary-color)' }} />
                    <span>Verifying box payload...</span>
                  </div>
                )}

                {scanError && (
                  <div className="st-scan-alert error animate-fade-in">
                    <AlertCircle size={20} />
                    <div className="st-alert-text">
                      <strong>Scan Failed:</strong> {scanError}
                    </div>
                    <button className="st-alert-close" onClick={() => setScanError(null)}>×</button>
                  </div>
                )}

                {scanSuccessBox && (
                  <div className="st-scan-alert success animate-fade-in">
                    <CheckCircle2 size={24} />
                    <div className="st-alert-text">
                      {scanSuccessBox.alreadyReceived ? (
                        <>
                          <strong>Already Checked In!</strong>
                          <p>Box #{scanSuccessBox.boxNum} of Order {scanSuccessBox.serialNumber ? `S${scanSuccessBox.serialNumber}-${scanSuccessBox.orderId}` : `#${scanSuccessBox.orderId}`} is already marked as received.</p>
                        </>
                      ) : (
                        <>
                          <strong>Box Received successfully! ✓</strong>
                          <p style={{ margin: '4px 0 0 0', fontWeight: '800' }}>Box #{scanSuccessBox.boxNum} • Order {scanSuccessBox.serialNumber ? `S${scanSuccessBox.serialNumber}-${scanSuccessBox.orderId}` : `#${scanSuccessBox.orderId}`}</p>
                          {scanSuccessBox.contents && (
                            <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#065f46', background: '#d1fae5', padding: '6px 10px', borderRadius: '6px', fontStyle: 'italic' }}>
                              Contents: {scanSuccessBox.contents}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Shift Scan Log */}
              <div className="st-scan-card st-scan-log-card">
                <div className="st-log-header">
                  <h3>Shift Scan History</h3>
                  <span className="st-log-count">{recentScans.length} Boxes Scanned</span>
                </div>

                <div className="st-log-list">
                  {recentScans.length > 0 ? (
                    recentScans.map((scan, idx) => (
                      <div key={idx} className="st-log-row animate-fade-in">
                        <div className="st-log-icon">
                          <CheckCircle2 size={16} color="#10b981" />
                        </div>
                        <div className="st-log-info">
                          <div className="st-log-title">
                            Box #{scan.boxNum} <span className="st-log-order">Order {scan.serialNumber ? `S${scan.serialNumber}-${scan.orderId}` : `#${scan.orderId}`}</span>
                          </div>
                          <span className="st-log-contents">{scan.contents}</span>
                        </div>
                        <span className="st-log-time">{scan.scannedAt}</span>
                      </div>
                    ))
                  ) : (
                    <div className="st-log-empty">
                      <QrCode size={36} style={{ opacity: 0.3 }} />
                      <p>No scans processed in this shift yet.</p>
                      <span>Scanned boxes will appear here for verification.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Dynamic Camera Scanner Overlay Modal */}
      <AnimatePresence>
        {cameraActive && (
          <div className="modal-overlay" style={{ zIndex: 6000 }}>
            <motion.div
              className="st-camera-scan-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '450px',
                maxWidth: '90vw',
                background: 'white',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
                  <Camera size={20} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>
                    Live Camera Scanner
                  </h3>
                </div>
                <button 
                  onClick={stopCamera} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '50%' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                <div style={{ 
                  position: 'relative', 
                  width: '320px', 
                  height: '320px', 
                  maxWidth: '100%',
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  border: '2.5px solid #10b981',
                  background: '#0f172a'
                }}>
                  <div className="st-camera-laser-sweep"></div>
                  
                  {/* html5-qrcode live stream node */}
                  <div id="st-camera-reader" style={{ width: '100%', height: '100%', overflow: 'hidden' }}></div>
                </div>
                
                <p style={{ margin: '0', fontSize: '11px', color: '#64748b', fontWeight: '600', textAlign: 'center', lineHeight: '1.4' }}>
                  Point your computer webcam or mobile camera at the printed QR code on the box slip. It will automatically scan and receive.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button className="modal-btn cancel" onClick={stopCamera} style={{ height: '38px', borderRadius: '8px', fontWeight: '700' }}>
                  Cancel / Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      </div>

      {/* Weight Modal */}
      <AnimatePresence>
        {showWeightModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div className="custom-modal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}><Scale size={32} /></div>
              <h3 className="modal-title">Calculate Weight Item</h3>
              <div className="access-modal-form">
                <div><label>Weight (kg)</label><input type="number" step="0.001" value={weightInput.weight} onChange={(e) => handleWeightCalc('weight', e.target.value)} /></div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b', fontSize: '12px' }}>OR</div>
                <div><label>Budget Amount (₹)</label><input type="number" value={weightInput.amount} onChange={(e) => handleWeightCalc('amount', e.target.value)} /></div>
                <div className="modal-actions">
                  <button type="button" className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button type="button" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} onClick={confirmWeightAdd}>Confirm Add</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Store Worksheet Preview Modal */}
      <AnimatePresence>
        {wsPreviewSheet && (() => {
          const globalQuantities = wsPreviewSheet.quantities || {};
          const storeQuantities = [];
          
          wsItems.forEach(item => {
            const qty = globalQuantities[item.id]?.[id];
            if (qty && qty > 0) {
              const isCompleted = !!(wsPreviewSheet.completed?.[item.id]?.[id]);
              storeQuantities.push({
                id: item.id,
                name: item.name,
                qty,
                unit: item.unit,
                unitLabel: item.unit === 'Weight' ? 'KG' : 'Pcs',
                isCompleted
              });
            }
          });

          return (
            <div className="modal-overlay" style={{ zIndex: 6000 }} onClick={() => setWsPreviewSheet(null)}>
              <motion.div
                className="custom-modal"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ maxWidth: '480px', width: '90%', maxHeight: '80vh', overflowY: 'auto', textAlign: 'left' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-icon-box" style={{ background: 'rgba(212, 175, 55, 0.1)', color: 'var(--accent-color)' }}>
                  <ClipboardList size={28} />
                </div>
                <h3 className="modal-title">Worksheet Preview</h3>
                <p className="modal-text" style={{ marginBottom: '16px' }}>Allocations for date: <strong>{wsPreviewSheet.date}</strong></p>

                {storeQuantities.length > 0 ? (
                  <div className="ws-preview-list">
                    {storeQuantities.map((item, idx) => (
                      <div key={idx} className="ws-preview-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="ws-preview-name" style={{ fontWeight: '600', color: '#0f172a' }}>{item.name}</span>
                          {item.isCompleted && (
                            <span style={{ 
                              background: '#d1fae5', 
                              color: '#065f46', 
                              fontSize: '10px', 
                              fontWeight: '800', 
                              padding: '1px 6px', 
                              borderRadius: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px'
                            }}>
                              <CheckCircle2 size={8} /> Prepared
                            </span>
                          )}
                        </div>
                        <span className="ws-preview-qty" style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{item.qty} {item.unitLabel}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8' }}>
                    No items allocated for this outlet on this date.
                  </div>
                )}

                <div className="modal-actions" style={{ marginTop: '24px' }}>
                  <button className="modal-btn cancel" onClick={() => setWsPreviewSheet(null)}>
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Bluetooth Thermal Printer Scanner Modal */}
      <AnimatePresence>
        {showBluetoothModal && (
          <div className="modal-overlay" style={{ zIndex: 5000 }}>
            <motion.div 
              className="st-bluetooth-scan-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="scan-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Bluetooth size={24} color="#2563eb" className={isScanningBt ? "pulse-icon" : ""} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>Connect Bluetooth Thermal Printer</h3>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>Web Bluetooth BLE Scanner</p>
                  </div>
                </div>
                <button className="close-btn" onClick={() => setShowBluetoothModal(false)} disabled={connectingBtDevice !== null}><X size={18} /></button>
              </div>

              <div className="scan-modal-body">
                {isScanningBt ? (
                  <div className="scan-loading-area">
                    <div className="scan-radar">
                      <div className="circle circle-1"></div>
                      <div className="circle circle-2"></div>
                      <div className="circle circle-3"></div>
                      <Bluetooth size={32} color="#2563eb" />
                    </div>
                    <p className="scan-pulse-text">Scanning for active BLE printers nearby...</p>
                  </div>
                ) : (
                  <div className="device-results-list">
                    <span className="results-label">Select Bluetooth Printer ({btDevices.length} found)</span>
                    <div className="devices-container">
                      {btDevices.map((device, idx) => (
                        <div 
                          key={idx} 
                          className={`device-list-row ${connectingBtDevice === device.name ? 'connecting' : ''}`}
                          onClick={() => connectBtDevice(device.name)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="device-avatar-icon"><Printer size={16} /></div>
                            <div>
                              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13px' }}>{device.name}</div>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>{device.type} • RSSI: {device.rssi}dBm</span>
                            </div>
                          </div>
                          <button className="row-connect-btn">
                            {connectingBtDevice === device.name ? "Pairing..." : "Connect"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="scan-modal-footer">
                <button className="modal-btn cancel" onClick={() => setShowBluetoothModal(false)} disabled={connectingBtDevice !== null}>Cancel</button>
                {!isScanningBt && (
                  <button className="st-print-invoice-btn" style={{ background: '#2563eb' }} onClick={restartBtScan} disabled={connectingBtDevice !== null}>
                    Rescan
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QZ Tray USB Printer Selection Modal */}
      <AnimatePresence>
        {showQZModal && (
          <div className="modal-overlay" style={{ zIndex: 5100 }}>
            <motion.div
              className="st-bluetooth-scan-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="scan-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Usb size={22} color="#2563eb" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>USB Thermal Printer (QZ Tray)</h3>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>{qzPrinters.length} printer(s) found on your system</p>
                  </div>
                </div>
                <button className="close-btn" onClick={() => setShowQZModal(false)}><X size={18} /></button>
              </div>

              <div className="scan-modal-body">
                {qzPrinters.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 20px', color: '#64748b' }}>
                    <WifiOff size={36} style={{ marginBottom: '10px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontWeight: '700' }}>No printers found</p>
                    <p style={{ margin: '6px 0 0', fontSize: '12px' }}>Make sure QZ Tray is running and a printer is connected.</p>
                  </div>
                ) : (
                  <div className="device-results-list">
                    <span className="results-label">Select a Printer to Use</span>
                    <div className="devices-container">
                      {qzPrinters.map((printer, idx) => (
                        <div
                          key={idx}
                          className={`device-list-row ${selectedQZPrinter === printer ? 'connecting' : ''}`}
                          onClick={() => setSelectedQZPrinter(printer)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="device-avatar-icon"><Printer size={16} /></div>
                            <div>
                              <div style={{ fontWeight: '800', color: '#0f172a', fontSize: '13px' }}>{printer}</div>
                              <span style={{ fontSize: '10px', color: '#64748b' }}>USB / Network Printer</span>
                            </div>
                          </div>
                          {selectedQZPrinter === printer && (
                            <CheckCircle2 size={18} color="#2563eb" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="scan-modal-footer">
                <button className="modal-btn cancel" onClick={disconnectQZTray}>Disconnect QZ</button>
                <button
                  className="modal-btn cancel"
                  style={{ background: '#f1f5f9', color: '#475569' }}
                  onClick={async () => {
                    try {
                      const printers = await listQZPrinters();
                      setQzPrinters(printers);
                      toast.success('Printer list refreshed');
                    } catch (e) {
                      toast.error('Failed to refresh');
                    }
                  }}
                >
                  <RefreshCw size={13} /> Refresh
                </button>
                <button
                  className="st-print-invoice-btn"
                  style={{ background: selectedQZPrinter ? '#2563eb' : '#94a3b8', cursor: selectedQZPrinter ? 'pointer' : 'not-allowed' }}
                  onClick={() => {
                    if (selectedQZPrinter) {
                      setShowQZModal(false);
                      toast.success(`Active printer: ${selectedQZPrinter}`);
                    }
                  }}
                  disabled={!selectedQZPrinter}
                >
                  Use This Printer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QZ Tray Setup Guide Modal */}
      <AnimatePresence>
        {showQZSetupGuide && (
          <div className="modal-overlay" style={{ zIndex: 5200 }}>
            <motion.div
              className="st-bluetooth-scan-modal"
              style={{ maxWidth: '480px' }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="scan-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Usb size={22} color="#dc2626" />
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>QZ Tray Not Detected</h3>
                    <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>USB printing requires QZ Tray running locally</p>
                  </div>
                </div>
                <button className="close-btn" onClick={() => setShowQZSetupGuide(false)}><X size={18} /></button>
              </div>

              <div className="scan-modal-body" style={{ padding: '20px 24px' }}>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                  QZ Tray is a free local app that lets this browser communicate directly with any USB or network printer using raw ESC/POS commands. Follow these steps:
                </p>

                {/* Step 1 */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0 }}>1</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '2px' }}>Download &amp; Install QZ Tray</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>Free, open-source. Windows / Mac / Linux supported.</div>
                    <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563eb', color: 'white', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textDecoration: 'none' }}>
                      Download QZ Tray →
                    </a>
                  </div>
                </div>

                {/* Step 2 */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0 }}>2</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '2px' }}>Start QZ Tray</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Launch QZ Tray from your Start Menu / Applications. You should see the QZ Tray icon in the system tray (bottom-right taskbar).</div>
                  </div>
                </div>

                {/* Step 3 — Certificate trust (most commonly missed!) */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#dc2626', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0 }}>3</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626', marginBottom: '2px' }}>⚠️ Trust the QZ Tray Certificate (Required!)</div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', lineHeight: '1.6' }}>
                      Your browser blocks QZ Tray's self-signed certificate by default. You must visit this URL <strong>once</strong> and click <strong>"Advanced → Proceed"</strong> to trust it:
                    </div>
                    <a href="https://localhost:8181" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', textDecoration: 'none' }}>
                      Open https://localhost:8181 →
                    </a>
                  </div>
                </div>

                {/* Step 4 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#16a34a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800', flexShrink: 0 }}>4</div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '2px' }}>Come back &amp; click "Retry Connect"</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>Once QZ Tray is running and the certificate is trusted, click Retry below.</div>
                  </div>
                </div>
              </div>

              <div className="scan-modal-footer">
                <button className="modal-btn cancel" onClick={() => setShowQZSetupGuide(false)}>Close</button>
                <button
                  className="st-print-invoice-btn"
                  style={{ background: '#2563eb' }}
                  onClick={async () => {
                    setShowQZSetupGuide(false);
                    await connectQZTray();
                  }}
                >
                  <RefreshCw size={13} /> Retry Connect
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bill Receipt Preview Modal */}

      <AnimatePresence>
        {selectedReceiptBill && (
          <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <motion.div 
              className="st-receipt-modal"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              <div className="receipt-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Receipt size={20} color="var(--primary-color)" />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Bill Receipt Settle Successful</h3>
                </div>
                <button className="close-btn" onClick={() => setSelectedReceiptBill(null)}><X size={18} /></button>
              </div>

              <div className="receipt-print-area">
                <div className="receipt-brand">
                  <h2>Ravi Sweets</h2>
                  <p>{selectedReceiptBill.storeName || 'Outlet Store'}</p>
                </div>

                <div className="receipt-meta-grid">
                  <div>
                    <span className="label">Bill ID</span>
                    <span className="value">#{selectedReceiptBill.billId}</span>
                  </div>
                  <div>
                    <span className="label">Date</span>
                    <span className="value">{selectedReceiptBill.date}</span>
                  </div>
                  <div>
                    <span className="label">Payment Mode</span>
                    <span className="value">{selectedReceiptBill.paymentMode}</span>
                  </div>
                  <div>
                    <span className="label">Payment Status</span>
                    <span className="value" style={{ color: '#16a34a', fontWeight: '800' }}>PAID</span>
                  </div>
                </div>

                <div className="receipt-table-section">
                  <h4>Product Invoice Items</h4>
                  <table className="slip-subtable">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReceiptBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600' }}>{item.name}</td>
                          <td style={{ textAlign: 'right' }}>₹{Number(item.price).toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>{item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>₹{Number(item.total).toFixed(2)}</td>
                        </tr>
                      ))}
                      {(() => {
                        const billTotal = Number(selectedReceiptBill.totalAmount || 0);
                        const billSubtotal = billTotal / 1.05;
                        const billGst = billTotal - billSubtotal;
                        return (
                          <>
                            <tr>
                              <td colSpan="3" style={{ fontWeight: '700', color: '#64748b', fontSize: '12px', borderBottom: '1px dashed #e2e8f0', padding: '8px' }}>Subtotal (Excl. Tax)</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: '#64748b', fontSize: '12px', borderBottom: '1px dashed #e2e8f0', padding: '8px' }}>
                                ₹{billSubtotal.toFixed(2)}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan="3" style={{ fontWeight: '700', color: '#64748b', fontSize: '12px', borderBottom: '1.5px solid #cbd5e1', padding: '8px' }}>GST (5%)</td>
                              <td style={{ textAlign: 'right', fontWeight: '700', color: '#64748b', fontSize: '12px', borderBottom: '1.5px solid #cbd5e1', padding: '8px' }}>
                                ₹{billGst.toFixed(2)}
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                      <tr className="slip-total-row">
                        <td colSpan="3" style={{ fontWeight: '800' }}>Grand Total Amount</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary-color)', fontSize: '17px' }}>
                          ₹{Number(selectedReceiptBill.totalAmount).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="receipt-modal-footer">
                <button className="modal-btn cancel" onClick={() => setSelectedReceiptBill(null)}>Close</button>
                <button className="st-print-invoice-btn" onClick={() => handlePrintTrigger(selectedReceiptBill)}>
                  <Printer size={16} /> Print Receipt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Order Full Screen Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            className="ord-full-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ zIndex: 1000 }}
          >
            <div className="ord-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <ShoppingBag size={24} color="var(--primary-color)" />
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800' }}>{editingOrderId ? 'Edit Customer Order' : 'Create New Customer Order'}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{editingOrderId ? 'Update customer details and items' : 'Fill in customer details and select items'}</p>
                </div>
              </div>
              <button className="items-close-btn" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>

            {/* Mobile Modal Tabs */}
            <div className="ord-modal-tabs-mobile" style={{ display: 'flex' }}>
              <button 
                type="button" 
                className={`ord-modal-tab-btn-mobile ${activeModalTab === 'items' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('items')}
              >
                <Plus size={16} /> 1. Select Items
              </button>
              <button 
                type="button" 
                className={`ord-modal-tab-btn-mobile ${activeModalTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('summary')}
                style={{ position: 'relative' }}
              >
                <ShoppingBag size={16} /> 2. Checkout
                {orderCart.length > 0 && (
                  <span className="cart-badge-dot">{orderCart.length}</span>
                )}
              </button>
            </div>

            <div className="ord-modal-content">
              {/* Left Panel: Form & Selection */}
              <div className={`ord-items-panel ${activeModalTab === 'items' ? 'show-mobile' : 'hide-mobile'}`} style={{ overflowY: 'auto' }}>
                <div className="ord-panel-header">
                  <div className="ord-panel-top" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                    <CustomDropdown 
                      label="Select Customer *"
                      options={orderCustomers}
                      onSelect={setSelectedCustomer}
                      selectedValue={selectedCustomer}
                      placeholder="Search name or number..."
                      icon={User}
                      onCreateClick={handleOpenCreateCustomer}
                      hasError={!!formErrors.customer}
                      errorMsg={formErrors.customer}
                    />
                    
                    {/* Read-Only Non-Editable Selected Store */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Delivery Store</label>
                      <div style={{
                        height: '42px',
                        padding: '0 12px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        fontSize: '13px',
                        background: '#f1f5f9',
                        color: '#475569',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <Store size={18} color="var(--primary-color)" />
                        <span>{store?.name || 'Loading Store...'}</span>
                      </div>
                    </div>

                    <CustomDropdown 
                      label="Select Packing Unit *"
                      options={orderPUnits}
                      onSelect={setSelectedPUnit}
                      selectedValue={selectedPUnit}
                      placeholder="Select a packing unit..."
                      icon={Package}
                      hasError={!!formErrors.pUnit}
                      errorMsg={formErrors.pUnit}
                    />
                  </div>

                  {/* Delivery Date, Time & Packing Instructions */}
                  <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Delivery Date *</label>
                      <input 
                        type="date"
                        required
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        style={{
                          height: '38px',
                          padding: '0 12px',
                          border: formErrors.deliveryDate ? '1.5px solid #dc2626' : '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                      {formErrors.deliveryDate && (
                        <span style={{ color: '#dc2626', fontSize: '11px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                          {formErrors.deliveryDate}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Delivery Time *</label>
                      <input 
                        type="time"
                        required
                        value={deliveryTime}
                        onChange={(e) => setDeliveryTime(e.target.value)}
                        style={{
                          height: '38px',
                          padding: '0 12px',
                          border: formErrors.deliveryTime ? '1.5px solid #dc2626' : '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                      {formErrors.deliveryTime && (
                        <span style={{ color: '#dc2626', fontSize: '11px', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                          {formErrors.deliveryTime}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Packing Unit Instructions</label>
                      <input 
                        type="text"
                        placeholder="Packaging and gift wrapping notes..."
                        value={pUnitDescription}
                        onChange={(e) => setPUnitDescription(e.target.value)}
                        style={{
                          height: '38px',
                          padding: '0 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Global Instructions (Full Width) */}
                  <div style={{ display: 'flex', gap: '15px', marginTop: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Global Instructions</label>
                      <textarea 
                        placeholder="General order instructions..."
                        value={globalDescription}
                        onChange={(e) => setGlobalDescription(e.target.value)}
                        style={{
                          height: '50px',
                          padding: '8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          resize: 'none',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                          width: '100%'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={18} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '16px', fontWeight: '800', margin: 0 }}>Select Sweets & Products</h3>
                </div>

                {/* Item Search and Category Filter Row */}
                <div className="ord-search-filter-row">
                  <div className="ord-item-search-wrapper">
                    <Search size={16} className="ord-item-search-icon" />
                    <input
                      type="text"
                      className="ord-item-search-input"
                      placeholder="Search item by name..."
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="ord-category-pills-row">
                    <button
                      type="button"
                      className={`ord-category-pill ${selectedCategoryFilter === 'All' ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryFilter('All')}
                    >
                      All
                    </button>
                    {categories.map(cat => (
                      <button
                        type="button"
                        key={cat.id}
                        className={`ord-category-pill ${selectedCategoryFilter === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategoryFilter(cat.id)}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ord-items-grid" style={{ paddingBottom: '30px' }}>
                  {filteredItemsForOrder.length > 0 ? (
                    filteredItemsForOrder.map(item => {
                      const cartItem = orderCart.find(ci => ci.id === item.id);
                      const isInCart = !!cartItem;
                      return (
                        <div key={item.id} className={`ord-selectable-card ${isInCart ? 'in-cart' : ''}`} onClick={() => handleItemClickOrder(item)}>
                          <div className="ord-item-img-container">
                            <img 
                              src={(!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} 
                              alt={item.name} 
                              className="ord-item-img" 
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = DEFAULT_ITEM_IMAGE;
                              }}
                            />
                            {isInCart && (
                              <div className="ord-card-cart-badge">
                                {cartItem.quantity} {item.unit === 'Weight' ? 'kg' : 'pcs'}
                              </div>
                            )}
                          </div>
                          <div className="ord-item-details">
                            <h4>{item.name}</h4>
                            <div className="ord-price-row">
                              <span className="price">₹{item.price}</span>
                              <span className="unit">{item.unit === 'Weight' ? '/ kg' : '/ piece'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                      <Package size={32} style={{ margin: '0 auto 10px' }} />
                      <p>No matching items found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Panel: Summary */}
              <div className={`ord-summary-panel ${activeModalTab === 'summary' ? 'show-mobile' : 'hide-mobile'}`}>
                <h2><FileText size={20} /> Order Cart & Summary</h2>
                
                <div className="ord-summary-list">
                  {orderCart.length > 0 ? orderCart.map((item, idx) => (
                    <div key={idx} className="ord-summary-item">
                      <div className="ord-item-info">
                        <h4>{item.name}</h4>
                        <p>{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`} @ ₹{item.price}</p>
                        {item.description && <p className="item-note">Note: {item.description}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {item.unit === 'Weight' ? (
                          <button onClick={() => handleEditCartItemOrder(item)} className="ord-edit-cart-btn" title="Edit Weight" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-color)' }}>
                            <Edit size={14} />
                          </button>
                        ) : (
                          <div className="ord-qty-controls">
                            <button onClick={() => updateCartQuantityOrder(item.id, -1)}><Minus size={12} /></button>
                            <span>{item.quantity}</span>
                            <button onClick={() => updateCartQuantityOrder(item.id, 1)}><Plus size={12} /></button>
                          </div>
                        )}
                        <div className="ord-item-price">
                          <span className="amt">₹{item.total.toFixed(2)}</span>
                        </div>
                        <button onClick={() => removeFromCartOrder(item.id)} style={{ color: 'var(--error-color)', background: 'none', border: 'none', cursor: 'pointer' }} title="Remove Item">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                      <ShoppingBag size={32} style={{ marginBottom: '10px' }} />
                      <p>Your order cart is empty</p>
                    </div>
                  )}
                </div>

                <div className="ord-summary-totals" style={{ borderTop: 'none', paddingTop: '0' }}>
                  {orderDiscountVal > 0 && (
                    <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      <span>Cart Total</span>
                      <span>₹{orderCartTotalAmt.toFixed(2)}</span>
                    </div>
                  )}
                  {orderDiscountVal > 0 && (
                    <div className="ord-total-row" style={{ fontSize: '13px', color: '#dc2626', fontWeight: '600', marginTop: '2px' }}>
                      <span>Discount (₹)</span>
                      <span>-₹{orderDiscountVal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    <span>Subtotal (Excl. Tax)</span>
                    <span>₹{(orderTotalAmount / 1.05).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                    <span>GST (5%)</span>
                    <span>₹{(orderTotalAmount - (orderTotalAmount / 1.05)).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ borderTop: '1px dashed var(--border-color)', marginTop: '6px', paddingTop: '6px' }}>
                    <span>Grand Total (Incl. Tax)</span>
                    <span>₹{orderTotalAmount.toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: '#16a34a', fontWeight: '700', marginTop: '2px' }}>
                    <span>Total Paid</span>
                    <span>₹{(parseFloat(receivedAmount) || 0).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                    <span>Balance Due</span>
                    <span>₹{Math.max(0, orderTotalAmount - (parseFloat(receivedAmount) || 0)).toFixed(2)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                      <div className="ord-payment-modes" style={{ marginTop: '0' }}>
                        {['Cash', 'UPI', 'Card'].map(mode => (
                          <button 
                            type="button"
                            key={mode} 
                            className={`ord-mode-btn ${orderPaymentMode === mode ? 'active' : ''}`}
                            onClick={() => setOrderPaymentMode(mode)}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Discount (₹)</label>
                        <input 
                          type="number"
                          placeholder="0.00"
                          value={orderDiscount}
                          onChange={(e) => setOrderDiscount(e.target.value)}
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
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Received Amount (₹)</label>
                        <input 
                          type="number"
                          placeholder="0.00"
                          value={receivedAmount}
                          onChange={(e) => setReceivedAmount(e.target.value)}
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
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Status</label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
                          <span className={`ord-status-badge ${orderPaymentStatus}`} style={{ fontSize: '11px', padding: '5px 12px' }}>
                            {orderPaymentStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="ord-save-btn" onClick={saveOrder} disabled={savingOrder} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {savingOrder ? <div className="loader"></div> : 'Confirm & Save Store Order'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Order Weight Modal */}
      <AnimatePresence>
        {showOrderWeightModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
                <Scale size={32} />
              </div>
              <h3 className="modal-title">Enter Quantity for {showOrderWeightModal.name}</h3>
              
              <div className="ord-weight-form">
                <div className="ord-weight-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left', marginBottom: '10px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700' }}>Weight (kg)</label>
                  <input 
                    type="number" 
                    step="0.001" 
                    placeholder="0.000"
                    value={orderWeightInput.weight}
                    onChange={(e) => handleOrderWeightCalc('weight', e.target.value, showOrderWeightModal.price)}
                    style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  />
                </div>
                <div style={{ textAlign: 'center', fontWeight: '700', opacity: 0.5, margin: '5px 0' }}>OR</div>
                <div className="ord-weight-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left', marginBottom: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700' }}>Amount (₹)</label>
                  <input 
                    type="number" 
                    placeholder="0.00"
                    value={orderWeightInput.amount}
                    onChange={(e) => handleOrderWeightCalc('amount', e.target.value, showOrderWeightModal.price)}
                    style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  />
                </div>

                <div className="ord-weight-input-group" style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'left', marginBottom: '15px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700' }}>Manufacturing description</label>
                  <textarea 
                    placeholder="e.g. less sugar, extra packing..."
                    value={orderWeightInput.description}
                    onChange={(e) => setOrderWeightInput(prev => ({ ...prev, description: e.target.value }))}
                    style={{ 
                      height: '60px', 
                      padding: '10px', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '8px', 
                      fontSize: '13px', 
                      resize: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div className="modal-actions" style={{ marginTop: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setShowOrderWeightModal(null)}>Cancel</button>
                  <button 
                    className="modal-btn confirm" 
                    style={{ background: 'var(--primary-color)' }}
                    onClick={confirmOrderWeightAdd}
                  >
                    Add to Order
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Creation Modal */}
      <AnimatePresence>
        {showCreateCustomerModal && (
          <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ width: '450px' }}
            >
              <div className="modal-icon-box" style={{ background: '#dcfce7', color: '#16a34a' }}>
                <User size={32} />
              </div>
              <h3 className="modal-title">Register New Customer</h3>
              
              <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', marginTop: '15px' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700' }}>First Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={customerFormData.firstName} 
                      onChange={(e) => setCustomerFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700' }}>Last Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={customerFormData.lastName} 
                      onChange={(e) => setCustomerFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700' }}>Mobile Number *</label>
                  <input 
                    type="tel" 
                    required 
                    value={customerFormData.mobileNumber} 
                    onChange={(e) => setCustomerFormData(prev => ({ ...prev, mobileNumber: e.target.value }))}
                    style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '5px 0' }}>
                  <input 
                    type="checkbox" 
                    name="isB2B" 
                    id="modalIsB2B" 
                    checked={customerFormData.isB2B || false} 
                    onChange={(e) => setCustomerFormData(prev => ({ ...prev, isB2B: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                  />
                  <label htmlFor="modalIsB2B" style={{ fontSize: '12px', fontWeight: '700', cursor: 'pointer', userSelect: 'none', margin: 0 }}>Is B2B Customer?</label>
                </div>

                {customerFormData.isB2B && (
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700' }}>Business Name *</label>
                      <input
                        type="text"
                        required
                        value={customerFormData.businessName || ''}
                        onChange={(e) => setCustomerFormData(prev => ({ ...prev, businessName: e.target.value }))}
                        style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700' }}>GST Number *</label>
                      <input
                        type="text"
                        required
                        value={customerFormData.gstNumber || ''}
                        onChange={(e) => setCustomerFormData(prev => ({ ...prev, gstNumber: e.target.value }))}
                        style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700' }}>Street Address</label>
                  <textarea 
                    value={customerFormData.address} 
                    onChange={(e) => setCustomerFormData(prev => ({ ...prev, address: e.target.value }))}
                    style={{ height: '50px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '8px', resize: 'none', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700' }}>City</label>
                    <input 
                      type="text" 
                      value={customerFormData.city} 
                      onChange={(e) => setCustomerFormData(prev => ({ ...prev, city: e.target.value }))}
                      style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700' }}>State</label>
                    <input 
                      type="text" 
                      value={customerFormData.state} 
                      onChange={(e) => setCustomerFormData(prev => ({ ...prev, state: e.target.value }))}
                      style={{ height: '38px', padding: '0 12px', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '15px' }}>
                  <button type="button" className="modal-btn cancel" onClick={() => setShowCreateCustomerModal(false)} disabled={savingCustomer}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} disabled={savingCustomer}>
                    {savingCustomer ? <div className="loader"></div> : 'Register Customer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      {/* Preview Modal */}
      <AnimatePresence>
        {previewOrder && (() => {
          const balanceDue = Number(previewOrder.totalAmount || 0) - Number(previewOrder.receivedAmount || 0);
          return (
            <div className="modal-overlay" style={{ zIndex: 4000 }}>
              <motion.div 
                className="custom-modal ord-preview-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                style={{ maxWidth: '600px', width: '90%' }}
              >
                <div className="ord-preview-header" style={{ marginBottom: '15px', paddingBottom: '10px' }}>
                  <h2>Order Invoice Preview</h2>
                  <button className="items-close-btn" onClick={() => setPreviewOrder(null)}><X size={24} /></button>
                </div>
                
                <div className="ord-preview-body">
                  <div className="ord-preview-top" style={{ marginBottom: '15px' }}>
                    <div>
                      <h3>Ravi Sweets</h3>
                      <p>{previewOrder.storeName}</p>
                      <p style={{ marginTop: '6px' }}>
                        <strong>Order:</strong> {previewOrder.serialNumber ? `S${previewOrder.serialNumber}-${previewOrder.orderId}` : `#${previewOrder.orderId}`}
                      </p>
                      <p><strong>Date:</strong> {previewOrder.createdAt?.toDate ? previewOrder.createdAt.toDate().toLocaleString() : 'Pending'}</p>
                      {previewOrder.deliveryDate && (
                        <p style={{ color: 'var(--primary-color)', fontWeight: '700', marginTop: '2px' }}>
                          <strong>Delivery Target:</strong> {new Date(previewOrder.deliveryDate).toLocaleDateString()} at {previewOrder.deliveryTime || ''}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <h3>Bill To</h3>
                      <p><strong>{previewOrder.customerName}</strong></p>
                      <p>{previewOrder.customerPhone}</p>
                    </div>
                  </div>

                  <div className="ord-preview-desc" style={{ marginBottom: '15px', padding: '10px' }}>
                    {previewOrder.globalDescription && <p><strong>Global Note:</strong> {previewOrder.globalDescription}</p>}
                    {previewOrder.mUnitDescription && <p><strong>Mfg Note:</strong> {previewOrder.mUnitDescription}</p>}
                    {previewOrder.pUnitDescription && <p><strong>Pack Note:</strong> {previewOrder.pUnitDescription}</p>}
                  </div>

                  {/* Tabs Header */}
                  <div className="ord-preview-tabs">
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'items' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('items')}
                    >
                      Items Included
                    </button>
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'packing' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('packing')}
                    >
                      Packing Details
                    </button>
                    <button
                      type="button"
                      className={`ord-preview-tab-btn ${previewTab === 'payment' ? 'active' : ''}`}
                      onClick={() => setPreviewTab('payment')}
                    >
                      Payment History
                    </button>
                  </div>

                  {/* Tab Panel: Items Included */}
                  {previewTab === 'items' && (
                    <div className="ord-tab-panel">
                      <table className="ord-preview-table">
                        <thead>
                          <tr>
                            <th>Item Description</th>
                            <th style={{ textAlign: 'center' }}>Qty</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewOrder.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>
                                <div style={{ fontWeight: '700' }}>{item.name}</div>
                                {item.description && <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.description}</div>}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pcs`}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`ord-status-badge ${(item.status || 'preparation_started').toLowerCase().replace(/_/g, '-')}`} style={{ fontSize: '10px', padding: '3px 8px' }}>
                                  {getStatusLabel(item.status || 'preparation_started')}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: '700' }}>₹{item.total.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab Panel: Packing Details */}
                  {previewTab === 'packing' && (
                    <div className="ord-tab-panel animate-fade-in">
                      <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '20px' }}>
                        <div className="ord-payment-summary-card">
                          <h4>Boxes Packed</h4>
                          <p>{previewOrder.boxesPacked !== undefined ? `${previewOrder.boxesPacked} Boxes` : 'Not Packed yet'}</p>
                        </div>
                        <div className="ord-payment-summary-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <h4>Packing Instructions / Notes</h4>
                          <p style={{ fontSize: '13px', fontWeight: '600', color: '#475569', margin: '4px 0 0 0' }}>
                            {previewOrder.pUnitDescription || 'None specified'}
                          </p>
                        </div>
                      </div>

                      <div className="ord-installment-section">
                        <h3>Packed Boxes Contents</h3>
                        <div className="ord-installment-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {previewOrder.boxes && Array.isArray(previewOrder.boxes) && previewOrder.boxes.length > 0 ? (
                            previewOrder.boxes.map((box, bIdx) => {
                              const isReceived = box.received === true || box.status === 'received_at_store';
                              return (
                                <div 
                                  key={bIdx} 
                                  className="ord-installment-card" 
                                  style={{ 
                                    padding: '14px', 
                                    background: isReceived ? '#f0fdf4' : '#faf5ff', 
                                    border: isReceived ? '1.5px solid #10b981' : '1px solid #f3e8ff', 
                                    display: 'block', 
                                    textAlign: 'left',
                                    borderRadius: '10px',
                                    boxShadow: isReceived ? '0 0 12px rgba(16, 185, 129, 0.12)' : 'none',
                                    transition: 'all 0.3s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: '11px', fontWeight: '800', color: isReceived ? '#10b981' : 'var(--primary-color)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        📦 BOX #{box.boxNum}
                                      </span>
                                      {isReceived && (
                                        <span style={{ fontSize: '10px', fontWeight: '800', color: '#10b981', background: '#d1fae5', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                          ✓ RECEIVED AT STORE
                                        </span>
                                      )}
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: '600', color: isReceived ? '#14532d' : '#1e293b', whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                                      {box.contents}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : previewOrder.boxContents ? (
                            <div className="ord-installment-card" style={{ padding: '14px', background: '#faf5ff', border: '1px solid #f3e8ff', display: 'block', textAlign: 'left' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--primary-color)', textTransform: 'uppercase' }}>
                                  📦 Dynamic Box Contents
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', whiteSpace: 'pre-wrap', marginTop: '4px' }}>
                                  {previewOrder.boxContents}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="ord-timeline-empty" style={{ padding: '30px', background: '#f8fafc', color: '#64748b' }}>
                              No packing details or boxes recorded yet for this order.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab Panel: Payment History */}
                  {previewTab === 'payment' && (
                    <div className="ord-tab-panel">
                      <div className="ord-payment-summary-grid">
                        <div className="ord-payment-summary-card">
                          <h4>Total Bill</h4>
                          <p>₹{previewOrder.totalAmount.toFixed(2)}</p>
                        </div>
                        <div className="ord-payment-summary-card">
                          <h4>Total Paid</h4>
                          <p>₹{previewOrder.receivedAmount.toFixed(2)}</p>
                        </div>
                        <div className={`ord-payment-summary-card due ${balanceDue <= 0 ? 'paid' : ''}`}>
                          <h4>Balance Due</h4>
                          <p>₹{Math.max(0, balanceDue).toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Add Inline Installment Form */}
                      {balanceDue > 0.01 && (
                        <form onSubmit={handleAddPaymentSubmit} style={{ marginTop: '0', marginBottom: '24px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                          <h4 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--primary-color)', marginTop: '0' }}>Record New Payment</h4>
                          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Amount (₹) *</label>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                required
                                value={addPayAmount}
                                onChange={(e) => setAddPayAmount(e.target.value)}
                                max={balanceDue}
                                min="0.01"
                                style={{
                                  height: '36px',
                                  padding: '0 10px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  fontWeight: '700',
                                  boxSizing: 'border-box',
                                  width: '100%',
                                  background: '#FFFFFF'
                                }}
                              />
                            </div>
                            <div style={{ flex: 1.5, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                              <div style={{ display: 'flex', gap: '4px', height: '36px' }}>
                                {['UPI', 'Cash', 'Card'].map(mode => (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setAddPayMode(mode)}
                                    style={{
                                      flex: 1,
                                      border: '1.5px solid ' + (addPayMode === mode ? 'var(--primary-color)' : 'var(--border-color)'),
                                      background: addPayMode === mode ? 'var(--primary-color)' : '#FFFFFF',
                                      color: addPayMode === mode ? '#FFFFFF' : 'var(--text-secondary)',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {mode}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div style={{ flex: 2, minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Notes / Reference</label>
                              <input
                                type="text"
                                placeholder="e.g. UPI ID or Installment note"
                                value={addPayNotes}
                                onChange={(e) => setAddPayNotes(e.target.value)}
                                style={{
                                  height: '36px',
                                  padding: '0 10px',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '6px',
                                  fontSize: '13px',
                                  boxSizing: 'border-box',
                                  width: '100%',
                                  background: '#FFFFFF'
                                }}
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={addingPayment}
                              style={{
                                flex: 1,
                                minWidth: '120px',
                                height: '36px',
                                background: 'var(--primary-color)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {addingPayment ? (
                                <div className="loader" style={{ width: '14px', height: '14px', borderTopColor: '#fff' }}></div>
                              ) : (
                                <>
                                  <Plus size={14} /> Record Payment
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="ord-installment-section">
                        <h3>Installment timeline</h3>
                        <div className="ord-installment-timeline">
                          {previewInstallments.length > 0 ? (
                            previewInstallments.map((inst, idx) => (
                              <div key={inst.id || idx} className="ord-installment-card">
                                <div className="ord-inst-left">
                                  <span className="ord-inst-date">
                                    {inst.createdAt?.toDate ? inst.createdAt.toDate().toLocaleString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit'
                                    }) : 'Just now'}
                                  </span>
                                  {inst.notes && <span className="ord-inst-note">{inst.notes}</span>}
                                </div>
                                <div className="ord-inst-right">
                                  <span className="ord-inst-amount">₹{Number(inst.amount).toFixed(2)}</span>
                                  <div>
                                    <span className="ord-inst-mode">{inst.paymentMode || 'Cash'}</span>
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="ord-timeline-empty">
                              No installment payments recorded.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '24px', justifyContent: 'flex-end', gap: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setPreviewOrder(null)}>Close</button>
                  <button
                    className="ord-modal-print-btn"
                    onClick={() => {
                      handlePrintOrder(previewOrder);
                    }}
                  >
                    <Printer size={16} /> Print Receipt
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

    </PortalLayout>
  );
};

export default StorePortal;
