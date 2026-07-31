import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, Search, PackageCheck, Trash2, X,
  ChevronDown, CheckCircle2, AlertCircle, AlertTriangle,
  Save, Calendar, Factory, FileText, Eye, Scale, Layers, RefreshCw, Filter, Clock, Box
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection, addDoc, getDocs, query, orderBy,
  onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StockEntry.css';

/* ── Custom Portal-based Searchable Product Dropdown ── */
const ProductSearchDropdown = ({ products, value, onChange, placeholder = "Search product by name or ID..." }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 340 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const selectedProduct = products.find(p => p.id === value);

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = Math.max(rect.width, 360);
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      setCoords({
        top: rect.bottom + 6,
        left: Math.max(16, left),
        width: popoverWidth
      });
    }
  };

  const handleToggle = () => {
    if (!open) {
      updateCoords();
      setSearch('');
    }
    setOpen(!open);
  };

  useEffect(() => {
    if (open) {
      updateCoords();
      const handleScrollOrResize = () => updateCoords();
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = products.filter(p => {
    const queryStr = search.toLowerCase().trim();
    if (!queryStr) return true;
    const nameMatch = (p.name || '').toLowerCase().includes(queryStr);
    const idMatch = (p.id || '').toLowerCase().includes(queryStr);
    const codeMatch = (p.itemCode || '').toLowerCase().includes(queryStr);
    return nameMatch || idMatch || codeMatch;
  });

  return (
    <div className="se-product-dropdown" ref={triggerRef}>
      <div
        className={`se-product-trigger ${open ? 'open' : ''} ${selectedProduct ? 'has-value' : ''}`}
        onClick={handleToggle}
      >
        {selectedProduct ? (
          <div className="se-selected-product">
            <span className="se-sp-name">{selectedProduct.name}</span>
            <span className="se-sp-id">ID: {selectedProduct.id}</span>
          </div>
        ) : (
          <div className="se-placeholder-wrap">
            <Search size={14} className="se-trigger-search-icon" />
            <span className="se-placeholder">{placeholder}</span>
          </div>
        )}
        <ChevronDown size={16} className={`se-chevron ${open ? 'rotated' : ''}`} />
      </div>

      {open && createPortal(
        <AnimatePresence>
          <motion.div
            ref={popoverRef}
            className="se-dropdown-popover-portal"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 99999
            }}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="se-dd-search-wrap">
              <Search size={15} className="se-dd-search-icon" />
              <input
                className="se-dd-search-input"
                placeholder="Type product name or ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
              {search && (
                <button
                  type="button"
                  className="se-dd-clear-btn"
                  onClick={(e) => { e.stopPropagation(); setSearch(''); }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="se-dd-list">
              {filtered.length === 0 ? (
                <div className="se-dd-empty">No matching products found</div>
              ) : (
                filtered.map(p => (
                  <div
                    key={p.id}
                    className={`se-dd-item ${p.id === value ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(p);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <div className="se-dd-item-main">
                      <div className="se-dd-item-name-row">
                        <span className="se-dd-item-name">{p.name}</span>
                        {p.unit && <span className="se-dd-item-unit">{p.unit}</span>}
                      </div>
                      <span className="se-dd-item-id">ID: {p.id}</span>
                    </div>
                    {p.id === value && <CheckCircle2 size={16} className="se-dd-check" />}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

/* ── Main Stock Entry Component ────────────────────────── */
const StockEntry = () => {
  const [activeTab, setActiveTab] = useState('entry'); // 'entry' | 'list'

  // Master Data
  const [mUnits, setMUnits] = useState([]);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [stockAssignments, setStockAssignments] = useState([]);
  const [stockEntries, setStockEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMUnitId, setSelectedMUnitId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Rows state for new entry
  const [entryRows, setEntryRows] = useState([
    { id: Date.now(), itemId: '', itemName: '', unit: 'Weight', kgPerTray: '', trays: '', qty: '', totalQty: 0 }
  ]);

  const [submitting, setSubmitting] = useState(false);

  // List View state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMUnit, setFilterMUnit] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState(null); // For modal view
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Firestore Listeners ─────────────────────────────── */
  useEffect(() => {
    const qMUnits = query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'));
    const unsubMUnits = onSnapshot(qMUnits, snap => setMUnits(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qProducts = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubProducts = onSnapshot(qProducts, snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qRecipes = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
    const unsubRecipes = onSnapshot(qRecipes, snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qStockAssign = query(collection(db, 'stock_assignments'));
    const unsubStockAssign = onSnapshot(qStockAssign, snap => setStockAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qEntries = query(collection(db, 'stock_entries'), orderBy('createdAt', 'desc'));
    const unsubEntries = onSnapshot(qEntries, snap => {
      setStockEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubMUnits();
      unsubProducts();
      unsubRecipes();
      unsubStockAssign();
      unsubEntries();
    };
  }, []);

  // Default select first MUnit if available
  useEffect(() => {
    if (!selectedMUnitId && mUnits.length > 0) {
      setSelectedMUnitId(mUnits[0].id);
    }
  }, [mUnits, selectedMUnitId]);

  /* ── Entry Rows Handlers ─────────────────────────────── */
  const handleAddRow = () => {
    setEntryRows(prev => [
      ...prev,
      { id: Date.now() + Math.random(), itemId: '', itemName: '', unit: 'Weight', kgPerTray: '', trays: '', qty: '', totalQty: 0 }
    ]);
  };

  const handleRemoveRow = (id) => {
    if (entryRows.length === 1) {
      return toast.error('At least one item row is required in the entry');
    }
    setEntryRows(prev => prev.filter(r => r.id !== id));
  };

  const handleProductSelect = (rowId, product) => {
    setEntryRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;

      const unit = product.unit || 'Weight';
      const isTray = unit === 'Tray';
      const kgPerTray = isTray ? (row.kgPerTray || '') : '';
      const trays = isTray ? (row.trays || '') : '';
      const qty = !isTray ? (row.qty || '') : '';

      let totalQty = 0;
      if (isTray) {
        totalQty = (Number(trays) || 0) * (Number(kgPerTray) || 0);
      } else {
        totalQty = Number(qty) || 0;
      }

      return {
        ...row,
        itemId: product.id,
        itemName: product.name,
        unit: unit,
        kgPerTray,
        trays,
        qty,
        totalQty
      };
    }));
  };

  const handleRowChange = (rowId, field, value) => {
    setEntryRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;

      const updated = { ...row, [field]: value };

      // Calculate total quantity dynamically
      if (updated.unit === 'Tray') {
        const kg = field === 'kgPerTray' ? value : updated.kgPerTray;
        const tr = field === 'trays' ? value : updated.trays;
        updated.totalQty = (Number(kg) || 0) * (Number(tr) || 0);
      } else {
        const q = field === 'qty' ? value : updated.qty;
        updated.totalQty = Number(q) || 0;
      }

      // If unit changed
      if (field === 'unit') {
        if (value === 'Tray') {
          updated.qty = '';
          updated.totalQty = (Number(updated.kgPerTray) || 0) * (Number(updated.trays) || 0);
        } else {
          updated.kgPerTray = '';
          updated.trays = '';
          updated.totalQty = Number(updated.qty) || 0;
        }
      }

      return updated;
    }));
  };

  /* ── Helper to find recipe for a row item ────────────── */
  const getRecipeForItem = (itemId) => {
    if (!itemId) return null;
    const mUnitRecipe = recipes.find(r => r.itemId === itemId && r.mUnitId === selectedMUnitId);
    if (mUnitRecipe) return mUnitRecipe;
    return recipes.find(r => r.itemId === itemId);
  };

  /* ── Save Stock Entry Logic ───────────────────────────── */
  const handleSaveEntry = async (e) => {
    e.preventDefault();

    if (!selectedMUnitId) {
      return toast.error('Please select a Manufacturing Unit');
    }

    if (entryRows.length === 0) {
      return toast.error('Add at least one product row');
    }

    // Validate rows
    for (let i = 0; i < entryRows.length; i++) {
      const row = entryRows[i];
      if (!row.itemId) {
        return toast.error(`Row ${i + 1}: Please select a product`);
      }
      if (row.unit === 'Tray') {
        if (!row.kgPerTray || Number(row.kgPerTray) <= 0) {
          return toast.error(`Row ${i + 1} (${row.itemName}): Please enter valid Kg per Tray`);
        }
        if (!row.trays || Number(row.trays) <= 0) {
          return toast.error(`Row ${i + 1} (${row.itemName}): Please enter valid number of Trays`);
        }
      } else {
        if (!row.qty || Number(row.qty) <= 0) {
          return toast.error(`Row ${i + 1} (${row.itemName}): Please enter valid quantity`);
        }
      }
    }

    setSubmitting(true);

    try {
      const selectedMUnit = mUnits.find(m => m.id === selectedMUnitId);
      const mUnitName = selectedMUnit?.name || 'Manufacturing Unit';

      const processedItems = [];
      const aggregatedRawDeductions = {};

      for (const row of entryRows) {
        const recipe = getRecipeForItem(row.itemId);
        const itemDeductions = [];

        if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
          for (const ing of recipe.ingredients) {
            const deductQty = (Number(ing.qty) || 0) * (Number(row.totalQty) || 0);
            itemDeductions.push({
              stockItemId: ing.stockItemId,
              stockItemName: ing.stockItemName,
              qtyDeducted: deductQty,
              unit: ing.unit
            });

            if (!aggregatedRawDeductions[ing.stockItemId]) {
              aggregatedRawDeductions[ing.stockItemId] = {
                stockItemId: ing.stockItemId,
                stockItemName: ing.stockItemName,
                unit: ing.unit,
                totalQtyDeducted: 0
              };
            }
            aggregatedRawDeductions[ing.stockItemId].totalQtyDeducted += deductQty;
          }
        }

        processedItems.push({
          itemId: row.itemId,
          itemName: row.itemName,
          unit: row.unit,
          trays: row.unit === 'Tray' ? Number(row.trays) : null,
          kgPerTray: row.unit === 'Tray' ? Number(row.kgPerTray) : null,
          totalQty: row.totalQty,
          recipeId: recipe ? recipe.id : null,
          recipeName: recipe ? recipe.name : null,
          ingredientsDeducted: itemDeductions
        });
      }

      // Update stock assignments in Firestore
      const updatePromises = Object.values(aggregatedRawDeductions).map(async (deduction) => {
        const existingAssignment = stockAssignments.find(
          a => a.stockItemId === deduction.stockItemId && a.mUnitId === selectedMUnitId
        );

        if (existingAssignment) {
          const currentQty = Number(existingAssignment.currentQty) || 0;
          const newQty = Math.max(0, currentQty - deduction.totalQtyDeducted);
          await updateDoc(doc(db, 'stock_assignments', existingAssignment.id), {
            currentQty: newQty,
            updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'stock_assignments'), {
            stockItemId: deduction.stockItemId,
            stockItemName: deduction.stockItemName,
            mUnitId: selectedMUnitId,
            mUnitName: mUnitName,
            currentQty: 0,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      });

      await Promise.all(updatePromises);

      const entryNo = `SE-${Date.now().toString().slice(-6)}`;
      const totalEntryQty = processedItems.reduce((sum, i) => sum + (Number(i.totalQty) || 0), 0);

      await addDoc(collection(db, 'stock_entries'), {
        entryNo,
        date: entryDate,
        mUnitId: selectedMUnitId,
        mUnitName: mUnitName,
        remarks: remarks.trim(),
        items: processedItems,
        rawMaterialsDeducted: Object.values(aggregatedRawDeductions),
        totalItems: processedItems.length,
        totalQty: totalEntryQty,
        createdAt: serverTimestamp()
      });

      toast.success(`Stock Entry ${entryNo} saved & raw material stock updated based on recipe!`);

      setRemarks('');
      setEntryRows([{ id: Date.now(), itemId: '', itemName: '', unit: 'Weight', kgPerTray: '', trays: '', qty: '', totalQty: 0 }]);
      setActiveTab('list');

    } catch (err) {
      console.error('Error saving stock entry:', err);
      toast.error('Failed to save stock entry');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Delete Entry Handler ─────────────────────────────── */
  const handleDeleteEntry = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'stock_entries', deleteTarget.id));
      toast.success('Stock entry deleted');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Filtered Stock Entries for List Tab ─────────────── */
  const filteredEntries = stockEntries.filter(entry => {
    const queryStr = searchTerm.toLowerCase().trim();
    const matchesSearch = !queryStr ||
      (entry.entryNo || '').toLowerCase().includes(queryStr) ||
      (entry.mUnitName || '').toLowerCase().includes(queryStr) ||
      (entry.items || []).some(i => (i.itemName || '').toLowerCase().includes(queryStr));

    const matchesUnit = filterMUnit === 'all' || entry.mUnitId === filterMUnit;

    return matchesSearch && matchesUnit;
  });

  return (
    <div className="se-container">
      {/* Top Header */}
      <div className="se-header">
        <div className="se-header-title">
          <h1><PackageCheck size={26} /> Stock Entry</h1>
          <p>Record finished goods stock entry and automatically deduct recipe-based raw materials</p>
        </div>

        {/* Navigation Tabs */}
        <div className="se-tabs">
          <button
            className={`se-tab-btn ${activeTab === 'entry' ? 'active' : ''}`}
            onClick={() => setActiveTab('entry')}
          >
            <Plus size={16} /> Add Stock Entry
          </button>
          <button
            className={`se-tab-btn ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            <FileText size={16} /> List of Entries
            <span className="se-tab-badge">{stockEntries.length}</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: ADD STOCK ENTRY ───────────────────────── */}
      {activeTab === 'entry' && (
        <motion.div
          className="se-entry-wrapper"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <form onSubmit={handleSaveEntry} className="se-form-card">
            {/* Header Metadata Section */}
            <div className="se-form-header-grid">
              <div className="se-field">
                <label><Calendar size={14} /> Entry Date <span>*</span></label>
                <input
                  type="date"
                  className="se-input"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  required
                />
              </div>

              <div className="se-field">
                <label><Factory size={14} /> Manufacturing Unit <span>*</span></label>
                <select
                  className="se-select"
                  value={selectedMUnitId}
                  onChange={e => setSelectedMUnitId(e.target.value)}
                  required
                >
                  <option value="" disabled>Select Unit...</option>
                  {mUnits.map(mu => (
                    <option key={mu.id} value={mu.id}>{mu.name}</option>
                  ))}
                </select>
              </div>

              <div className="se-field full-width">
                <label><FileText size={14} /> Remarks / Notes (Optional)</label>
                <input
                  type="text"
                  className="se-input"
                  placeholder="e.g. Batch #104 morning production..."
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                />
              </div>
            </div>

            {/* Table of Entry Rows */}
            <div className="se-items-section">
              <div className="se-items-section-header">
                <h3><Layers size={18} /> Products to Add</h3>
                <button
                  type="button"
                  className="se-btn-secondary"
                  onClick={handleAddRow}
                >
                  <Plus size={15} /> Add Row
                </button>
              </div>

              <div className="se-table-container">
                <table className="se-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th style={{ minWidth: '250px' }}>Product (Name / ID)</th>
                      <th style={{ width: '140px' }}>Unit</th>
                      <th style={{ minWidth: '220px' }}>Tray / Qty Input</th>
                      <th style={{ width: '130px' }}>Total Weight/Qty</th>
                      <th style={{ minWidth: '180px' }}>Recipe Status</th>
                      <th style={{ width: '50px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryRows.map((row, index) => {
                      const recipe = getRecipeForItem(row.itemId);
                      const isTray = row.unit === 'Tray';

                      return (
                        <tr key={row.id}>
                          <td className="se-td-index">{index + 1}</td>
                          
                          {/* Product Search & Select */}
                          <td>
                            <ProductSearchDropdown
                              products={products}
                              value={row.itemId}
                              onChange={p => handleProductSelect(row.id, p)}
                              placeholder="Search by product name or ID..."
                            />
                          </td>

                          {/* Unit Select */}
                          <td>
                            <select
                              className="se-select-sm"
                              value={row.unit}
                              onChange={e => handleRowChange(row.id, 'unit', e.target.value)}
                            >
                              <option value="Weight">Weight (Kg)</option>
                              <option value="Tray">Tray</option>
                              <option value="Piece">Piece (Pcs)</option>
                              <option value="Litre">Litre (Ltr)</option>
                              <option value="Packet">Packet</option>
                            </select>
                          </td>

                          {/* Dynamic Input based on Unit */}
                          <td>
                            {isTray ? (
                              <div className="se-tray-input-group">
                                <div className="se-sub-field">
                                  <span className="se-sub-label">Kg per Tray:</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    className="se-input-sm"
                                    placeholder="e.g. 5"
                                    value={row.kgPerTray}
                                    onChange={e => handleRowChange(row.id, 'kgPerTray', e.target.value)}
                                  />
                                </div>
                                <div className="se-sub-field">
                                  <span className="se-sub-label">Trays:</span>
                                  <input
                                    type="number"
                                    step="1"
                                    min="1"
                                    className="se-input-sm"
                                    placeholder="e.g. 2"
                                    value={row.trays}
                                    onChange={e => handleRowChange(row.id, 'trays', e.target.value)}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="se-single-input-wrap">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  className="se-input-sm"
                                  placeholder="Enter Qty..."
                                  value={row.qty}
                                  onChange={e => handleRowChange(row.id, 'qty', e.target.value)}
                                />
                                <span className="se-unit-badge">{row.unit}</span>
                              </div>
                            )}
                          </td>

                          {/* Calculated Total Qty */}
                          <td className="se-td-total">
                            <span className="se-total-badge">
                              {row.totalQty > 0 ? row.totalQty.toFixed(2) : '0.00'}{' '}
                              {isTray ? 'Kg' : (row.unit === 'Weight' ? 'Kg' : row.unit)}
                            </span>
                          </td>

                          {/* Recipe Status */}
                          <td>
                            {row.itemId ? (
                              recipe ? (
                                <div className="se-recipe-pill active" title={`Ingredients: ${recipe.ingredients?.map(i => `${i.stockItemName} (${i.qty})`).join(', ')}`}>
                                  <CheckCircle2 size={13} />
                                  <span>{recipe.name}</span>
                                </div>
                              ) : (
                                <div className="se-recipe-pill warning" title="No recipe configured for this item. Entry will be saved without raw material deduction.">
                                  <AlertTriangle size={13} />
                                  <span>No Recipe</span>
                                </div>
                              )
                            ) : (
                              <span className="se-text-muted">Select Product</span>
                            )}
                          </td>

                          {/* Remove Button */}
                          <td className="se-td-action">
                            <button
                              type="button"
                              className="se-btn-icon-danger"
                              onClick={() => handleRemoveRow(row.id)}
                              title="Remove row"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Form Summary & Action Footer */}
            <div className="se-form-footer">
              <div className="se-summary-pills">
                <div className="se-summary-pill">
                  <span>Total Products:</span> <strong>{entryRows.filter(r => r.itemId).length}</strong>
                </div>
                <div className="se-summary-pill accent">
                  <span>Total Quantity:</span> <strong>
                    {entryRows.reduce((sum, r) => sum + (Number(r.totalQty) || 0), 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="se-form-actions">
                <button
                  type="submit"
                  className="se-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? <RefreshCw size={16} className="se-spin" /> : <Save size={16} />}
                  {submitting ? 'Saving Entry...' : 'Save Stock Entry'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      {/* ── TAB 2: LIST OF ENTRIES ────────────────────────── */}
      {activeTab === 'list' && (
        <motion.div
          className="se-list-wrapper"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Filters Bar */}
          <div className="se-filters-bar">
            <div className="se-search-box">
              <Search size={16} className="se-search-icon" />
              <input
                type="text"
                placeholder="Search by Entry No, Product Name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="se-clear-search" onClick={() => setSearchTerm('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="se-filter-select-wrap">
              <Filter size={15} className="se-filter-icon" />
              <select
                className="se-filter-select"
                value={filterMUnit}
                onChange={e => setFilterMUnit(e.target.value)}
              >
                <option value="all">All Manufacturing Units</option>
                {mUnits.map(mu => (
                  <option key={mu.id} value={mu.id}>{mu.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Entries Table */}
          {loading ? (
            <div className="se-loading-state">
              <RefreshCw size={24} className="se-spin" />
              <p>Loading stock entries...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="se-empty-state">
              <Box size={48} className="se-empty-icon" />
              <h3>No Stock Entries Found</h3>
              <p>Create a new stock entry to update finished items and raw material inventory.</p>
              <button className="se-btn-primary" onClick={() => setActiveTab('entry')}>
                <Plus size={16} /> Create Stock Entry
              </button>
            </div>
          ) : (
            <div className="se-table-container shadow">
              <table className="se-table">
                <thead>
                  <tr>
                    <th>Entry No</th>
                    <th>Date</th>
                    <th>Manufacturing Unit</th>
                    <th>Products Added</th>
                    <th>Total Quantity</th>
                    <th>Raw Materials Impact</th>
                    <th>Created At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(entry => {
                    const formattedDate = entry.date ? new Date(entry.date).toLocaleDateString('en-IN') : 'N/A';
                    const createdAtDate = entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString('en-IN') : 'Just now';

                    return (
                      <tr key={entry.id}>
                        <td className="se-td-entryno">
                          <strong>{entry.entryNo || entry.id.substring(0, 8)}</strong>
                        </td>
                        <td>{formattedDate}</td>
                        <td>
                          <span className="se-munit-badge"><Factory size={12} /> {entry.mUnitName || 'Unit'}</span>
                        </td>
                        <td>
                          <div className="se-products-preview">
                            {(entry.items || []).slice(0, 2).map((item, idx) => (
                              <span key={idx} className="se-item-tag">
                                {item.itemName} ({item.totalQty} {item.unit === 'Tray' ? 'Kg' : item.unit})
                              </span>
                            ))}
                            {(entry.items || []).length > 2 && (
                              <span className="se-more-tag">+{entry.items.length - 2} more</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <strong className="se-qty-text">{Number(entry.totalQty || 0).toFixed(2)}</strong>
                        </td>
                        <td>
                          {entry.rawMaterialsDeducted && entry.rawMaterialsDeducted.length > 0 ? (
                            <span className="se-status-tag success">
                              <CheckCircle2 size={12} /> {entry.rawMaterialsDeducted.length} Raw Materials Updated
                            </span>
                          ) : (
                            <span className="se-status-tag warning">
                              <AlertCircle size={12} /> No Recipe Deduction
                            </span>
                          )}
                        </td>
                        <td className="se-text-muted">{createdAtDate}</td>
                        <td className="se-td-actions">
                          <button
                            className="se-btn-icon"
                            title="View Details"
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            className="se-btn-icon-danger"
                            title="Delete Entry"
                            onClick={() => setDeleteTarget(entry)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* ── ENTRY DETAILS MODAL ──────────────────────────── */}
      <AnimatePresence>
        {selectedEntry && (
          <div className="se-modal-overlay" onClick={() => setSelectedEntry(null)}>
            <motion.div
              className="se-modal-card"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="se-modal-header">
                <div>
                  <h2>Stock Entry Details: {selectedEntry.entryNo}</h2>
                  <p>Date: {selectedEntry.date} | Unit: {selectedEntry.mUnitName}</p>
                </div>
                <button className="se-btn-close" onClick={() => setSelectedEntry(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="se-modal-body">
                {selectedEntry.remarks && (
                  <div className="se-modal-remarks">
                    <strong>Remarks:</strong> {selectedEntry.remarks}
                  </div>
                )}

                {/* Items Table */}
                <h3>Added Finished Products</h3>
                <table className="se-modal-table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Unit</th>
                      <th>Tray Details</th>
                      <th>Total Quantity</th>
                      <th>Recipe Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedEntry.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td><strong>{item.itemName}</strong></td>
                        <td>{item.unit}</td>
                        <td>
                          {item.unit === 'Tray' ? `${item.trays} trays × ${item.kgPerTray} kg` : '-'}
                        </td>
                        <td><strong>{item.totalQty} {item.unit === 'Tray' ? 'Kg' : item.unit}</strong></td>
                        <td>{item.recipeName ? item.recipeName : 'None'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Deducted Raw Materials Table */}
                {selectedEntry.rawMaterialsDeducted && selectedEntry.rawMaterialsDeducted.length > 0 && (
                  <>
                    <h3 style={{ marginTop: '20px' }}>Deducted Raw Materials (From Stock)</h3>
                    <table className="se-modal-table raw-materials">
                      <thead>
                        <tr>
                          <th>Raw Material Name</th>
                          <th>Deducted Quantity</th>
                          <th>Unit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEntry.rawMaterialsDeducted.map((rm, idx) => (
                          <tr key={idx}>
                            <td><strong>{rm.stockItemName}</strong></td>
                            <td className="text-danger">-{Number(rm.totalQtyDeducted).toFixed(2)}</td>
                            <td>{rm.unit || 'Weight'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              <div className="se-modal-footer">
                <button className="se-btn-secondary" onClick={() => setSelectedEntry(null)}>
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRMATION MODAL ────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="se-modal-overlay" onClick={() => setDeleteTarget(null)}>
            <motion.div
              className="se-modal-card sm"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="se-modal-header danger">
                <h2>Delete Stock Entry</h2>
                <button className="se-btn-close" onClick={() => setDeleteTarget(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="se-modal-body">
                <p>Are you sure you want to delete stock entry <strong>{deleteTarget.entryNo}</strong>?</p>
                <p className="se-text-muted" style={{ marginTop: '8px', fontSize: '13px' }}>
                  Note: This will remove the entry record from history.
                </p>
              </div>
              <div className="se-modal-footer">
                <button className="se-btn-secondary" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </button>
                <button
                  className="se-btn-danger"
                  disabled={deleting}
                  onClick={handleDeleteEntry}
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StockEntry;
