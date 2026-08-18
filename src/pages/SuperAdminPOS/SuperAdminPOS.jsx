import React, { useState, useEffect, useRef } from 'react';
import { 
  CreditCard, 
  Search, 
  Store as StoreIcon, 
  UserPlus, 
  Barcode, 
  Plus, 
  Minus, 
  Trash2, 
  X, 
  Printer, 
  Save, 
  CheckCircle2, 
  Scale, 
  Clock,
  Receipt,
  UserCheck,
  ShoppingBag,
  Bluetooth,
  Usb,
  RefreshCw
} from 'lucide-react';

import { usePrinter } from '../../context/PrinterContext';
import { buildBillESCPOS } from '../../utils/qzTray';
import { generateReceiptHTML } from '../../utils/printReceiptHelper';
import { db } from '../../config/firebase';

import { collection, addDoc, getDocs, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import logo from '../../assets/logo.png';
import './SuperAdminPOS.css';

const DEFAULT_ITEM_IMAGE = logo;


const SuperAdminPOS = () => {
  const {
    bluetoothConnected,
    connectedDevice,
    qzConnected,
    selectedQZPrinter,
    printRawUSB,
    showBluetoothModal,
    showQZModal,
    qzConnecting,
    setShowBluetoothModal,
    setShowQZModal,
    handleBluetoothConnect,
    disconnectPrinter,
    connectQZTray,
    disconnectQZTray,
    printHTMLContent
  } = usePrinter();

  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedStoreName, setSelectedStoreName] = useState('');
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);


  // Active Billing State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const custDropdownRef = useRef(null);
  const [itemSearch, setItemSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef(null);

  // Sub Tab State: 'pos' or 'saved_bills'
  const [activeTab, setActiveTab] = useState('pos');
  const [savedBillsList, setSavedBillsList] = useState([]);
  const [cart, setCart] = useState([]);
  const [posDiscount, setPosDiscount] = useState('');
  const [discountType, setDiscountType] = useState('percent'); // 'percent' (%) or 'amount' (₹)
  const [paymentMode, setPaymentMode] = useState('Cash'); // 'UPI', 'Cash', 'Card'

  const [submittingBill, setSubmittingBill] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (custDropdownRef.current && !custDropdownRef.current.contains(e.target)) {
        setShowCustDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeTab === 'pos' && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [activeTab]);



  // Create Customer Modal State
  const [showCreateCustomerModal, setShowCreateCustomerModal] = useState(false);
  const [custForm, setCustForm] = useState({ firstName: '', lastName: '', mobileNumber: '', address: '', city: '', isB2B: false, companyName: '', gstNumber: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);


  // Weight Item Modal
  const [showWeightModal, setShowWeightModal] = useState(null);
  const [weightInput, setWeightInput] = useState({ weight: '', amount: '' });

  // Receipt Modal
  const [receiptBill, setReceiptBill] = useState(null);

  // Fetch Stores
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'stores'), orderBy('name', 'asc')));
        const storeList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStores(storeList);
        if (storeList.length > 0) {
          setSelectedStoreId(storeList[0].id);
          setSelectedStoreName(storeList[0].name);
        }
      } catch (err) {
        console.error("Error fetching stores:", err);
      }
    };
    fetchStores();
  }, []);

  // Fetch Items & Customers
  useEffect(() => {
    setLoading(true);
    const qItems = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubItems = onSnapshot(qItems, (snap) => {
      setItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const qCust = query(collection(db, 'customers'), orderBy('firstName', 'asc'));
    const unsubCust = onSnapshot(qCust, (snap) => {
      setCustomers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubItems();
      unsubCust();
    };
  }, []);

  // Fetch Saved (Parked) Bills for selected store
  useEffect(() => {
    if (!selectedStoreId) return;
    const qSaved = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));
    const unsubSaved = onSnapshot(qSaved, (snap) => {
      const allBills = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const storeSaved = allBills.filter(b => b.storeId === selectedStoreId && b.status === 'saved');
      setSavedBillsList(storeSaved);
    });
    return () => unsubSaved();
  }, [selectedStoreId]);

  // Handle Store Selection Change
  const handleStoreChange = (e) => {
    const sId = e.target.value;
    setSelectedStoreId(sId);
    const found = stores.find(s => s.id === sId);
    if (found) setSelectedStoreName(found.name);
  };

  // Barcode Scanner Form Submit
  const handleBarcodeSubmit = (e) => {
    if (e) e.preventDefault();
    const cleanInput = barcodeInput.trim();
    if (!cleanInput) return;

    // Support barcodeID*quantity e.g. 890123456789*500 or 890123456789*2
    const parts = cleanInput.split('*');
    const scannedCode = parts[0].trim();
    const multiplier = parts.length > 1 ? parseFloat(parts[1]) : null;

    const foundItem = items.find(i => 
      (i.barcode || i.barcodeId || '').toLowerCase() === scannedCode.toLowerCase() ||
      i.id === scannedCode ||
      i.name.toLowerCase() === scannedCode.toLowerCase()
    );

    if (foundItem) {
      if (foundItem.unit === 'Weight') {
        let weightInKg = 1;
        if (multiplier) {
          weightInKg = multiplier > 20 ? multiplier / 1000 : multiplier;
        }
        const amt = (weightInKg * foundItem.price).toFixed(2);
        addToCart(foundItem, weightInKg.toFixed(3), amt);
        toast.success(`Scanned: ${foundItem.name} (${weightInKg} kg)`);
      } else {
        const qty = multiplier ? Math.round(multiplier) : 1;
        addToCart(foundItem, qty, foundItem.price * qty);
        toast.success(`Scanned: ${foundItem.name} (${qty} pcs)`);
      }
    } else {
      toast.error(`No item found matching Barcode ID: "${scannedCode}"`);
    }

    setBarcodeInput('');
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const addToCart = (item, quantity, amount) => {
    const existingIndex = cart.findIndex(c => c.id === item.id);
    if (existingIndex > -1) {
      setCart(prev => prev.map((c, i) => {
        if (i === existingIndex) {
          if (item.unit === 'Weight') {
            const newWeight = (parseFloat(c.quantity) + parseFloat(quantity)).toFixed(3);
            const newTotal = parseFloat(newWeight) * c.price;
            return { ...c, quantity: newWeight, total: newTotal };
          } else {
            const newQty = parseInt(c.quantity) + parseInt(quantity);
            const newTotal = newQty * c.price;
            return { ...c, quantity: newQty, total: newTotal };
          }
        }
        return c;
      }));
    } else {
      setCart(prev => [...prev, {
        id: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        quantity: item.unit === 'Weight' ? parseFloat(quantity).toFixed(3) : parseInt(quantity),
        total: parseFloat(amount)
      }]);
    }
  };


  const handleItemClick = (item) => {
    if (item.unit === 'Weight') {
      setShowWeightModal(item);
      const existing = cart.find(c => c.id === item.id);
      setWeightInput({
        weight: existing ? existing.quantity.toString() : '',
        amount: existing ? existing.total.toString() : ''
      });
    } else {
      addToCart(item, 1, item.price);
    }
  };

  const handleWeightCalc = (type, val) => {
    const price = showWeightModal.price;
    if (type === 'weight') {
      const amt = (parseFloat(val) * price).toFixed(2);
      setWeightInput({ weight: val, amount: isNaN(amt) ? '' : amt });
    } else {
      const wt = (parseFloat(val) / price).toFixed(3);
      setWeightInput({ weight: isNaN(wt) ? '' : wt, amount: val });
    }
  };

  const confirmWeightAdd = () => {
    if (!weightInput.weight || !weightInput.amount) return;
    addToCart(showWeightModal, weightInput.weight, weightInput.amount);
    setShowWeightModal(null);
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
          return { ...c, quantity: isWeight ? newQty.toFixed(3) : newQty, total: newQty * c.price };
        }
        return c;
      });
    });
  };

  // Create Customer Handler
  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!custForm.firstName || !custForm.mobileNumber) {
      toast.error("First Name and Mobile Number are required");
      return;
    }
    setSavingCustomer(true);
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...custForm,
        createdAt: serverTimestamp()
      });
      const newCust = { id: docRef.id, ...custForm };
      setCustomers(prev => [newCust, ...prev]);
      setSelectedCustomerId(docRef.id);
      toast.success("Customer created and selected!");
      setShowCreateCustomerModal(false);
      setCustForm({ firstName: '', lastName: '', mobileNumber: '', address: '', city: '', isB2B: false, companyName: '', gstNumber: '' });

    } catch (err) {
      console.error(err);
      toast.error("Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  };

  const generateBillId = () => {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `SB${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  // Save / Settle Bill Implementation
  const processBill = async (billStatus) => {
    if (cart.length === 0) {
      toast.error("Shopping cart is empty");
      return;
    }


    setSubmittingBill(true);
    try {
      const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);
      const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
      const rawDiscount = parseFloat(posDiscount) || 0;
      const discountVal = discountType === 'percent' ? (cartTotal * rawDiscount) / 100 : rawDiscount;
      const totalAmt = Math.max(0, cartTotal - discountVal);


      const selectedStoreObj = stores.find(s => s.id === selectedStoreId);
      const billId = editingBillId ? (savedBillsList.find(b => b.id === editingBillId)?.billId || generateBillId()) : generateBillId();

      const billData = {
        billId,
        storeId: selectedStoreId,
        storeName: selectedStoreName || selectedStoreObj?.name || 'Outlet Store',
        tradeName: selectedStoreObj?.tradeName || selectedStoreObj?.name || 'Raju Ghee Sweets',
        storeGstNumber: selectedStoreObj?.gstNumber || '',
        storeAddress: selectedStoreObj?.address || '',
        storePhone: selectedStoreObj?.phone || '',
        storeCity: selectedStoreObj?.city || '',
        storeState: selectedStoreObj?.state || '',
        customerId: selectedCustomerId,
        customerName: selectedCustomerObj ? `${selectedCustomerObj.firstName} ${selectedCustomerObj.lastName || ''}`.trim() : 'Walk-in Customer',
        customerPhone: selectedCustomerObj ? selectedCustomerObj.mobileNumber : '',
        isB2B: selectedCustomerObj ? (selectedCustomerObj.isB2B || false) : false,
        companyName: selectedCustomerObj ? (selectedCustomerObj.companyName || '') : '',
        customerGst: selectedCustomerObj ? (selectedCustomerObj.gstNumber || selectedCustomerObj.gst || '') : '',

        items: cart,
        discount: discountVal,
        totalAmount: totalAmt,
        paymentMode,
        status: billStatus, // 'settled' or 'saved'
        date: new Date().toLocaleDateString('en-IN'),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (editingBillId) {
        await updateDoc(doc(db, 'bills', editingBillId), billData);
        await updateDoc(doc(db, 'stores', selectedStoreId, 'bills', editingBillId), billData).catch(() => {});
        toast.success(`Bill #${billId} ${billStatus === 'settled' ? 'settled' : 'updated & saved'}!`);
      } else {
        const docRef = await addDoc(collection(db, 'bills'), billData);
        await addDoc(collection(db, 'stores', selectedStoreId, 'bills'), { ...billData, id: docRef.id }).catch(() => {});
        toast.success(`Bill #${billId} ${billStatus === 'settled' ? 'settled' : 'saved as draft'}!`);
      }

      if (billStatus === 'settled') {
        setReceiptBill(billData);
        handlePrintTrigger(billData);
      }

      // Reset cart and billing state
      setCart([]);
      setPosDiscount('');
      setEditingBillId(null);
      setSelectedCustomerId('');
    } catch (err) {
      console.error("Save/Settle Bill Error:", err);
      toast.error("Failed to process bill");
    } finally {
      setSubmittingBill(false);
    }
  };

  const handlePrintReceipt = async (bill) => {
    if (!bill) return;
    const printContent = generateReceiptHTML(bill);
    await printHTMLContent(printContent, bill);
  };

  const handlePrintTrigger = handlePrintReceipt;


  // Load Saved Bill back into Cart
  const loadSavedBill = (bill) => {
    setEditingBillId(bill.id);
    setSelectedCustomerId(bill.customerId || '');
    setCart(bill.items || []);
    setPosDiscount(bill.discount ? bill.discount.toString() : '');
    setPaymentMode(bill.paymentMode || 'Cash');
    setActiveTab('pos');
    toast.success(`Loaded saved bill #${bill.billId}! You can now modify and settle it.`);
  };

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.lastName || '').toLowerCase().includes(q) ||
      (c.mobileNumber || '').includes(q)
    );
  });

  const cartTotal = cart.reduce((sum, item) => sum + item.total, 0);
  const discountVal = parseFloat(posDiscount) || 0;
  const grandTotal = Math.max(0, cartTotal - discountVal);

  return (
    <div className="sa-pos-container">
      {/* Header Bar */}
      <div className="sa-pos-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(10,42,27,0.08)', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', margin: 0 }}>Billing & POS Terminal</h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--polaris-text-subdued)' }}>
              Create, park, and settle walk-in bills for any selected outlet store
            </p>
          </div>
        </div>

        {/* Store Selector */}
        <div className="sa-store-selector-box">
          <label>Active Store Outlet:</label>
          <select className="sa-store-select" value={selectedStoreId} onChange={handleStoreChange}>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs: Active POS Terminal vs Saved (Parked) Bills */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
        <button 
          className={`polaris-btn ${activeTab === 'pos' ? 'polaris-btn-primary' : 'polaris-btn-secondary'}`}
          onClick={() => setActiveTab('pos')}
        >
          <CreditCard size={15} /> Active POS Billing
        </button>

        <button 
          className={`polaris-btn ${activeTab === 'saved_bills' ? 'polaris-btn-primary' : 'polaris-btn-secondary'}`}
          onClick={() => setActiveTab('saved_bills')}
        >
          <Clock size={15} /> Saved (Parked) Bills ({savedBillsList.length})
        </button>
      </div>

      {activeTab === 'pos' ? (
        <>
          {/* Fast Barcode Scanner Header Box */}
          <form className="sa-barcode-scanner-bar" onSubmit={handleBarcodeSubmit}>
            <Barcode size={22} color="var(--primary-color)" />
            <div className="sa-barcode-input-wrapper">
              <input 
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan barcode or enter ID*Qty (e.g. 890123456789*500)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
            </div>
            <button type="submit" className="polaris-btn polaris-btn-primary">Add Item</button>
          </form>

          {/* POS Main Grid */}
          <div className="st-pos-layout" style={{ marginTop: '10px' }}>
            {/* Product Catalogue */}
            <div className="st-pos-catalogue">
              <div className="st-catalogue-header">
                <h3>Product Catalog</h3>
                <div className="st-pos-search">
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Search by product name or price..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="st-catalogue-grid">
                {items
                  .filter(i => (i.name || '').toLowerCase().includes(itemSearch.toLowerCase()))
                  .map(item => {
                    const inCart = cart.find(c => c.id === item.id);
                    return (
                      <div key={item.id} className="st-pos-item-card" onClick={() => handleItemClick(item)}>
                        <div className="st-pos-item-img">
                          <img 
                            src={(!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image}
                            alt={item.name} 
                            onError={(e) => { e.target.onerror = null; e.target.src = DEFAULT_ITEM_IMAGE; }}
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
                              <button className="st-pos-weight-btn" onClick={(e) => { e.stopPropagation(); handleItemClick(item); }}>
                                <Scale size={12} /> Scale
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Billing Cart & Settle Panel */}
            <div className="st-pos-summary">
              {/* Mandatory Customer Selector */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px 14px', borderRadius: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <UserCheck size={15} /> Select Customer <span style={{ color: '#64748b', fontWeight: '500', fontSize: '11px' }}>(Optional)</span>
                  </label>

                  <button 
                    type="button" 
                    onClick={() => setShowCreateCustomerModal(true)}
                    style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <UserPlus size={13} /> + New Customer
                  </button>
                </div>

                {(() => {
                  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);
                  return (
                    <div style={{ position: 'relative' }} ref={custDropdownRef}>
                      {selectedCustomerObj ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#e6f4ea', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserCheck size={16} color="#065f46" />
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#065f46' }}>
                                {selectedCustomerObj.firstName} {selectedCustomerObj.lastName || ''}
                              </div>
                              <div style={{ fontSize: '11px', color: '#047857' }}>
                                📱 {selectedCustomerObj.mobileNumber}
                              </div>
                            </div>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => { setSelectedCustomerId(''); setCustomerSearch(''); }}
                            style={{ background: 'none', border: 'none', color: '#047857', cursor: 'pointer', padding: '4px' }}
                            title="Clear selected customer"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <input 
                            type="text" 
                            placeholder="Type customer name or mobile number..."
                            value={customerSearch}
                            onFocus={() => setShowCustDropdown(true)}
                            onChange={(e) => {
                              setCustomerSearch(e.target.value);
                              setShowCustDropdown(true);
                            }}
                            style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                          />

                          {showCustDropdown && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.15)', zIndex: 100, maxHeight: '220px', overflowY: 'auto', marginTop: '4px' }}>
                              {filteredCustomers.length > 0 ? (
                                filteredCustomers.map(c => (
                                  <div 
                                    key={c.id}
                                    onClick={() => {
                                      setSelectedCustomerId(c.id);
                                      setCustomerSearch(`${c.firstName} ${c.lastName || ''}`);
                                      setShowCustDropdown(false);
                                    }}
                                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.15s' }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                                  >
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>
                                        {c.firstName} {c.lastName || ''}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#64748b' }}>📱 {c.mobileNumber}</div>
                                    </div>
                                    {c.isB2B && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>B2B</span>}
                                  </div>
                                ))
                              ) : (
                                <div 
                                  onClick={() => {
                                    setCustForm(p => ({
                                      ...p,
                                      firstName: /^\d+$/.test(customerSearch) ? '' : customerSearch,
                                      mobileNumber: /^\d+$/.test(customerSearch) ? customerSearch : ''
                                    }));
                                    setShowCreateCustomerModal(true);
                                    setShowCustDropdown(false);
                                  }}
                                  style={{ padding: '12px', cursor: 'pointer', color: '#0284c7', fontSize: '13px', fontWeight: '700', textAlign: 'center', background: '#f0f9ff' }}
                                >
                                  + Create customer for "{customerSearch}"
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              {/* Items Count Header Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#334155' }}>
                  Total Items: <strong style={{ color: 'var(--primary-color)' }}>{cart.length}</strong>
                </span>
                <span style={{ fontSize: '11px', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', fontWeight: '800' }}>
                  Total Units: {cart.reduce((sum, item) => sum + (item.unit === 'Weight' ? parseFloat(item.quantity) : parseInt(item.quantity)), 0).toFixed(cart.some(i => i.unit === 'Weight') ? 3 : 0)}
                </span>
              </div>

              {/* Cart Items List */}
              <div className="st-summary-items" style={{ minHeight: '260px', maxHeight: '380px', overflowY: 'auto' }}>


                {cart.map((item, idx) => (
                  <div key={idx} className="st-summary-row">
                    <div className="st-summary-details">
                      <span className="name">{item.name}</span>
                      <span className="price-sub">₹{item.price} / {item.unit === 'Weight' ? 'kg' : 'pc'}</span>
                    </div>
                    <div className="st-summary-actions">
                      {item.unit === 'Weight' ? (
                        <div className="st-pos-qty-controls">
                          <button onClick={() => handleItemClick(items.find(i => i.id === item.id))}><Scale size={12} /></button>
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
                    <ShoppingBag size={32} color="#94a3b8" />
                    <p>Shopping cart is empty.</p>
                  </div>
                )}
              </div>

              {/* Breakdown & Discount */}
              <div className="st-summary-settle">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>
                      Discount ({discountType === 'percent' ? '%' : '₹'})
                    </label>
                    <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: 'none',
                          background: discountType === 'percent' ? 'var(--primary-color)' : '#f1f5f9',
                          color: discountType === 'percent' ? '#ffffff' : '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('amount')}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: '700',
                          border: 'none',
                          background: discountType === 'amount' ? 'var(--primary-color)' : '#f1f5f9',
                          color: discountType === 'amount' ? '#ffffff' : '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        ₹
                      </button>
                    </div>
                  </div>
                  <input 
                    type="number" 
                    placeholder={discountType === 'percent' ? 'e.g. 10%' : 'e.g. 50'}
                    value={posDiscount}
                    onChange={(e) => setPosDiscount(e.target.value)}
                    style={{ height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '700' }}
                  />
                </div>

                {(() => {
                  const cartSubtotal = cart.reduce((sum, item) => sum + item.total, 0);
                  const rawDisc = parseFloat(posDiscount) || 0;
                  const calculatedDisc = discountType === 'percent' ? (cartSubtotal * rawDisc) / 100 : rawDisc;
                  const finalGrandTotal = Math.max(0, cartSubtotal - calculatedDisc);

                  return (
                    <div className="total-display" style={{ marginBottom: '12px' }}>
                      <span>Grand Total (Incl. Tax)</span>
                      <span className="amt">₹{finalGrandTotal.toFixed(2)}</span>
                    </div>
                  );
                })()}


                {/* Payment Methods */}
                <div className="payment-select" style={{ marginBottom: '12px' }}>
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

                {/* Action Buttons: Save (Park) vs Settle */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    className="polaris-btn polaris-btn-secondary"
                    style={{ flex: 1, justifyContent: 'center', height: '42px', fontWeight: '700' }}
                    onClick={() => processBill('saved')}
                    disabled={submittingBill || cart.length === 0}
                  >
                    <Save size={16} /> Save Bill (Park)
                  </button>

                  <button 
                    type="button"
                    className="st-settle-btn"
                    style={{ flex: 1.2, height: '42px' }}
                    onClick={() => processBill('settled')}
                    disabled={submittingBill || cart.length === 0}
                  >
                    {submittingBill ? <div className="loader"></div> : 'Settle & Settle Bill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Saved (Parked) Bills Tab */
        <div className="polaris-card">
          <div className="polaris-table-wrapper">
            {savedBillsList.length > 0 ? (
              <table className="polaris-table">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Customer Name</th>
                    <th>Customer Phone</th>
                    <th>Saved Date</th>
                    <th>Items Count</th>
                    <th>Total Amount</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedBillsList.map(bill => (
                    <tr key={bill.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>{bill.billId}</td>
                      <td>{bill.customerName || 'Walk-in Customer'}</td>
                      <td>{bill.customerPhone || '—'}</td>
                      <td>{bill.date}</td>
                      <td>{(bill.items || []).length} items</td>
                      <td style={{ fontWeight: '700' }}>₹{Number(bill.totalAmount || 0).toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="polaris-btn polaris-btn-primary"
                          style={{ height: '30px', padding: '0 12px', fontSize: '12px' }}
                          onClick={() => loadSavedBill(bill)}
                        >
                          Resume & Settle →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <Clock size={36} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>No Saved Bills</h3>
                <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Bills saved as draft will be listed here until settled.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {showCreateCustomerModal && (
        <div className="walkin-modal-overlay">
          <div className="walkin-modal-card" style={{ maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Create New Customer</h3>
              <button onClick={() => setShowCreateCustomerModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="items-input-group">
                <label>First Name *</label>
                <input type="text" required value={custForm.firstName} onChange={(e) => setCustForm(p => ({ ...p, firstName: e.target.value }))} placeholder="e.g. Ramesh" />
              </div>
              <div className="items-input-group">
                <label>Last Name</label>
                <input type="text" value={custForm.lastName} onChange={(e) => setCustForm(p => ({ ...p, lastName: e.target.value }))} placeholder="e.g. Kumar" />
              </div>
              <div className="items-input-group">
                <label>Mobile Number *</label>
                <input type="tel" required value={custForm.mobileNumber} onChange={(e) => setCustForm(p => ({ ...p, mobileNumber: e.target.value }))} placeholder="e.g. 9876543210" />
              </div>

              {/* B2B Customer Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '4px' }}>
                <input 
                  type="checkbox" 
                  id="isB2BCheck"
                  checked={custForm.isB2B}
                  onChange={(e) => setCustForm(p => ({ ...p, isB2B: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isB2BCheck" style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', cursor: 'pointer', margin: 0 }}>
                  Is B2B Commercial Customer?
                </label>
              </div>

              {custForm.isB2B && (
                <>
                  <div className="items-input-group">
                    <label>Company / Business Name *</label>
                    <input type="text" required={custForm.isB2B} value={custForm.companyName} onChange={(e) => setCustForm(p => ({ ...p, companyName: e.target.value }))} placeholder="e.g. Vishnu Wholesale Sweets" />
                  </div>
                  <div className="items-input-group">
                    <label>GSTIN / GST Number *</label>
                    <input type="text" required={custForm.isB2B} value={custForm.gstNumber} onChange={(e) => setCustForm(p => ({ ...p, gstNumber: e.target.value.toUpperCase() }))} placeholder="e.g. 36AAAAA0000A1Z5" />
                  </div>
                  <div className="items-input-group">
                    <label>Billing Address</label>
                    <input type="text" value={custForm.address} onChange={(e) => setCustForm(p => ({ ...p, address: e.target.value }))} placeholder="e.g. Plot No 12, Main Road" />
                  </div>
                  <div className="items-input-group">
                    <label>City</label>
                    <input type="text" value={custForm.city} onChange={(e) => setCustForm(p => ({ ...p, city: e.target.value }))} placeholder="e.g. Hyderabad" />
                  </div>
                </>
              )}

              <button type="submit" className="polaris-btn polaris-btn-primary" style={{ marginTop: '8px', justifyContent: 'center' }} disabled={savingCustomer}>
                {savingCustomer ? 'Saving...' : 'Save & Select Customer'}
              </button>
            </form>
          </div>
        </div>
      )}


      {/* Weight Modal */}
      {showWeightModal && (
        <div className="walkin-modal-overlay">
          <div className="walkin-modal-card" style={{ maxWidth: '360px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{showWeightModal.name}</h3>
              <button onClick={() => setShowWeightModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>Price: ₹{showWeightModal.price} / kg</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="items-input-group">
                <label>Weight (in kg)</label>
                <input type="number" step="0.001" value={weightInput.weight} onChange={(e) => handleWeightCalc('weight', e.target.value)} placeholder="e.g. 0.500 for 500g" />
              </div>
              <div className="items-input-group">
                <label>Total Amount (₹)</label>
                <input type="number" step="1" value={weightInput.amount} onChange={(e) => handleWeightCalc('amount', e.target.value)} placeholder="e.g. 350" />
              </div>
              <button type="button" className="polaris-btn polaris-btn-primary" style={{ justifyContent: 'center' }} onClick={confirmWeightAdd}>
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminPOS;
