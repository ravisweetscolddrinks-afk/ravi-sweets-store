import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Package, Edit, Trash2, X,
  Factory, BarChart2, ChevronDown,
  AlertTriangle, CheckCircle2, AlertCircle,
  Scale, Hash, Layers, ArrowUpCircle, Save,
  Box, FlaskConical, Minus
} from 'lucide-react';
import { db } from '../../config/firebase';
import {
  collection, addDoc, getDocs, query, orderBy,
  onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './StockAnalysis.css';

/* ── helpers ─────────────────────────────────────────── */
const getHealth = (currentQty, bufferQty) => {
  if (currentQty <= bufferQty) return 'critical';
  if (currentQty <= bufferQty * 1.5) return 'low';
  return 'good';
};

const HealthIcon = ({ level }) => {
  if (level === 'critical') return <AlertCircle size={12} />;
  if (level === 'low') return <AlertTriangle size={12} />;
  return <CheckCircle2 size={12} />;
};

const HealthLabel = { critical: 'Critical', low: 'Low Stock', good: 'Good' };

/* ── Custom Searchable Dropdown ───────────────────────── */
const SASearchDropdown = ({ label, options, value, onChange, placeholder, required, getLabel, getValue, renderOption }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    (getLabel(o) || '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(o => getValue(o) === value);

  return (
    <div className="sa-custom-dropdown" ref={ref}>
      {label && <label className="sa-custom-dropdown-label">{label}{required && ' *'}</label>}
      <div
        className={`sa-custom-dropdown-trigger ${open ? 'open' : ''}`}
        onClick={() => { setOpen(!open); setSearch(''); }}
      >
        <span className={selectedOption ? 'sa-dd-selected' : 'sa-dd-placeholder'}>
          {selectedOption ? getLabel(selectedOption) : placeholder || 'Select...'}
        </span>
        <ChevronDown size={15} className={`sa-dd-chevron ${open ? 'rotated' : ''}`} />
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="sa-custom-dropdown-popover"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="sa-dd-search-wrap">
              <Search size={13} className="sa-dd-search-icon" />
              <input
                className="sa-dd-search-input"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            </div>
            <div className="sa-dd-list">
              {filtered.length === 0 ? (
                <div className="sa-dd-empty">No results found</div>
              ) : (
                filtered.map(opt => (
                  <div
                    key={getValue(opt)}
                    className={`sa-dd-item ${getValue(opt) === value ? 'active' : ''}`}
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {renderOption ? renderOption(opt) : getLabel(opt)}
                    {getValue(opt) === value && <CheckCircle2 size={12} className="sa-dd-check" />}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Main Component ────────────────────────────────────── */
const StockAnalysis = () => {
  const [activeTab, setActiveTab] = useState('analysis');

  // Data
  const [mUnits, setMUnits] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockAssignments, setStockAssignments] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Stock Items form
  const [showStockForm, setShowStockForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [stockForm, setStockForm] = useState({ name: '', unit: 'Weight', bufferQty: '' });
  const [savingItem, setSavingItem] = useState(false);

  // Stock Items tab search
  const [stockItemSearch, setStockItemSearch] = useState('');

  // Assign modal
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignQties, setAssignQties] = useState({});
  const [savingAssign, setSavingAssign] = useState(false);

  // Recipe form
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [recipeForm, setRecipeForm] = useState({ name: '', mUnitId: '', itemId: '', itemName: '', ingredients: [] });
  const [savingRecipe, setSavingRecipe] = useState(false);

  // Recipes tab search
  const [recipeSearch, setRecipeSearch] = useState('');

  // Analysis filters
  const [selectedMUnit, setSelectedMUnit] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Delete modals
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Firestore listeners ─────────────────────────────── */
  useEffect(() => {
    const q = query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => setMUnits(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'stock_items'), orderBy('name', 'asc'));
    return onSnapshot(q, snap => {
      setStockItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'stock_assignments'), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, snap => setStockAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'items'), orderBy('name', 'asc')));
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Failed to load items', err);
      }
    };
    fetchItems();
  }, []);

  /* ── Stock Items CRUD ─────────────────────────────────── */
  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!stockForm.name.trim()) return toast.error('Item name is required');
    setSavingItem(true);
    try {
      const data = {
        name: stockForm.name.trim(),
        unit: stockForm.unit,
        bufferQty: Number(stockForm.bufferQty) || 0,
        updatedAt: serverTimestamp()
      };
      if (editingItem) {
        await updateDoc(doc(db, 'stock_items', editingItem.id), data);
        toast.success('Stock item updated');
      } else {
        await addDoc(collection(db, 'stock_items'), { ...data, createdAt: serverTimestamp() });
        toast.success('Stock item added');
      }
      resetItemForm();
    } catch {
      toast.error('Failed to save stock item');
    } finally {
      setSavingItem(false);
    }
  };

  const resetItemForm = () => {
    setStockForm({ name: '', unit: 'Weight', bufferQty: '' });
    setShowStockForm(false);
    setEditingItem(null);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setStockForm({ name: item.name, unit: item.unit, bufferQty: item.bufferQty });
    setShowStockForm(true);
  };

  /* ── Assign Modal ─────────────────────────────────────── */
  const openAssignModal = (item) => {
    const existing = {};
    stockAssignments.filter(a => a.stockItemId === item.id)
      .forEach(a => { existing[a.mUnitId] = a.currentQty; });
    setAssignQties(existing);
    setAssignTarget(item);
  };

  const handleSaveAssignment = async () => {
    if (!assignTarget) return;
    setSavingAssign(true);
    try {
      for (const mUnitId of mUnits.map(m => m.id)) {
        const qty = Number(assignQties[mUnitId]) || 0;
        if (qty === 0) continue;
        const existing = stockAssignments.find(a => a.stockItemId === assignTarget.id && a.mUnitId === mUnitId);
        const mUnit = mUnits.find(m => m.id === mUnitId);
        if (existing) {
          await updateDoc(doc(db, 'stock_assignments', existing.id), {
            currentQty: qty, updatedAt: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'stock_assignments'), {
            stockItemId: assignTarget.id,
            stockItemName: assignTarget.name,
            mUnitId,
            mUnitName: mUnit?.name || '',
            currentQty: qty,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      }
      toast.success('Stock assigned to units');
      setAssignTarget(null);
      setAssignQties({});
    } catch {
      toast.error('Failed to save assignment');
    } finally {
      setSavingAssign(false);
    }
  };

  /* ── Recipe CRUD ──────────────────────────────────────── */
  const handleSaveRecipe = async (e) => {
    e.preventDefault();
    if (!recipeForm.name.trim()) return toast.error('Recipe name required');
    if (!recipeForm.mUnitId) return toast.error('Select a manufacturing unit');
    if (!recipeForm.itemId) return toast.error('Select an item to assign this recipe to');
    const validIngredients = recipeForm.ingredients.filter(i => i.stockItemId && i.qty);
    if (validIngredients.length === 0) return toast.error('Add at least one ingredient');
    setSavingRecipe(true);
    try {
      const mUnit = mUnits.find(m => m.id === recipeForm.mUnitId);
      const linkedItem = items.find(i => i.id === recipeForm.itemId);
      const data = {
        name: recipeForm.name.trim(),
        mUnitId: recipeForm.mUnitId,
        mUnitName: mUnit?.name || '',
        itemId: recipeForm.itemId,
        itemName: linkedItem?.name || '',
        ingredients: validIngredients,
        updatedAt: serverTimestamp()
      };
      if (editingRecipe) {
        await updateDoc(doc(db, 'recipes', editingRecipe.id), data);
        toast.success('Recipe updated');
      } else {
        await addDoc(collection(db, 'recipes'), { ...data, createdAt: serverTimestamp() });
        toast.success('Recipe added');
      }
      resetRecipeForm();
    } catch {
      toast.error('Failed to save recipe');
    } finally {
      setSavingRecipe(false);
    }
  };

  const resetRecipeForm = () => {
    setRecipeForm({ name: '', mUnitId: '', itemId: '', itemName: '', ingredients: [] });
    setShowRecipeForm(false);
    setEditingRecipe(null);
  };

  const handleEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setRecipeForm({ name: recipe.name, mUnitId: recipe.mUnitId, itemId: recipe.itemId || '', itemName: recipe.itemName || '', ingredients: recipe.ingredients || [] });
    setShowRecipeForm(true);
  };

  const addIngredient = () =>
    setRecipeForm(p => ({ ...p, ingredients: [...p.ingredients, { stockItemId: '', stockItemName: '', qty: '', unit: 'Weight' }] }));

  const updateIngredient = (idx, field, value) => {
    const updated = [...recipeForm.ingredients];
    if (field === 'stockItemId') {
      const si = stockItems.find(i => i.id === value);
      updated[idx] = { ...updated[idx], stockItemId: value, stockItemName: si?.name || '', unit: si?.unit || 'Weight' };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setRecipeForm(p => ({ ...p, ingredients: updated }));
  };

  const removeIngredient = (idx) =>
    setRecipeForm(p => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) }));

  /* ── Delete ───────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const colName = deleteTarget.type === 'item' ? 'stock_items' : 'recipes';
      await deleteDoc(doc(db, colName, deleteTarget.id));
      toast.success(`${deleteTarget.type === 'item' ? 'Stock item' : 'Recipe'} deleted`);
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  /* ── Analysis data computation ────────────────────────── */
  const computeAnalysis = () => {
    const unitsToShow = selectedMUnit === 'all' ? mUnits : mUnits.filter(m => m.id === selectedMUnit);
    const result = [];
    unitsToShow.forEach(mu => {
      const itemsForUnit = stockItems
        .filter(item => searchQuery ? item.name.toLowerCase().includes(searchQuery.toLowerCase()) : true)
        .map(item => {
          const assignment = stockAssignments.find(a => a.stockItemId === item.id && a.mUnitId === mu.id);
          const currentQty = assignment?.currentQty || 0;
          const health = getHealth(currentQty, item.bufferQty || 0);
          return { ...item, currentQty, health };
        })
        .filter(item => healthFilter === 'all' ? true : item.health === healthFilter);
      result.push({ mUnit: mu, items: itemsForUnit });
    });
    return result.filter(g => g.items.length > 0 || selectedMUnit !== 'all');
  };

  const analysisData = computeAnalysis();

  // Summary counts
  const allAssignedItems = stockItems.map(item => {
    const totalAssigned = stockAssignments
      .filter(a => a.stockItemId === item.id)
      .reduce((s, a) => s + (a.currentQty || 0), 0);
    const health = getHealth(totalAssigned, item.bufferQty || 0);
    return { ...item, totalQty: totalAssigned, health };
  });
  const criticalCount = allAssignedItems.filter(i => i.health === 'critical').length;
  const lowCount = allAssignedItems.filter(i => i.health === 'low').length;
  const goodCount = allAssignedItems.filter(i => i.health === 'good').length;

  // Filtered stock items for items tab
  const filteredStockItems = stockItems.filter(item =>
    stockItemSearch ? item.name.toLowerCase().includes(stockItemSearch.toLowerCase()) : true
  );

  // Filtered recipes for recipes tab
  const filteredRecipes = recipes.filter(r =>
    recipeSearch
      ? r.name.toLowerCase().includes(recipeSearch.toLowerCase()) ||
        (r.itemName || '').toLowerCase().includes(recipeSearch.toLowerCase()) ||
        (r.mUnitName || '').toLowerCase().includes(recipeSearch.toLowerCase())
      : true
  );

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="sa-container">
      {/* Header */}
      <div className="sa-header">
        <div className="sa-header-info">
          <h1><BarChart2 size={24} /> Stock Analysis</h1>
          <p>Recipe-based raw material stock management across manufacturing units</p>
        </div>
        {activeTab === 'items' && !showStockForm && (
          <button className="sa-add-btn" onClick={() => setShowStockForm(true)}>
            <Plus size={18} /> Add Stock Item
          </button>
        )}
        {activeTab === 'recipes' && !showRecipeForm && (
          <button className="sa-add-btn" onClick={() => setShowRecipeForm(true)}>
            <Plus size={18} /> Add Recipe
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="sa-tabs">
        {[
          { id: 'analysis', label: 'Stock Analysis', icon: <BarChart2 size={15} /> },
          { id: 'items', label: 'Stock Items', icon: <Box size={15} /> },
          { id: 'recipes', label: 'Recipes', icon: <FlaskConical size={15} /> },
        ].map(tab => (
          <button
            key={tab.id}
            className={`sa-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── ANALYSIS TAB ─────────────────────────────────── */}
      {activeTab === 'analysis' && (
        <div>
          {/* Summary Stats */}
          <div className="sa-stats-row">
            <div className="sa-stat-card">
              <span className="sa-stat-label">Total Items</span>
              <span className="sa-stat-value">{stockItems.length}</span>
            </div>
            <div className="sa-stat-card critical">
              <span className="sa-stat-label">⚠ Critical</span>
              <span className="sa-stat-value">{criticalCount}</span>
            </div>
            <div className="sa-stat-card low">
              <span className="sa-stat-label">↓ Low Stock</span>
              <span className="sa-stat-value">{lowCount}</span>
            </div>
            <div className="sa-stat-card good">
              <span className="sa-stat-label">✓ Good</span>
              <span className="sa-stat-value">{goodCount}</span>
            </div>
          </div>

          {/* Filters */}
          <div className="sa-filter-bar">
            <div className="sa-search-box">
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input
                placeholder="Search stock items..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="sa-filter-chip-group">
              {['all', 'critical', 'low', 'good'].map(h => (
                <button key={h} className={`sa-filter-chip ${h} ${healthFilter === h ? 'active' : ''}`}
                  onClick={() => setHealthFilter(h)}>
                  {h === 'all' ? 'All' : HealthLabel[h]}
                </button>
              ))}
            </div>
          </div>

          {/* mUnit selector */}
          <div className="sa-munit-bar">
            <button className={`sa-munit-chip ${selectedMUnit === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedMUnit('all')}>
              <Factory size={13} /> All Units
            </button>
            {mUnits.map(mu => (
              <button key={mu.id} className={`sa-munit-chip ${selectedMUnit === mu.id ? 'active' : ''}`}
                onClick={() => setSelectedMUnit(mu.id)}>
                <Factory size={13} /> {mu.name}
              </button>
            ))}
          </div>

          {/* Data */}
          {loading ? (
            <div className="sa-loader-container"><div className="loader" /></div>
          ) : stockItems.length === 0 ? (
            <div className="sa-empty-state">
              <div className="sa-empty-icon"><Box size={28} /></div>
              <h3>No Stock Items Yet</h3>
              <p>Go to <strong>Stock Items</strong> tab to add raw materials</p>
            </div>
          ) : analysisData.length === 0 ? (
            <div className="sa-empty-state">
              <div className="sa-empty-icon"><BarChart2 size={28} /></div>
              <h3>No Items Match Filters</h3>
              <p>Try adjusting the health filter or search query</p>
            </div>
          ) : (
            analysisData.map(({ mUnit, items }) => (
              <div key={mUnit.id} className="sa-munit-section">
                <div className="sa-munit-section-title">
                  <div className="sa-munit-icon"><Factory size={16} /></div>
                  <h2>{mUnit.name}</h2>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="sa-stock-grid">
                  {items.map(item => {
                    const pct = item.bufferQty > 0
                      ? Math.min(100, (item.currentQty / (item.bufferQty * 2)) * 100)
                      : item.currentQty > 0 ? 100 : 0;
                    return (
                      <div key={item.id} className={`sa-stock-card ${item.health}`}>
                        <div className="sa-card-top">
                          <div>
                            <p className="sa-item-name">{item.name}</p>
                            <p className="sa-item-unit">{item.unit === 'Weight' ? 'kg / gm' : 'pieces'}</p>
                          </div>
                          <span className={`health-badge ${item.health}`}>
                            <HealthIcon level={item.health} />
                            {HealthLabel[item.health]}
                          </span>
                        </div>
                        <div className="sa-qty-display">
                          <div className="sa-qty-current">
                            {item.currentQty}
                            <span>{item.unit === 'Weight' ? 'kg' : 'pc'}</span>
                          </div>
                          <div className="sa-qty-buffer">
                            Buffer: {item.bufferQty}{item.unit === 'Weight' ? 'kg' : 'pc'}
                          </div>
                        </div>
                        <div className="sa-progress-bar">
                          <div className={`sa-progress-fill ${item.health}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── STOCK ITEMS TAB ──────────────────────────────── */}
      {activeTab === 'items' && (
        <div className="sa-content-layout">
          <div className={`sa-list-section ${showStockForm ? 'shrink' : ''}`}>

            {/* Search bar for stock items */}
            {stockItems.length > 0 && (
              <div className="sa-search-box" style={{ marginBottom: 14 }}>
                <Search size={15} style={{ color: 'var(--text-secondary)' }} />
                <input
                  placeholder="Search stock items..."
                  value={stockItemSearch}
                  onChange={e => setStockItemSearch(e.target.value)}
                />
              </div>
            )}

            {loading ? (
              <div className="sa-loader-container"><div className="loader" /></div>
            ) : filteredStockItems.length === 0 ? (
              <div className="sa-empty-state">
                <div className="sa-empty-icon"><Package size={28} /></div>
                <h3>{stockItemSearch ? 'No Results Found' : 'No Stock Items'}</h3>
                <p>{stockItemSearch ? 'Try a different search term' : 'Add your first raw material or ingredient'}</p>
              </div>
            ) : (
              <div className="sa-items-list">
                {filteredStockItems.map(item => {
                  const totalQty = stockAssignments
                    .filter(a => a.stockItemId === item.id)
                    .reduce((s, a) => s + (a.currentQty || 0), 0);
                  const health = getHealth(totalQty, item.bufferQty || 0);
                  return (
                    <div key={item.id} className="sa-item-row">
                      <div className="sa-item-row-icon">
                        {item.unit === 'Weight' ? <Scale size={18} /> : <Hash size={18} />}
                      </div>
                      <div className="sa-item-row-info">
                        <p className="sa-item-row-name">{item.name}</p>
                        <div className="sa-item-row-meta">
                          <span><Package size={12} />{item.unit}</span>
                          <span>Buffer: {item.bufferQty} {item.unit === 'Weight' ? 'kg' : 'pc'}</span>
                          {/* Available stock display */}
                          <span className="sa-item-avail-stock" style={{
                            fontWeight: '800',
                            color: health === 'critical' ? '#dc2626' : health === 'low' ? '#d97706' : '#059669',
                            background: health === 'critical' ? '#fef2f2' : health === 'low' ? '#fffbeb' : '#f0fdf4',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <Layers size={11} />
                            Available: {totalQty} {item.unit === 'Weight' ? 'kg' : 'pc'}
                          </span>
                          <span>
                            <span className={`health-badge ${health}`} style={{ fontSize: 10 }}>
                              <HealthIcon level={health} />{HealthLabel[health]}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="sa-item-row-actions">
                        <button className="sa-action-btn assign" onClick={() => openAssignModal(item)}>
                          <ArrowUpCircle size={13} /> Assign
                        </button>
                        <button className="sa-action-btn edit" onClick={() => handleEditItem(item)}>
                          <Edit size={13} />
                        </button>
                        <button className="sa-action-btn delete" onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <AnimatePresence>
            {showStockForm && (
              <motion.div className="sa-form-panel"
                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}>
                <div className="sa-panel-header">
                  <h2>{editingItem ? 'Edit Item' : 'Add Stock Item'}</h2>
                  <button className="sa-close-btn" onClick={resetItemForm}><X size={16} /></button>
                </div>
                <form onSubmit={handleSaveItem}>
                  <div className="sa-input-group">
                    <label>Item Name *</label>
                    <input placeholder="e.g. Pure Ghee, Sugar, Cashews"
                      value={stockForm.name}
                      onChange={e => setStockForm(p => ({ ...p, name: e.target.value }))}
                      required />
                  </div>
                  <div className="sa-form-row">
                    <div className="sa-input-group">
                      <label>Unit Type *</label>
                      <select value={stockForm.unit}
                        onChange={e => setStockForm(p => ({ ...p, unit: e.target.value }))}>
                        <option value="Weight">Weight (kg)</option>
                        <option value="Piece">Piece (qty)</option>
                        <option value="Litre">Litre (L/ml)</option>
                        <option value="Packet">Packet (pkt)</option>
                      </select>
                    </div>
                    <div className="sa-input-group">
                      <label>Buffer Qty *</label>
                      <input type="number" min="0" placeholder="20"
                        value={stockForm.bufferQty}
                        onChange={e => setStockForm(p => ({ ...p, bufferQty: e.target.value }))}
                        required />
                    </div>
                  </div>
                  <div className="sa-form-actions">
                    <button type="button" className="sa-btn-cancel" onClick={resetItemForm}>Cancel</button>
                    <button type="submit" className="sa-btn-save" disabled={savingItem}>
                      {savingItem ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : <><Save size={14} /> Save Item</>}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── RECIPES TAB ──────────────────────────────────── */}
      {activeTab === 'recipes' && (
        <div className="sa-content-layout">
          <div className={`sa-list-section ${showRecipeForm ? 'shrink' : ''}`}>

            {/* Search bar for recipes */}
            {recipes.length > 0 && (
              <div className="sa-search-box" style={{ marginBottom: 14 }}>
                <Search size={15} style={{ color: 'var(--text-secondary)' }} />
                <input
                  placeholder="Search by recipe name, item or unit..."
                  value={recipeSearch}
                  onChange={e => setRecipeSearch(e.target.value)}
                />
              </div>
            )}

            {loading ? (
              <div className="sa-loader-container"><div className="loader" /></div>
            ) : recipes.length === 0 ? (
              <div className="sa-empty-state">
                <div className="sa-empty-icon"><FlaskConical size={28} /></div>
                <h3>No Recipes Yet</h3>
                <p>Add recipes to define which raw materials each product uses</p>
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div className="sa-empty-state">
                <div className="sa-empty-icon"><Search size={28} /></div>
                <h3>No Recipes Match</h3>
                <p>Try a different search term</p>
              </div>
            ) : (
              <div className="sa-recipe-grid">
                {filteredRecipes.map(recipe => (
                  <div key={recipe.id} className="sa-recipe-card">
                    <div className="sa-recipe-card-header">
                      <div>
                        <p className="sa-recipe-name">{recipe.name}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px', alignItems: 'center' }}>
                          <span className="sa-recipe-munit"><Factory size={11} />{recipe.mUnitName || 'Unknown Unit'}</span>
                          {recipe.itemName && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              fontSize: '11px', fontWeight: '700', color: '#0369a1',
                              background: '#e0f2fe', padding: '2px 7px', borderRadius: '5px'
                            }}>
                              <Package size={10} /> {recipe.itemName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button className="sa-action-btn edit" onClick={() => handleEditRecipe(recipe)}>
                          <Edit size={13} />
                        </button>
                        <button className="sa-action-btn delete" onClick={() => setDeleteTarget({ type: 'recipe', id: recipe.id, name: recipe.name })}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="sa-ingredients-list">
                      {(recipe.ingredients || []).length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>No ingredients</p>
                      ) : (recipe.ingredients || []).map((ing, i) => {
                        const totalAvail = stockAssignments
                          .filter(a => a.stockItemId === ing.stockItemId)
                          .reduce((s, a) => s + (a.currentQty || 0), 0);
                        return (
                          <div key={i} className="sa-ingredient-row">
                            <span className="sa-ingredient-name">{ing.stockItemName}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '700', color: 'var(--primary-color)', fontSize: '12px' }}>
                                {ing.qty} {ing.unit === 'Weight' ? 'kg' : 'pc'} needed
                              </span>
                              <span style={{
                                fontSize: '11px', fontWeight: '700',
                                color: totalAvail === 0 ? '#dc2626' : '#059669',
                                background: totalAvail === 0 ? '#fef2f2' : '#f0fdf4',
                                padding: '1px 6px', borderRadius: '4px'
                              }}>
                                {totalAvail} {ing.unit === 'Weight' ? 'kg' : 'pc'} avail
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {showRecipeForm && (
              <motion.div className="sa-form-panel"
                initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}
                style={{ overflowY: 'auto', maxHeight: '80vh' }}>
                <div className="sa-panel-header">
                  <h2>{editingRecipe ? 'Edit Recipe' : 'Add Recipe'}</h2>
                  <button className="sa-close-btn" onClick={resetRecipeForm}><X size={16} /></button>
                </div>
                <form onSubmit={handleSaveRecipe}>
                  <div className="sa-input-group">
                    <label>Recipe Name *</label>
                    <input placeholder="e.g. Mysore Pak, Kaju Katli"
                      value={recipeForm.name}
                      onChange={e => setRecipeForm(p => ({ ...p, name: e.target.value }))}
                      required />
                  </div>

                  {/* Manufacturing Unit — Custom Searchable Dropdown */}
                  <SASearchDropdown
                    label="Manufacturing Unit"
                    options={mUnits}
                    value={recipeForm.mUnitId}
                    onChange={opt => setRecipeForm(p => ({ ...p, mUnitId: opt.id }))}
                    placeholder="Select manufacturing unit..."
                    required
                    getLabel={o => o.name}
                    getValue={o => o.id}
                    renderOption={o => (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Factory size={13} style={{ color: 'var(--primary-color)' }} />
                        {o.name}
                      </span>
                    )}
                  />

                  {/* Assign to Item — Custom Searchable Dropdown */}
                  <SASearchDropdown
                    label="Assign to Item"
                    options={items}
                    value={recipeForm.itemId}
                    onChange={opt => setRecipeForm(p => ({ ...p, itemId: opt.id, itemName: opt.name }))}
                    placeholder="Select item to link recipe..."
                    required
                    getLabel={o => o.name}
                    getValue={o => o.id}
                    renderOption={o => (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Package size={13} style={{ color: '#0369a1' }} />
                        {o.name}
                        {o.category && <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>{o.category}</span>}
                      </span>
                    )}
                  />
                  {recipeForm.itemId && (
                    <p style={{ fontSize: '11px', color: '#059669', fontWeight: '700', marginTop: '-8px', marginBottom: '12px' }}>
                      ✓ This recipe will be used for stock tracking of "{recipeForm.itemName}" in orders
                    </p>
                  )}

                  {/* Ingredients */}
                  <div className="sa-input-group">
                    <label>Ingredients</label>
                    {recipeForm.ingredients.map((ing, idx) => (
                      <div key={idx} className="sa-ingredient-form-row" style={{ alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                          <SASearchDropdown
                            options={stockItems}
                            value={ing.stockItemId}
                            onChange={opt => updateIngredient(idx, 'stockItemId', opt.id)}
                            placeholder="Select stock item..."
                            getLabel={o => o.name}
                            getValue={o => o.id}
                            renderOption={o => (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {o.unit === 'Weight' ? <Scale size={12} style={{ color: '#7c3aed' }} /> : <Hash size={12} style={{ color: '#7c3aed' }} />}
                                {o.name}
                                <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{o.unit}</span>
                              </span>
                            )}
                          />
                        </div>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Qty"
                          value={ing.qty}
                          onChange={e => updateIngredient(idx, 'qty', e.target.value)}
                          style={{ width: '70px', flexShrink: 0 }}
                        />
                        <button type="button" className="sa-remove-ingredient-btn" style={{ marginTop: '2px' }}
                          onClick={() => removeIngredient(idx)}>
                          <Minus size={14} />
                        </button>
                      </div>
                    ))}
                    <button type="button" className="sa-add-ingredient-btn" onClick={addIngredient}>
                      <Plus size={14} /> Add Ingredient
                    </button>
                  </div>

                  <div className="sa-form-actions">
                    <button type="button" className="sa-btn-cancel" onClick={resetRecipeForm}>Cancel</button>
                    <button type="submit" className="sa-btn-save" disabled={savingRecipe}>
                      {savingRecipe ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : <><Save size={14} /> Save Recipe</>}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Assign Stock Modal ────────────────────────────── */}
      <AnimatePresence>
        {assignTarget && (
          <motion.div className="sa-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setAssignTarget(null)}>
            <motion.div className="sa-modal"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}>
              <div className="sa-modal-header">
                <h2><ArrowUpCircle size={20} style={{ color: 'var(--primary-color)' }} /> Assign Stock</h2>
                <button className="sa-close-btn" onClick={() => setAssignTarget(null)}><X size={16} /></button>
              </div>
              <p className="sa-modal-subtitle">
                Set current stock quantity for <strong>{assignTarget.name}</strong> in each manufacturing unit
              </p>
              {mUnits.map(mu => (
                <div key={mu.id} className="sa-assign-row">
                  <span className="sa-assign-row-label"><Factory size={15} />{mu.name}</span>
                  <input
                    type="number" min="0" step="0.01"
                    placeholder="0"
                    value={assignQties[mu.id] ?? ''}
                    onChange={e => setAssignQties(p => ({ ...p, [mu.id]: e.target.value }))}
                  />
                  <span className="sa-assign-unit-label">
                    {assignTarget.unit === 'Weight' ? 'kg' : 'pcs'}
                  </span>
                </div>
              ))}
              <div className="sa-form-actions" style={{ marginTop: 20 }}>
                <button className="sa-btn-cancel" onClick={() => setAssignTarget(null)}>Cancel</button>
                <button className="sa-btn-save" onClick={handleSaveAssignment} disabled={savingAssign}>
                  {savingAssign ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : <><Save size={14} /> Save Assignment</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ───────────────────────────── */}
      {deleteTarget && (
        <div className="sa-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="sa-modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', padding: '8px 0 20px' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#dc2626' }}>
                <Trash2 size={24} />
              </div>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800 }}>Delete {deleteTarget.type === 'item' ? 'Stock Item' : 'Recipe'}?</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>"{deleteTarget.name}"</strong> will be permanently removed.
              </p>
            </div>
            <div className="sa-form-actions">
              <button className="sa-btn-cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</button>
              <button className="sa-btn-save" style={{ background: '#dc2626' }} onClick={handleDelete} disabled={deleting}>
                {deleting ? <div className="loader" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockAnalysis;
