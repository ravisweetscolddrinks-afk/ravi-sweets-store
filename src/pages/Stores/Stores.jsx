import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { 
  Plus, 
  Search, 
  MapPin, 
  Phone, 
  Navigation, 
  Edit, 
  Trash2, 
  X,
  Store,
  Map as MapIcon,
  Globe
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
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Stores.css';

const Stores = () => {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    latitude: '',
    longitude: ''
  });

  // Fetch Stores
  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStores(storeData);
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
      const storeData = {
        ...formData,
        updatedAt: serverTimestamp()
      };

      if (editingStore) {
        await updateDoc(doc(db, 'stores', editingStore.id), storeData);
        toast.success("Store updated successfully");
      } else {
        await addDoc(collection(db, 'stores'), {
          ...storeData,
          createdAt: serverTimestamp()
        });
        toast.success("New store added successfully");
      }
      resetForm();
    } catch (error) {
      console.error("Error saving store:", error);
      toast.error("Failed to save store details");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      latitude: '',
      longitude: ''
    });
    setShowAddForm(false);
    setEditingStore(null);
  };

  const handleEdit = (store) => {
    setEditingStore(store);
    setFormData({
      name: store.name,
      phone: store.phone,
      address: store.address,
      city: store.city,
      state: store.state,
      latitude: store.latitude || '',
      longitude: store.longitude || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'stores', showDeleteModal));
      toast.success("Store deleted successfully");
      setShowDeleteModal(null);
    } catch (error) {
      toast.error("Failed to delete store");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredStores = stores.filter(store => 
    store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    store.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="stores-container">
      <div className="stores-header">
        <div className="stores-header-info">
          <h1>Retail Outlets</h1>
          <p>Manage store locations, contact info, and coordinates</p>
        </div>
        {!showAddForm && (
          <button className="stores-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add New Store
          </button>
        )}
      </div>

      <div className="stores-content-layout">
        <div className={`stores-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="stores-search-bar">
            <Search size={18} className="stores-search-icon" />
            <input 
              type="text" 
              placeholder="Search by store name or city..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="stores-grid">
            {loading ? (
              <div className="stores-empty-state"><div className="loader"></div></div>
            ) : filteredStores.length > 0 ? (
              filteredStores.map(store => (
                <div key={store.id} className="store-card" onClick={() => navigate(`/stores/${store.id}`)} style={{ cursor: 'pointer' }}>
                  <div className="store-card-header">
                    <div className="store-icon-box">
                      <Store size={24} />
                    </div>
                    <div className="store-card-actions">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(store); }} className="store-mini-btn edit"><Edit size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setShowDeleteModal(store.id); }} className="store-mini-btn delete"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="store-card-body">
                    <h3>{store.name}</h3>
                    <div className="store-info-item">
                      <Phone size={14} />
                      <span>{store.phone}</span>
                    </div>
                    <div className="store-info-item">
                      <MapPin size={14} />
                      <span>{store.address}</span>
                    </div>
                    <div className="store-info-item">
                      <Navigation size={14} />
                      <span>{store.city}, {store.state}</span>
                    </div>
                    {(store.latitude && store.longitude) && (
                      <div className="store-geo-tag">
                        <span>Lat: {store.latitude}</span>
                        <span>Long: {store.longitude}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="stores-empty-state">
                <div className="empty-icon-circle">
                  <Store size={32} />
                </div>
                <h3>No Stores Found</h3>
                <p>Register your first retail outlet to start managing locations.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="stores-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="stores-sidebar-header">
                <h2>{editingStore ? 'Edit Store' : 'Add New Store'}</h2>
                <button onClick={resetForm} className="stores-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="stores-form">
                <div className="stores-input-group">
                  <label>Store Name</label>
                  <input 
                    type="text" 
                    name="name" 
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Ravi Sweets Main Branch"
                    required 
                  />
                </div>

                <div className="stores-input-group">
                  <label>Contact Number</label>
                  <input 
                    type="tel" 
                    name="phone" 
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="+91 00000 00000"
                    required 
                  />
                </div>

                <div className="stores-input-group">
                  <label>Street Address</label>
                  <textarea 
                    name="address" 
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter full address..."
                    required 
                  />
                </div>

                <div className="stores-form-row">
                  <div className="stores-input-group">
                    <label>City</label>
                    <input type="text" name="city" value={formData.city} onChange={handleInputChange} placeholder="City" required />
                  </div>
                  <div className="stores-input-group">
                    <label>State</label>
                    <input type="text" name="state" value={formData.state} onChange={handleInputChange} placeholder="State" required />
                  </div>
                </div>

                <div className="stores-form-row">
                  <div className="stores-input-group">
                    <label>Latitude</label>
                    <input type="text" name="latitude" value={formData.latitude} onChange={handleInputChange} placeholder="17.3850" />
                  </div>
                  <div className="stores-input-group">
                    <label>Longitude</label>
                    <input type="text" name="longitude" value={formData.longitude} onChange={handleInputChange} placeholder="78.4867" />
                  </div>
                </div>

                <div className="stores-form-actions">
                  <button type="button" onClick={resetForm} className="stores-btn-cancel">Cancel</button>
                  <button type="submit" className="stores-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : 'Save Store'}
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
            <h3 className="modal-title">Delete Store?</h3>
            <p className="modal-text">Are you sure you want to remove this store? This action cannot be undone.</p>
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

export default Stores;
