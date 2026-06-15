import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Truck, Edit, Trash2, X,
  Phone, MapPin, Package, Printer,
  ShoppingCart, User, Save, Minus, CheckCircle2,
  Clock, XCircle, Receipt
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection, addDoc, query, orderBy,
  onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Vendors.css';

/* ── Invoice Print ─────────────────────────────────────── */
const printVendorInvoice = (order) => {
  const itemsHtml = (order.items || []).map((item, i) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${i + 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${item.itemName}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;">${item.qty} ${item.unit === 'Weight' ? 'kg' : 'pcs'}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;">₹${Number(item.price).toFixed(2)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;">₹${(Number(item.qty) * Number(item.price)).toFixed(2)}</td>
    </tr>
  `).join('');

  const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Vendor Purchase Order — ${order.id || ''}</title>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'IBM Plex Sans', Arial, sans-serif; color: #1a202c; background: #fff; padding: 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #348bdd; }
    .brand { font-size: 20px; font-weight: 800; color: #348bdd; }
    .brand-sub { font-size: 12px; color: #64748b; margin-top: 3px; }
    .po-label { text-align: right; }
    .po-label h2 { font-size: 22px; font-weight: 800; color: #1a202c; }
    .po-label p { font-size: 12px; color: #64748b; margin-top: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .info-box { background: #f8fafc; border-radius: 10px; padding: 14px; }
    .info-box h3 { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .info-box p { font-size: 13px; color: #1a202c; margin: 2px 0; }
    .info-box .name { font-size: 15px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead { background: #348bdd; color: #fff; }
    thead th { padding: 10px; text-align: left; font-size: 12px; font-weight: 700; }
    thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: right; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .total-row { background: #f0f7ff !important; }
    .total-row td { padding: 10px; font-weight: 800; font-size: 15px; }
    .total-row td:last-child { color: #348bdd; }
    .footer { margin-top: 30px; padding-top: 16px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between; }
    .footer p { font-size: 11px; color: #94a3b8; }
    .signature-box { text-align: center; }
    .signature-box .sig-line { width: 150px; border-top: 1px solid #333; margin: 40px auto 6px; }
    .signature-box p { font-size: 11px; color: #64748b; }
    @media print { body { padding: 15px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">RAVI SWEETS</div>
      <div class="brand-sub">Chirala, Andhra Pradesh</div>
    </div>
    <div class="po-label">
      <h2>PURCHASE ORDER</h2>
      <p>Date: ${date}</p>
      <p>PO No: PO-${String(order.id || '').substring(0, 8).toUpperCase()}</p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <h3>Vendor Details</h3>
      <p class="name">${order.vendorName || '—'}</p>
      ${order.vendorPhone ? `<p>📞 ${order.vendorPhone}</p>` : ''}
      ${order.vendorAddress ? `<p>📍 ${order.vendorAddress}</p>` : ''}
    </div>
    <div class="info-box">
      <h3>Order Info</h3>
      <p>Status: <strong>${order.status || 'Pending'}</strong></p>
      <p>Items: ${(order.items || []).length}</p>
      <p>Order Date: ${date}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th>Item Name</th>
        <th style="text-align:center;">Quantity</th>
        <th style="text-align:right;">Unit Price</th>
        <th style="text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
      <tr class="total-row">
        <td colspan="4" style="text-align:right;padding:10px;">GRAND TOTAL</td>
        <td style="text-align:right;padding:10px;">₹${Number(order.totalAmount || 0).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    <p>This is a computer-generated purchase order.<br/>Ravi Sweets, Chirala</p>
    <div class="signature-box">
      <div class="sig-line"></div>
      <p>Authorized Signatory</p>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
};

/* ── Main Component ────────────────────────────────────── */
const Vendors = () => {
  const [activeTab, setActiveTab] = useState('orders');

  // Data
  const [vendors, setVendors] = useState([]);
  const [vendorOrders, setVendorOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Vendor form
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState({ name: '', phone: '', address: '' });
  const [savingVendor, setSavingVendor] = useState(false);

  // Order form
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderForm, setOrderForm] = useState({ vendorId: '', items: [] });
  const [savingOrder, setSavingOrder] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Firestore listeners ─────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'vendors'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'vendor_orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setVendorOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  /* ── Vendor CRUD ─────────────────────────────────────── */
  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!vendorForm.name.trim()) return toast.error('Vendor name is required');
    setSavingVendor(true);
    try {
      const data = {
        name: vendorForm.name.trim(),
        phone: vendorForm.phone.trim(),
        address: vendorForm.address.trim(),
        updatedAt: serverTimestamp()
      };
      if (editingVendor) {
        await updateDoc(doc(db, 'vendors', editingVendor.id), data);
        toast.success('Vendor updated');
      } else {
        await addDoc(collection(db, 'vendors'), { ...data, createdAt: serverTimestamp() });
        toast.success('Vendor added');
      }
      resetVendorForm();
    } catch { toast.error('Failed to save vendor'); }
    finally { setSavingVendor(false); }
  };

  const resetVendorForm = () => {
    setVendorForm({ name: '', phone: '', address: '' });
    setShowVendorForm(false);
    setEditingVendor(null);
  };

  const handleEditVendor = (v) => {
    setEditingVendor(v);
    setVendorForm({ name: v.name, phone: v.phone || '', address: v.address || '' });
    setShowVendorForm(true);
  };

  /* ── Orders ──────────────────────────────────────────── */
  const resetOrderForm = () => {
    setOrderForm({ vendorId: '', items: [] });
    setShowOrderForm(false);
  };

  const addOrderItem = () => setOrderForm(p => ({
    ...p,
    items: [...p.items, { itemName: '', qty: '', unit: 'Weight', price: '' }]
  }));

  const updateOrderItem = (idx, field, value) => {
    const updated = [...orderForm.items];
    updated[idx] = { ...updated[idx], [field]: value };
    setOrderForm(p => ({ ...p, items: updated }));
  };

  const removeOrderItem = (idx) =>
    setOrderForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const computeTotal = () =>
    orderForm.items.reduce((s, i) => s + (Number(i.qty) * Number(i.price) || 0), 0);

  const handleSaveOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.vendorId) return toast.error('Select a vendor');
    const validItems = orderForm.items.filter(i => i.itemName.trim() && i.qty && i.price);
    if (validItems.length === 0) return toast.error('Add at least one item with name, qty, and price');
    setSavingOrder(true);
    try {
      const vendor = vendors.find(v => v.id === orderForm.vendorId);
      const totalAmount = validItems.reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
      await addDoc(collection(db, 'vendor_orders'), {
        vendorId: orderForm.vendorId,
        vendorName: vendor?.name || '',
        vendorPhone: vendor?.phone || '',
        vendorAddress: vendor?.address || '',
        items: validItems,
        totalAmount,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Order created successfully');
      resetOrderForm();
    } catch { toast.error('Failed to create order'); }
    finally { setSavingOrder(false); }
  };

  const handleUpdateOrderStatus = async (orderId, status) => {
    try {
      await updateDoc(doc(db, 'vendor_orders', orderId), { status, updatedAt: serverTimestamp() });
      toast.success(`Order marked as ${status}`);
    } catch { toast.error('Failed to update status'); }
  };

  /* ── Delete ───────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const colMap = { vendor: 'vendors', order: 'vendor_orders' };
      await deleteDoc(doc(db, colMap[deleteTarget.type], deleteTarget.id));
      toast.success('Deleted successfully');
      setDeleteTarget(null);
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(false); }
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredOrders = vendorOrders.filter(o =>
    (o.vendorName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="v-container">
      {/* Header */}
      <div className="v-header">
        <div className="v-header-info">
          <h1><Truck size={24} /> Vendors</h1>
          <p>Manage suppliers and purchase orders</p>
        </div>
        {activeTab === 'orders' && !showOrderForm && (
          <button className="v-add-btn" onClick={() => setShowOrderForm(true)}>
            <Plus size={18} /> Add Order
          </button>
        )}
        {activeTab === 'vendors' && !showVendorForm && (
          <button className="v-add-btn" onClick={() => setShowVendorForm(true)}>
            <Plus size={18} /> Add Vendor
          </button>
        )}
      </div>

      {/* Tabs — only 2 tabs now */}
      <div className="v-tabs">
        {[
          { id: 'orders', label: 'Vendor Orders', icon: <ShoppingCart size={15} /> },
          { id: 'vendors', label: 'Vendors List', icon: <User size={15} /> },
        ].map(tab => (
          <button key={tab.id} className={`v-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── VENDOR ORDERS TAB ────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="v-content-layout">
          <div className={`v-list-section ${showOrderForm ? 'shrink' : ''}`}>
            <div className="v-search-bar">
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input placeholder="Search by vendor name..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {loading ? (
              <div className="v-loader-container"><div className="loader" /></div>
            ) : filteredOrders.length === 0 ? (
              <div className="v-empty-state">
                <div className="v-empty-icon"><ShoppingCart size={28} /></div>
                <h3>No Orders Yet</h3>
                <p>Create your first vendor purchase order</p>
              </div>
            ) : (
              <div className="v-orders-list">
                {filteredOrders.map(order => (
                  <div key={order.id} className="v-order-card">
                    <div className="v-order-card-top">
                      <div>
                        <p className="v-order-id">PO-{String(order.id).substring(0, 8).toUpperCase()}</p>
                        <p className="v-order-vendor">{order.vendorName}</p>
                        <div className="v-order-meta">
                          <span><Package size={12} />{(order.items || []).length} item{order.items?.length !== 1 ? 's' : ''}</span>
                          <span><Receipt size={12} />₹{Number(order.totalAmount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="v-order-total">₹{Number(order.totalAmount || 0).toFixed(0)}</div>
                        <div className="v-order-total-label">Total</div>
                      </div>
                    </div>

                    <div className="v-order-items-preview">
                      {(order.items || []).slice(0, 3).map((item, i) => (
                        <div key={i} className="v-order-item-row">
                          <span>{item.itemName}</span>
                          <span>{item.qty} {item.unit === 'Weight' ? 'kg' : 'pcs'} × ₹{item.price}</span>
                        </div>
                      ))}
                      {(order.items || []).length > 3 && (
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          +{order.items.length - 3} more
                        </span>
                      )}
                    </div>

                    <div className="v-order-card-footer">
                      <span className={`v-status-badge ${order.status || 'pending'}`}>
                        {order.status === 'received' ? <CheckCircle2 size={11} /> : order.status === 'cancelled' ? <XCircle size={11} /> : <Clock size={11} />}
                        {order.status === 'received' ? 'Received' : order.status === 'cancelled' ? 'Cancelled' : 'Pending'}
                      </span>
                      <div className="v-order-actions">
                        {order.status === 'pending' && (
                          <>
                            <button className="v-print-btn" style={{ background: '#f0fdf4', color: '#16a34a' }}
                              onClick={() => handleUpdateOrderStatus(order.id, 'received')}>
                              <CheckCircle2 size={13} /> Mark Received
                            </button>
                            <button className="v-print-btn" style={{ background: '#fff0f0', color: '#dc2626' }}
                              onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}>
                              <XCircle size={13} /> Cancel
                            </button>
                          </>
                        )}
                        <button className="v-print-btn" onClick={() => printVendorInvoice(order)}>
                          <Printer size={13} /> Invoice
                        </button>
                        <button className="v-action-btn delete"
                          onClick={() => setDeleteTarget({ type: 'order', id: order.id, name: `PO from ${order.vendorName}` })}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {showOrderForm && (
              <motion.div className="v-form-panel"
                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}>
                <div className="v-panel-header">
                  <h2>New Purchase Order</h2>
                  <button className="v-close-btn" onClick={resetOrderForm}><X size={16} /></button>
                </div>
                <form onSubmit={handleSaveOrder}>
                  <div className="v-input-group">
                    <label>Select Vendor *</label>
                    <select value={orderForm.vendorId}
                      onChange={e => setOrderForm(p => ({ ...p, vendorId: e.target.value }))}
                      required>
                      <option value="">Choose a vendor...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    {vendors.length === 0 && (
                      <p style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                        ⚠ No vendors yet. Add vendors in the Vendors List tab.
                      </p>
                    )}
                  </div>

                  <div className="v-input-group">
                    <label>Order Items *</label>
                    <div className="v-col-headers">
                      <span>Item Name</span>
                      <span>Qty</span>
                      <span>Price/Unit</span>
                      <span></span>
                    </div>
                    <div className="v-order-items-form">
                      {orderForm.items.map((item, idx) => (
                        <div key={idx} className="v-order-item-row-form">
                          <input
                            type="text"
                            placeholder="Item name..."
                            value={item.itemName}
                            onChange={e => updateOrderItem(idx, 'itemName', e.target.value)}
                          />
                          <input type="number" min="0.01" step="0.01" placeholder="Qty"
                            value={item.qty} onChange={e => updateOrderItem(idx, 'qty', e.target.value)} />
                          <input type="number" min="0" step="0.01" placeholder="₹ Price"
                            value={item.price} onChange={e => updateOrderItem(idx, 'price', e.target.value)} />
                          <button type="button" className="v-remove-row-btn" onClick={() => removeOrderItem(idx)}>
                            <Minus size={14} />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="v-add-order-item-btn" onClick={addOrderItem}>
                        <Plus size={14} /> Add Item Row
                      </button>
                    </div>
                  </div>

                  {orderForm.items.length > 0 && (
                    <div className="v-order-total-box">
                      <span>Order Total</span>
                      <strong>₹{computeTotal().toFixed(2)}</strong>
                    </div>
                  )}

                  <div className="v-form-actions">
                    <button type="button" className="v-btn-cancel" onClick={resetOrderForm}>Cancel</button>
                    <button type="submit" className="v-btn-save" disabled={savingOrder}>
                      {savingOrder
                        ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} />
                        : <><Save size={14} /> Create Order</>
                      }
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── VENDORS LIST TAB ─────────────────────────────── */}
      {activeTab === 'vendors' && (
        <div className="v-content-layout">
          <div className={`v-list-section ${showVendorForm ? 'shrink' : ''}`}>
            <div className="v-search-bar">
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input placeholder="Search vendors..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} />
            </div>

            {loading ? (
              <div className="v-loader-container"><div className="loader" /></div>
            ) : filteredVendors.length === 0 ? (
              <div className="v-empty-state">
                <div className="v-empty-icon"><Truck size={28} /></div>
                <h3>No Vendors Yet</h3>
                <p>Add your first supplier to start creating purchase orders</p>
              </div>
            ) : (
              <div className="v-vendor-grid">
                {filteredVendors.map(vendor => (
                  <div key={vendor.id} className="v-vendor-card">
                    <div className="v-vendor-card-top">
                      <div className="v-vendor-icon"><Truck size={20} /></div>
                      <div className="v-card-actions">
                        <button className="v-action-btn edit" onClick={() => handleEditVendor(vendor)}>
                          <Edit size={14} />
                        </button>
                        <button className="v-action-btn delete"
                          onClick={() => setDeleteTarget({ type: 'vendor', id: vendor.id, name: vendor.name })}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="v-vendor-name">{vendor.name}</p>
                    {vendor.phone && (
                      <p className="v-vendor-meta"><Phone size={12} />{vendor.phone}</p>
                    )}
                    {vendor.address && (
                      <p className="v-vendor-meta" style={{ marginTop: 4 }}><MapPin size={12} />{vendor.address}</p>
                    )}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e2e8f0' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Orders: {vendorOrders.filter(o => o.vendorId === vendor.id).length}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {showVendorForm && (
              <motion.div className="v-form-panel"
                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}>
                <div className="v-panel-header">
                  <h2>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
                  <button className="v-close-btn" onClick={resetVendorForm}><X size={16} /></button>
                </div>
                <form onSubmit={handleSaveVendor}>
                  <div className="v-input-group">
                    <label>Vendor Name *</label>
                    <input placeholder="e.g. Krishna Suppliers"
                      value={vendorForm.name}
                      onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))}
                      required />
                  </div>
                  <div className="v-input-group">
                    <label>Phone Number</label>
                    <input type="tel" placeholder="e.g. 9876543210"
                      value={vendorForm.phone}
                      onChange={e => setVendorForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="v-input-group">
                    <label>Address</label>
                    <textarea rows={3} placeholder="Street, City, State..."
                      value={vendorForm.address}
                      onChange={e => setVendorForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="v-form-actions">
                    <button type="button" className="v-btn-cancel" onClick={resetVendorForm}>Cancel</button>
                    <button type="submit" className="v-btn-save" disabled={savingVendor}>
                      {savingVendor
                        ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} />
                        : <><Save size={14} /> Save Vendor</>
                      }
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Delete Confirmation ───────────────────────────── */}
      {deleteTarget && (
        <div className="v-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="v-modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#dc2626' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Delete?</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>"{deleteTarget.name}"</strong> will be permanently removed.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="v-btn-cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="v-btn-save" style={{ background: '#dc2626' }} onClick={handleDelete} disabled={deleting}>
                {deleting
                  ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} />
                  : 'Delete'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
