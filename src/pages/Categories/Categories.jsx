import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Tag, 
  Edit, 
  Trash2, 
  X,
  Calendar
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Categories.css';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: ''
  });

  // Real-time listener for categories
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const catData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCategories(catData);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore error loading categories:", error);
        toast.error("Failed to load categories");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = formData.name.trim();

    if (!cleanName) {
      toast.error("Category name cannot be empty");
      return;
    }

    // Duplicate Check
    const isDuplicate = categories.some(cat => 
      cat.name.toLowerCase() === cleanName.toLowerCase() && 
      (!editingCategory || cat.id !== editingCategory.id)
    );

    if (isDuplicate) {
      toast.error("A category with this name already exists");
      return;
    }

    setSubmitting(true);
    try {
      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), {
          name: cleanName,
          updatedAt: serverTimestamp()
        });
        toast.success("Category updated successfully");
      } else {
        await addDoc(collection(db, 'categories'), {
          name: cleanName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Category added successfully");
      }
      resetForm();
    } catch (error) {
      console.error("Failed to save category:", error);
      toast.error(editingCategory ? "Failed to update category" : "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '' });
    setShowAddForm(false);
    setEditingCategory(null);
  };

  const handleEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({ name: cat.name });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'categories', showDeleteModal));
      toast.success("Category deleted successfully");
      setShowDeleteModal(null);
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast.error("Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="cat-container">
      <div className="cat-header">
        <div className="cat-header-info">
          <h1>Product Categories</h1>
          <p>Organize sweets, snacks, and other items into categories</p>
        </div>
        {!showAddForm && (
          <button className="cat-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add Category
          </button>
        )}
      </div>

      <div className="cat-content-layout">
        <div className={`cat-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="cat-search-bar">
            <Search size={18} className="cat-search-icon" />
            <input 
              type="text" 
              placeholder="Search categories..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="cat-grid">
            {loading ? (
              <div className="cat-loader-container">
                <div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div>
              </div>
            ) : filteredCategories.length > 0 ? (
              filteredCategories.map(cat => (
                <div key={cat.id} className="cat-card">
                  <div>
                    <div className="cat-card-header">
                      <div className="cat-icon"><Tag size={20} /></div>
                      <div className="cat-actions">
                        <button 
                          onClick={() => handleEdit(cat)} 
                          className="cat-action-btn edit" 
                          title="Edit Category"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => setShowDeleteModal(cat.id)} 
                          className="cat-action-btn delete" 
                          title="Delete Category"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="cat-info">
                      <h3 title={cat.name}>{cat.name}</h3>
                      <div className="cat-info-meta">
                        <Calendar size={12} />
                        <span>Added: {formatDate(cat.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="cat-card-footer">
                    <span className="cat-badge">Category</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="cat-empty-state">
                <div className="cat-icon" style={{ margin: '0 auto 20px', width: '56px', height: '56px' }}>
                  <Tag size={28} />
                </div>
                <h3>No Categories Found</h3>
                <p>Start by adding your first product category to organize your inventory</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="cat-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="cat-sidebar-header">
                <h2>{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
                <button onClick={resetForm} className="cat-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="cat-form">
                <div className="cat-input-group">
                  <label>Category Name <span>*</span></label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Ghee Sweets"
                    required 
                    maxLength={50}
                    autoComplete="off"
                  />
                </div>

                <div className="cat-form-actions">
                  <button type="button" onClick={resetForm} className="cat-btn-cancel">Cancel</button>
                  <button type="submit" className="cat-btn-save" disabled={submitting}>
                    {submitting ? (
                      <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div>
                    ) : (editingCategory ? 'Update' : 'Save Category')}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon-box delete">
              <Trash2 size={32} />
            </div>
            <h3 className="modal-title">Delete Category?</h3>
            <p className="modal-text">This action cannot be undone. Any products assigned to this category might lose their category reference.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Cancel</button>
              <button className="modal-btn confirm delete" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div>
                ) : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
