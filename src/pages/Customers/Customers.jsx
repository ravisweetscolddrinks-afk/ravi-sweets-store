import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  MapPin, 
  User, 
  Phone,
  Edit, 
  Trash2, 
  X,
  Users,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import './Customers.css';

const Customers = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    mobileNumber: '',
    address: '',
    city: '',
    state: '',
    isB2B: false,
    businessName: '',
    gstNumber: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customerData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(customerData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.isB2B && (!formData.businessName || !formData.gstNumber)) {
      toast.error("Business Name and GST Number are required for B2B customers");
      return;
    }
    setSubmitting(true);
    try {
      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.id), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Customer updated successfully");
      } else {
        await addDoc(collection(db, 'customers'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        toast.success("Customer added successfully");
      }
      resetForm();
    } catch (error) {
      toast.error(editingCustomer ? "Failed to update customer" : "Failed to add customer");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ 
      firstName: '', 
      lastName: '', 
      mobileNumber: '', 
      address: '', 
      city: '', 
      state: '',
      isB2B: false,
      businessName: '',
      gstNumber: '' 
    });
    setShowAddForm(false);
    setEditingCustomer(null);
  };

  const handleEdit = (e, customer) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setFormData({
      firstName: customer.firstName,
      lastName: customer.lastName,
      mobileNumber: customer.mobileNumber,
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      isB2B: customer.isB2B || false,
      businessName: customer.businessName || '',
      gstNumber: customer.gstNumber || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'customers', showDeleteModal));
      toast.success("Customer deleted successfully");
      setShowDeleteModal(null);
    } catch (error) {
      toast.error("Failed to delete customer");
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteModal = (e, id) => {
    e.stopPropagation();
    setShowDeleteModal(id);
  };

  const filteredCustomers = customers.filter(customer => 
    (customer.firstName + ' ' + customer.lastName).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.businessName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.mobileNumber.includes(searchQuery)
  );

  return (
    <div className="cust-container">
      <div className="cust-header">
        <div className="cust-header-info">
          <h1>Customers</h1>
          <p>Manage your customer database and contact information</p>
        </div>
        {!showAddForm && (
          <button className="cust-add-btn" onClick={() => setShowAddForm(true)}>
            <Plus size={20} /> Add Customer
          </button>
        )}
      </div>

      <div className="cust-content-layout">
        <div className={`cust-list-section ${showAddForm ? 'shrink' : 'full'}`}>
          <div className="cust-search-bar">
            <Search size={18} className="cust-search-icon" />
            <input 
              type="text" 
              placeholder="Search by name or mobile..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="cust-grid">
            {loading ? (
              <div className="cust-loader-container"><div className="loader" style={{ borderBottomColor: 'var(--primary-color)' }}></div></div>
            ) : filteredCustomers.length > 0 ? (
              filteredCustomers.map(customer => (
                <div 
                  key={customer.id} 
                  className="cust-card"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="cust-card-header">
                    <div className="cust-icon"><User size={20} /></div>
                    <div className="cust-actions">
                      <button onClick={(e) => handleEdit(e, customer)} className="cust-action-btn edit"><Edit size={16} /></button>
                      <button onClick={(e) => openDeleteModal(e, customer.id)} className="cust-action-btn delete"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="cust-info">
                    <h3>{customer.firstName} {customer.lastName}</h3>
                    <div className="cust-info-item">
                      <Phone size={14} />
                      <span>{customer.mobileNumber}</span>
                    </div>
                    {customer.city && (
                      <div className="cust-info-item">
                        <MapPin size={14} />
                        <span>{customer.city}, {customer.state}</span>
                      </div>
                    )}
                  </div>
                  <div className="cust-card-footer">
                    <span 
                      className="cust-type-badge" 
                      style={customer.isB2B ? { background: '#E0F2FE', color: '#0369A1' } : {}}
                    >
                      {customer.isB2B ? 'B2B' : 'Regular'}
                    </span>
                    <button className="cust-view-details">History <ArrowRight size={14} /></button>
                  </div>
                </div>
              ))
            ) : (
              <div className="cust-empty-state">
                <Users size={48} />
                <h3>No Customers Found</h3>
                <p>Start by adding your first customer to the database</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div 
              className="cust-form-sidebar"
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
            >
              <div className="cust-sidebar-header">
                <h2>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</h2>
                <button onClick={resetForm} className="cust-close-btn"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="cust-form">
                <div className="cust-form-row">
                  <div className="cust-input-group">
                    <label>First Name <span>*</span></label>
                    <input 
                      type="text" 
                      name="firstName" 
                      value={formData.firstName}
                      onChange={handleInputChange}
                      placeholder="Enter first name"
                      required 
                    />
                  </div>
                  <div className="cust-input-group">
                    <label>Last Name <span>*</span></label>
                    <input 
                      type="text" 
                      name="lastName" 
                      value={formData.lastName}
                      onChange={handleInputChange}
                      placeholder="Enter last name"
                      required 
                    />
                  </div>
                </div>
                
                 <div className="cust-input-group">
                  <label>Mobile Number <span>*</span></label>
                  <input 
                    type="tel" 
                    name="mobileNumber" 
                    value={formData.mobileNumber}
                    onChange={handleInputChange}
                    placeholder="Enter 10 digit mobile"
                    required 
                  />
                </div>

                <div className="cust-input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', margin: '5px 0' }}>
                  <input 
                    type="checkbox" 
                    name="isB2B" 
                    id="isB2B" 
                    checked={formData.isB2B || false} 
                    onChange={handleInputChange}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                  />
                  <label htmlFor="isB2B" style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}>Is B2B Customer?</label>
                </div>

                {formData.isB2B && (
                  <>
                    <div className="cust-input-group">
                      <label>Business Name <span>*</span></label>
                      <input 
                        type="text" 
                        name="businessName" 
                        value={formData.businessName || ''}
                        onChange={handleInputChange}
                        placeholder="Enter business name"
                        required 
                      />
                    </div>
                    <div className="cust-input-group">
                      <label>GST Number <span>*</span></label>
                      <input 
                        type="text" 
                        name="gstNumber" 
                        value={formData.gstNumber || ''}
                        onChange={handleInputChange}
                        placeholder="Enter 15-digit GST number"
                        required 
                      />
                    </div>
                  </>
                )}

                <div className="cust-input-group">
                  <label>Full Address</label>
                  <textarea 
                    name="address" 
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter street address..."
                  />
                </div>

                <div className="cust-form-row">
                  <div className="cust-input-group">
                    <label>City</label>
                    <input 
                      type="text" 
                      name="city" 
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="City"
                    />
                  </div>
                  <div className="cust-input-group">
                    <label>State</label>
                    <input 
                      type="text" 
                      name="state" 
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="State"
                    />
                  </div>
                </div>

                <div className="cust-form-actions">
                  <button type="button" onClick={resetForm} className="cust-btn-cancel">Cancel</button>
                  <button type="submit" className="cust-btn-save" disabled={submitting}>
                    {submitting ? <div className="loader"></div> : (editingCustomer ? 'Update' : 'Save Customer')}
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
            <h3 className="modal-title">Delete Customer?</h3>
            <p className="modal-text">This action cannot be undone. All data related to this customer will be permanently removed.</p>
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

export default Customers;
