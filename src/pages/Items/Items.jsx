import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Package, 
  Edit, 
  Trash2, 
  X,
  Image as ImageIcon,
  Scale,
  Factory,
  ChevronDown,
  Tag,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Info
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
  writeBatch
} from 'firebase/firestore';
import { uploadToImageKit } from '../../config/imagekit';
import * as XLSX from 'xlsx';

import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Items.css';
import logo from '../../assets/logo.png';

const DEFAULT_ITEM_IMAGE = logo;

// Premium Animated Custom Select Component
const CustomSelect = ({ label, options, value, onChange, placeholder, icon, required }) => {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="items-input-group custom-select-container" ref={dropdownRef}>
      <label>{label} {required && <span>*</span>}</label>
      <div className="custom-select-wrapper">
        <button
          type="button"
          className={`custom-select-trigger ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="custom-select-trigger-content">
            {icon && <span className="custom-select-icon">{icon}</span>}
            <span className={selectedOption ? 'selected-value' : 'placeholder-value'}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          </div>
          <ChevronDown size={16} className={`custom-select-chevron ${isOpen ? 'open' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.ul
              className="custom-select-options"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              {options.map((option) => (
                <li
                  key={option.value}
                  className={`custom-select-option ${option.value === value ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                >
                  {option.label}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const Items = () => {
  const [items, setItems] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [fallbackMUnitId, setFallbackMUnitId] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    unit: 'Weight', // 'Weight' or 'Piece'
    price: '',
    mUnitId: '',
    categoryId: '',
    image: '',
    showInWorksheet: true
  });
  const [imageFile, setImageFile] = useState(null);

  // Fetch Manufacturing Units for Dropdown
  useEffect(() => {
    const fetchMUnits = async () => {
      const q = query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      setMUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchMUnits();
  }, []);

  // Fetch Categories for Dropdown
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Fetch Global Items
  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'items'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const itemData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(itemData);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (file) => {
    try {
      console.log("Starting upload to ImageKit...");
      const uploadedUrl = await uploadToImageKit(file);
      console.log("Upload successful:", uploadedUrl);
      return uploadedUrl;
    } catch (error) {
      console.error("ImageKit Upload Error:", error);
      toast.error(`Upload Error: ${error.message || 'Check ImageKit configuration'}`);
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.mUnitId) {
      toast.error("Please select a manufacturing unit");
      return;
    }

    setSubmitting(true);
    
    try {
      let finalImageUrl = DEFAULT_ITEM_IMAGE;

      // 1. Handle Image Upload (Priority: New File > Existing URL > Default)
      if (imageFile) {
        console.log("New file detected, uploading to ImageKit...");
        const uploadedUrl = await uploadImage(imageFile);
        if (uploadedUrl) {
          finalImageUrl = uploadedUrl;
        } else {
          // If upload fails, fallback to default
          finalImageUrl = DEFAULT_ITEM_IMAGE;
        }
      } else if (editingItem && editingItem.image) {
        // If editing and no new file, keep old URL
        finalImageUrl = editingItem.image;
      }

      // 2. Prepare Data (Clean out base64 preview string)
      const { image, ...restData } = formData;
      const finalData = {
        ...restData,
        price: Number(formData.price),
        image: finalImageUrl,
        updatedAt: serverTimestamp()
      };

      console.log("Saving to Firestore collection: items");
      if (editingItem) {
        await updateDoc(doc(db, 'items', editingItem.id), finalData);
        toast.success("Item updated successfully");
      } else {
        await addDoc(collection(db, 'items'), {
          ...finalData,
          createdAt: serverTimestamp()
        });
        toast.success("Item added successfully");
      }
      resetForm();
    } catch (error) {
      console.error("Firestore Save Error:", error);
      toast.error(`Save Error: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', unit: 'Weight', price: '', mUnitId: '', categoryId: '', image: '', showInWorksheet: true });
    setImageFile(null);
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      unit: item.unit,
      price: item.price,
      mUnitId: item.mUnitId,
      categoryId: item.categoryId || '',
      image: item.image,
      showInWorksheet: item.showInWorksheet !== false
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'items', showDeleteModal));
      toast.success("Item removed successfully");
      setShowDeleteModal(null);
    } catch (error) {
      toast.error("Failed to delete item");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleWorksheetVisibility = async (item, checked) => {
    try {
      await updateDoc(doc(db, 'items', item.id), {
        showInWorksheet: checked,
        updatedAt: serverTimestamp()
      });
      toast.success(`${item.name} ${checked ? 'enabled' : 'disabled'} in store worksheet`);
    } catch (error) {
      console.error("Failed to toggle item visibility:", error);
      toast.error("Failed to update item visibility");
    }
  };

  // Bulk Import Helper Functions
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file) => {
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'csv') {
      toast.error("Please upload only Excel (.xlsx, .xls) or CSV files");
      return;
    }

    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (rows.length === 0) {
          toast.error("The selected file is empty");
          return;
        }

        // Header matching logic
        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item') || h.includes('title'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost') || h.includes('rate') || h.includes('amount'));
        const unitIdx = headers.findIndex(h => h.includes('unit') || h.includes('type') || h.includes('measure'));
        const mUnitIdx = headers.findIndex(h => h.includes('manufacturing') || h.includes('munit') || h.includes('kitchen') || h.includes('factory'));
        const categoryIdx = headers.findIndex(h => h.includes('category') || h.includes('cat') || h.includes('group'));

        if (nameIdx === -1 || priceIdx === -1) {
          toast.error("Could not find standard columns for 'Name' and 'Price' in your file. Please download and use the template.");
          return;
        }

        const parsed = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length === 0) continue;
          
          const name = String(row[nameIdx] || '').trim();
          if (!name) continue; // Skip blank lines

          const priceVal = parseFloat(String(row[priceIdx] || '').replace(/[^\d.-]/g, ''));
          
          const rawUnit = String(row[unitIdx] || '').trim().toLowerCase();
          let unit = 'Weight';
          if (rawUnit.includes('pc') || rawUnit.includes('piece') || rawUnit.includes('qty') || rawUnit.includes('count')) {
            unit = 'Piece';
          }

          const rawMUnit = String(row[mUnitIdx] || '').trim();
          const rawCategory = String(row[categoryIdx] || '').trim();

          const errors = [];
          if (!name) errors.push("Item name is empty");
          if (isNaN(priceVal) || priceVal <= 0) errors.push("Price must be a valid positive number");

          let mUnitId = '';
          let mUnitWarning = false;
          if (rawMUnit) {
            const foundMU = mUnits.find(mu => mu.name.trim().toLowerCase() === rawMUnit.toLowerCase());
            if (foundMU) {
              mUnitId = foundMU.id;
            }
          } else {
            mUnitWarning = true;
          }

          let categoryId = '';
          if (rawCategory) {
            const foundCat = categories.find(cat => cat.name.trim().toLowerCase() === rawCategory.toLowerCase());
            if (foundCat) {
              categoryId = foundCat.id;
            }
          }

          parsed.push({
            name,
            price: isNaN(priceVal) ? '' : priceVal,
            unit,
            rawMUnit,
            rawCategory,
            mUnitId,
            categoryId,
            errors,
            warning: mUnitWarning,
            status: errors.length > 0 ? 'invalid' : (mUnitWarning ? 'warning' : 'valid')
          });
        }

        if (parsed.length === 0) {
          toast.error("No valid data rows found in the file.");
          return;
        }

        setParsedData(parsed);
        toast.success(`Successfully parsed ${parsed.length} rows!`);
      } catch (err) {
        console.error("Error reading spreadsheet file:", err);
        toast.error("Failed to parse sheet: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    try {
      const headers = ['Name', 'Price (INR)', 'Unit Type (Weight / Piece)', 'Manufacturing Unit', 'Category (Optional)'];
      const examples = [
        ['Special Ghee Mysore Pak', '650', 'Weight', mUnits[0]?.name || 'Main Kitchen', categories[0]?.name || 'Sweets'],
        ['Kaju Katli', '900', 'Weight', mUnits[0]?.name || 'Main Kitchen', categories[0]?.name || 'Sweets'],
        ['Special Kara Boondi', '50', 'Piece', mUnits[1]?.name || mUnits[0]?.name || 'Savories Kitchen', categories[1]?.name || 'Snacks']
      ];

      let csvContent = headers.join(',') + '\n';
      examples.forEach(row => {
        csvContent += row.map(v => {
          const str = String(v);
          return str.includes(',') ? `"${str}"` : str;
        }).join(',') + '\n';
      });

      // Add information about valid names
      csvContent += '\n';
      csvContent += '--- HELP & DIRECTIONS ---\n';
      csvContent += `"Available Manufacturing Units (Match exactly): ${mUnits.map(mu => mu.name).join(' | ')}"\n`;
      csvContent += `"Available Categories (Match exactly): ${categories.map(cat => cat.name).join(' | ')}"\n`;
      csvContent += 'Unit Type must be either: Weight (default) or Piece\n';

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "item_bulk_import_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV Template downloaded successfully");
    } catch (err) {
      console.error("Error generating CSV template:", err);
      toast.error("Failed to download template");
    }
  };

  const handleBulkImport = async () => {
    const importable = parsedData.filter(item => {
      if (item.status === 'invalid') return false;
      if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
      return true;
    });

    if (importable.length === 0) {
      toast.error("No valid items to import. Please resolve validation errors or select a fallback manufacturing unit.");
      return;
    }

    setIsImporting(true);
    try {
      const batch = writeBatch(db);
      const itemsCollection = collection(db, 'items');
      const categoriesCollection = collection(db, 'categories');
      const mUnitsCollection = collection(db, 'manufacturing_units');

      // Keep track of newly created categories and manufacturing units in this batch to avoid duplicates
      const newCategoryRefsByName = {};
      const newMUnitRefsByName = {};

      // First pass: identify and create new categories and manufacturing units
      importable.forEach(row => {
        // Category creation
        if (row.rawCategory && !row.categoryId) {
          const cleanName = row.rawCategory.trim();
          const key = cleanName.toLowerCase();
          
          if (!newCategoryRefsByName[key]) {
            // Generate a new category reference with auto-ID
            const newCatRef = doc(categoriesCollection);
            batch.set(newCatRef, {
              name: cleanName,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            newCategoryRefsByName[key] = newCatRef.id;
          }
        }

        // Manufacturing Unit creation
        if (row.rawMUnit && !row.mUnitId) {
          const cleanName = row.rawMUnit.trim();
          const key = cleanName.toLowerCase();

          if (!newMUnitRefsByName[key]) {
            // Generate a new manufacturing unit reference with auto-ID
            const newMUnitRef = doc(mUnitsCollection);
            batch.set(newMUnitRef, {
              name: cleanName,
              address: 'Unspecified Address',
              city: 'Unspecified City',
              state: 'Unspecified State',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            newMUnitRefsByName[key] = newMUnitRef.id;
          }
        }
      });

      // Second pass: add items referencing matched or newly created IDs
      importable.forEach(row => {
        const itemDocRef = doc(itemsCollection);
        
        let finalCategoryId = row.categoryId || '';
        if (row.rawCategory && !finalCategoryId) {
          const key = row.rawCategory.trim().toLowerCase();
          finalCategoryId = newCategoryRefsByName[key] || '';
        }

        let finalMUnitId = row.mUnitId || '';
        if (row.rawMUnit && !finalMUnitId) {
          const key = row.rawMUnit.trim().toLowerCase();
          finalMUnitId = newMUnitRefsByName[key] || '';
        }

        // Fallback if rawMUnit is empty
        if (!finalMUnitId) {
          finalMUnitId = fallbackMUnitId;
        }

        batch.set(itemDocRef, {
          name: row.name,
          price: Number(row.price),
          unit: row.unit,
          mUnitId: finalMUnitId,
          categoryId: finalCategoryId,
          image: DEFAULT_ITEM_IMAGE,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
      toast.success(`Successfully imported ${importable.length} items and created missing categories & manufacturing units!`);
      resetImport();
    } catch (err) {
      console.error("Failed to commit batch writes:", err);
      toast.error("Import failed: " + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setParsedData([]);
    setFallbackMUnitId('');
    setShowImportModal(false);
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="items-container">
      <div className="items-header">
        <div className="items-header-info">
          <h1>Product Inventory</h1>
          <p>Manage sweets, snacks, and store essentials</p>
        </div>
        {!showAddForm && (
          <div className="items-header-actions">
            <button className="items-import-btn" onClick={() => setShowImportModal(true)}>
              <Upload size={18} /> Bulk Import
            </button>
            <button className="items-add-btn" onClick={() => setShowAddForm(true)}>
              <Plus size={20} /> Add New Item
            </button>
          </div>
        )}
      </div>

      <div className="items-content-layout">
        <div className={`items-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="items-search-bar">
            <Search size={18} className="items-search-icon" />
            <input 
              type="text" 
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="items-grid">
            {loading ? (
              <div className="items-loader-container"><div className="loader"></div></div>
            ) : filteredItems.length > 0 ? (
              filteredItems.map(item => (
                <div key={item.id} className="item-card">
                  <div className="item-img-box">
                    <img 
                      src={(!item.image || typeof item.image !== 'string' || item.image.trim() === "" || item.image.toLowerCase() === "none" || item.image.toLowerCase() === "null" || item.image.includes('unsplash')) ? DEFAULT_ITEM_IMAGE : item.image} 
                      alt={item.name} 
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = DEFAULT_ITEM_IMAGE;
                      }}
                    />
                    <div className="item-card-actions">
                      <button onClick={() => handleEdit(item)} className="item-mini-btn edit"><Edit size={14} /></button>
                      <button onClick={() => setShowDeleteModal(item.id)} className="item-mini-btn delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="item-card-info">
                    <div className="item-meta-top">
                      <span className="item-unit-tag">{item.unit}</span>
                      <span className="item-price-tag">₹{item.price}</span>
                    </div>
                    <h3>{item.name}</h3>
                    <div className="item-munit-info">
                      <Factory size={12} />
                      <span>{mUnits.find(mu => mu.id === item.mUnitId)?.name || 'Unknown Unit'}</span>
                    </div>
                    <div className="item-card-cat-tag">
                      <Tag size={12} />
                      <span>{categories.find(cat => cat.id === item.categoryId)?.name || 'Uncategorized'}</span>
                    </div>
                    <div className="item-worksheet-toggle" style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b' }}>Show in Worksheet</span>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={item.showInWorksheet !== false} 
                          onChange={(e) => handleToggleWorksheetVisibility(item, e.target.checked)}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="items-empty-state">
                <div className="empty-icon-circle">
                  <Package size={32} />
                </div>
                <h3>No Items Found</h3>
                <p>You haven't added any items yet. Click the button above to start building your inventory.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="items-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="items-sidebar-header">
                <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
                <button onClick={resetForm} className="items-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="items-form">
                <div className="item-image-upload">
                  <div className="image-preview-box">
                    {formData.image && !formData.image.includes('unsplash') ? (
                      <img src={formData.image} alt="Preview" />
                    ) : (
                      <ImageIcon size={32} />
                    )}
                  </div>
                  <div className="image-upload-info">
                    <label htmlFor="item-img-input" className="image-upload-btn">
                      <Plus size={14} /> {formData.image ? 'Change Image' : 'Upload Image'}
                    </label>
                    <input id="item-img-input" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    <span>Optional: Item photo</span>
                  </div>
                </div>

                <div className="items-input-group">
                  <label>Item Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Special Ghee Mysore Pak"
                    required 
                  />
                </div>

                <div className="items-form-row">
                  <CustomSelect
                    label="Unit Type"
                    options={[
                      { value: 'Weight', label: 'Weight (kg/gm)' },
                      { value: 'Piece', label: 'Piece (qty)' }
                    ]}
                    value={formData.unit}
                    onChange={(val) => setFormData(prev => ({ ...prev, unit: val }))}
                    placeholder="Select unit type"
                    icon={<Scale size={16} />}
                    required
                  />

                  <div className="items-input-group">
                    <label>Price (₹)</label>
                    <input 
                      type="number" 
                      name="price" 
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      required 
                    />
                  </div>
                </div>

                <CustomSelect
                  label="Manufacturing Unit"
                  options={mUnits.map(mu => ({ value: mu.id, label: mu.name }))}
                  value={formData.mUnitId}
                  onChange={(val) => setFormData(prev => ({ ...prev, mUnitId: val }))}
                  placeholder="Select a unit"
                  icon={<Factory size={16} />}
                  required
                />

                 <CustomSelect
                  label="Category"
                  options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
                  value={formData.categoryId}
                  onChange={(val) => setFormData(prev => ({ ...prev, categoryId: val }))}
                  placeholder="Select category"
                  icon={<Tag size={16} />}
                />

                <div className="items-input-group" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-color)', marginTop: '5px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>Show in Worksheet</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Enable to list in store worksheet</span>
                  </div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={formData.showInWorksheet} 
                      onChange={(e) => setFormData(prev => ({ ...prev, showInWorksheet: e.target.checked }))}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>

                <div className="items-form-actions">
                  <button type="button" onClick={resetForm} className="items-btn-cancel">Cancel</button>
                  <button type="submit" className="items-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : 'Save Product'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showImportModal && (
        <div className="import-modal-overlay">
          <div className="import-modal-card">
            <div className="import-modal-header">
              <div className="import-modal-header-info">
                <h2>Bulk Import Items</h2>
                <p>Upload an Excel (.xlsx, .xls) or CSV file containing item records</p>
              </div>
              <button className="import-modal-close-btn" onClick={resetImport}>
                <X size={20} />
              </button>
            </div>

            <div className="import-modal-body">
              <div className="import-template-box">
                <div className="import-template-text">
                  <h4>Need a template?</h4>
                  <p>Download our pre-formatted template with guidance and active category names.</p>
                </div>
                <button className="import-template-download-btn" onClick={downloadTemplate}>
                  <Download size={16} /> Download Template
                </button>
              </div>

              <div 
                className={`import-dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('bulk-file-input').click()}
              >
                <input 
                  id="bulk-file-input" 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                />
                <div className="import-dropzone-icon-circle">
                  <FileSpreadsheet size={28} />
                </div>
                {importFile ? (
                  <div>
                    <h3>Selected File: {importFile.name}</h3>
                    <p>{(importFile.size / 1024).toFixed(2)} KB - Click or drag new file to replace</p>
                  </div>
                ) : (
                  <div>
                    <h3>Drag & Drop your spreadsheet here</h3>
                    <p>Supports .xlsx, .xls, and .csv files</p>
                  </div>
                )}
              </div>

              {parsedData.length > 0 && (
                <div className="import-preview-section">
                  <div className="import-preview-header">
                    <h3>Parsed Preview</h3>
                    <div className="import-preview-summary">
                      <span className="import-summary-pill ready">
                        Ready: {parsedData.filter(r => r.status === 'valid').length}
                      </span>
                      <span className="import-summary-pill warning">
                        Warnings: {parsedData.filter(r => r.status === 'warning').length}
                      </span>
                      <span className="import-summary-pill errors">
                        Errors: {parsedData.filter(r => r.status === 'invalid').length}
                      </span>
                    </div>
                  </div>

                  <div className="import-table-wrapper">
                    <table className="import-table">
                      <thead>
                        <tr>
                          <th>Item Name</th>
                          <th>Unit</th>
                          <th>Price</th>
                          <th>Manufacturing Unit</th>
                          <th>Category</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.map((row, idx) => (
                          <tr key={idx} className={row.status === 'invalid' ? 'row-invalid' : ''}>
                            <td>
                              <div style={{ fontWeight: '600' }}>{row.name}</div>
                              {row.errors.includes("Item name is empty") && (
                                <div className="import-row-error">Name cannot be empty</div>
                              )}
                            </td>
                            <td>{row.unit}</td>
                            <td>
                              <div>₹{row.price || '-'}</div>
                              {row.errors.includes("Price must be a valid positive number") && (
                                <div className="import-row-error">Invalid price</div>
                              )}
                            </td>
                            <td>
                              {row.mUnitId ? (
                                <span style={{ color: '#137333', fontWeight: '500' }}>
                                  {mUnits.find(mu => mu.id === row.mUnitId)?.name}
                                </span>
                              ) : row.rawMUnit ? (
                                <span style={{ color: '#3182ce', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Factory size={12} style={{ color: '#3182ce' }} />
                                  {row.rawMUnit}
                                  <span style={{ fontSize: '9px', background: '#ebf8ff', color: '#2b6cb0', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>
                                </span>
                              ) : (
                                <div>
                                  {fallbackMUnitId ? (
                                    <span style={{ color: '#137333', fontWeight: '500' }}>
                                      {mUnits.find(mu => mu.id === fallbackMUnitId)?.name}
                                      <span style={{ fontSize: '9px', background: '#e6f4ea', color: '#137333', padding: '1px 4px', borderRadius: '4px', marginLeft: '4px' }}>FALLBACK</span>
                                    </span>
                                  ) : (
                                    <div className="import-row-error" style={{ color: '#B06000' }}>
                                      Requires fallback unit
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                            <td>
                              {row.categoryId ? (
                                <span style={{ fontWeight: '500' }}>
                                  {categories.find(cat => cat.id === row.categoryId)?.name}
                                </span>
                              ) : row.rawCategory ? (
                                <span style={{ color: '#3182ce', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Tag size={12} style={{ color: '#3182ce' }} />
                                  {row.rawCategory}
                                  <span style={{ fontSize: '9px', background: '#ebf8ff', color: '#2b6cb0', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>NEW</span>
                                </span>
                              ) : (
                                <span style={{ color: '#718096', fontStyle: 'italic' }}>Uncategorized</span>
                              )}
                            </td>
                            <td>
                              <span className={`import-badge ${row.status === 'valid' ? 'success' : (row.status === 'warning' ? 'warn' : 'error')}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {parsedData.some(r => r.status === 'warning' && !r.mUnitId) && (
                    <div className="import-fallback-section">
                      <div className="import-fallback-header">
                        <AlertCircle size={18} />
                        <span>Map Missing Manufacturing Units</span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Some items have unspecified or unmatched manufacturing units. Choose a default fallback manufacturing unit to apply to these items so they can be imported:
                      </p>
                      <div className="import-fallback-controls">
                        <label>Fallback Unit:</label>
                        <select 
                          value={fallbackMUnitId}
                          onChange={(e) => setFallbackMUnitId(e.target.value)}
                          className="items-select"
                          style={{ maxWidth: '280px', height: '38px' }}
                        >
                          <option value="">-- Select Fallback --</option>
                          {mUnits.map(mu => (
                            <option key={mu.id} value={mu.id}>{mu.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="import-modal-footer">
              <button className="import-btn-cancel" onClick={resetImport} disabled={isImporting}>
                Cancel
              </button>
              <button 
                className="import-btn-submit" 
                onClick={handleBulkImport} 
                disabled={
                  isImporting || 
                  parsedData.length === 0 || 
                  parsedData.filter(item => {
                    if (item.status === 'invalid') return false;
                    if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
                    return true;
                  }).length === 0
                }
              >
                {isImporting ? (
                  <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Import {
                      parsedData.filter(item => {
                        if (item.status === 'invalid') return false;
                        if (item.status === 'warning' && !item.mUnitId && !fallbackMUnitId) return false;
                        return true;
                      }).length
                    } Items
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon-box delete"><Trash2 size={32} /></div>
            <h3 className="modal-title">Delete Item?</h3>
            <p className="modal-text">Are you sure you want to remove this item from your inventory?</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Cancel</button>
              <button className="modal-btn confirm delete" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Yes, Delete'}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Items;
