import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  MapPin, 
  Building2, 
  MoreVertical, 
  Edit, 
  Trash2, 
  X,
  Factory,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './ManufacturingUnits.css';

const ManufacturingUnits = () => {
  const navigate = useNavigate();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);


  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'manufacturing_units'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unitData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUnits(unitData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUnit) {
        await updateDoc(doc(db, 'manufacturing_units', editingUnit.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Unit updated successfully");
      } else {
        await addDoc(collection(db, 'manufacturing_units'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        toast.success("Manufacturing unit added successfully");
      }
      resetForm();
    } catch (error) {
      toast.error(editingUnit ? "Failed to update unit" : "Failed to add unit");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', address: '', city: '', state: '' });
    setShowAddForm(false);
    setEditingUnit(null);
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name,
      address: unit.address,
      city: unit.city,
      state: unit.state
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'manufacturing_units', showDeleteModal));
      toast.success("Unit deleted successfully");
      setShowDeleteModal(null);
    } catch (error) {
      toast.error("Failed to delete unit");
    } finally {
      setIsDeleting(false);
    }
  };


  const filteredUnits = units.filter(unit => 
    unit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    unit.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mu-container">
      <div className="mu-header">
        <div className="mu-header-info">
          <h1>Manufacturing Units</h1>
          <p>Manage your production facilities and factory locations</p>
        </div>
        {!showAddForm && (
          <button className="mu-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add Unit
          </button>
        )}
      </div>

      <div className="mu-content-layout">
        <div className={`mu-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="mu-search-bar">
            <Search size={18} className="mu-search-icon" />
            <input 
              type="text" 
              placeholder="Search by name or city..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="mu-grid">
            {loading ? (
              <div className="mu-loader-container"><div className="loader"></div></div>
            ) : filteredUnits.length > 0 ? (
              filteredUnits.map(unit => (
                  <div 
                    key={unit.id} 
                    className="mu-unit-card"
                    onClick={() => navigate(`/manufacturing/${unit.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="mu-card-header">
                      <div className="mu-unit-icon"><Factory size={20} /></div>
                      <div className="mu-unit-actions">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(unit); }} className="mu-action-btn edit"><Edit size={16} /></button>
                        <button onClick={(e) => { e.stopPropagation(); setShowDeleteModal(unit.id); }} className="mu-action-btn delete"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="mu-unit-info">
                      <h3>{unit.name}</h3>
                      <div className="mu-info-item">
                        <MapPin size={14} />
                        <span>{unit.city}, {unit.state}</span>
                      </div>
                      <div className="mu-info-item">
                        <Building2 size={14} />
                        <span className="mu-address-text">{unit.address}</span>
                      </div>
                    </div>
                    <div className="mu-card-footer">
                      <span className="mu-status-badge">Active</span>
                      <button className="mu-view-details">Details <ArrowRight size={14} /></button>
                    </div>
                  </div>
              ))
            ) : (
              <div className="mu-empty-state">
                <Factory size={48} />
                <h3>No Units Found</h3>
                <p>Start by adding your first manufacturing facility</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="mu-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="mu-sidebar-header">
                <h2>{editingUnit ? 'Edit Unit' : 'Add New Unit'}</h2>
                <button onClick={resetForm} className="mu-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="mu-form">
                <div className="mu-input-group">
                  <label>Unit Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Hyderabad Main Unit"
                    required 
                  />
                </div>
                <div className="mu-input-group">
                  <label>Full Address</label>
                  <textarea 
                    name="address" 
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter street address..."
                    required 
                  />
                </div>
                <div className="mu-form-row">
                  <div className="mu-input-group">
                    <label>City</label>
                    <input 
                      type="text" 
                      name="city" 
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="City"
                      required 
                    />
                  </div>
                  <div className="mu-input-group">
                    <label>State</label>
                    <input 
                      type="text" 
                      name="state" 
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="State"
                      required 
                    />
                  </div>
                </div>

                <div className="mu-form-actions">
                  <button type="button" onClick={resetForm} className="mu-btn-cancel">Cancel</button>
                  <button type="submit" className="mu-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : (editingUnit ? 'Update Unit' : 'Save Unit')}
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
            <h3 className="modal-title">Delete Unit?</h3>
            <p className="modal-text">This action cannot be undone. All data related to this manufacturing unit will be permanently removed.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Cancel</button>
              <button className="modal-btn confirm delete" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManufacturingUnits;
