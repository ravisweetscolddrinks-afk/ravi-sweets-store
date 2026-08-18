import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Store as StoreIcon, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Printer, 
  Eye, 
  X,
  Filter,
  CreditCard,
  ShoppingBag
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { generateReceiptHTML } from '../../utils/printReceiptHelper';
import logo from '../../assets/logo.png';
import { usePrinter } from '../../context/PrinterContext';
import './WalkInSales.css';

const DEFAULT_ITEM_IMAGE = logo;

const WalkInSales = () => {
  const [bills, setBills] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all', 'settled', 'saved'
  const [filterDate, setFilterDate] = useState('');
  const [previewBill, setPreviewBill] = useState(null);

  // Fetch Outlets / Stores List for Filter
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'stores'), orderBy('name', 'asc')));
        setStores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching stores:", err);
      }
    };
    fetchStores();
  }, []);

  // Fetch Global Bills across all stores reactively
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'bills'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBills(fetchedBills);
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to root bills:", err);
      // Fallback: search subcollections if root bills is empty
      fetchBillsFromSubcollections();
    });

    return () => unsubscribe();
  }, []);

  const fetchBillsFromSubcollections = async () => {
    try {
      const storeSnap = await getDocs(collection(db, 'stores'));
      let allBills = [];

      for (const sDoc of storeSnap.docs) {
        const storeId = sDoc.id;
        const storeName = sDoc.data().name || 'Store';
        const bSnap = await getDocs(collection(db, 'stores', storeId, 'bills'));
        bSnap.docs.forEach(bDoc => {
          allBills.push({
            id: bDoc.id,
            storeId,
            storeName,
            status: 'settled',
            ...bDoc.data()
          });
        });
      }

      allBills.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setBills(allBills);
    } catch (err) {
      console.error("Fallback subcollection bills fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter Logic
  const filteredBills = bills.filter(bill => {
    const queryLower = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      (bill.billId || '').toLowerCase().includes(queryLower) ||
      (bill.customerName || '').toLowerCase().includes(queryLower) ||
      (bill.customerPhone || '').toLowerCase().includes(queryLower) ||
      (bill.storeName || '').toLowerCase().includes(queryLower);

    const matchesStore = selectedStore === 'all' || bill.storeId === selectedStore;
    const matchesStatus = selectedStatus === 'all' || (bill.status || 'settled') === selectedStatus;
    const matchesDate = !filterDate || bill.date === new Date(filterDate).toLocaleDateString('en-IN') || (bill.date || '').includes(filterDate);

    return matchesSearch && matchesStore && matchesStatus && matchesDate;
  });

  // Calculate High-Level Metrics
  const settledBills = bills.filter(b => (b.status || 'settled') === 'settled');
  const savedBills = bills.filter(b => b.status === 'saved');

  const totalWalkInRevenue = settledBills.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const todayStr = new Date().toLocaleDateString('en-IN');
  const todaySales = settledBills
    .filter(b => b.date === todayStr)
    .reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

  const {
    printHTMLContent,
    bluetoothConnected,
    qzConnected,
    selectedQZPrinter,
    printRawBLE,
    printRawUSB,
    webUsbConnected,
    webSerialConnected,
  } = usePrinter();

  const handlePrintReceipt = async (bill) => {
    const printContent = generateReceiptHTML(bill);
    // Pass bill object as 2nd arg so smartPrint uses buildReceiptESCPOS for direct printers
    await printHTMLContent(printContent, bill);
  };


  return (
    <div className="walkin-sales-container">
      {/* Header Bar */}
      <div className="walkin-header-bar">
        <div className="walkin-title-group">
          <div className="walkin-title-icon">
            <Receipt size={22} />
          </div>
          <div>
            <h1 className="walkin-page-title">Walk-In Sales History</h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--polaris-text-subdued)' }}>
              Real-time POS invoice records and sales analytics across all store outlets
            </p>
          </div>
        </div>
      </div>

      {/* High-Level Metrics Summary Cards */}
      <div className="walkin-metrics-grid">
        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Total Walk-In Sales</div>
          <div className="walkin-metric-value">₹{totalWalkInRevenue.toLocaleString('en-IN')}</div>
          <div className="walkin-metric-subtext">All time settled POS invoices</div>
        </div>

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Settled Bills</div>
          <div className="walkin-metric-value">{settledBills.length}</div>
          <div className="walkin-metric-subtext" style={{ color: '#0284c7' }}>Completed & Paid</div>
        </div>

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Saved / Draft Bills</div>
          <div className="walkin-metric-value">{savedBills.length}</div>
          <div className="walkin-metric-subtext" style={{ color: '#d97706' }}>Parked (Not in calculations)</div>
        </div>

        <div className="walkin-metric-card">
          <div className="walkin-metric-label">Today's Revenue</div>
          <div className="walkin-metric-value">₹{todaySales.toLocaleString('en-IN')}</div>
          <div className="walkin-metric-subtext">Settled today ({todayStr})</div>
        </div>
      </div>

      {/* Filter Card & Toolbar */}
      <div className="walkin-filter-card">
        <div className="walkin-filter-left">
          <div className="walkin-search-box">
            <Search size={15} color="#6b7280" />
            <input 
              type="text" 
              placeholder="Search by Bill ID, Customer, Phone, or Store..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select 
            className="walkin-select-filter"
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
          >
            <option value="all">🏬 All Outlets & Stores</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select 
            className="walkin-select-filter"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">⚡ All Statuses</option>
            <option value="settled">✅ Settled & Paid</option>
            <option value="saved">⏳ Saved / Parked</option>
          </select>

          <input 
            type="date"
            className="walkin-date-input"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />

          {filterDate && (
            <button 
              className="polaris-btn polaris-btn-secondary"
              style={{ height: '36px', padding: '0 10px', fontSize: '12px' }}
              onClick={() => setFilterDate('')}
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      {/* Main Data Table */}
      <div className="polaris-card">
        <div className="polaris-table-wrapper">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <div className="loader"></div>
            </div>
          ) : filteredBills.length > 0 ? (
            <table className="polaris-table">
              <thead>
                <tr>
                  <th>Bill ID</th>
                  <th>Store Outlet</th>
                  <th>Customer Name</th>
                  <th>Customer Phone</th>
                  <th>Total Amount</th>
                  <th>Payment Mode</th>
                  <th>Status</th>
                  <th>Bill Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(bill => {
                  const billStatus = bill.status || 'settled';
                  return (
                    <tr key={bill.id}>
                      <td style={{ fontWeight: '700', color: 'var(--primary-color)' }}>
                        {bill.billId}
                      </td>
                      <td style={{ fontWeight: '600' }}>
                        <div>{bill.storeName || 'Outlet Store'}</div>
                        {bill.tradeName && bill.tradeName !== bill.storeName && (
                          <div style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: '700' }}>{bill.tradeName}</div>
                        )}
                        {bill.storeGstNumber && (
                          <div style={{ fontSize: '10px', color: '#1e3a8a', fontWeight: '700' }}>GST: {bill.storeGstNumber}</div>
                        )}
                      </td>
                      <td>{bill.customerName || 'Walk-in Customer'}</td>
                      <td style={{ color: '#4b5563' }}>{bill.customerPhone || '—'}</td>
                      <td style={{ fontWeight: '700', fontSize: '14px' }}>₹{Number(bill.totalAmount || 0).toFixed(2)}</td>
                      <td>
                        <span className="polaris-badge" style={{ background: '#f3f4f6', color: '#1f2937', fontWeight: '700' }}>
                          {bill.paymentMode || 'Cash'}
                        </span>
                      </td>
                      <td>
                        <span className={`walkin-status-badge ${billStatus}`}>
                          {billStatus === 'settled' ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                          {billStatus === 'settled' ? 'Settled' : 'Saved (Draft)'}
                        </span>
                      </td>
                      <td style={{ color: '#6b7280', fontSize: '12px' }}>{bill.date || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button 
                            className="polaris-btn polaris-btn-secondary" 
                            style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                            onClick={() => setPreviewBill(bill)}
                            title="View Bill Details"
                          >
                            <Eye size={14} /> View
                          </button>
                          <button 
                            className="polaris-btn polaris-btn-secondary" 
                            style={{ height: '30px', padding: '0 8px', fontSize: '12px' }}
                            onClick={() => handlePrintReceipt(bill)}
                            title="Print Thermal Receipt"
                          >
                            <Printer size={14} /> Print
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <Receipt size={36} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px' }}>No POS Bills Found</h3>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>Try adjusting your search criteria or store selection.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bill Preview Modal */}
      {previewBill && (
        <div className="walkin-modal-overlay">
          <div className="walkin-modal-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '700' }}>Bill #{previewBill.billId}</h3>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  {previewBill.tradeName || previewBill.storeName} {previewBill.storeName && previewBill.tradeName !== previewBill.storeName ? `(${previewBill.storeName})` : ''} • {previewBill.date}
                </span>
              </div>
              <button 
                onClick={() => setPreviewBill(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', marginBottom: '16px' }}>
              {previewBill.tradeName && <div><b>Store Trade Name:</b> {previewBill.tradeName}</div>}
              {previewBill.storeGstNumber && (
                <div style={{ color: '#047857', fontWeight: '700' }}>
                  <b>Store GSTIN:</b> {previewBill.storeGstNumber}
                </div>
              )}
              {previewBill.storeAddress && <div><b>Store Address:</b> {previewBill.storeAddress}</div>}
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '6px', marginTop: '2px' }}><b>Customer Name:</b> {previewBill.customerName || 'Walk-in Customer'}</div>
              <div><b>Customer Phone:</b> {previewBill.customerPhone || '—'}</div>
              {previewBill.companyName && <div><b>B2B Company:</b> {previewBill.companyName}</div>}
              {(previewBill.customerGst || previewBill.gstNumber) && (
                <div style={{ color: '#1e3a8a', fontWeight: '700' }}>
                  <b>Customer GSTIN:</b> {previewBill.customerGst || previewBill.gstNumber}
                </div>
              )}
              <div><b>Payment Mode:</b> {previewBill.paymentMode || 'Cash'}</div>

              <div>
                <b>Bill Status:</b>{' '}
                <span className={`walkin-status-badge ${previewBill.status || 'settled'}`}>
                  {previewBill.status === 'saved' ? 'Saved (Draft)' : 'Settled & Paid'}
                </span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #d1d5db', borderBottom: '1px dashed #d1d5db', padding: '12px 0', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '700' }}>Purchased Items</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(previewBill.items || []).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <div>
                      <div style={{ fontWeight: '600' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        ₹{item.price} x {item.unit === 'Weight' ? `${item.quantity}kg` : item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: '700' }}>₹{Number(item.total).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', marginBottom: '20px' }}>
              {previewBill.discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                  <span>Discount</span>
                  <span>-₹{previewBill.discount}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '15px' }}>
                <span>Grand Total</span>
                <span>₹{Number(previewBill.totalAmount || 0).toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="polaris-btn polaris-btn-primary" 
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  handlePrintReceipt(previewBill);
                  setPreviewBill(null);
                }}
              >
                <Printer size={15} /> Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkInSales;
