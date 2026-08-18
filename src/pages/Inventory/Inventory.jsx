import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  BarChart3, 
  Boxes, 
  BookOpen, 
  Plus, 
  Search, 
  Factory, 
  Scale, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Clock, 
  Trash2, 
  Edit, 
  X, 
  ChevronRight, 
  Layers, 
  Package, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  Truck,
  FileSpreadsheet
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  increment,
  where
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Inventory.css';

const CATEGORIES_LIST = [
  'Dairy & Milk',
  'Sweeteners & Sugar',
  'Nuts & Dry Fruits',
  'Flour & Grains',
  'Oils & Ghee',
  'Spices & Flavors',
  'Packaging Materials',
  'General Supplies'
];

const UNITS_LIST = ['kg', 'grams', 'liters', 'pieces', 'box'];

const Inventory = () => {
  const { tab: urlTab } = useParams();
  const navigate = useNavigate();

  // Active Tab: 'stock-analysis' | 'stock-items' | 'recipe'
  const [activeTab, setActiveTab] = useState(urlTab || 'stock-analysis');

  // Core Data States
  const [stockItems, setStockItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [finishedItems, setFinishedItems] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [stockLogs, setStockLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedMUnit, setSelectedMUnit] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL');

  // Modal States
  const [showStockItemModal, setShowStockItemModal] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState(null);
  
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null); // { type, item }

  const [submitting, setSubmitting] = useState(false);

  // Form States - Stock Item
  const [itemForm, setItemForm] = useState({
    name: '',
    unit: 'kg',
    category: 'Dairy & Milk',
    currentStock: '',
    minStockLevel: '10',
    costPerUnit: '',
    vendorId: ''
  });

  // Form States - Recipe
  const [recipeForm, setRecipeForm] = useState({
    itemId: '',
    yieldQuantity: '1',
    yieldUnit: 'kg',
    notes: '',
    ingredients: [
      { stockItemId: '', quantity: '', unit: 'kg' }
    ]
  });

  // Form States - Allocation / Assignment to MUnit
  const [assignForm, setAssignForm] = useState({
    stockItemId: '',
    mUnitId: '',
    quantity: '',
    notes: ''
  });

  // Form States - Record Consumption / Usage
  const [usageForm, setUsageForm] = useState({
    stockItemId: '',
    mUnitId: '',
    quantity: '',
    reason: 'Daily Sweet Production',
    notes: ''
  });

  // Sync tab with URL parameter
  useEffect(() => {
    if (urlTab && ['stock-analysis', 'stock-items', 'recipe'].includes(urlTab)) {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    navigate(`/inventory/${newTab}`);
  };

  // Real-time Listeners
  useEffect(() => {
    // 1. Stock Items
    const qStockItems = query(collection(db, 'stock_items'), orderBy('name', 'asc'));
    const unsubStockItems = onSnapshot(qStockItems, (snap) => {
      setStockItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    // 2. Manufacturing Units
    const qMUnits = query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'));
    const unsubMUnits = onSnapshot(qMUnits, (snap) => {
      setMUnits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Finished Products (from items collection)
    const qItems = query(collection(db, 'items'), orderBy('name', 'asc'));
    const unsubItems = onSnapshot(qItems, (snap) => {
      setFinishedItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Vendors
    const qVendors = query(collection(db, 'vendors'), orderBy('name', 'asc'));
    const unsubVendors = onSnapshot(qVendors, (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 5. Recipes
    const qRecipes = query(collection(db, 'recipes'), orderBy('createdAt', 'desc'));
    const unsubRecipes = onSnapshot(qRecipes, (snap) => {
      setRecipes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 6. Stock Logs / History
    const qLogs = query(collection(db, 'stock_logs'), orderBy('createdAt', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setStockLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubStockItems();
      unsubMUnits();
      unsubItems();
      unsubVendors();
      unsubRecipes();
      unsubLogs();
    };
  }, []);

  // ----------------------------------------------------------------------
  // STOCK ITEM ACTIONS
  // ----------------------------------------------------------------------
  const handleOpenAddStockItem = () => {
    setEditingStockItem(null);
    setItemForm({
      name: '',
      unit: 'kg',
      category: 'Dairy & Milk',
      currentStock: '',
      minStockLevel: '10',
      costPerUnit: '',
      vendorId: vendors[0]?.id || ''
    });
    setShowStockItemModal(true);
  };

  const handleOpenEditStockItem = (item) => {
    setEditingStockItem(item);
    setItemForm({
      name: item.name || '',
      unit: item.unit || 'kg',
      category: item.category || 'Dairy & Milk',
      currentStock: item.currentStock !== undefined ? String(item.currentStock) : '',
      minStockLevel: item.minStockLevel !== undefined ? String(item.minStockLevel) : '10',
      costPerUnit: item.costPerUnit !== undefined ? String(item.costPerUnit) : '',
      vendorId: item.vendorId || ''
    });
    setShowStockItemModal(true);
  };

  const handleSubmitStockItem = async (e) => {
    e.preventDefault();
    const cleanName = itemForm.name.trim();
    if (!cleanName) {
      toast.error("Stock item name is required");
      return;
    }

    const currentStockNum = parseFloat(itemForm.currentStock) || 0;
    const minStockNum = parseFloat(itemForm.minStockLevel) || 0;
    const costNum = parseFloat(itemForm.costPerUnit) || 0;

    setSubmitting(true);
    try {
      const selectedVendor = vendors.find(v => v.id === itemForm.vendorId);
      const payload = {
        name: cleanName,
        unit: itemForm.unit,
        category: itemForm.category,
        currentStock: currentStockNum,
        minStockLevel: minStockNum,
        costPerUnit: costNum,
        vendorId: itemForm.vendorId || null,
        vendorName: selectedVendor ? selectedVendor.name : null,
        assignedStock: editingStockItem?.assignedStock || 0,
        usedStock: editingStockItem?.usedStock || 0,
        unitAllocations: editingStockItem?.unitAllocations || {},
        updatedAt: serverTimestamp()
      };

      if (editingStockItem) {
        await updateDoc(doc(db, 'stock_items', editingStockItem.id), payload);
        toast.success("Stock item updated");
      } else {
        payload.createdAt = serverTimestamp();
        payload.assignedStock = 0;
        payload.usedStock = 0;
        payload.unitAllocations = {};
        const docRef = await addDoc(collection(db, 'stock_items'), payload);

        // Record initial log if stock was given
        if (currentStockNum > 0) {
          await addDoc(collection(db, 'stock_logs'), {
            stockItemId: docRef.id,
            stockItemName: cleanName,
            type: 'INITIAL_STOCK',
            quantity: currentStockNum,
            unit: itemForm.unit,
            notes: 'Initial inventory entry',
            createdAt: serverTimestamp()
          });
        }
        toast.success("Stock item added");
      }
      setShowStockItemModal(false);
    } catch (err) {
      console.error("Error saving stock item:", err);
      toast.error("Failed to save stock item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAdjust = async (item, delta) => {
    const newQty = Math.max(0, (item.currentStock || 0) + delta);
    try {
      await updateDoc(doc(db, 'stock_items', item.id), {
        currentStock: newQty,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'stock_logs'), {
        stockItemId: item.id,
        stockItemName: item.name,
        type: delta > 0 ? 'STOCK_ADDED' : 'STOCK_REDUCED',
        quantity: Math.abs(delta),
        unit: item.unit || 'kg',
        notes: `Quick adjust (${delta > 0 ? '+' : ''}${delta} ${item.unit || 'kg'})`,
        createdAt: serverTimestamp()
      });

      toast.success(`Updated stock for ${item.name}`);
    } catch (err) {
      console.error("Quick adjust error:", err);
      toast.error("Failed to adjust stock");
    }
  };

  // ----------------------------------------------------------------------
  // RECIPE ACTIONS
  // ----------------------------------------------------------------------
  const handleOpenAddRecipe = () => {
    setEditingRecipe(null);
    setRecipeForm({
      itemId: finishedItems[0]?.id || '',
      yieldQuantity: '1',
      yieldUnit: 'kg',
      notes: '',
      ingredients: [
        { stockItemId: stockItems[0]?.id || '', quantity: '1', unit: 'kg' }
      ]
    });
    setShowRecipeModal(true);
  };

  const handleOpenEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setRecipeForm({
      itemId: recipe.itemId || '',
      yieldQuantity: String(recipe.yieldQuantity || '1'),
      yieldUnit: recipe.yieldUnit || 'kg',
      notes: recipe.notes || '',
      ingredients: recipe.ingredients && recipe.ingredients.length > 0
        ? recipe.ingredients.map(ing => ({
            stockItemId: ing.stockItemId || '',
            quantity: String(ing.quantity || ''),
            unit: ing.unit || 'kg'
          }))
        : [{ stockItemId: stockItems[0]?.id || '', quantity: '1', unit: 'kg' }]
    });
    setShowRecipeModal(true);
  };

  const handleAddIngredientRow = () => {
    setRecipeForm(prev => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { stockItemId: stockItems[0]?.id || '', quantity: '0.5', unit: 'kg' }
      ]
    }));
  };

  const handleRemoveIngredientRow = (index) => {
    if (recipeForm.ingredients.length <= 1) {
      toast.error("Recipe must contain at least one ingredient");
      return;
    }
    setRecipeForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const handleIngredientChange = (index, field, value) => {
    setRecipeForm(prev => {
      const updated = [...prev.ingredients];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, ingredients: updated };
    });
  };

  const handleSubmitRecipe = async (e) => {
    e.preventDefault();
    if (!recipeForm.itemId) {
      toast.error("Please select a finished product item");
      return;
    }

    const selectedProduct = finishedItems.find(i => i.id === recipeForm.itemId);
    const cleanIngredients = [];

    for (const ing of recipeForm.ingredients) {
      const stockItem = stockItems.find(s => s.id === ing.stockItemId);
      const qtyNum = parseFloat(ing.quantity);
      if (!ing.stockItemId || !stockItem) {
        toast.error("Please select a valid stock item for each ingredient");
        return;
      }
      if (isNaN(qtyNum) || qtyNum <= 0) {
        toast.error(`Please provide a valid quantity for ${stockItem?.name || 'ingredient'}`);
        return;
      }
      cleanIngredients.push({
        stockItemId: ing.stockItemId,
        stockItemName: stockItem.name,
        quantity: qtyNum,
        unit: ing.unit || stockItem.unit || 'kg',
        estimatedCost: (stockItem.costPerUnit || 0) * qtyNum
      });
    }

    const totalBatchCost = cleanIngredients.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);

    setSubmitting(true);
    try {
      const payload = {
        itemId: recipeForm.itemId,
        itemName: selectedProduct ? selectedProduct.name : 'Unknown Product',
        itemImage: selectedProduct?.image || null,
        yieldQuantity: parseFloat(recipeForm.yieldQuantity) || 1,
        yieldUnit: recipeForm.yieldUnit || 'kg',
        notes: recipeForm.notes.trim(),
        ingredients: cleanIngredients,
        totalBatchCost: totalBatchCost,
        updatedAt: serverTimestamp()
      };

      if (editingRecipe) {
        await updateDoc(doc(db, 'recipes', editingRecipe.id), payload);
        toast.success("Recipe updated successfully");
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'recipes'), payload);
        toast.success("Recipe added successfully");
      }
      setShowRecipeModal(false);
    } catch (err) {
      console.error("Error saving recipe:", err);
      toast.error("Failed to save recipe");
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // ALLOCATION / ASSIGNMENT ACTIONS
  // ----------------------------------------------------------------------
  const handleOpenAssignModal = () => {
    setAssignForm({
      stockItemId: stockItems[0]?.id || '',
      mUnitId: mUnits[0]?.id || '',
      quantity: '',
      notes: ''
    });
    setShowAssignModal(true);
  };

  const handleSubmitAssign = async (e) => {
    e.preventDefault();
    const qty = parseFloat(assignForm.quantity);
    if (!assignForm.stockItemId || !assignForm.mUnitId || isNaN(qty) || qty <= 0) {
      toast.error("Please fill in a valid stock item, manufacturing unit, and quantity");
      return;
    }

    const stockItem = stockItems.find(s => s.id === assignForm.stockItemId);
    const mUnit = mUnits.find(m => m.id === assignForm.mUnitId);

    if (!stockItem) {
      toast.error("Stock item not found");
      return;
    }

    if (qty > (stockItem.currentStock || 0)) {
      toast.error(`Cannot assign more than current on-hand stock (${stockItem.currentStock || 0} ${stockItem.unit || 'kg'})`);
      return;
    }

    setSubmitting(true);
    try {
      const currentUnitAllocations = stockItem.unitAllocations || {};
      const previousUnitQty = currentUnitAllocations[assignForm.mUnitId] || 0;
      const updatedUnitAllocations = {
        ...currentUnitAllocations,
        [assignForm.mUnitId]: previousUnitQty + qty
      };

      // Update Stock Item: decrease currentStock, increase assignedStock
      await updateDoc(doc(db, 'stock_items', stockItem.id), {
        currentStock: (stockItem.currentStock || 0) - qty,
        assignedStock: (stockItem.assignedStock || 0) + qty,
        unitAllocations: updatedUnitAllocations,
        updatedAt: serverTimestamp()
      });

      // Add to Stock Logs
      await addDoc(collection(db, 'stock_logs'), {
        stockItemId: stockItem.id,
        stockItemName: stockItem.name,
        mUnitId: mUnit?.id || null,
        mUnitName: mUnit?.name || 'Manufacturing Unit',
        type: 'ASSIGNED_TO_UNIT',
        quantity: qty,
        unit: stockItem.unit || 'kg',
        notes: assignForm.notes.trim() || `Assigned to ${mUnit?.name || 'Unit'}`,
        createdAt: serverTimestamp()
      });

      toast.success(`Assigned ${qty} ${stockItem.unit} to ${mUnit?.name}`);
      setShowAssignModal(false);
    } catch (err) {
      console.error("Assignment error:", err);
      toast.error("Failed to assign stock");
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // USAGE / CONSUMPTION ACTIONS
  // ----------------------------------------------------------------------
  const handleOpenUsageModal = () => {
    setUsageForm({
      stockItemId: stockItems[0]?.id || '',
      mUnitId: mUnits[0]?.id || '',
      quantity: '',
      reason: 'Daily Sweet Production',
      notes: ''
    });
    setShowUsageModal(true);
  };

  const handleSubmitUsage = async (e) => {
    e.preventDefault();
    const qty = parseFloat(usageForm.quantity);
    if (!usageForm.stockItemId || isNaN(qty) || qty <= 0) {
      toast.error("Please provide a valid stock item and quantity");
      return;
    }

    const stockItem = stockItems.find(s => s.id === usageForm.stockItemId);
    const mUnit = mUnits.find(m => m.id === usageForm.mUnitId);

    if (!stockItem) {
      toast.error("Stock item not found");
      return;
    }

    setSubmitting(true);
    try {
      const currentUnitAllocations = stockItem.unitAllocations || {};
      const unitAssigned = usageForm.mUnitId ? (currentUnitAllocations[usageForm.mUnitId] || 0) : (stockItem.assignedStock || 0);

      // Decrement unit allocation if assigned
      let updatedAllocations = { ...currentUnitAllocations };
      let newAssignedStock = stockItem.assignedStock || 0;
      let newCurrentStock = stockItem.currentStock || 0;

      if (usageForm.mUnitId && unitAssigned > 0) {
        const deductedFromUnit = Math.min(qty, unitAssigned);
        updatedAllocations[usageForm.mUnitId] = Math.max(0, unitAssigned - deductedFromUnit);
        newAssignedStock = Math.max(0, newAssignedStock - deductedFromUnit);
      } else {
        newCurrentStock = Math.max(0, newCurrentStock - qty);
      }

      await updateDoc(doc(db, 'stock_items', stockItem.id), {
        currentStock: newCurrentStock,
        assignedStock: newAssignedStock,
        usedStock: (stockItem.usedStock || 0) + qty,
        unitAllocations: updatedAllocations,
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'stock_logs'), {
        stockItemId: stockItem.id,
        stockItemName: stockItem.name,
        mUnitId: mUnit?.id || null,
        mUnitName: mUnit?.name || 'General / Central Store',
        type: 'CONSUMED_IN_PRODUCTION',
        quantity: qty,
        unit: stockItem.unit || 'kg',
        reason: usageForm.reason,
        notes: usageForm.notes.trim(),
        createdAt: serverTimestamp()
      });

      toast.success(`Recorded usage of ${qty} ${stockItem.unit} for ${stockItem.name}`);
      setShowUsageModal(false);
    } catch (err) {
      console.error("Usage record error:", err);
      toast.error("Failed to record usage");
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // DELETE HANDLER
  // ----------------------------------------------------------------------
  const handleDeleteConfirm = async () => {
    if (!showDeleteModal) return;
    const { type, item } = showDeleteModal;
    setSubmitting(true);
    try {
      if (type === 'stock-item') {
        await deleteDoc(doc(db, 'stock_items', item.id));
        toast.success(`Deleted stock item "${item.name}"`);
      } else if (type === 'recipe') {
        await deleteDoc(doc(db, 'recipes', item.id));
        toast.success(`Deleted recipe for "${item.itemName}"`);
      }
      setShowDeleteModal(null);
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete item");
    } finally {
      setSubmitting(false);
    }
  };

  // ----------------------------------------------------------------------
  // COMPUTED / FILTERED DATA
  // ----------------------------------------------------------------------
  const filteredStockItems = stockItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    
    let matchesStatus = true;
    const isOut = (item.currentStock || 0) <= 0;
    const isLow = !isOut && (item.currentStock || 0) <= (item.minStockLevel || 10);
    if (stockStatusFilter === 'LOW') matchesStatus = isLow;
    else if (stockStatusFilter === 'OUT') matchesStatus = isOut;
    else if (stockStatusFilter === 'NORMAL') matchesStatus = !isLow && !isOut;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const filteredRecipes = recipes.filter(rec => {
    return rec.itemName?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Calculate Unit-Wise Stock Analytics
  const totalAssignedStock = stockItems.reduce((sum, i) => {
    if (selectedMUnit === 'ALL') return sum + (i.assignedStock || 0);
    return sum + ((i.unitAllocations && i.unitAllocations[selectedMUnit]) || 0);
  }, 0);

  const totalRemainingStock = stockItems.reduce((sum, i) => sum + (i.currentStock || 0), 0);
  const totalConsumedStock = stockItems.reduce((sum, i) => sum + (i.usedStock || 0), 0);
  const lowStockCount = stockItems.filter(i => (i.currentStock || 0) <= (i.minStockLevel || 10)).length;

  const selectedUnitObj = mUnits.find(m => m.id === selectedMUnit);

  const filteredLogs = stockLogs.filter(log => {
    if (selectedMUnit === 'ALL') return true;
    return log.mUnitId === selectedMUnit;
  });

  return (
    <div className="inventory-container">
      {/* Header */}
      <div className="inventory-header">
        <div className="inventory-title-group">
          <h1>
            <Boxes size={28} color="var(--primary-color)" />
            Inventory & Stock Management
          </h1>
          <p>Real-time raw material tracking, unit allocations, sweet recipes & consumption audit</p>
        </div>

        <div className="inventory-header-actions">
          {activeTab === 'stock-analysis' && (
            <>
              <button className="inventory-action-btn secondary" onClick={handleOpenUsageModal}>
                <ArrowDownRight size={16} />
                Record Usage
              </button>
              <button className="inventory-action-btn" onClick={handleOpenAssignModal}>
                <ArrowUpRight size={16} />
                Assign to Unit
              </button>
            </>
          )}

          {activeTab === 'stock-items' && (
            <button className="inventory-action-btn" onClick={handleOpenAddStockItem}>
              <Plus size={18} />
              Add Stock Item
            </button>
          )}

          {activeTab === 'recipe' && (
            <button className="inventory-action-btn" onClick={handleOpenAddRecipe}>
              <Plus size={18} />
              Add Recipe
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="inventory-tabs">
        <button 
          className={`inventory-tab-btn ${activeTab === 'stock-analysis' ? 'active' : ''}`}
          onClick={() => handleTabChange('stock-analysis')}
        >
          <BarChart3 size={16} />
          Stock Analysis
          <span className="inventory-tab-badge">{mUnits.length} Units</span>
        </button>

        <button 
          className={`inventory-tab-btn ${activeTab === 'stock-items' ? 'active' : ''}`}
          onClick={() => handleTabChange('stock-items')}
        >
          <Boxes size={16} />
          Stock Items (Raw Materials)
          <span className="inventory-tab-badge">{stockItems.length}</span>
        </button>

        <button 
          className={`inventory-tab-btn ${activeTab === 'recipe' ? 'active' : ''}`}
          onClick={() => handleTabChange('recipe')}
        >
          <BookOpen size={16} />
          Recipes & Formulations
          <span className="inventory-tab-badge">{recipes.length}</span>
        </button>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* TAB 1: STOCK ANALYSIS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'stock-analysis' && (
        <>
          {/* Unit Filter Banner */}
          <div className="analysis-unit-banner">
            <div className="analysis-unit-info">
              <h2>
                <Factory size={22} />
                {selectedMUnit === 'ALL' ? 'All Manufacturing Units Overview' : `${selectedUnitObj?.name || 'Selected Unit'} Stock View`}
              </h2>
              <p>
                {selectedMUnit === 'ALL' 
                  ? 'Showing consolidated inventory allocations across all production centers' 
                  : `Real-time allocated raw materials and utilization for ${selectedUnitObj?.name}`}
              </p>
            </div>

            <div className="analysis-unit-quick-actions">
              <select 
                className="inventory-select-filter"
                value={selectedMUnit}
                onChange={(e) => setSelectedMUnit(e.target.value)}
                style={{ background: '#ffffff', color: 'var(--text-primary)', fontWeight: 600 }}
              >
                <option value="ALL">🏭 All Manufacturing Units</option>
                {mUnits.map(unit => (
                  <option key={unit.id} value={unit.id}>
                    📍 {unit.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="inventory-stats-grid">
            <div className="inventory-stat-card">
              <div className="inventory-stat-icon blue">
                <ArrowUpRight size={24} />
              </div>
              <div className="inventory-stat-info">
                <span className="inventory-stat-label">Assigned to Units</span>
                <span className="inventory-stat-value">{totalAssignedStock.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="inventory-stat-card">
              <div className="inventory-stat-icon green">
                <Boxes size={24} />
              </div>
              <div className="inventory-stat-info">
                <span className="inventory-stat-label">Remaining In Central Stock</span>
                <span className="inventory-stat-value">{totalRemainingStock.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="inventory-stat-card">
              <div className="inventory-stat-icon gold">
                <ArrowDownRight size={24} />
              </div>
              <div className="inventory-stat-info">
                <span className="inventory-stat-label">Total Consumed</span>
                <span className="inventory-stat-value">{totalConsumedStock.toFixed(1)} kg</span>
              </div>
            </div>

            <div className="inventory-stat-card">
              <div className={`inventory-stat-icon ${lowStockCount > 0 ? 'red' : 'green'}`}>
                <AlertTriangle size={24} />
              </div>
              <div className="inventory-stat-info">
                <span className="inventory-stat-label">Low Stock Alerts</span>
                <span className="inventory-stat-value">{lowStockCount} items</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="inventory-toolbar">
            <div className="inventory-toolbar-left">
              <div className="inventory-search-wrapper">
                <Search size={18} className="inventory-search-icon" />
                <input
                  type="text"
                  className="inventory-search-input"
                  placeholder="Search stock item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select 
                className="inventory-select-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {CATEGORIES_LIST.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table: Stock Analysis */}
          <div className="inventory-table-card">
            <div className="inventory-table-responsive">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>Raw Material Item</th>
                    <th>Category</th>
                    <th>Assigned To Unit(s)</th>
                    <th>Remaining Central Stock</th>
                    <th>Consumed / Used</th>
                    <th>Usage & Stock Health</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockItems.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>No stock items found for analysis.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredStockItems.map(item => {
                      const unitQty = selectedMUnit === 'ALL' 
                        ? (item.assignedStock || 0)
                        : ((item.unitAllocations && item.unitAllocations[selectedMUnit]) || 0);

                      const totalHandled = (item.currentStock || 0) + (item.assignedStock || 0) + (item.usedStock || 0);
                      const usagePercent = totalHandled > 0 ? Math.round(((item.usedStock || 0) / totalHandled) * 100) : 0;
                      
                      const isOut = (item.currentStock || 0) <= 0;
                      const isLow = !isOut && (item.currentStock || 0) <= (item.minStockLevel || 10);

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="stock-item-name-cell">
                              <div className="stock-item-badge">
                                {item.name ? item.name.charAt(0).toUpperCase() : 'S'}
                              </div>
                              <div className="stock-item-meta">
                                <h4>{item.name}</h4>
                                <span>Unit: {item.unit || 'kg'}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                              {item.category || 'General'}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: 'var(--primary-color)' }}>
                              {unitQty} {item.unit || 'kg'}
                            </strong>
                          </td>
                          <td>
                            <strong>{item.currentStock || 0} {item.unit || 'kg'}</strong>
                          </td>
                          <td>
                            <span style={{ color: '#b45309', fontWeight: 600 }}>
                              {item.usedStock || 0} {item.unit || 'kg'}
                            </span>
                          </td>
                          <td>
                            <div className="stock-progress-cell">
                              <div className="stock-progress-bar-bg">
                                <div 
                                  className={`stock-progress-fill ${isOut ? 'danger' : isLow ? 'low' : ''}`}
                                  style={{ width: `${Math.min(100, usagePercent)}%` }}
                                />
                              </div>
                              <span className="stock-progress-text">
                                {usagePercent}% consumed ({item.currentStock || 0} remaining)
                              </span>
                            </div>
                          </td>
                          <td>
                            {isOut ? (
                              <span className="stock-status-pill out">Out of Stock</span>
                            ) : isLow ? (
                              <span className="stock-status-pill low">Low Stock</span>
                            ) : (
                              <span className="stock-status-pill good">In Stock</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* History of Item Usage & Allocations */}
          <div className="inventory-history-section">
            <h3 className="inventory-section-title">
              <Clock size={20} color="var(--primary-color)" />
              Stock Usage & Allocation History
            </h3>

            <div className="history-timeline-list">
              {filteredLogs.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                  No stock activity logged yet.
                </p>
              ) : (
                filteredLogs.slice(0, 15).map(log => {
                  const isAssigned = log.type === 'ASSIGNED_TO_UNIT';
                  const isUsed = log.type === 'CONSUMED_IN_PRODUCTION';
                  const isInitial = log.type === 'INITIAL_STOCK' || log.type === 'STOCK_ADDED';

                  const dateStr = log.createdAt?.toDate 
                    ? log.createdAt.toDate().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
                    : 'Just now';

                  return (
                    <div key={log.id} className="history-item-row">
                      <div className="history-left-info">
                        <div className={`history-icon-badge ${isAssigned ? 'assigned' : isUsed ? 'used' : 'added'}`}>
                          {isAssigned && <ArrowUpRight size={18} />}
                          {isUsed && <ArrowDownRight size={18} />}
                          {isInitial && <Plus size={18} />}
                        </div>
                        <div className="history-desc">
                          <h5>
                            {log.stockItemName} &bull; {log.notes || log.type}
                          </h5>
                          <span>
                            {log.mUnitName ? `Location: ${log.mUnitName} • ` : ''}{dateStr}
                          </span>
                        </div>
                      </div>

                      <div>
                        <span className={`history-qty-badge ${isUsed ? 'negative' : 'positive'}`}>
                          {isUsed ? '-' : '+'}{log.quantity} {log.unit || 'kg'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 2: STOCK ITEMS */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'stock-items' && (
        <>
          {/* Toolbar */}
          <div className="inventory-toolbar">
            <div className="inventory-toolbar-left">
              <div className="inventory-search-wrapper">
                <Search size={18} className="inventory-search-icon" />
                <input
                  type="text"
                  className="inventory-search-input"
                  placeholder="Search raw material item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select 
                className="inventory-select-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {CATEGORIES_LIST.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <select 
                className="inventory-select-filter"
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value)}
              >
                <option value="ALL">All Stock Status</option>
                <option value="NORMAL">In Stock</option>
                <option value="LOW">Low Stock</option>
                <option value="OUT">Out of Stock</option>
              </select>
            </div>

            <button className="inventory-action-btn" onClick={handleOpenAddStockItem}>
              <Plus size={18} />
              Add Stock Item
            </button>
          </div>

          {/* Stock Items Grid */}
          {filteredStockItems.length === 0 ? (
            <div className="inventory-empty-card">
              <div className="inventory-empty-icon">
                <Boxes size={32} />
              </div>
              <h3>No Stock Items Found</h3>
              <p>Create your raw material items like Ghee, Sugar, Cashews, Milk, Cardamom to track stock.</p>
              <button className="inventory-action-btn" onClick={handleOpenAddStockItem} style={{ marginTop: '8px' }}>
                <Plus size={18} />
                Add First Stock Item
              </button>
            </div>
          ) : (
            <div className="stock-items-grid">
              {filteredStockItems.map(item => {
                const isOut = (item.currentStock || 0) <= 0;
                const isLow = !isOut && (item.currentStock || 0) <= (item.minStockLevel || 10);

                return (
                  <motion.div 
                    key={item.id} 
                    className="stock-item-card"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div>
                      <div className="stock-card-top">
                        <div>
                          <span className="stock-card-category">{item.category || 'General'}</span>
                          <h3 className="stock-card-title">{item.name}</h3>
                        </div>

                        <div className="stock-card-actions">
                          <button 
                            className="stock-card-btn" 
                            title="Edit"
                            onClick={() => handleOpenEditStockItem(item)}
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            className="stock-card-btn delete" 
                            title="Delete"
                            onClick={() => setShowDeleteModal({ type: 'stock-item', item })}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="stock-card-numbers" style={{ marginTop: '16px' }}>
                        <div className="stock-num-box">
                          <span className="stock-num-label">Current Stock</span>
                          <span className="stock-num-val">
                            {item.currentStock || 0} <small style={{ fontSize: '13px' }}>{item.unit || 'kg'}</small>
                          </span>
                        </div>

                        <div className="stock-num-box">
                          <span className="stock-num-label">Cost per {item.unit || 'kg'}</span>
                          <span className="stock-num-val" style={{ color: 'var(--text-primary)' }}>
                            ₹{item.costPerUnit || 0}
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          Alert Level: <strong>{item.minStockLevel || 10} {item.unit || 'kg'}</strong>
                        </span>
                        {isOut ? (
                          <span className="stock-status-pill out">Out of Stock</span>
                        ) : isLow ? (
                          <span className="stock-status-pill low">Low Stock</span>
                        ) : (
                          <span className="stock-status-pill good">In Stock</span>
                        )}
                      </div>
                    </div>

                    <div className="stock-card-bottom">
                      <span>Quick Adjust:</span>
                      <div className="quick-stock-adjust-group">
                        <button 
                          className="quick-adjust-btn" 
                          onClick={() => handleQuickAdjust(item, -5)}
                          title="Reduce 5 kg"
                        >
                          -5
                        </button>
                        <button 
                          className="quick-adjust-btn" 
                          onClick={() => handleQuickAdjust(item, 5)}
                          title="Add 5 kg"
                        >
                          +5
                        </button>
                        <button 
                          className="quick-adjust-btn" 
                          onClick={() => handleQuickAdjust(item, 25)}
                          title="Add 25 kg"
                        >
                          +25
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 3: RECIPE */}
      {/* ---------------------------------------------------------------- */}
      {activeTab === 'recipe' && (
        <>
          {/* Toolbar */}
          <div className="inventory-toolbar">
            <div className="inventory-toolbar-left">
              <div className="inventory-search-wrapper">
                <Search size={18} className="inventory-search-icon" />
                <input
                  type="text"
                  className="inventory-search-input"
                  placeholder="Search recipe by sweet / product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <button className="inventory-action-btn" onClick={handleOpenAddRecipe}>
              <Plus size={18} />
              Add Recipe
            </button>
          </div>

          {/* Recipes Grid */}
          {filteredRecipes.length === 0 ? (
            <div className="inventory-empty-card">
              <div className="inventory-empty-icon">
                <BookOpen size={32} />
              </div>
              <h3>No Recipes Created Yet</h3>
              <p>Map your finished sweets (like Kaju Katli, Motichoor Laddu) to raw stock item ratios and formulas.</p>
              <button className="inventory-action-btn" onClick={handleOpenAddRecipe} style={{ marginTop: '8px' }}>
                <Plus size={18} />
                Add First Recipe
              </button>
            </div>
          ) : (
            <div className="recipes-grid">
              {filteredRecipes.map(recipe => {
                return (
                  <motion.div 
                    key={recipe.id} 
                    className="recipe-card"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="recipe-card-header">
                      <div className="recipe-item-preview">
                        {recipe.itemImage ? (
                          <img src={recipe.itemImage} alt={recipe.itemName} className="recipe-item-img" />
                        ) : (
                          <div className="recipe-item-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--primary-color)' }}>
                            {recipe.itemName?.charAt(0) || 'R'}
                          </div>
                        )}
                        <div className="recipe-item-info">
                          <h3>{recipe.itemName}</h3>
                          <span className="recipe-yield-tag">
                            Yield: {recipe.yieldQuantity || 1} {recipe.yieldUnit || 'kg'} Batch
                          </span>
                        </div>
                      </div>

                      <div className="stock-card-actions">
                        <button 
                          className="stock-card-btn" 
                          title="Edit Recipe"
                          onClick={() => handleOpenEditRecipe(recipe)}
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          className="stock-card-btn delete" 
                          title="Delete Recipe"
                          onClick={() => setShowDeleteModal({ type: 'recipe', item: recipe })}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="recipe-ingredients-box">
                      <div className="recipe-ingredients-title">Ingredients Breakdown:</div>
                      {recipe.ingredients?.map((ing, idx) => (
                        <div key={idx} className="recipe-ingredient-row">
                          <span className="recipe-ingredient-name">
                            &bull; {ing.stockItemName}
                          </span>
                          <span className="recipe-ingredient-qty">
                            {ing.quantity} {ing.unit || 'kg'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {recipe.notes && (
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
                        "{recipe.notes}"
                      </p>
                    )}

                    <div className="recipe-card-footer">
                      <span className="recipe-cost-estimate">
                        Est. Cost: <strong>₹{Math.round(recipe.totalBatchCost || 0)}</strong> / batch
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--primary-color)', fontWeight: 600 }}>
                        {recipe.ingredients?.length || 0} Raw Items
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT STOCK ITEM */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {showStockItemModal && (
          <div className="inventory-modal-overlay" onClick={() => setShowStockItemModal(false)}>
            <motion.div 
              className="inventory-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inventory-modal-header">
                <h3 className="inventory-modal-title">
                  <Boxes size={20} color="var(--primary-color)" />
                  {editingStockItem ? 'Edit Stock Item' : 'Add New Stock Item (Raw Material)'}
                </h3>
                <button className="inventory-modal-close" onClick={() => setShowStockItemModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitStockItem}>
                <div className="inventory-modal-body">
                  <div className="inventory-form-group">
                    <label>Item Name <span>*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pure Cow Ghee, Sugar S-30, Cashews W320"
                      className="inventory-form-input"
                      value={itemForm.name}
                      onChange={(e) => setItemForm(prev => ({ ...prev, name: e.target.value }))}
                      autoFocus
                    />
                  </div>

                  <div className="inventory-form-grid">
                    <div className="inventory-form-group">
                      <label>Category <span>*</span></label>
                      <select
                        className="inventory-form-select"
                        value={itemForm.category}
                        onChange={(e) => setItemForm(prev => ({ ...prev, category: e.target.value }))}
                      >
                        {CATEGORIES_LIST.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="inventory-form-group">
                      <label>Measurement Unit <span>*</span></label>
                      <select
                        className="inventory-form-select"
                        value={itemForm.unit}
                        onChange={(e) => setItemForm(prev => ({ ...prev, unit: e.target.value }))}
                      >
                        {UNITS_LIST.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="inventory-form-grid">
                    <div className="inventory-form-group">
                      <label>Current / Initial Quantity ({itemForm.unit})</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        className="inventory-form-input"
                        value={itemForm.currentStock}
                        onChange={(e) => setItemForm(prev => ({ ...prev, currentStock: e.target.value }))}
                      />
                    </div>

                    <div className="inventory-form-group">
                      <label>Minimum Stock Alert Level</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="10"
                        className="inventory-form-input"
                        value={itemForm.minStockLevel}
                        onChange={(e) => setItemForm(prev => ({ ...prev, minStockLevel: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="inventory-form-grid">
                    <div className="inventory-form-group">
                      <label>Cost per {itemForm.unit} (₹)</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 520"
                        className="inventory-form-input"
                        value={itemForm.costPerUnit}
                        onChange={(e) => setItemForm(prev => ({ ...prev, costPerUnit: e.target.value }))}
                      />
                    </div>

                    <div className="inventory-form-group">
                      <label>Preferred Vendor (Optional)</label>
                      <select
                        className="inventory-form-select"
                        value={itemForm.vendorId}
                        onChange={(e) => setItemForm(prev => ({ ...prev, vendorId: e.target.value }))}
                      >
                        <option value="">-- None / Multiple Suppliers --</option>
                        {vendors.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="inventory-modal-footer">
                  <button 
                    type="button" 
                    className="inventory-btn-cancel"
                    onClick={() => setShowStockItemModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inventory-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : (editingStockItem ? 'Update Stock Item' : 'Save Stock Item')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT RECIPE */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {showRecipeModal && (
          <div className="inventory-modal-overlay" onClick={() => setShowRecipeModal(false)}>
            <motion.div 
              className="inventory-modal large"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inventory-modal-header">
                <h3 className="inventory-modal-title">
                  <BookOpen size={20} color="var(--primary-color)" />
                  {editingRecipe ? 'Edit Recipe & Raw Material Ingredients' : 'Add New Sweet Recipe'}
                </h3>
                <button className="inventory-modal-close" onClick={() => setShowRecipeModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitRecipe}>
                <div className="inventory-modal-body">
                  <div className="inventory-form-grid">
                    <div className="inventory-form-group">
                      <label>Select Finished Sweet / Product <span>*</span></label>
                      <select
                        required
                        className="inventory-form-select"
                        value={recipeForm.itemId}
                        onChange={(e) => setRecipeForm(prev => ({ ...prev, itemId: e.target.value }))}
                      >
                        <option value="">-- Choose Product from Catalog --</option>
                        {finishedItems.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="inventory-form-group">
                      <label>Recipe Yield / Batch Size</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="1"
                          className="inventory-form-input"
                          value={recipeForm.yieldQuantity}
                          onChange={(e) => setRecipeForm(prev => ({ ...prev, yieldQuantity: e.target.value }))}
                        />
                        <select
                          className="inventory-form-select"
                          style={{ width: '100px' }}
                          value={recipeForm.yieldUnit}
                          onChange={(e) => setRecipeForm(prev => ({ ...prev, yieldUnit: e.target.value }))}
                        >
                          <option value="kg">kg</option>
                          <option value="grams">grams</option>
                          <option value="pieces">pieces</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Multi-Ingredient Row Builder */}
                  <div className="recipe-builder-section">
                    <div className="recipe-builder-header">
                      <h4>Ingredients & Raw Stock Items</h4>
                      <button 
                        type="button" 
                        className="recipe-add-row-btn"
                        onClick={handleAddIngredientRow}
                      >
                        <Plus size={14} />
                        Add Ingredient
                      </button>
                    </div>

                    {recipeForm.ingredients.map((ing, idx) => (
                      <div key={idx} className="ingredient-row-item">
                        <select
                          required
                          className="inventory-form-select"
                          value={ing.stockItemId}
                          onChange={(e) => handleIngredientChange(idx, 'stockItemId', e.target.value)}
                        >
                          <option value="">-- Select Raw Material --</option>
                          {stockItems.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.unit || 'kg'})
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          step="any"
                          required
                          placeholder="Quantity (kg)"
                          className="inventory-form-input"
                          value={ing.quantity}
                          onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                        />

                        <select
                          className="inventory-form-select"
                          value={ing.unit}
                          onChange={(e) => handleIngredientChange(idx, 'unit', e.target.value)}
                        >
                          {UNITS_LIST.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>

                        <button 
                          type="button" 
                          className="ingredient-remove-btn"
                          onClick={() => handleRemoveIngredientRow(idx)}
                          title="Remove row"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="inventory-form-group">
                    <label>Preparation Notes & Cooking Formula (Optional)</label>
                    <textarea
                      rows="2"
                      placeholder="e.g. Boil sugar syrup to single string consistency before adding cashew powder..."
                      className="inventory-form-textarea"
                      value={recipeForm.notes}
                      onChange={(e) => setRecipeForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="inventory-modal-footer">
                  <button 
                    type="button" 
                    className="inventory-btn-cancel"
                    onClick={() => setShowRecipeModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inventory-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : (editingRecipe ? 'Update Recipe' : 'Save Recipe')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: ASSIGN STOCK TO MANUFACTURING UNIT */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {showAssignModal && (
          <div className="inventory-modal-overlay" onClick={() => setShowAssignModal(false)}>
            <motion.div 
              className="inventory-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inventory-modal-header">
                <h3 className="inventory-modal-title">
                  <ArrowUpRight size={20} color="var(--primary-color)" />
                  Assign Raw Materials to Manufacturing Unit
                </h3>
                <button className="inventory-modal-close" onClick={() => setShowAssignModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitAssign}>
                <div className="inventory-modal-body">
                  <div className="inventory-form-group">
                    <label>Select Raw Material Stock Item <span>*</span></label>
                    <select
                      required
                      className="inventory-form-select"
                      value={assignForm.stockItemId}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, stockItemId: e.target.value }))}
                    >
                      <option value="">-- Choose Stock Item --</option>
                      {stockItems.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Available in Central Stock: {s.currentStock || 0} {s.unit || 'kg'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="inventory-form-group">
                    <label>Select Target Manufacturing Unit <span>*</span></label>
                    <select
                      required
                      className="inventory-form-select"
                      value={assignForm.mUnitId}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, mUnitId: e.target.value }))}
                    >
                      <option value="">-- Choose Manufacturing Unit --</option>
                      {mUnits.map(unit => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="inventory-form-group">
                    <label>Quantity to Assign (kg / units) <span>*</span></label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 50"
                      className="inventory-form-input"
                      value={assignForm.quantity}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, quantity: e.target.value }))}
                    />
                  </div>

                  <div className="inventory-form-group">
                    <label>Transfer Notes / Dispatch Ref</label>
                    <input
                      type="text"
                      placeholder="e.g. Morning dispatch for festive batch"
                      className="inventory-form-input"
                      value={assignForm.notes}
                      onChange={(e) => setAssignForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="inventory-modal-footer">
                  <button 
                    type="button" 
                    className="inventory-btn-cancel"
                    onClick={() => setShowAssignModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inventory-btn-submit"
                    disabled={submitting}
                  >
                    {submitting ? 'Assigning...' : 'Assign Stock'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: RECORD USAGE / CONSUMPTION */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {showUsageModal && (
          <div className="inventory-modal-overlay" onClick={() => setShowUsageModal(false)}>
            <motion.div 
              className="inventory-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inventory-modal-header">
                <h3 className="inventory-modal-title">
                  <ArrowDownRight size={20} color="#dc2626" />
                  Record Stock Consumption / Usage
                </h3>
                <button className="inventory-modal-close" onClick={() => setShowUsageModal(false)}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmitUsage}>
                <div className="inventory-modal-body">
                  <div className="inventory-form-group">
                    <label>Stock Item Consumed <span>*</span></label>
                    <select
                      required
                      className="inventory-form-select"
                      value={usageForm.stockItemId}
                      onChange={(e) => setUsageForm(prev => ({ ...prev, stockItemId: e.target.value }))}
                    >
                      <option value="">-- Choose Stock Item --</option>
                      {stockItems.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} (Assigned: {s.assignedStock || 0}, On-Hand: {s.currentStock || 0} {s.unit || 'kg'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="inventory-form-group">
                    <label>Production Unit (Optional)</label>
                    <select
                      className="inventory-form-select"
                      value={usageForm.mUnitId}
                      onChange={(e) => setUsageForm(prev => ({ ...prev, mUnitId: e.target.value }))}
                    >
                      <option value="">-- Central Store / General --</option>
                      {mUnits.map(unit => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="inventory-form-group">
                    <label>Quantity Consumed (kg / units) <span>*</span></label>
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 20"
                      className="inventory-form-input"
                      value={usageForm.quantity}
                      onChange={(e) => setUsageForm(prev => ({ ...prev, quantity: e.target.value }))}
                    />
                  </div>

                  <div className="inventory-form-group">
                    <label>Reason / Production Batch</label>
                    <input
                      type="text"
                      placeholder="e.g. Daily Worksheet production, Wastage, Testing"
                      className="inventory-form-input"
                      value={usageForm.reason}
                      onChange={(e) => setUsageForm(prev => ({ ...prev, reason: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="inventory-modal-footer">
                  <button 
                    type="button" 
                    className="inventory-btn-cancel"
                    onClick={() => setShowUsageModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inventory-btn-submit"
                    style={{ background: '#dc2626' }}
                    disabled={submitting}
                  >
                    {submitting ? 'Recording...' : 'Record Consumption'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------------- */}
      {/* MODAL: DELETE CONFIRMATION */}
      {/* ---------------------------------------------------------------- */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="inventory-modal-overlay" onClick={() => setShowDeleteModal(null)}>
            <motion.div 
              className="inventory-modal"
              style={{ maxWidth: '440px' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#fee2e2', color: 'var(--error-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={32} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                  Delete {showDeleteModal.type === 'stock-item' ? 'Stock Item' : 'Recipe'}?
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  Are you sure you want to remove <strong>"{showDeleteModal.item.name || showDeleteModal.item.itemName}"</strong>? This action cannot be undone.
                </p>
              </div>

              <div className="inventory-modal-footer" style={{ justifyContent: 'center' }}>
                <button 
                  type="button" 
                  className="inventory-btn-cancel"
                  onClick={() => setShowDeleteModal(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="inventory-btn-submit"
                  style={{ background: 'var(--error-color)' }}
                  onClick={handleDeleteConfirm}
                  disabled={submitting}
                >
                  {submitting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Inventory;
