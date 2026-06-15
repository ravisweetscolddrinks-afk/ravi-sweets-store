import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  ShoppingBag,
  User,
  Store,
  X,
  ChevronDown,
  Scale,
  Trash2,
  Minus,
  Calendar,
  Clock,
  ArrowRight,
  Package,
  FileText,
  CreditCard,
  Factory,
  Printer,
  Edit,
  Eye,
  ChevronUp,
  Bluetooth,
  Usb,
  RefreshCw
} from 'lucide-react';
import { buildOrderESCPOS } from '../../utils/qzTray';
import { usePrinter } from '../../context/PrinterContext';
import logo from '../../assets/logo.png';
import { generateGSTInvoice } from '../../utils/invoice';
import { db } from '../../config/firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  deleteDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Orders.css';
import { triggerWhatsAppOrderReady, triggerWhatsAppOrderConfirmation } from '../../utils/whatsapp';


const DEFAULT_ITEM_IMAGE = logo;

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
                    <span className="name">
                      {opt.name || opt.firstName + ' ' + opt.lastName}
                      {opt.isB2B && (
                        <span style={{ fontSize: '9px', background: '#E0F2FE', color: '#0369A1', padding: '1px 4px', borderRadius: '4px', marginLeft: '6px', fontWeight: 'bold' }}>
                          B2B
                        </span>
                      )}
                    </span>
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

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState('items'); // 'items' or 'summary'
  const [searchQuery, setSearchQuery] = useState('');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All');
  const [storeFilter, setStoreFilter] = useState('All');
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [accordionTabs, setAccordionTabs] = useState({}); // { [orderId]: 'items' | 'payment' | 'packing' }
  const getAccordionTab = (orderId) => accordionTabs[orderId] || 'items';
  const setAccordionTab = (orderId, tabName) => setAccordionTabs(prev => ({ ...prev, [orderId]: tabName }));

  // Date helper functions for filter shortcuts
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getTomorrowStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };
  const [previewOrder, setPreviewOrder] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);

  // Form State
  const [customers, setCustomers] = useState([]);
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [pUnits, setPUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [previewTab, setPreviewTab] = useState('items');
  const [previewInstallments, setPreviewInstallments] = useState([]);
  const [addPayAmount, setAddPayAmount] = useState('');
  const [addPayMode, setAddPayMode] = useState('UPI');
  const [addPayNotes, setAddPayNotes] = useState('');
  const [addingPayment, setAddingPayment] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedPUnit, setSelectedPUnit] = useState('');
  const [globalDescription, setGlobalDescription] = useState('');
  const [mUnitDescription, setMUnitDescription] = useState('');
  const [pUnitDescription, setPUnitDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [discount, setDiscount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [cart, setCart] = useState([]);
  const [formErrors, setFormErrors] = useState({});

  // Modals
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // Shared Global Printer Connections
  const {
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB
  } = usePrinter();

  // Create Customer Modal State
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [customerFormData, setCustomerFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    address: '',
    city: '',
    state: '',
    isB2B: false,
    businessName: '',
    gstNumber: ''
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

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

      setCustomers(prev => [newCust, ...prev].sort((a, b) => a.firstName.localeCompare(b.firstName)));
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

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch stores on mount for filters
  useEffect(() => {
    const fetchAllStores = async () => {
      try {
        const snap = await getDocs(collection(db, 'stores'));
        const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetched.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setStores(fetched);
      } catch (error) {
        console.error("Failed to load stores for filter in Orders:", error);
      }
    };
    fetchAllStores();
  }, []);

  useEffect(() => {
    if (showAddModal) {
      const fetchModalData = async () => {
        const [custSnap, storeSnap, itemSnap, muSnap, puSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('firstName', 'asc'))),
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'items'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'packing_units'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
        ]);

        setCustomers(custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setStores(storeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setItems(itemSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setMUnits(muSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setPUnits(puSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCategories(catSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      };
      fetchModalData();
    }
  }, [showAddModal]);

  // Fetch installments dynamic subcollection for order preview
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

  const handleItemClick = (item) => {
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      setWeightInput({ weight: '', amount: '', description: '' });
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const handleWeightCalc = (type, value, price) => {
    if (type === 'weight') {
      const amt = (parseFloat(value) * price).toFixed(2);
      setWeightInput({ ...weightInput, weight: value, amount: isNaN(amt) ? '' : amt });
    } else {
      const wt = (parseFloat(value) / price).toFixed(3);
      setWeightInput({ ...weightInput, weight: isNaN(wt) ? '' : wt, amount: value });
    }
  };

  const addToCart = (item, quantity, total, itemDescription = '') => {
    const existingIndex = cart.findIndex(c => c.id === item.id);

    if (existingIndex > -1) {
      const newCart = [...cart];
      if (item.unit !== 'Weight') {
        newCart[existingIndex].quantity += Number(quantity);
        newCart[existingIndex].total = newCart[existingIndex].quantity * item.price;
      } else {
        newCart[existingIndex].quantity = Number(quantity);
        newCart[existingIndex].total = Number(total);
        newCart[existingIndex].description = itemDescription;
      }
      setCart(newCart);
    } else {
      setCart([...cart, {
        id: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        quantity: Number(quantity),
        total: Number(total),
        description: itemDescription,
        mUnitId: item.mUnitId,
        status: 'preparation_started'
      }]);
    }
    toast.success(`${item.name} added`);
  };

  const updateCartQuantity = (id, delta) => {
    setCart(prev => prev.map(c => {
      if (c.id === id) {
        const newQty = c.quantity + delta;
        if (newQty < 1) return c; // don't decrement below 1
        return { ...c, quantity: newQty, total: newQty * c.price };
      }
      return c;
    }));
  };

  const handleEditCartItem = (item) => {
    const originalItem = items.find(i => i.id === item.id);
    if (!originalItem) return;
    setShowWeightModal(originalItem);
    setWeightInput({
      weight: item.quantity.toString(),
      amount: item.total.toString(),
      description: item.description || ''
    });
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(c => c.id !== id));
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
      console.error("Error calculating sequence prefix for delivery date in Orders:", err);
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


  const saveOrder = async () => {
    const errors = {};
    if (!selectedCustomer) errors.customer = "Customer is required";
    if (!selectedStore) errors.store = "Store is required";
    if (!selectedPUnit) errors.pUnit = "Packing Unit is required";
    if (!deliveryDate) errors.deliveryDate = "Delivery Date is required";
    if (!deliveryTime) errors.deliveryTime = "Delivery Time is required";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setActiveModalTab('items');
      toast.error("Please fill in all mandatory fields");
      return;
    }

    if (cart.length === 0) return toast.error("Cart is empty");

    setFormErrors({});
    setSubmitting(true);
    try {
      let orderId = '';
      let serialNumber = 1;
      if (editingOrderId) {
        const existingOrder = orders.find(o => o.id === editingOrderId);
        orderId = existingOrder?.orderId || generateOrderId();
        serialNumber = existingOrder?.serialNumber || 1;
      } else {
        const seq = await getNextOrderSequenceForDeliveryDate(selectedStore, deliveryDate);
        orderId = generateOrderId();
        serialNumber = seq;
      }
      const customer = customers.find(c => c.id === selectedCustomer);
      const store = stores.find(s => s.id === selectedStore);

      const cartTotalAmt = cart.reduce((sum, item) => sum + item.total, 0);
      const discountVal = parseFloat(discount) || 0;
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
        customerName: `${customer.firstName} ${customer.lastName}`,
        customerPhone: customer.mobileNumber,
        isB2B: customer.isB2B || false,
        businessName: customer.businessName || '',
        gstNumber: customer.gstNumber || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        storeId: selectedStore,
        storeName: store.name,
        pUnitId: selectedPUnit,
        globalDescription,
        mUnitDescription,
        pUnitDescription,
        items: cart,
        discount: discountVal,
        totalAmount: totalAmt,
        receivedAmount: recAmtVal,
        paymentStatus: payStatus,
        paymentMode,
        deliveryDate,
        deliveryTime,
        status: calculateOverallOrderStatus(cart), // new, In Progress, Delivered, etc.
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
            paymentMode: paymentMode,
            notes: 'Initial Down Payment',
            createdAt: serverTimestamp()
          });
        }
        toast.success(`Order #${orderId} saved successfully!`);
        setTimeout(() => triggerWhatsAppOrderConfirmation({ id: orderRef.id, ...orderData }), 500);
      }

      if (statusChangedToReady) {
        setTimeout(() => triggerWhatsAppOrderReady(orderData), 500);
      }

      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error("Save Error:", error);
      toast.error("Failed to save order");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCustomer('');
    setSelectedStore('');
    setSelectedPUnit('');
    setGlobalDescription('');
    setMUnitDescription('');
    setPUnitDescription('');
    setCart([]);
    setPaymentMode('Cash');
    setReceivedAmount('');
    setDiscount('');
    setDeliveryDate('');
    setDeliveryTime('');
    setEditingOrderId(null);
    setItemSearchQuery('');
    setSelectedCategoryFilter('All');
    setActiveModalTab('items');
    setFormErrors({});
  };

  const handleEditOrder = (order) => {
    setSelectedCustomer(order.customerId);
    setSelectedStore(order.storeId);
    setSelectedPUnit(order.pUnitId || '');
    setGlobalDescription(order.globalDescription || '');
    setMUnitDescription(order.mUnitDescription || '');
    setPUnitDescription(order.pUnitDescription || '');
    setPaymentMode(order.paymentMode || 'Cash');
    setReceivedAmount(order.receivedAmount !== undefined ? order.receivedAmount.toString() : '');
    setDiscount(order.discount !== undefined ? order.discount.toString() : '');
    setDeliveryDate(order.deliveryDate || '');
    setDeliveryTime(order.deliveryTime || '');
    setCart(order.items || []);
    setEditingOrderId(order.id);
    setActiveModalTab('items');
    setShowAddModal(true);
  };

  const handleDeleteOrder = async (id) => {
    if (window.confirm("Are you sure you want to delete this order?")) {
      try {
        await deleteDoc(doc(db, 'orders', id));
        toast.success("Order deleted successfully");
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete order");
      }
    }
  };

  const isOrderB2B = (order) => {
    if (order.isB2B) return true;
    const cust = customers.find(c => c.id === order.customerId);
    return cust?.isB2B || false;
  };

  const handleInvoiceClick = (order) => {
    const cust = customers.find(c => c.id === order.customerId);
    const enrichedOrder = {
      ...order,
      businessName: order.businessName || cust?.businessName || '',
      gstNumber: order.gstNumber || cust?.gstNumber || '',
      address: order.address || cust?.address || '',
      city: order.city || cust?.city || '',
      state: order.state || cust?.state || '',
    };
    generateGSTInvoice(enrichedOrder);
  };

  const handlePrintReceipt = (order) => {
    const printContent = `
      <html>
        <head>
          <title>Print Bill</title>
          <style>
            body { font-family: monospace; width: 300px; margin: 0 auto; padding: 20px; color: black; }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { text-align: left; padding: 4px 0; border-bottom: 1px dashed #ccc; font-size: 12px; }
            .total { margin-top: 10px; text-align: right; font-weight: bold; font-size: 14px; }
            .divider { border-bottom: 1px dashed black; margin: 10px 0; }
            @media print {
              body { width: 100%; margin: 0; padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="center" style="margin-bottom: 8px;">
            <img src="${logo}" alt="Logo" style="max-height: 50px; width: auto; object-fit: contain;" />
          </div>
          <div class="center bold" style="font-size: 18px;">Ravi Sweets</div>
          <div class="center" style="font-size: 12px; margin-bottom: 10px;">${order.storeName}</div>
          <div>Order: ${order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId}`}</div>
          <div>Date: ${order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : ''}</div>
          <div>Customer: ${order.customerName}</div>
          <div>Phone: ${order.customerPhone}</div>
          <div class="divider"></div>
          <table>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Amt</th>
            </tr>
            ${order.items.map(item => `
              <tr>
                <td>${item.name}</td>
                <td>${item.unit === 'Weight' ? item.quantity + 'kg' : item.quantity + 'pcs'}</td>
                <td>₹${item.total.toFixed(2)}</td>
              </tr>
            `).join('')}
          </table>
          <div class="divider"></div>
          <div style="font-size: 12px; line-height: 1.5; margin-top: 10px;">
            ${Number(order.discount || 0) > 0 ? `
            <div style="display: flex; justify-content: space-between;">
              <span>Cart Total:</span>
              <span>₹${(Number(order.totalAmount || 0) + Number(order.discount || 0)).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; color: #dc2626;">
              <span>Discount:</span>
              <span>-₹${Number(order.discount || 0).toFixed(2)}</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between;">
              <span>Subtotal (Excl. Tax):</span>
              <span>₹${(Number(order.totalAmount || 0) / 1.05).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>GST (5%):</span>
              <span>₹${(Number(order.totalAmount || 0) - (Number(order.totalAmount || 0) / 1.05)).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold; border-top: 1px dashed #000; padding-top: 2px; margin-top: 2px;">
              <span>GRAND TOTAL:</span>
              <span class="bold">₹${Number(order.totalAmount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 4px;">
              <span>ADVANCE PAID:</span>
              <span>₹${Number(order.receivedAmount || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px;">
              <span>BALANCE DUE:</span>
              <span class="bold">₹${(Number(order.totalAmount || 0) - Number(order.receivedAmount || 0)).toFixed(2)}</span>
            </div>
          </div>
          <div class="divider"></div>
          <div class="center" style="font-size: 12px;">Thank you for your business!</div>
          <div class="center" style="font-size: 12px; margin-top: 4px;">Please visit again.</div>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
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
        bytes.push(...encoder.encode(`Cart Total: ${`Rs.${grossTotal.toFixed(2)}`.padStart(20, ' ')}\n`));
        bytes.push(...encoder.encode(`Discount:   ${`-Rs.${discountVal.toFixed(2)}`.padStart(20, ' ')}\n`));
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
      handlePrintReceipt(order);
    }
  };

  const handlePrint = async (order) => {
    if (bluetoothConnected) {
      printOrderDirectToBluetooth(order);
    } else if (qzConnected && selectedQZPrinter) {
      try {
        toast.loading("Printing to USB printer via QZ Tray...", { id: 'qz-print' });
        const bytes = buildOrderESCPOS(order);
        await printRawUSB(bytes);
        toast.dismiss('qz-print');
        toast.success("Order printed successfully (USB)!");
      } catch (err) {
        console.error('QZ Print error:', err);
        toast.dismiss('qz-print');
        toast.error("USB print failed. Opening system print fallback...");
        handlePrintReceipt(order);
      }
    } else {
      handlePrintReceipt(order);
    }
  };



  const toggleOrderAccordion = (id) => {
    setExpandedOrders(prev => prev.includes(id) ? prev.filter(oId => oId !== id) : [...prev, id]);
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

  const getStatusLabel = (status) => {
    if (!status) return 'NEW';
    return status.replace(/_/g, ' ').toUpperCase();
  };

  const filteredItemsForOrder = items.filter(item => {
    const matchesSearch = (item.name || '').toLowerCase().includes(itemSearchQuery.toLowerCase());
    const matchesCategory = selectedCategoryFilter === 'All' || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const discountVal = parseFloat(discount) || 0;
  const totalAmount = Math.max(0, cartTotal - discountVal);
  const recAmt = parseFloat(receivedAmount) || 0;
  let paymentStatus = 'Pending';
  if (recAmt > 0) {
    if (recAmt >= totalAmount) {
      paymentStatus = 'Done';
    } else {
      paymentStatus = 'Partial';
    }
  }

  const filteredOrders = orders.filter(o => {
    const matchesSearch = 
      (o.orderId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.customerPhone || '').includes(searchQuery);
    const matchesDate = !deliveryDateFilter || o.deliveryDate === deliveryDateFilter;
    const matchesStatus = statusFilter === 'All' || (o.status || 'new').toLowerCase().trim() === statusFilter.toLowerCase().trim();
    const matchesPaymentStatus = paymentStatusFilter === 'All' || (o.paymentStatus || 'Pending').toLowerCase().trim() === paymentStatusFilter.toLowerCase().trim();
    const matchesStore = storeFilter === 'All' || o.storeId === storeFilter;
    return matchesSearch && matchesDate && matchesStatus && matchesPaymentStatus && matchesStore;
  });

  return (
    <div className="orders-container">
      <div className="orders-header">
        <div className="orders-header-info">
          <h1>Customer Orders</h1>
          <p>Track and manage customer sweet orders and factory production</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="add-order-btn" onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}>
            <Plus size={20} /> Create New Order
          </button>
        </div>
      </div>

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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '100px' }}><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></td></tr>
            ) : filteredOrders.length > 0 ? (
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
                      <div className="ord-actions-cell">
                        <button className="ord-action-btn view" title="Preview" onClick={() => { setPreviewTab('items'); setPreviewOrder(order); }}><Eye size={16} /></button>
                        {isOrderB2B(order) && (
                          <button className="ord-action-btn print" title="Invoice" onClick={() => handleInvoiceClick(order)} style={{ background: '#E0F2FE', color: '#0369A1' }}><FileText size={16} /></button>
                        )}
                        <button className="ord-action-btn print" title="Print" onClick={() => handlePrint(order)}><Printer size={16} /></button>
                        <button className="ord-action-btn edit" title="Edit" onClick={() => handleEditOrder(order)}><Edit size={16} /></button>
                        <button className="ord-action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}><Trash2 size={16} /></button>
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
                  {(searchQuery || deliveryDateFilter || statusFilter !== 'All' || paymentStatusFilter !== 'All' || storeFilter !== 'All') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setDeliveryDateFilter('');
                        setStatusFilter('All');
                        setPaymentStatusFilter('All');
                        setStoreFilter('All');
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

      {/* Mobile & Tablet Card View */}
      <div className="ord-mobile-cards-list">
        {loading ? (
          <div className="ord-portal-loading"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>
        ) : filteredOrders.length > 0 ? (
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

                {/* Card Actions */}
                <div className="ord-mobile-card-actions" style={{ flexWrap: 'wrap', gap: '5px' }}>
                  <button className="ord-mobile-action-btn view" title="Preview" onClick={() => { setPreviewTab('items'); setPreviewOrder(order); }}><Eye size={14} /> Preview</button>
                  {isOrderB2B(order) && (
                    <button className="ord-mobile-action-btn print" title="Invoice" onClick={() => handleInvoiceClick(order)} style={{ background: '#E0F2FE', color: '#0369A1' }}><FileText size={14} /> Invoice</button>
                  )}
                  <button className="ord-mobile-action-btn print" title="Print" onClick={() => handlePrint(order)}><Printer size={14} /> Print</button>
                  <button className="ord-mobile-action-btn edit" title="Edit" onClick={() => handleEditOrder(order)}><Edit size={14} /> Edit</button>
                  <button className="ord-mobile-action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}><Trash2 size={14} /> Delete</button>
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
                            <h4 style={{ fontSize: '9px', margin: '0 0 2px 0' }}>Boxes Packed</h4>
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
                                No packing details or boxes recorded yet for this order.
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
          <div className="ord-orders-empty">
            <Calendar size={36} style={{ margin: '0 auto 12px', opacity: 0.5, color: 'var(--primary-color)' }} />
            <h3>No Orders Found</h3>
            <p>Try adjusting your filters or date selection.</p>
          </div>
        )}
      </div>

      {/* Add Order Full Screen Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className="ord-full-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="ord-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <ShoppingBag size={24} color="var(--primary-color)" />
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: '800' }}>{editingOrderId ? 'Edit Customer Order' : 'Create New Customer Order'}</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{editingOrderId ? 'Update customer details and items' : 'Fill in customer details and select items'}</p>
                </div>
              </div>
              <button className="items-close-btn" onClick={() => setShowAddModal(false)}><X size={24} /></button>
            </div>

            {/* Mobile Modal Tabs */}
            <div className="ord-modal-tabs-mobile">
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
                {cart.length > 0 && (
                  <span className="cart-badge-dot">{cart.length}</span>
                )}
              </button>
            </div>

            <div className="ord-modal-content">
              {/* Left Panel: Form & Selection */}
              <div className={`ord-items-panel ${activeModalTab === 'items' ? 'show-mobile' : 'hide-mobile'}`}>
                <div className="ord-panel-header">
                  <div className="ord-panel-top">
                    <CustomDropdown
                      label="Select Customer *"
                      options={customers}
                      onSelect={setSelectedCustomer}
                      selectedValue={selectedCustomer}
                      placeholder="Search name or number..."
                      icon={User}
                      onCreateClick={handleOpenCreateCustomer}
                      hasError={!!formErrors.customer}
                      errorMsg={formErrors.customer}
                    />
                    <CustomDropdown
                      label="Select Delivery Store *"
                      options={stores}
                      onSelect={setSelectedStore}
                      selectedValue={selectedStore}
                      placeholder="Select a store..."
                      icon={Store}
                      hasError={!!formErrors.store}
                      errorMsg={formErrors.store}
                    />
                    <CustomDropdown
                      label="Select Packing Unit *"
                      options={pUnits}
                      onSelect={setSelectedPUnit}
                      selectedValue={selectedPUnit}
                      placeholder="Select a packing unit..."
                      icon={Package}
                      hasError={!!formErrors.pUnit}
                      errorMsg={formErrors.pUnit}
                    />
                  </div>

                  {/* Delivery Date, Time & Packing Description */}
                  <div className="ord-delivery-fields-row">
                    <div style={{ flex: 1, minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
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
                    <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
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
                    <div style={{ flex: 2, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Packing Unit Description</label>
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
                </div>

                <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={18} color="var(--primary-color)" />
                  <h3 style={{ fontSize: '16px', fontWeight: '800' }}>Select Items</h3>
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

                <div className="ord-items-grid">
                  {filteredItemsForOrder.length > 0 ? (
                    filteredItemsForOrder.map(item => {
                      const cartItem = cart.find(ci => ci.id === item.id);
                      const isInCart = !!cartItem;
                      return (
                        <div key={item.id} className={`ord-selectable-card ${isInCart ? 'in-cart' : ''}`} onClick={() => handleItemClick(item)}>
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
                <h2><FileText size={20} /> Order Summary</h2>

                <div className="ord-summary-list">
                  {cart.length > 0 ? cart.map((item, idx) => (
                    <div key={idx} className="ord-summary-item">
                      <div className="ord-item-info">
                        <h4>{item.name}</h4>
                        <p>{item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity} pcs`} @ ₹{item.price}</p>
                        {item.description && <p className="item-note">Note: {item.description}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {item.unit === 'Weight' ? (
                          <button onClick={() => handleEditCartItem(item)} className="ord-edit-cart-btn" title="Edit Weight">
                            <Edit size={14} />
                          </button>
                        ) : (
                          <div className="ord-qty-controls">
                            <button onClick={() => updateCartQuantity(item.id, -1)}><Minus size={12} /></button>
                            <span>{item.quantity}</span>
                            <button onClick={() => updateCartQuantity(item.id, 1)}><Plus size={12} /></button>
                          </div>
                        )}
                        <div className="ord-item-price">
                          <span className="amt">₹{item.total.toFixed(2)}</span>
                        </div>
                        <button onClick={() => removeFromCart(item.id)} style={{ color: 'var(--error-color)', background: 'none' }} title="Remove Item">
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                      <ShoppingBag size={32} style={{ marginBottom: '10px' }} />
                      <p>Your cart is empty</p>
                    </div>
                  )}
                </div>

                <div className="ord-summary-totals" style={{ borderTop: 'none', paddingTop: '0' }}>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    <span>Cart Total</span>
                    <span>₹{cartTotal.toFixed(2)}</span>
                  </div>
                  {discountVal > 0 && (
                    <div className="ord-total-row" style={{ fontSize: '13px', color: '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                      <span>Discount</span>
                      <span>-₹{discountVal.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                    <span>Subtotal (Excl. Tax)</span>
                    <span>₹{(totalAmount / 1.05).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600', marginTop: '2px' }}>
                    <span>GST (5%)</span>
                    <span>₹{(totalAmount - (totalAmount / 1.05)).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ borderTop: '1px dashed var(--border-color)', marginTop: '6px', paddingTop: '6px' }}>
                    <span>Grand Total (Incl. Tax)</span>
                    <span>₹{totalAmount.toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: '#16a34a', fontWeight: '700', marginTop: '2px' }}>
                    <span>Total Paid</span>
                    <span>₹{(parseFloat(receivedAmount) || 0).toFixed(2)}</span>
                  </div>
                  <div className="ord-total-row" style={{ fontSize: '13px', color: '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                    <span>Balance Due</span>
                    <span>₹{Math.max(0, totalAmount - (parseFloat(receivedAmount) || 0)).toFixed(2)}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Discount (₹)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
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
                        <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>Payment Mode</label>
                        <div className="ord-payment-modes" style={{ marginTop: '0', display: 'flex', gap: '5px', height: '38px' }}>
                          {['Cash', 'UPI', 'Card'].map(mode => (
                            <button
                              type="button"
                              key={mode}
                              className={`ord-mode-btn ${paymentMode === mode ? 'active' : ''}`}
                              onClick={() => setPaymentMode(mode)}
                              style={{ flex: 1, height: '100%', padding: 0 }}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '15px' }}>
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
                          <span className={`ord-status-badge ${paymentStatus}`} style={{ fontSize: '11px', padding: '5px 12px' }}>
                            {paymentStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="ord-save-btn" onClick={saveOrder} disabled={submitting}>
                    {submitting ? <div className="loader"></div> : 'Confirm & Save Order'}
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
            <motion.div
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
                <Scale size={32} />
              </div>
              <h3 className="modal-title">Enter Quantity for {showWeightModal.name}</h3>

              <div className="ord-weight-form">
                <div className="ord-weight-input-group">
                  <label>Weight (kg)</label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={weightInput.weight}
                    onChange={(e) => handleWeightCalc('weight', e.target.value, showWeightModal.price)}
                  />
                </div>
                <div style={{ textAlign: 'center', fontWeight: '700', opacity: 0.5 }}>OR</div>
                <div className="ord-weight-input-group">
                  <label>Amount (₹)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={weightInput.amount}
                    onChange={(e) => handleWeightCalc('amount', e.target.value, showWeightModal.price)}
                  />
                </div>

                <div className="ord-weight-input-group">
                  <label>Manufacturing description</label>
                  <textarea
                    placeholder="e.g. less sugar, extra packing..."
                    value={weightInput.description}
                    onChange={(e) => setWeightInput({ ...weightInput, description: e.target.value })}
                    style={{
                      height: '60px',
                      padding: '10px',
                      border: '1px solid var(--border-color)',
                      border_radius: '10px',
                      font_size: '14px',
                      resize: 'none'
                    }}
                  />
                </div>

                <div className="modal-actions" style={{ marginTop: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setShowWeightModal(null)}>Cancel</button>
                  <button
                    className="modal-btn confirm"
                    style={{ background: 'var(--primary-color)' }}
                    onClick={() => {
                      if (weightInput.weight && weightInput.amount) {
                        addToCart(showWeightModal, weightInput.weight, weightInput.amount, weightInput.description);
                        setShowWeightModal(null);
                      } else {
                        toast.error("Please enter weight or amount");
                      }
                    }}
                  >
                    Add to Order
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal */}
      <AnimatePresence>
        {previewOrder && (() => {
          const balanceDue = Number(previewOrder.totalAmount || 0) - Number(previewOrder.receivedAmount || 0);
          return (
            <div className="modal-overlay" style={{ zIndex: 3000 }}>
              <motion.div
                className="custom-modal ord-preview-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
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
                    <div className="ord-tab-panel animate-fade-in">
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div className="ord-payment-summary-grid">
                          <div className="ord-payment-summary-card">
                            <h4>Boxes Packed</h4>
                            <p>{previewOrder.boxesPacked !== undefined ? `${previewOrder.boxesPacked} Boxes` : 'Not Packed yet'}</p>
                          </div>
                          <div className="ord-payment-summary-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <h4 style={{ margin: '0 0 4px 0' }}>Packing Instructions / Notes</h4>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#475569', margin: '2px 0 0 0' }}>
                              {previewOrder.pUnitDescription || 'None specified'}
                            </p>
                          </div>
                        </div>

                        <div className="ord-installment-section">
                          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Packed Boxes Contents</h3>
                          <div className="ord-installment-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '250px', overflowY: 'auto' }}>
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
                    </div>
                  )}

                  {/* Tab Panel: Payment History */}
                  {previewTab === 'payment' && (
                    <div className="ord-tab-panel animate-fade-in">
                      <div className="ord-payment-summary-grid" style={{ gridTemplateColumns: previewOrder.discount > 0 ? 'repeat(auto-fit, minmax(110px, 1fr))' : 'repeat(3, 1fr)' }}>
                        {previewOrder.discount > 0 && (
                          <>
                            <div className="ord-payment-summary-card">
                              <h4>Cart Total</h4>
                              <p>₹{(previewOrder.totalAmount + previewOrder.discount).toFixed(2)}</p>
                            </div>
                            <div className="ord-payment-summary-card" style={{ color: '#dc2626' }}>
                              <h4>Discount</h4>
                              <p>-₹{previewOrder.discount.toFixed(2)}</p>
                            </div>
                          </>
                        )}
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
                                width: '100%',
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
                  )}
                </div>

                <div className="modal-actions" style={{ marginTop: '24px', justifyContent: 'flex-end', gap: '10px' }}>
                  <button className="modal-btn cancel" onClick={() => setPreviewOrder(null)}>Close</button>
                  {previewOrder && isOrderB2B(previewOrder) && (
                    <button
                      className="ord-modal-print-btn"
                      style={{ background: '#E0F2FE', color: '#0369A1', border: '1px solid #BCE0FD' }}
                      onClick={() => {
                        handleInvoiceClick(previewOrder);
                      }}
                    >
                      <FileText size={16} /> GST Invoice
                    </button>
                  )}
                  <button
                    className="ord-modal-print-btn"
                    onClick={() => {
                      handlePrint(previewOrder);
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

      {/* Create Customer Modal */}
      <AnimatePresence>
        {showCreateCustomerModal && (
          <div className="modal-overlay" style={{ zIndex: 3000 }}>
            <motion.div
              className="custom-modal"
              style={{ maxWidth: '500px', width: '90%' }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <User size={32} />
              </div>
              <h3 className="modal-title" style={{ marginBottom: '5px' }}>Create New Customer</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '20px' }}>Fill in customer details to save and select automatically</p>

              <form onSubmit={handleSaveCustomer} className="ord-weight-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>First Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="First Name"
                      value={customerFormData.firstName}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, firstName: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Last Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Last Name"
                      value={customerFormData.lastName}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, lastName: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={customerFormData.mobileNumber}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, mobileNumber: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '5px 0' }}>
                  <input 
                    type="checkbox" 
                    name="isB2B" 
                    id="modalIsB2B" 
                    checked={customerFormData.isB2B || false} 
                    onChange={(e) => setCustomerFormData({ ...customerFormData, isB2B: e.target.checked })}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                  />
                  <label htmlFor="modalIsB2B" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', margin: 0 }}>Is B2B Customer?</label>
                </div>

                {customerFormData.isB2B && (
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Business Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="Business Name"
                        value={customerFormData.businessName || ''}
                        onChange={(e) => setCustomerFormData({ ...customerFormData, businessName: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>GST Number *</label>
                      <input
                        type="text"
                        required
                        placeholder="15-digit GSTIN"
                        value={customerFormData.gstNumber || ''}
                        onChange={(e) => setCustomerFormData({ ...customerFormData, gstNumber: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>Full Address</label>
                  <textarea
                    placeholder="Enter street address..."
                    value={customerFormData.address}
                    onChange={(e) => setCustomerFormData({ ...customerFormData, address: e.target.value })}
                    style={{
                      width: '100%',
                      height: '60px',
                      padding: '10px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'none',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '15px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>City</label>
                    <input
                      type="text"
                      placeholder="City"
                      value={customerFormData.city}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, city: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', display: 'block', textAlign: 'left' }}>State</label>
                    <input
                      type="text"
                      placeholder="State"
                      value={customerFormData.state}
                      onChange={(e) => setCustomerFormData({ ...customerFormData, state: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '14px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="modal-btn cancel" onClick={() => setShowCreateCustomerModal(false)} disabled={savingCustomer}>Cancel</button>
                  <button
                    type="submit"
                    className="modal-btn confirm"
                    style={{ background: 'var(--primary-color)' }}
                    disabled={savingCustomer}
                  >
                    {savingCustomer ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Save & Select'}
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

export default Orders;
