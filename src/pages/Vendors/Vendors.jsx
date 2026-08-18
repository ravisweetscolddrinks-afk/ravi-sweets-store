import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  X, 
  Phone, 
  MapPin, 
  User, 
  Building2, 
  MessageSquare, 
  AlertCircle,
  Truck,
  FileText,
  CheckCircle2,
  ExternalLink
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
import './Vendors.css';

const Vendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    whatsappNumber: '',
    address: '',
    contactPerson: '',
    gstin: '',
    notes: ''
  });

  // Real-time Firestore sync
  useEffect(() => {
    const q = query(collection(db, 'vendors'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const vendorList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setVendors(vendorList);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching vendors:", error);
        toast.error("Failed to load vendors");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleOpenAdd = () => {
    setEditingVendor(null);
    setFormData({
      name: '',
      whatsappNumber: '',
      address: '',
      contactPerson: '',
      gstin: '',
      notes: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name || '',
      whatsappNumber: vendor.whatsappNumber || '',
      address: vendor.address || '',
      contactPerson: vendor.contactPerson || '',
      gstin: vendor.gstin || '',
      notes: vendor.notes || ''
    });
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVendor(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanName = formData.name.trim();
    const cleanWhatsapp = formData.whatsappNumber.trim().replace(/[^0-9+]/g, '');
    const cleanAddress = formData.address.trim();

    if (!cleanName) {
      toast.error("Vendor name is required");
      return;
    }

    if (!cleanWhatsapp) {
      toast.error("WhatsApp number is required");
      return;
    }

    if (!cleanAddress) {
      toast.error("Address is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: cleanName,
        whatsappNumber: cleanWhatsapp,
        address: cleanAddress,
        contactPerson: formData.contactPerson.trim(),
        gstin: formData.gstin.trim().toUpperCase(),
        notes: formData.notes.trim(),
        status: 'Active',
        updatedAt: serverTimestamp()
      };

      if (editingVendor) {
        await updateDoc(doc(db, 'vendors', editingVendor.id), payload);
        toast.success("Vendor updated successfully");
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'vendors'), payload);
        toast.success("Vendor added successfully");
      }

      handleCloseModal();
    } catch (error) {
      console.error("Error saving vendor:", error);
      toast.error(editingVendor ? "Failed to update vendor" : "Failed to add vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!showDeleteModal) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'vendors', showDeleteModal.id));
      toast.success("Vendor deleted successfully");
      setShowDeleteModal(null);
    } catch (error) {
      console.error("Error deleting vendor:", error);
      toast.error("Failed to delete vendor");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered vendors
  const filteredVendors = vendors.filter(vendor => {
    const q = searchQuery.toLowerCase();
    const nameMatch = vendor.name?.toLowerCase().includes(q);
    const phoneMatch = vendor.whatsappNumber?.toLowerCase().includes(q);
    const addrMatch = vendor.address?.toLowerCase().includes(q);
    const personMatch = vendor.contactPerson?.toLowerCase().includes(q);
    return nameMatch || phoneMatch || addrMatch || personMatch;
  });

  const getCleanPhone = (phone) => {
    if (!phone) return '';
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length === 10) return `91${digits}`;
    return digits;
  };

  return (
    <div className="vendors-container">
      {/* Header */}
      <div className="vendors-header">
        <div className="vendors-title-group">
          <h1>
            <Truck size={28} color="var(--primary-color)" />
            Vendors Management
          </h1>
          <p>Manage raw material suppliers, WhatsApp contacts, and procurement addresses</p>
        </div>

        <button className="vendors-add-btn" onClick={handleOpenAdd}>
          <Plus size={18} />
          Add Vendor
        </button>
      </div>

      {/* Stats Summary */}
      <div className="vendors-stats-grid">
        <div className="vendors-stat-card">
          <div className="vendors-stat-icon">
            <Truck size={24} />
          </div>
          <div className="vendors-stat-info">
            <span className="vendors-stat-label">Total Suppliers</span>
            <span className="vendors-stat-value">{vendors.length}</span>
          </div>
        </div>

        <div className="vendors-stat-card">
          <div className="vendors-stat-icon green">
            <CheckCircle2 size={24} />
          </div>
          <div className="vendors-stat-info">
            <span className="vendors-stat-label">Active Vendors</span>
            <span className="vendors-stat-value">{vendors.filter(v => v.status !== 'Inactive').length}</span>
          </div>
        </div>

        <div className="vendors-stat-card">
          <div className="vendors-stat-icon gold">
            <MessageSquare size={24} />
          </div>
          <div className="vendors-stat-info">
            <span className="vendors-stat-label">WhatsApp Connected</span>
            <span className="vendors-stat-value">{vendors.filter(v => !!v.whatsappNumber).length}</span>
          </div>
        </div>
      </div>

      {/* Toolbar / Search */}
      <div className="vendors-toolbar">
        <div className="vendors-search-wrapper">
          <Search size={18} className="vendors-search-icon" />
          <input
            type="text"
            className="vendors-search-input"
            placeholder="Search by vendor name, phone, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <span className="vendors-count-badge">
          Showing {filteredVendors.length} of {vendors.length} vendors
        </span>
      </div>

      {/* Vendors Grid */}
      {loading ? (
        <div className="vendors-empty-state">
          <div className="vendors-empty-icon">
            <Truck size={32} />
          </div>
          <h3>Loading Vendors...</h3>
          <p>Please wait while we fetch the latest supplier details from your database.</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="vendors-empty-state">
          <div className="vendors-empty-icon">
            <Truck size={32} />
          </div>
          <h3>No Vendors Found</h3>
          <p>
            {searchQuery 
              ? "No vendors match your search criteria. Try a different search." 
              : "You haven't added any vendors yet. Click 'Add Vendor' to register your first supplier."}
          </p>
          {!searchQuery && (
            <button className="vendors-add-btn" onClick={handleOpenAdd} style={{ marginTop: '8px' }}>
              <Plus size={18} />
              Add First Vendor
            </button>
          )}
        </div>
      ) : (
        <div className="vendors-grid">
          {filteredVendors.map((vendor) => {
            const cleanPhone = getCleanPhone(vendor.whatsappNumber);
            const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';

            return (
              <motion.div 
                key={vendor.id} 
                className="vendor-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div>
                  <div className="vendor-card-header">
                    <div className="vendor-avatar">
                      {vendor.name ? vendor.name.charAt(0).toUpperCase() : 'V'}
                    </div>
                    <div className="vendor-main-info">
                      <h3 className="vendor-name" title={vendor.name}>{vendor.name}</h3>
                      <span className="vendor-type-tag">Raw Material Supplier</span>
                    </div>
                    <div className="vendor-card-actions">
                      <button 
                        className="vendor-icon-btn" 
                        title="Edit Vendor"
                        onClick={() => handleOpenEdit(vendor)}
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        className="vendor-icon-btn delete" 
                        title="Delete Vendor"
                        onClick={() => setShowDeleteModal(vendor)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="vendor-card-body" style={{ marginTop: '16px' }}>
                    {vendor.contactPerson && (
                      <div className="vendor-detail-row">
                        <User size={15} className="vendor-detail-icon" />
                        <span className="vendor-detail-text">
                          <strong>Contact:</strong> {vendor.contactPerson}
                        </span>
                      </div>
                    )}

                    <div className="vendor-detail-row">
                      <MessageSquare size={15} className="vendor-detail-icon" />
                      <span className="vendor-detail-text">
                        <strong>WhatsApp:</strong> {vendor.whatsappNumber}
                      </span>
                    </div>

                    <div className="vendor-detail-row">
                      <MapPin size={15} className="vendor-detail-icon" />
                      <span className="vendor-detail-text address" title={vendor.address}>
                        {vendor.address}
                      </span>
                    </div>

                    {vendor.gstin && (
                      <div className="vendor-detail-row">
                        <FileText size={15} className="vendor-detail-icon" />
                        <span className="vendor-detail-text">
                          <strong>GSTIN:</strong> {vendor.gstin}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="vendor-card-footer">
                  <a 
                    href={waLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="vendor-whatsapp-btn"
                  >
                    <MessageSquare size={16} />
                    WhatsApp
                  </a>
                  {vendor.whatsappNumber && (
                    <a 
                      href={`tel:${vendor.whatsappNumber}`} 
                      className="vendor-call-btn"
                      title="Call Vendor"
                    >
                      <Phone size={16} />
                    </a>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Vendor Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="vendors-modal-overlay" onClick={handleCloseModal}>
            <motion.div 
              className="vendors-modal"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="vendors-modal-header">
                <h3 className="vendors-modal-title">
                  <Building2 size={20} color="var(--primary-color)" />
                  {editingVendor ? 'Edit Vendor Details' : 'Add New Vendor'}
                </h3>
                <button className="vendors-modal-close" onClick={handleCloseModal}>
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="vendors-modal-form">
                  <div className="vendor-form-group">
                    <label>Vendor Name <span>*</span></label>
                    <div className="vendor-input-with-icon">
                      <Building2 size={16} className="vendor-input-icon" />
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder="e.g. Sri Krishna Dairy & Ghee Traders"
                        className="vendor-form-input"
                        value={formData.name}
                        onChange={handleInputChange}
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="vendor-form-group">
                    <label>WhatsApp Number <span>*</span></label>
                    <div className="vendor-input-with-icon">
                      <MessageSquare size={16} className="vendor-input-icon" />
                      <input
                        type="tel"
                        name="whatsappNumber"
                        required
                        placeholder="e.g. 9876543210 or +91 9876543210"
                        className="vendor-form-input"
                        value={formData.whatsappNumber}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div className="vendor-form-group">
                    <label>Address <span>*</span></label>
                    <div className="vendor-input-with-icon">
                      <MapPin size={16} className="vendor-input-icon" style={{ top: '14px' }} />
                      <textarea
                        name="address"
                        required
                        placeholder="e.g. Shop #14, Main Bazar, Guntur Road, Chirala, AP"
                        className="vendor-form-textarea"
                        value={formData.address}
                        onChange={handleInputChange}
                        style={{ paddingLeft: '42px' }}
                      />
                    </div>
                  </div>

                  <div className="vendor-form-group">
                    <label>Contact Person (Optional)</label>
                    <div className="vendor-input-with-icon">
                      <User size={16} className="vendor-input-icon" />
                      <input
                        type="text"
                        name="contactPerson"
                        placeholder="e.g. Ramesh Kumar (Manager)"
                        className="vendor-form-input"
                        value={formData.contactPerson}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div className="vendor-form-group">
                    <label>GSTIN / Tax ID (Optional)</label>
                    <div className="vendor-input-with-icon">
                      <FileText size={16} className="vendor-input-icon" />
                      <input
                        type="text"
                        name="gstin"
                        placeholder="e.g. 37ABCDE1234F1Z5"
                        className="vendor-form-input"
                        value={formData.gstin}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>

                <div className="vendors-modal-footer">
                  <button 
                    type="button" 
                    className="vendor-cancel-btn" 
                    onClick={handleCloseModal}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="vendor-save-btn" 
                    disabled={submitting}
                  >
                    {submitting ? 'Saving...' : (editingVendor ? 'Update Vendor' : 'Save Vendor')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="vendors-modal-overlay" onClick={() => setShowDeleteModal(null)}>
            <motion.div 
              className="vendors-modal"
              style={{ maxWidth: '440px' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="vendor-delete-body">
                <div className="vendor-delete-icon-wrap">
                  <AlertCircle size={32} />
                </div>
                <h3 className="vendor-delete-title">Delete Vendor?</h3>
                <p className="vendor-delete-desc">
                  Are you sure you want to remove <strong>"{showDeleteModal.name}"</strong>? This supplier will no longer appear in your active vendors list.
                </p>
              </div>

              <div className="vendors-modal-footer" style={{ justifyContent: 'center' }}>
                <button 
                  type="button" 
                  className="vendor-cancel-btn"
                  onClick={() => setShowDeleteModal(null)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="vendor-delete-btn"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Vendors;
