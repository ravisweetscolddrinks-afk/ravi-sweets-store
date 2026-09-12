import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Boxes,
  Store as StoreIcon,
  Search,
  Filter,
  Plus,
  Minus,
  Save,
  RotateCcw,
  History,
  AlertTriangle,
  CheckCircle2,
  Package,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowRight,
  Layers,
  X,
  FileSpreadsheet,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import {
  subscribeStoreStock,
  saveItemStock,
  bulkSaveStoreStock,
  fetchStockLogs
} from '../../utils/stockService';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import CustomDropdown from '../../components/Common/CustomDropdown';
import logo from '../../assets/logo.png';
import * as XLSX from 'xlsx';
import './StoreStockManagement.css';

const DEFAULT_ITEM_IMAGE = logo;

const StoreStockManagement = () => {
  // Store & Catalog states
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [storeStockMap, setStoreStockMap] = useState({}); // { [itemId]: stockDoc }
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL'); // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

  // Per-item row edit state:
  // editState[itemId] = { mode: 'set' | 'increment' | 'decrement', value: '' or number }
  const [editState, setEditState] = useState({});

  // Global bulk controls
  const [globalMode, setGlobalMode] = useState('increment'); // 'increment' | 'decrement' | 'set'
  const [bulkApplyValue, setBulkApplyValue] = useState('');
  const [bulkReason, setBulkReason] = useState('Stock audit & adjustment');

  // Saving states
  const [savingItemId, setSavingItemId] = useState(null);
  const [savingAll, setSavingAll] = useState(false);

  // Audit Logs Modal
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch Stores & Categories
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [storesSnap, catsSnap] = await Promise.all([
          getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
          getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
        ]);

        const storesList = storesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setStores(storesList);
        if (storesList.length > 0 && !selectedStoreId) {
          setSelectedStoreId(storesList[0].id);
        }

        setCategories(catsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Failed to load initial data:", err);
        toast.error("Failed to load stores or categories");
      }
    };
    fetchInitialData();
  }, []);

  // Fetch Items Catalog
  useEffect(() => {
    const q = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemsList);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching items:", err);
      toast.error("Error loading products");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time stock subscription for the selected store
  useEffect(() => {
    if (!selectedStoreId) return;
    setLoading(true);
    const unsubscribe = subscribeStoreStock(
      selectedStoreId,
      (stockData) => {
        setStoreStockMap(stockData);
        setLoading(false);
      },
      (err) => {
        toast.error("Failed to sync store stock");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedStoreId]);

  // Load audit logs when modal is open
  const loadLogs = async () => {
    if (!selectedStoreId) return;
    setLoadingLogs(true);
    try {
      const stockLogs = await fetchStockLogs(selectedStoreId, 50);
      setLogs(stockLogs);
    } catch (err) {
      toast.error("Failed to load stock movement logs");
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (showLogsModal) {
      loadLogs();
    }
  }, [showLogsModal, selectedStoreId]);

  // Helper to get existing stock for an item
  const getExistingStock = (itemId) => {
    const entry = storeStockMap[itemId];
    return entry ? Number(entry.currentStock || 0) : 0;
  };

  // Helper to compute new stock for an item given its current edit state
  const computeNewStock = (item) => {
    const existing = getExistingStock(item.id);
    const state = editState[item.id];
    if (!state || state.value === '' || isNaN(Number(state.value))) {
      return existing;
    }

    const val = Number(state.value);
    const isWeight = item.unit === 'Weight';

    if (state.mode === 'increment') {
      const res = existing + val;
      return isWeight ? parseFloat(res.toFixed(3)) : Math.round(res);
    }
    if (state.mode === 'decrement') {
      const res = Math.max(0, existing - val);
      return isWeight ? parseFloat(res.toFixed(3)) : Math.round(res);
    }
    // 'set' mode:
    return Math.max(0, isWeight ? parseFloat(val.toFixed(3)) : Math.round(val));
  };

  // Check if an item has unsaved changes
  const hasItemChanges = (itemId) => {
    const state = editState[itemId];
    if (!state || state.value === '' || isNaN(Number(state.value))) return false;
    const item = items.find(i => i.id === itemId);
    if (!item) return false;
    const existing = getExistingStock(itemId);
    const calculated = computeNewStock(item);
    return calculated !== existing;
  };

  // List of modified items
  const modifiedItemsList = useMemo(() => {
    return items.filter(item => hasItemChanges(item.id));
  }, [items, editState, storeStockMap]);

  // Handle single item mode change
  const handleItemModeChange = (itemId, mode) => {
    setEditState(prev => ({
      ...prev,
      [itemId]: {
        mode,
        value: prev[itemId]?.value || ''
      }
    }));
  };

  // Handle single item value input
  const handleItemValueChange = (itemId, rawVal) => {
    setEditState(prev => ({
      ...prev,
      [itemId]: {
        mode: prev[itemId]?.mode || globalMode,
        value: rawVal
      }
    }));
  };

  // Handle quick chip button (+1, +5, +10, -1, -5)
  const handleQuickChip = (item, amount) => {
    const currentVal = Number(editState[item.id]?.value || 0);
    const newVal = Math.max(0, currentVal + amount);
    setEditState(prev => ({
      ...prev,
      [item.id]: {
        mode: prev[item.id]?.mode || globalMode,
        value: newVal === 0 ? '' : (item.unit === 'Weight' ? newVal.toFixed(1) : newVal.toString())
      }
    }));
  };

  // Apply delta across all filtered items
  const handleApplyBulkDelta = () => {
    if (bulkApplyValue === '' || isNaN(Number(bulkApplyValue))) {
      toast.error("Please enter a valid quantity to apply");
      return;
    }
    const num = Number(bulkApplyValue);
    if (num <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }

    setEditState(prev => {
      const next = { ...prev };
      filteredItems.forEach(item => {
        next[item.id] = {
          mode: globalMode,
          value: item.unit === 'Weight' ? num.toFixed(2) : Math.round(num).toString()
        };
      });
      return next;
    });

    toast.success(`Applied ${globalMode === 'increment' ? '+' : globalMode === 'decrement' ? '-' : ''}${num} to ${filteredItems.length} products`);
  };

  // Reset all unsaved modifications
  const handleResetAll = () => {
    setEditState({});
    setBulkApplyValue('');
    toast.success("All unsaved changes reset");
  };

  // Save single item stock
  const handleSaveSingleItem = async (item) => {
    if (!selectedStoreId) return toast.error("Please select a store");
    const state = editState[item.id];
    if (!state || state.value === '' || isNaN(Number(state.value))) {
      return toast.error("No quantity adjustment specified");
    }

    const existing = getExistingStock(item.id);
    const newStock = computeNewStock(item);
    const delta = item.unit === 'Weight' 
      ? parseFloat((newStock - existing).toFixed(3))
      : Math.round(newStock - existing);

    setSavingItemId(item.id);
    try {
      await saveItemStock({
        storeId: selectedStoreId,
        item,
        existingStock: existing,
        newStock,
        delta,
        updateType: state.mode,
        reason: `${state.mode.toUpperCase()}: Manual stock update`
      });

      // Clear edit state for this item
      setEditState(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      toast.success(`Stock updated for ${item.name}! (${existing} → ${newStock})`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to update stock: ${err.message}`);
    } finally {
      setSavingItemId(null);
    }
  };

  // Save all modified items in bulk
  const handleSaveAllModified = async () => {
    if (!selectedStoreId) return toast.error("Please select a store");
    if (modifiedItemsList.length === 0) {
      return toast.error("No stock modifications to save");
    }

    setSavingAll(true);
    try {
      const updates = modifiedItemsList.map(item => {
        const existing = getExistingStock(item.id);
        const newStock = computeNewStock(item);
        const state = editState[item.id];
        const delta = item.unit === 'Weight' 
          ? parseFloat((newStock - existing).toFixed(3))
          : Math.round(newStock - existing);

        return {
          item,
          existingStock: existing,
          newStock,
          delta,
          updateType: state?.mode || globalMode,
          reason: bulkReason || 'Bulk stock update'
        };
      });

      await bulkSaveStoreStock(selectedStoreId, updates);

      // Clear edit states
      setEditState({});
      setBulkApplyValue('');
      toast.success(`Successfully saved stock for ${updates.length} items!`);
    } catch (err) {
      console.error("Bulk save error:", err);
      toast.error("Failed to save all stock details");
    } finally {
      setSavingAll(false);
    }
  };

  // Export current stock report to Excel
  const exportStockExcel = () => {
    const currentStore = stores.find(s => s.id === selectedStoreId);
    const data = filteredItems.map(item => {
      const existing = getExistingStock(item.id);
      const cat = categories.find(c => c.id === item.categoryId)?.name || 'General';
      return {
        'Product Name': item.name,
        'Category': cat,
        'Unit': item.unit,
        'Barcode / SKU': item.barcode || 'N/A',
        'Price (₹)': item.price,
        'Current Stock': existing,
        'Status': existing === 0 ? 'Out of Stock' : (existing <= (item.unit === 'Weight' ? 2 : 5) ? 'Low Stock' : 'In Stock')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Store Stock");
    XLSX.writeFile(workbook, `Stock_${currentStore?.name || 'Store'}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Stock sheet downloaded");
  };

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = 
        (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.barcode || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === 'ALL' || item.categoryId === selectedCategory;

      const stock = getExistingStock(item.id);
      const isLow = stock > 0 && stock <= (item.unit === 'Weight' ? 2 : 5);
      const isOut = stock === 0;
      const isIn = stock > (item.unit === 'Weight' ? 2 : 5);

      if (stockStatusFilter === 'IN_STOCK' && (!isIn && !isLow)) return false;
      if (stockStatusFilter === 'LOW_STOCK' && !isLow) return false;
      if (stockStatusFilter === 'OUT_OF_STOCK' && !isOut) return false;

      return matchesSearch && matchesCat;
    });
  }, [items, searchQuery, selectedCategory, stockStatusFilter, storeStockMap]);

  // Store options for dropdown
  const storeOptions = useMemo(() => {
    return stores.map(s => ({
      value: s.id,
      label: s.name + (s.city ? ` (${s.city})` : '')
    }));
  }, [stores]);

  const selectedStoreObj = stores.find(s => s.id === selectedStoreId);

  // Statistics KPI calculations
  const stats = useMemo(() => {
    let totalItems = items.length;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    items.forEach(item => {
      const stk = getExistingStock(item.id);
      if (stk <= 0) {
        outOfStock++;
      } else if (stk <= (item.unit === 'Weight' ? 2 : 5)) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    return { totalItems, inStock, lowStock, outOfStock };
  }, [items, storeStockMap]);

  return (
    <div className="stock-container">
      {/* Top Header */}
      <div className="stock-header">
        <div className="stock-header-info">
          <h1>Store Stock Management</h1>
          <p>
            Track real-time inventory, restock additions, wastage, and automatic POS sales deductions
          </p>
        </div>

        {/* Store Selector & Header Actions */}
        <div className="stock-header-controls">
          <div className="stock-store-picker">
            <span className="stock-picker-label">Store:</span>
            <CustomDropdown
              options={storeOptions}
              value={selectedStoreId}
              onChange={(val) => {
                setSelectedStoreId(val);
                setEditState({});
              }}
              placeholder="Select Store"
              icon={<StoreIcon size={15} />}
              className="stock-dropdown-component"
            />
          </div>

          <button
            className="stock-header-btn"
            onClick={() => setShowLogsModal(true)}
            title="View Stock Movement Audit Logs"
          >
            <History size={15} />
            <span>Audit Logs</span>
          </button>
          <button
            className="stock-header-btn"
            onClick={exportStockExcel}
            title="Export Stock Report to Excel"
          >
            <FileSpreadsheet size={15} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="stock-metrics-grid">
        <div className="stock-metric-card total">
          <div className="stock-metric-icon">
            <Package size={22} />
          </div>
          <div className="stock-metric-info">
            <span className="stock-metric-val">{stats.totalItems}</span>
            <span className="stock-metric-label">Total Catalog Products</span>
          </div>
        </div>

        <div className="stock-metric-card instock">
          <div className="stock-metric-icon">
            <CheckCircle2 size={22} />
          </div>
          <div className="stock-metric-info">
            <span className="stock-metric-val">{stats.inStock}</span>
            <span className="stock-metric-label">Ample In-Stock</span>
          </div>
        </div>

        <div className="stock-metric-card lowstock">
          <div className="stock-metric-icon">
            <AlertTriangle size={22} />
          </div>
          <div className="stock-metric-info">
            <span className="stock-metric-val">{stats.lowStock}</span>
            <span className="stock-metric-label">Low Stock Alerts</span>
          </div>
        </div>

        <div className="stock-metric-card outofstock">
          <div className="stock-metric-icon">
            <X size={22} />
          </div>
          <div className="stock-metric-info">
            <span className="stock-metric-val">{stats.outOfStock}</span>
            <span className="stock-metric-label">Out of Stock</span>
          </div>
        </div>
      </div>

      {/* Search, Filter & Bulk Controls Panel */}
      <div className="stock-controls-panel">
        <div className="stock-search-filters">
          <div className="stock-search-box">
            <Search size={18} className="stock-search-icon" />
            <input
              type="text"
              placeholder="Search product by name or barcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="stock-clear-btn" onClick={() => setSearchQuery('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="stock-filter-dropdowns">
            <select
              className="stock-select-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            <select
              className="stock-select-filter"
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
            >
              <option value="ALL">All Stock Levels</option>
              <option value="IN_STOCK">Ample Stock</option>
              <option value="LOW_STOCK">Low Stock</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
            </select>
          </div>
        </div>

        {/* Bulk Increment / Decrement / Set Action Toolbar */}
        <div className="stock-bulk-toolbar">
          <div className="stock-bulk-mode-group">
            <span className="stock-bulk-label">Bulk Operation:</span>
            <div className="stock-segmented-control">
              <button
                type="button"
                className={`stock-seg-btn ${globalMode === 'increment' ? 'active increment' : ''}`}
                onClick={() => setGlobalMode('increment')}
              >
                <Plus size={14} />
                <span>Increment (+ Add)</span>
              </button>
              <button
                type="button"
                className={`stock-seg-btn ${globalMode === 'decrement' ? 'active decrement' : ''}`}
                onClick={() => setGlobalMode('decrement')}
              >
                <Minus size={14} />
                <span>Decrement (- Reduce)</span>
              </button>
              <button
                type="button"
                className={`stock-seg-btn ${globalMode === 'set' ? 'active set' : ''}`}
                onClick={() => setGlobalMode('set')}
              >
                <SlidersHorizontal size={14} />
                <span>Direct Set (=)</span>
              </button>
            </div>
          </div>

          <div className="stock-bulk-apply-box">
            <input
              type="number"
              step="any"
              min="0"
              placeholder={`Quantity to ${globalMode === 'increment' ? 'add' : globalMode === 'decrement' ? 'reduce' : 'set'}...`}
              value={bulkApplyValue}
              onChange={(e) => setBulkApplyValue(e.target.value)}
              className="stock-bulk-input"
            />
            <button
              className="stock-btn-apply"
              onClick={handleApplyBulkDelta}
              title="Apply this quantity to all filtered items below"
            >
              Apply to All ({filteredItems.length})
            </button>
          </div>

          {modifiedItemsList.length > 0 && (
            <div className="stock-bulk-actions">
              <button
                className="stock-btn-reset"
                onClick={handleResetAll}
                title="Discard all pending changes"
              >
                <RotateCcw size={15} />
                <span>Reset</span>
              </button>
              <button
                className="stock-btn-save-all"
                onClick={handleSaveAllModified}
                disabled={savingAll}
              >
                {savingAll ? (
                  <div className="stock-mini-spinner" />
                ) : (
                  <Save size={16} />
                )}
                <span>Save All Stock ({modifiedItemsList.length})</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stock Table */}
      <div className="stock-table-card">
        {loading ? (
          <div className="stock-loading-state">
            <div className="stock-spinner" />
            <p>Loading catalog & store inventory...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="stock-empty-state">
            <Package size={48} className="stock-empty-icon" />
            <h3>No products found</h3>
            <p>Try adjusting your search query or category filters.</p>
          </div>
        ) : (
          <div className="stock-table-wrapper">
            <table className="stock-table">
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th>Barcode / SKU</th>
                  <th>Unit & Price</th>
                  <th>Existing Stock</th>
                  <th>Adjustment Mode</th>
                  <th>Quantity (+/-)</th>
                  <th>New Stock Preview</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const existing = getExistingStock(item.id);
                  const isWeight = item.unit === 'Weight';
                  const rowState = editState[item.id] || { mode: globalMode, value: '' };
                  const hasChanges = hasItemChanges(item.id);
                  const newStock = computeNewStock(item);
                  const isSavingThis = savingItemId === item.id;
                  const catName = categories.find(c => c.id === item.categoryId)?.name || 'General';

                  // Stock level status badge
                  let stockStatus = 'in';
                  if (existing <= 0) stockStatus = 'out';
                  else if (existing <= (isWeight ? 2 : 5)) stockStatus = 'low';

                  return (
                    <tr
                      key={item.id}
                      className={`stock-table-row ${hasChanges ? 'row-modified' : ''}`}
                    >
                      {/* Product details */}
                      <td className="stock-td-product">
                        <div className="stock-product-cell">
                          <img
                            src={item.image || DEFAULT_ITEM_IMAGE}
                            alt={item.name}
                            className="stock-product-img"
                            onError={(e) => { e.target.src = DEFAULT_ITEM_IMAGE; }}
                          />
                          <div className="stock-product-meta">
                            <span className="stock-product-name">{item.name}</span>
                            <span className="stock-product-cat">{catName}</span>
                          </div>
                        </div>
                      </td>

                      {/* Barcode */}
                      <td className="stock-td-barcode">
                        <span className="stock-barcode-pill">
                          {item.barcode || 'N/A'}
                        </span>
                      </td>

                      {/* Unit & Price */}
                      <td className="stock-td-price">
                        <div className="stock-price-meta">
                          <span className="stock-unit-badge">{item.unit}</span>
                          <span className="stock-item-price">₹{Number(item.price).toFixed(2)}</span>
                        </div>
                      </td>

                      {/* Existing Stock */}
                      <td className="stock-td-existing">
                        <div className={`stock-existing-badge ${stockStatus}`}>
                          <span className="stock-qty-val">
                            {isWeight ? existing.toFixed(3) : existing}
                          </span>
                          <span className="stock-qty-unit">
                            {isWeight ? 'kg' : 'pcs'}
                          </span>
                        </div>
                      </td>

                      {/* Row Adjustment Mode Selector */}
                      <td className="stock-td-mode">
                        <div className="stock-row-mode-pills">
                          <button
                            type="button"
                            className={`stock-mini-mode-btn ${rowState.mode === 'increment' ? 'active-inc' : ''}`}
                            onClick={() => handleItemModeChange(item.id, 'increment')}
                            title="Add to existing stock"
                          >
                            + Add
                          </button>
                          <button
                            type="button"
                            className={`stock-mini-mode-btn ${rowState.mode === 'decrement' ? 'active-dec' : ''}`}
                            onClick={() => handleItemModeChange(item.id, 'decrement')}
                            title="Reduce from existing stock"
                          >
                            - Reduce
                          </button>
                          <button
                            type="button"
                            className={`stock-mini-mode-btn ${rowState.mode === 'set' ? 'active-set' : ''}`}
                            onClick={() => handleItemModeChange(item.id, 'set')}
                            title="Set exact stock value"
                          >
                            = Set
                          </button>
                        </div>
                      </td>

                      {/* Input quantity & Quick chips */}
                      <td className="stock-td-input">
                        <div className="stock-input-wrapper">
                          <div className="stock-stepper">
                            <button
                              type="button"
                              className="stock-step-btn"
                              onClick={() => {
                                const cur = Number(rowState.value || 0);
                                const step = isWeight ? 0.5 : 1;
                                handleItemValueChange(item.id, Math.max(0, cur - step));
                              }}
                            >
                              <Minus size={13} />
                            </button>
                            <input
                              type="number"
                              step={isWeight ? "0.1" : "1"}
                              min="0"
                              placeholder="0"
                              value={rowState.value}
                              onChange={(e) => handleItemValueChange(item.id, e.target.value)}
                              className="stock-qty-input"
                            />
                            <button
                              type="button"
                              className="stock-step-btn"
                              onClick={() => {
                                const cur = Number(rowState.value || 0);
                                const step = isWeight ? 0.5 : 1;
                                handleItemValueChange(item.id, cur + step);
                              }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <div className="stock-quick-chips">
                            <button
                              type="button"
                              className="stock-chip"
                              onClick={() => handleQuickChip(item, isWeight ? 0.5 : 1)}
                            >
                              +{isWeight ? '0.5' : '1'}
                            </button>
                            <button
                              type="button"
                              className="stock-chip"
                              onClick={() => handleQuickChip(item, isWeight ? 1 : 5)}
                            >
                              +{isWeight ? '1' : '5'}
                            </button>
                            <button
                              type="button"
                              className="stock-chip"
                              onClick={() => handleQuickChip(item, isWeight ? 5 : 10)}
                            >
                              +{isWeight ? '5' : '10'}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* New Stock Preview */}
                      <td className="stock-td-preview">
                        {hasChanges ? (
                          <div className={`stock-calc-preview ${rowState.mode}`}>
                            <div className="stock-formula">
                              <span className="formula-existing">{existing}</span>
                              <span className="formula-op">
                                {rowState.mode === 'increment' ? '+' : rowState.mode === 'decrement' ? '-' : '→'}
                              </span>
                              <span className="formula-delta">
                                {Number(rowState.value || 0)}
                              </span>
                            </div>
                            <div className="stock-result-badge">
                              = <strong>{isWeight ? newStock.toFixed(3) : newStock}</strong> {isWeight ? 'kg' : 'pcs'}
                            </div>
                          </div>
                        ) : (
                          <span className="stock-no-change">
                            {isWeight ? existing.toFixed(3) : existing} {isWeight ? 'kg' : 'pcs'}
                          </span>
                        )}
                      </td>

                      {/* Row Action: Save individual */}
                      <td className="stock-td-action">
                        <button
                          className={`stock-row-save-btn ${hasChanges ? 'ready' : ''}`}
                          disabled={!hasChanges || isSavingThis}
                          onClick={() => handleSaveSingleItem(item)}
                          title="Save this product stock"
                        >
                          {isSavingThis ? (
                            <div className="stock-mini-spinner" />
                          ) : (
                            <>
                              <Save size={14} />
                              <span>Save</span>
                            </>
                          )}
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

      {/* Sticky Bottom Bar for Unsaved Changes */}
      <AnimatePresence>
        {modifiedItemsList.length > 0 && (
          <motion.div
            className="stock-floating-save-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="stock-bar-summary">
              <div className="stock-bar-count-badge">
                {modifiedItemsList.length}
              </div>
              <div className="stock-bar-text">
                <strong>{modifiedItemsList.length} products modified</strong>
                <span>Changes will update live stock for {selectedStoreObj?.name || 'this store'}</span>
              </div>
            </div>

            <div className="stock-bar-reason">
              <input
                type="text"
                placeholder="Reason / Note (optional)..."
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                className="stock-bar-reason-input"
              />
            </div>

            <div className="stock-bar-buttons">
              <button
                type="button"
                className="stock-bar-btn-discard"
                onClick={handleResetAll}
              >
                <RotateCcw size={15} />
                <span>Discard</span>
              </button>
              <button
                type="button"
                className="stock-bar-btn-confirm"
                onClick={handleSaveAllModified}
                disabled={savingAll}
              >
                {savingAll ? (
                  <div className="stock-mini-spinner" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>Save All Details</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stock Audit Movement Logs Modal */}
      <AnimatePresence>
        {showLogsModal && (
          <div className="stock-modal-backdrop" onClick={() => setShowLogsModal(false)}>
            <motion.div
              className="stock-modal-card"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="stock-modal-header">
                <div className="stock-modal-title">
                  <History size={20} />
                  <div>
                    <h3>Stock Movement Logs</h3>
                    <p>Audit trail of additions, deductions, wastage, and POS billing settlements for {selectedStoreObj?.name}</p>
                  </div>
                </div>
                <button
                  className="stock-modal-close"
                  onClick={() => setShowLogsModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="stock-modal-body">
                {loadingLogs ? (
                  <div className="stock-modal-loading">
                    <div className="stock-spinner" />
                    <p>Loading audit trail...</p>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="stock-modal-empty">
                    <Clock size={36} />
                    <h4>No stock movement logs found</h4>
                    <p>Stock adjustments or settled POS bills will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="stock-logs-list">
                    {logs.map((log) => {
                      const isPositive = Number(log.delta) > 0;
                      const isBill = log.actionType === 'bill_settle';
                      const formattedDate = log.createdAt?.toDate 
                        ? log.createdAt.toDate().toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Just now';

                      return (
                        <div key={log.id} className="stock-log-item">
                          <div className={`stock-log-type-icon ${isBill ? 'bill' : isPositive ? 'inc' : 'dec'}`}>
                            {isBill ? <Boxes size={18} /> : isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                          </div>

                          <div className="stock-log-details">
                            <div className="stock-log-header">
                              <span className="stock-log-item-name">{log.itemName}</span>
                              <span className="stock-log-timestamp">{formattedDate}</span>
                            </div>
                            <div className="stock-log-reason">
                              {log.reason || log.actionType}
                              {log.billId && <span className="stock-log-bill-id">#{log.billId}</span>}
                            </div>
                          </div>

                          <div className="stock-log-numbers">
                            <span className={`stock-log-delta ${isPositive ? 'plus' : 'minus'}`}>
                              {isPositive ? `+${log.delta}` : log.delta} {log.unit === 'Weight' ? 'kg' : 'pcs'}
                            </span>
                            <span className="stock-log-range">
                              {log.previousStock} → <strong>{log.newStock}</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="stock-modal-footer">
                <button
                  className="stock-btn-secondary"
                  onClick={loadLogs}
                  disabled={loadingLogs}
                >
                  <RefreshCw size={14} />
                  <span>Refresh</span>
                </button>
                <button
                  className="stock-btn-secondary"
                  onClick={() => setShowLogsModal(false)}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreStockManagement;
