import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  X, 
  UserPlus, 
  Phone, 
  MapPin, 
  Briefcase, 
  Home, 
  ShieldAlert,
  Search,
  MoreVertical,
  Trash2,
  Calendar,
  Eye,
  Edit2,
  AlertTriangle,
  IndianRupee
} from 'lucide-react';
import { db } from '../../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './Employees.css';

const Employees = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');


  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    salary: '',
    acceptedLeaves: '',
    address: '',
    city: '',
    state: '',
    emergencyContact: {
      relation: '',
      name: '',
      mobile: ''
    }
  });

  const fetchEmployees = async () => {
    try {
      const q = query(collection(db, 'employees'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const emps = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
    } catch (error) {
      console.error("Error fetching employees: ", error);
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('emergency_')) {
      const field = name.split('_')[1];
      setFormData(prev => ({
        ...prev,
        emergencyContact: {
          ...prev.emergencyContact,
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleNumberScroll = (e) => {
    e.target.blur();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.phone) {
      toast.error('First name and Phone are required');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'employees'), {
        ...formData,
        createdAt: new Date().toISOString()
      });
      toast.success('Employee added successfully!');
      setIsFormOpen(false);
      setFormData({
        firstName: '', lastName: '', phone: '', salary: '', acceptedLeaves: '', address: '', city: '', state: '',
        emergencyContact: { relation: '', name: '', mobile: '' }
      });
      fetchEmployees();
    } catch (error) {
      console.error("Error adding employee: ", error);
      toast.error('Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (e, emp) => {
    e.stopPropagation();
    setEmployeeToDelete(emp);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!employeeToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'employees', employeeToDelete.id));
      toast.success('Employee removed');
      setShowDeleteModal(false);
      setEmployeeToDelete(null);
      fetchEmployees();
    } catch (error) {
      toast.error('Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };


  const handleRowClick = (id) => {
    navigate(`/employees/${id}`);
  };

  const handleActionClick = (e, action, id) => {
    e.stopPropagation();
    if (action === 'view') navigate(`/employees/${id}`);
    if (action === 'edit') navigate(`/employees/edit/${id}`);
  };

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
    const phone = emp.phone || '';
    const empId = `EMP-${emp.id.slice(0, 5).toUpperCase()}`;
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || phone.includes(query) || empId.toLowerCase().includes(query);
  });

  return (
    <div className="emp-container">
      <div className="emp-header">
        <div>
          <h1 className="emp-title">Employee Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px' }}>
            {employees.length} Total Employees
          </p>
        </div>
        <button className="emp-add-btn" onClick={() => setIsFormOpen(!isFormOpen)}>
          {isFormOpen ? <><X size={18} /> Close Form</> : <><UserPlus size={18} /> Add Employee</>}
        </button>
      </div>

      <div className="emp-layout">
        <div className="emp-list-section">
          <div className="emp-search-wrapper">
            <Search size={18} className="emp-search-icon" />
            <input 
              type="text" 
              className="emp-search-input" 
              placeholder="Search employees by name, phone, ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="emp-table-wrapper">
            {loading ? (
              <div className="emp-empty-state"><div className="loader"></div></div>
            ) : filteredEmployees.length === 0 ? (
              <div className="emp-empty-state">
                <ShieldAlert size={48} style={{ opacity: 0.2, marginBottom: '15px' }} />
                <p>{employees.length === 0 ? 'No employees found. Click "Add Employee" to get started.' : 'No employees found matching your search.'}</p>
              </div>
            ) : (
              <table className="emp-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Phone</th>
                    <th>Salary</th>
                    <th>Leaves</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp) => (
                    <tr key={emp.id} onClick={() => handleRowClick(emp.id)}>
                      <td>
                        <div className="emp-name-cell">
                          <div className="emp-avatar-box">{emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}</div>
                          <div>
                            <div style={{ fontWeight: '700' }}>{emp.firstName} {emp.lastName}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>EMP-{emp.id.slice(0, 5).toUpperCase()}</div>
                          </div>
                        </div>
                      </td>
                      <td>{emp.phone}</td>
                      <td>
                        <div style={{ fontWeight: '600' }}>₹{emp.salary || '0'}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color="#06D6A0" />
                          <span>{emp.acceptedLeaves || 0} Days</span>
                        </div>
                      </td>
                      <td>
                        <div className="emp-actions-cell">
                          <button className="action-icon-btn view" onClick={(e) => handleActionClick(e, 'view', emp.id)}>
                            <Eye size={16} />
                          </button>
                          <button className="action-icon-btn edit" onClick={(e) => handleActionClick(e, 'edit', emp.id)}>
                            <Edit2 size={16} />
                          </button>
                          <button className="action-icon-btn delete" onClick={(e) => confirmDelete(e, emp)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isFormOpen && (
            <motion.div 
              className="emp-form-section"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="emp-form-header">
                <h3>Add New Employee</h3>
                <button className="emp-close-circle" onClick={() => setIsFormOpen(false)}><X size={18} /></button>
              </div>

              <form onSubmit={handleSubmit} className="emp-data-form">
                <div className="emp-group-label">Personal Information</div>
                <div className="emp-form-row">
                  <div className="emp-input-group">
                    <label className="emp-input-label">First Name</label>
                    <input type="text" name="firstName" className="emp-text-input" value={formData.firstName} onChange={handleInputChange} placeholder="John" required />
                  </div>
                  <div className="emp-input-group">
                    <label className="emp-input-label">Last Name</label>
                    <input type="text" name="lastName" className="emp-text-input" value={formData.lastName} onChange={handleInputChange} placeholder="Doe" />
                  </div>
                </div>

                <div className="emp-form-row">
                  <div className="emp-input-group">
                    <label className="emp-input-label">Phone Number</label>
                    <input type="tel" name="phone" className="emp-text-input" value={formData.phone} onChange={handleInputChange} placeholder="+91 00000 00000" required />
                  </div>
                  <div className="emp-input-group">
                    <label className="emp-input-label">Salary (Monthly)</label>
                    <input type="number" name="salary" className="emp-text-input" value={formData.salary} onChange={handleInputChange} onWheel={handleNumberScroll} placeholder="₹ 25,000" />
                  </div>
                </div>

                <div className="emp-form-row">
                  <div className="emp-input-group">
                    <label className="emp-input-label">Accepted Leaves</label>
                    <input type="number" name="acceptedLeaves" className="emp-text-input" value={formData.acceptedLeaves} onChange={handleInputChange} onWheel={handleNumberScroll} placeholder="12" />
                  </div>
                  <div className="emp-input-group">
                    <label className="emp-input-label">City</label>
                    <input type="text" name="city" className="emp-text-input" value={formData.city} onChange={handleInputChange} placeholder="Hyderabad" />
                  </div>
                </div>

                <div className="emp-input-group">
                  <label className="emp-input-label">Address</label>
                  <input type="text" name="address" className="emp-text-input" value={formData.address} onChange={handleInputChange} placeholder="Street, Area" />
                </div>

                <div className="emp-input-group">
                  <label className="emp-input-label">State</label>
                  <input type="text" name="state" className="emp-text-input" value={formData.state} onChange={handleInputChange} placeholder="Telangana" />
                </div>

                <div className="emp-group-label">Emergency Contact</div>
                <div className="emp-form-row">
                  <div className="emp-input-group">
                    <label className="emp-input-label">Contact Name</label>
                    <input type="text" name="emergency_name" className="emp-text-input" value={formData.emergencyContact.name} onChange={handleInputChange} placeholder="Relation Name" />
                  </div>
                  <div className="emp-input-group">
                    <label className="emp-input-label">Relation</label>
                    <input type="text" name="emergency_relation" className="emp-text-input" value={formData.emergencyContact.relation} onChange={handleInputChange} placeholder="e.g. Spouse" />
                  </div>
                </div>
                <div className="emp-input-group">
                  <label className="emp-input-label">Contact Mobile</label>
                  <input type="tel" name="emergency_mobile" className="emp-text-input" value={formData.emergencyContact.mobile} onChange={handleInputChange} placeholder="+91 00000 00000" />
                </div>

                <button type="submit" className="emp-save-btn" disabled={submitting} style={{ marginTop: '10px' }}>
                  {submitting ? <div className="loader"></div> : <><UserPlus size={18} /> Save Employee</>}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="modal-overlay">
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-icon-box">
                <AlertTriangle size={32} />
              </div>
              <h3 className="modal-title">Delete Employee?</h3>
              <p className="modal-text">
                Are you sure you want to delete <strong>{employeeToDelete?.firstName} {employeeToDelete?.lastName}</strong>? This action cannot be undone.
              </p>
              <div className="modal-actions">
                <button className="modal-btn cancel" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancel</button>
                <button className="modal-btn confirm" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Delete Now'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Employees;
