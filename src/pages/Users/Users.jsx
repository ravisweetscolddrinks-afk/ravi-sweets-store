import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  UserCog, 
  X, 
  Store, 
  Factory, 
  Package,
  ShieldCheck,
  Smartphone,
  Trash2,
  Edit,
  User
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
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Users.css';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data for access selection
  const [stores, setStores] = useState([]);
  const [mUnits, setMUnits] = useState([]);
  const [pUnits, setPUnits] = useState([]);

  // Form State
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [selectedStores, setSelectedStores] = useState([]);
  const [selectedMUnits, setSelectedMUnits] = useState([]);
  const [selectedPUnits, setSelectedPUnits] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [employeeAccess, setEmployeeAccess] = useState(false);
  const [individualAccess, setIndividualAccess] = useState(false);

  useEffect(() => {
    // Fetch users
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Fetch access data
    const fetchAccessData = async () => {
      const [sSnap, mSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),
        getDocs(query(collection(db, 'manufacturing_units'), orderBy('name', 'asc'))),
        getDocs(query(collection(db, 'packing_units'), orderBy('name', 'asc')))
      ]);
      setStores(sSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setMUnits(mSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
      setPUnits(pSnap.docs.map(d => ({ id: d.id, name: d.data().name })));
    };
    fetchAccessData();

    return () => unsubscribe();
  }, []);

  const resetForm = () => {
    setName('');
    setMobile('');
    setSelectedStores([]);
    setSelectedMUnits([]);
    setSelectedPUnits([]);
    setEmployeeAccess(false);
    setIndividualAccess(false);
    setEditingId(null);
  };

  const handleToggleAccess = (list, setList, id) => {
    if (list.includes(id)) {
      setList(list.filter(i => i !== id));
    } else {
      setList([...list, id]);
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (!name || !mobile) return toast.error('Name and Mobile Number are required');
    if (mobile.length < 10) return toast.error('Enter valid 10 digit mobile number');

    setSubmitting(true);
    try {
      const userData = {
        name,
        mobileNumber: mobile,
        role: 'user', // Default non-super admin role
        access: {
          stores: selectedStores,
          mUnits: selectedMUnits,
          pUnits: selectedPUnits,
          employees: employeeAccess,
          individual: individualAccess
        },
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'users', editingId), userData);
        toast.success('User updated successfully');
      } else {
        userData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users'), userData);
        toast.success('User created successfully');
      }
      
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving user:', error);
      toast.error('Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user) => {
    setName(user.name);
    setMobile(user.mobileNumber);
    setSelectedStores(user.access?.stores || []);
    setSelectedMUnits(user.access?.mUnits || []);
    setSelectedPUnits(user.access?.pUnits || []);
    setEmployeeAccess(user.access?.employees || false);
    setIndividualAccess(user.access?.individual || false);
    setEditingId(user.id);
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await deleteDoc(doc(db, 'users', id));
        toast.success('User deleted');
      } catch (error) {
        toast.error('Failed to delete user');
      }
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.mobileNumber.includes(searchQuery)
  );

  return (
    <div className="usrm-container">
      <div className="usrm-header">
        <div className="usrm-header-info">
          <h1>Users & Roles</h1>
          <p>Manage staff access to Stores, Manufacturing, and Packing units</p>
        </div>
        <button className="usrm-add-btn" onClick={() => { resetForm(); setShowAddModal(true); }}>
          <Plus size={20} /> Add User
        </button>
      </div>

      <div className="usrm-list-card">
        <div className="usrm-search-bar">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Search by name or mobile number..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <table className="usrm-table">
          <thead>
            <tr>
              <th>User Name</th>
              <th>Mobile Number</th>
              <th>Store Access</th>
              <th>Manufacturing Access</th>
              <th>Packing Access</th>
              <th>Special Access</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="usrm-empty"><div className="loader"></div></td></tr>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="usrm-user-cell">
                      <div className="avatar"><UserCog size={18} /></div>
                      <span className="name">{user.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="usrm-phone-cell">
                      <Smartphone size={14} />
                      {user.mobileNumber}
                    </div>
                  </td>
                  <td><span className="usrm-access-badge">{user.access?.stores?.length || 0} Stores</span></td>
                  <td><span className="usrm-access-badge">{user.access?.mUnits?.length || 0} Units</span></td>
                  <td><span className="usrm-access-badge">{user.access?.pUnits?.length || 0} Units</span></td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      {user.access?.employees && <span className="usrm-access-badge" style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>Staff Directory</span>}
                      {user.access?.individual && <span className="usrm-access-badge" style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd' }}>My Profile</span>}
                      {!user.access?.employees && !user.access?.individual && <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>None</span>}
                    </div>
                  </td>
                  <td>
                    <div className="usrm-actions">
                      <button className="edit-btn" onClick={() => handleEdit(user)}><Edit size={16} /></button>
                      <button className="delete-btn" onClick={() => handleDelete(user.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="6" className="usrm-empty">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="modal-overlay">
            <motion.div 
              className="custom-modal usrm-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="usrm-modal-header">
                <h2>{editingId ? 'Edit User Access' : 'Add New User'}</h2>
                <button onClick={() => setShowAddModal(false)} className="close-btn"><X size={24} /></button>
              </div>

              <form onSubmit={saveUser} className="usrm-modal-body">
                <div className="usrm-form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Rahul Sharma" 
                      value={name} 
                      onChange={e => setName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Mobile Number (For OTP Login)</label>
                    <input 
                      type="tel" 
                      placeholder="e.g. 9876543210" 
                      value={mobile} 
                      onChange={e => setMobile(e.target.value)} 
                      required 
                      pattern="[0-9]{10}"
                      maxLength="10"
                    />
                  </div>
                </div>

                <div className="usrm-access-section">
                  <h3><ShieldCheck size={18} /> Configure Module Access</h3>
                  <p>Select which units this user is allowed to manage.</p>

                  <div className="usrm-access-grid">
                    {/* Stores */}
                    <div className="usrm-access-card">
                      <div className="usrm-acard-header">
                        <Store size={18} />
                        <h4>Stores</h4>
                      </div>
                      <div className="usrm-acard-list">
                        {stores.length > 0 ? stores.map(store => (
                          <label key={store.id} className="usrm-checkbox-row">
                            <input 
                              type="checkbox" 
                              checked={selectedStores.includes(store.id)}
                              onChange={() => handleToggleAccess(selectedStores, setSelectedStores, store.id)}
                            />
                            <span>{store.name}</span>
                          </label>
                        )) : <div className="no-data">No stores available</div>}
                      </div>
                    </div>

                    {/* Manufacturing Units */}
                    <div className="usrm-access-card">
                      <div className="usrm-acard-header">
                        <Factory size={18} />
                        <h4>Manufacturing Units</h4>
                      </div>
                      <div className="usrm-acard-list">
                        {mUnits.length > 0 ? mUnits.map(unit => (
                          <label key={unit.id} className="usrm-checkbox-row">
                            <input 
                              type="checkbox" 
                              checked={selectedMUnits.includes(unit.id)}
                              onChange={() => handleToggleAccess(selectedMUnits, setSelectedMUnits, unit.id)}
                            />
                            <span>{unit.name}</span>
                          </label>
                        )) : <div className="no-data">No manufacturing units</div>}
                      </div>
                    </div>

                    {/* Packing Units */}
                    <div className="usrm-access-card">
                      <div className="usrm-acard-header">
                        <Package size={18} />
                        <h4>Packing Units</h4>
                      </div>
                      <div className="usrm-acard-list">
                        {pUnits.length > 0 ? pUnits.map(unit => (
                          <label key={unit.id} className="usrm-checkbox-row">
                            <input 
                              type="checkbox" 
                              checked={selectedPUnits.includes(unit.id)}
                              onChange={() => handleToggleAccess(selectedPUnits, setSelectedPUnits, unit.id)}
                            />
                            <span>{unit.name}</span>
                          </label>
                        )) : <div className="no-data">No packing units</div>}
                      </div>
                    </div>

                    {/* Employee Operations Portal */}
                    <div className="usrm-access-card" style={{ background: '#faf5ff', border: '1.5px dashed #c084fc' }}>
                      <div className="usrm-acard-header" style={{ background: '#f3e8ff', color: '#6b21a8' }}>
                        <ShieldCheck size={18} />
                        <h4>Staff & Timesheets</h4>
                      </div>
                      <div className="usrm-acard-list" style={{ padding: '15px' }}>
                        <label className="usrm-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={employeeAccess}
                            onChange={() => setEmployeeAccess(!employeeAccess)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6' }}>Allow view-only staff list & attendance logging</span>
                        </label>
                      </div>
                    </div>

                    {/* Individual Portal (My Profile) */}
                    <div className="usrm-access-card" style={{ background: '#f5f3ff', border: '1.5px dashed #a855f7' }}>
                      <div className="usrm-acard-header" style={{ background: '#eff6ff', color: '#4f46e5' }}>
                        <User size={18} />
                        <h4>Individual Portal (My Profile)</h4>
                      </div>
                      <div className="usrm-acard-list" style={{ padding: '15px' }}>
                        <label className="usrm-checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={individualAccess}
                            onChange={() => setIndividualAccess(!individualAccess)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: '600', color: '#4f46e5' }}>Allow viewing personal profile & advances in read-only portal</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="usrm-modal-footer">
                  <button type="button" className="btn-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn-save" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save User Access'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Users;
