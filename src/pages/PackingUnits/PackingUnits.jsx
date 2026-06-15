import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  MapPin, 
  Building2, 
  Edit, 
  Trash2, 
  X,
  Package,
  ArrowRight
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
import './PackingUnits.css';

const PackingUnits = () => {
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
    const q = query(collection(db, 'packing_units'), orderBy('createdAt', 'desc'));
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
        await updateDoc(doc(db, 'packing_units', editingUnit.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Unit updated successfully");
      } else {
        await addDoc(collection(db, 'packing_units'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        toast.success("Packing unit added successfully");
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
      await deleteDoc(doc(db, 'packing_units', showDeleteModal));
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
    <div className="pu-container">
      <div className="pu-header">
        <div className="pu-header-info">
          <h1>Packing Units</h1>
          <p>Manage your packaging centers and distribution hubs</p>
        </div>
        {!showAddForm && (
          <button className="pu-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add Unit
          </button>
        )}
      </div>

      <div className="pu-content-layout">
        <div className={`pu-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="pu-search-bar">
            <Search size={18} className="pu-search-icon" />
            <input 
              type="text" 
              placeholder="Search packing units..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="pu-grid">
            {loading ? (
              <div className="pu-loader-container"><div className="loader"></div></div>
            ) : filteredUnits.length > 0 ? (
              filteredUnits.map(unit => (
                <div key={unit.id} className="pu-unit-card">
                  <div className="pu-card-header">
                    <div className="pu-unit-icon"><Package size={20} /></div>
                    <div className="pu-unit-actions">
                      <button onClick={() => handleEdit(unit)} className="pu-action-btn edit"><Edit size={16} /></button>
                      <button onClick={() => setShowDeleteModal(unit.id)} className="pu-action-btn delete"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="pu-unit-info">
                    <h3>{unit.name}</h3>
                    <div className="pu-info-item">
                      <MapPin size={14} />
                      <span>{unit.city}, {unit.state}</span>
                    </div>
                    <div className="pu-info-item">
                      <Building2 size={14} />
                      <span className="pu-address-text">{unit.address}</span>
                    </div>
                  </div>
                  <div className="pu-card-footer">
                    <span className="pu-status-badge">Operational</span>
                    <button className="pu-view-details" onClick={() => navigate('/packing/' + unit.id)}>Hub Details <ArrowRight size={14} /></button>
                  </div>
                </div>
              ))
            ) : (
              <div className="pu-empty-state">
                <Package size={48} />
                <h3>No Packing Units</h3>
                <p>Register your first packing or distribution center</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="pu-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="pu-sidebar-header">
                <h2>{editingUnit ? 'Edit Packing Unit' : 'Add Packing Unit'}</h2>
                <button onClick={resetForm} className="pu-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="pu-form">
                <div className="pu-input-group">
                  <label>Unit Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Hyderabad Packing Hub"
                    required 
                  />
                </div>
                <div className="pu-input-group">
                  <label>Full Address</label>
                  <textarea 
                    name="address" 
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter full address..."
                    required 
                  />
                </div>
                <div className="pu-form-row">
                  <div className="pu-input-group">
                    <label>City</label>
                    <input type="text" name="city" value={formData.city} onChange={handleInputChange} placeholder="City" required />
                  </div>
                  <div className="pu-input-group">
                    <label>State</label>
                    <input type="text" name="state" value={formData.state} onChange={handleInputChange} placeholder="State" required />
                  </div>
                </div>

                <div className="pu-form-actions">
                  <button type="button" onClick={resetForm} className="pu-btn-cancel">Cancel</button>
                  <button type="submit" className="pu-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : (editingUnit ? 'Update' : 'Save Unit')}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="custom-modal">
            <div className="modal-icon-box delete"><Trash2 size={32} /></div>
            <h3 className="modal-title">Remove Packing Unit?</h3>
            <p className="modal-text">Permanently delete this packing unit? This will remove all associated logs and data.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowDeleteModal(null)} disabled={isDeleting}>Go Back</button>
              <button className="modal-btn confirm delete" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Yes, Remove'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default PackingUnits;
