import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IndianRupee,
  ShieldAlert,
  Edit,
  Save,
  Clock,
  FileText,
  CreditCard,
  Plus,
  PieChart,
  X,
  History,
  Briefcase,
  MoreVertical,
  ChevronDown
} from 'lucide-react';
import { db } from '../../config/firebase';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  getDocs,
  query, 
  where, 
  onSnapshot, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './EmployeeDetails.css';

const EmployeeDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Attendance & Leaves States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRecords, setLeaveRecords] = useState([]);

  // Advance States
  const [advances, setAdvances] = useState([]);
  const [showAdvModal, setShowAdvModal] = useState(false);
  const [advType, setAdvType] = useState('short_term');
  const [advFormData, setAdvFormData] = useState({
    amount: '',
    reason: '',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  });

  // Instalment States
  const [showInstModal, setShowInstModal] = useState(false);
  const [selectedAdv, setSelectedAdv] = useState(null);
  const [instFormData, setInstFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  });

  // History States
  const [showHistModal, setShowHistModal] = useState(false);
  const [instalments, setInstalments] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        const docRef = doc(db, 'employees', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setEmployee(data);
          setEditData(data);
        }
      } catch (error) {
        console.error("Error fetching employee details:", error);
        toast.error("Failed to load employee data");
      } finally {
        setLoading(false);
      }
    };
    fetchEmployee();

    // Real-time advances
    const q = query(
      collection(db, 'advances'), 
      where('employeeId', '==', id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const advs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      advs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });
      setAdvances(advs);
    }, (error) => {
      console.error("Advances sub error:", error);
    });

    // Real-time attendance
    const qAttendance = query(
      collection(db, 'attendance'),
      where('employeeId', '==', id)
    );
    const unsubscribeAttendance = onSnapshot(qAttendance, (snapshot) => {
      const records = snapshot.docs.map(doc => doc.data());
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      setAttendanceRecords(records);
    }, (error) => {
      console.error("Attendance sub error:", error);
    });

    // Real-time leaves
    const qLeaves = query(
      collection(db, 'leaves'),
      where('employeeId', '==', id)
    );
    const unsubscribeLeaves = onSnapshot(qLeaves, (snapshot) => {
      const records = snapshot.docs.map(doc => doc.data());
      records.sort((a, b) => new Date(b.date) - new Date(a.date));
      setLeaveRecords(records);
    }, (error) => {
      console.error("Leaves sub error:", error);
    });

    return () => {
      unsubscribe();
      unsubscribeAttendance();
      unsubscribeLeaves();
    };
  }, [id]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('emergency_')) {
      const field = name.split('_')[1];
      setEditData(prev => ({
        ...prev,
        emergencyContact: {
          ...prev.emergencyContact,
          [field]: value
        }
      }));
    } else {
      setEditData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const docRef = doc(db, 'employees', id);
      await updateDoc(docRef, editData);
      setEmployee(editData);
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAdvance = async (e) => {
    e.preventDefault();
    if (!advFormData.amount || !advFormData.reason) {
      toast.error("Please fill in amount and reason");
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'advances'), {
        employeeId: id,
        type: advType,
        amount: Number(advFormData.amount),
        balance: Number(advFormData.amount),
        date: advFormData.date,
        time: advFormData.time,
        reason: advFormData.reason,
        status: 'active',
        createdAt: serverTimestamp()
      });
      toast.success("Advance added successfully");
      setShowAdvModal(false);
      setAdvFormData({
        amount: '',
        reason: '',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to add advance");
    } finally {
      setSubmitting(false);
    }
  };

  // Expanded state
  const [expandedAdv, setExpandedAdv] = useState(null);

  const toggleExpand = async (advId) => {
    if (expandedAdv === advId) {
      setExpandedAdv(null);
    } else {
      setExpandedAdv(advId);
      // Fetch instalments for this specific advance
      const q = query(
        collection(db, `advances/${advId}/instalments`),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const insts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInstalments(insts);
    }
  };

  const handleAddInstalment = async (e) => {
    e.preventDefault();
    if (!instFormData.amount) {
      toast.error("Please enter instalment amount");
      return;
    }

    if (Number(instFormData.amount) > selectedAdv.balance) {
      toast.error("Amount exceeds remaining balance");
      return;
    }

    setSubmitting(true);
    try {
      const newBalance = selectedAdv.balance - Number(instFormData.amount);
      
      await updateDoc(doc(db, 'advances', selectedAdv.id), {
        balance: newBalance,
        status: newBalance <= 0 ? 'paid' : 'active'
      });

      const instRef = await addDoc(collection(db, `advances/${selectedAdv.id}/instalments`), {
        amount: Number(instFormData.amount),
        date: instFormData.date,
        time: instFormData.time,
        createdAt: serverTimestamp()
      });

      // Update local instalment list instantly
      const newInst = {
        id: instRef.id,
        amount: Number(instFormData.amount),
        date: instFormData.date,
        time: instFormData.time,
      };
      setInstalments(prev => [newInst, ...prev]);

      toast.success("Instalment added successfully");
      setShowInstModal(false);
      setInstFormData({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      });
    } catch (error) {
      toast.error("Failed to add instalment");
    } finally {
      setSubmitting(false);
    }
  };

  const getAdvStats = (type) => {
    const filtered = advances.filter(a => a.type === type);
    const totalTaken = filtered.reduce((acc, curr) => acc + curr.amount, 0);
    const balanceDue = filtered.reduce((acc, curr) => acc + curr.balance, 0);
    return { totalTaken, balanceDue };
  };

  if (loading && !activeTab) return <div className="details-loader"><div className="loader"></div></div>;
  if (!employee) return <div className="details-error">Employee not found</div>;

  const tabs = [
    { id: 'info', label: 'Employee Info', icon: <User size={16} /> },
    { id: 'timesheet', label: 'Timesheet', icon: <Clock size={16} /> },
    { id: 'leaves', label: 'Leaves', icon: <Calendar size={16} /> },
    { id: 'advance', label: 'Advance', icon: <CreditCard size={16} /> },
  ];

  return (
    <div className="details-container">
      <div className="details-header-row">
        <button className="details-back-btn" onClick={() => navigate('/employees')}>
          <ArrowLeft size={18} /> Back to Employees
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ textAlign: 'right' }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{employee.firstName} {employee.lastName}</h4>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>EMP-{id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div className="profile-avatar" style={{ width: '40px', height: '40px', fontSize: '14px', borderRadius: '10px' }}>
            {employee.firstName[0]}{employee.lastName ? employee.lastName[0] : ''}
          </div>
        </div>
      </div>

      <div className="details-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`details-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {tab.icon}
              {tab.label}
            </div>
          </button>
        ))}
      </div>

      <div className="details-content-card">
        {activeTab === 'info' && (
          <div className="info-section">
            <div className="info-section-header">
              <h2>Personal & Professional Information</h2>
              <button
                className={`edit-toggle-btn ${isEditing ? 'edit-mode' : 'view-mode'}`}
                onClick={isEditing ? handleSave : () => setIsEditing(true)}
                disabled={submitting}
              >
                {submitting ? <div className="loader" style={{ width: '16px', height: '16px' }}></div> : (
                  isEditing ? <><Save size={18} /> Save Changes</> : <><Edit size={18} /> Edit Profile</>
                )}
              </button>
            </div>

            <div className="info-grid">
              <div className="info-item">
                <label>First Name</label>
                {isEditing ? <input type="text" name="firstName" className="edit-input" value={editData.firstName} onChange={handleEditChange} /> : <div className="value">{employee.firstName}</div>}
              </div>
              <div className="info-item">
                <label>Last Name</label>
                {isEditing ? <input type="text" name="lastName" className="edit-input" value={editData.lastName} onChange={handleEditChange} /> : <div className="value">{employee.lastName || 'N/A'}</div>}
              </div>
              <div className="info-item">
                <label>Phone Number</label>
                {isEditing ? <input type="tel" name="phone" className="edit-input" value={editData.phone} onChange={handleEditChange} /> : <div className="value">{employee.phone}</div>}
              </div>
              <div className="info-item">
                <label>Monthly Salary</label>
                {isEditing ? <input type="number" name="salary" className="edit-input" value={editData.salary} onChange={handleEditChange} /> : <div className="value">₹ {employee.salary || '0'}</div>}
              </div>
              <div className="info-item">
                <label>Accepted Leaves</label>
                {isEditing ? <input type="number" name="acceptedLeaves" className="edit-input" value={editData.acceptedLeaves} onChange={handleEditChange} /> : <div className="value">{employee.acceptedLeaves || '0'} Days / Year</div>}
              </div>
              <div className="info-item">
                <label>City</label>
                {isEditing ? <input type="text" name="city" className="edit-input" value={editData.city} onChange={handleEditChange} /> : <div className="value">{employee.city || 'N/A'}</div>}
              </div>
              <div className="info-item">
                <label>State</label>
                {isEditing ? <input type="text" name="state" className="edit-input" value={editData.state} onChange={handleEditChange} /> : <div className="value">{employee.state || 'N/A'}</div>}
              </div>
              <div className="info-item" style={{ gridColumn: 'span 2' }}>
                <label>Full Address</label>
                {isEditing ? <input type="text" name="address" className="edit-input" value={editData.address} onChange={handleEditChange} /> : <div className="value">{employee.address || 'No address provided'}</div>}
              </div>
            </div>

            <div className="emp-group-label" style={{ marginTop: '40px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              Emergency Contact
            </div>
            <div className="info-grid">
              <div className="info-item">
                <label>Contact Name</label>
                {isEditing ? <input type="text" name="emergency_name" className="edit-input" value={editData.emergencyContact?.name} onChange={handleEditChange} /> : <div className="value">{employee.emergencyContact?.name || 'N/A'}</div>}
              </div>
              <div className="info-item">
                <label>Relation</label>
                {isEditing ? <input type="text" name="emergency_relation" className="edit-input" value={editData.emergencyContact?.relation} onChange={handleEditChange} /> : <div className="value">{employee.emergencyContact?.relation || 'N/A'}</div>}
              </div>
              <div className="info-item">
                <label>Mobile Number</label>
                {isEditing ? <input type="tel" name="emergency_mobile" className="edit-input" value={editData.emergencyContact?.mobile} onChange={handleEditChange} /> : <div className="value">{employee.emergencyContact?.mobile || 'N/A'}</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timesheet' && (
          <div className="tab-details-view">
            <h2 className="section-title-custom">Attendance Timesheet Records</h2>
            {attendanceRecords.length === 0 ? (
              <div className="empty-tab-content">
                <Clock size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                <h3>Timesheet Data</h3>
                <p>No timesheet records available for this employee yet.</p>
              </div>
            ) : (
              <div className="details-table-wrapper">
                <table className="details-sub-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceRecords.map((record, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '700' }}>{record.date}</td>
                        <td>
                          <span className={`status-badge-custom ${record.status}`}>
                            {record.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                          {new Date(record.updatedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaves' && (
          <div className="tab-details-view">
            <h2 className="section-title-custom">Employee Leave History</h2>
            {leaveRecords.length === 0 ? (
              <div className="empty-tab-content">
                <Calendar size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                <h3>Leave Management</h3>
                <p>No leave requests or history found.</p>
              </div>
            ) : (
              <div className="details-table-wrapper">
                <table className="details-sub-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Leave Type</th>
                      <th>Reason</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRecords.map((record, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '700' }}>{record.date}</td>
                        <td style={{ fontWeight: '600' }}>{record.type}</td>
                        <td>{record.reason}</td>
                        <td>
                          <span className="status-badge-custom approved">
                            {record.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'advance' && (
          <div className="advance-section">
            <div className="info-section-header">
              <h2>Salary Advances</h2>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="edit-toggle-btn view-mode"><History size={18} /> Full Summary</button>
                <button className="edit-toggle-btn edit-mode"><PieChart size={18} /> Analytics</button>
              </div>
            </div>

            <div className="advance-container">
              {/* Short Term Advance Card */}
              <div className="advance-card">
                <h3><CreditCard size={18} /> Short Term Advance</h3>
                <div className="advance-actions">
                  <button className="adv-btn add" onClick={() => { setAdvType('short_term'); setShowAdvModal(true); }}><Plus size={16} /> Add Advance</button>
                </div>
                <div className="adv-stats">
                  <div className="stat-box">
                    <label>Total Taken</label>
                    <div className="amount">₹ {getAdvStats('short_term').totalTaken}</div>
                  </div>
                  <div className="stat-box">
                    <label>Balance Due</label>
                    <div className="amount" style={{ color: 'var(--error-color)' }}>₹ {getAdvStats('short_term').balanceDue}</div>
                  </div>
                </div>
              </div>

              {/* Long Term Advance Card */}
              <div className="advance-card">
                <h3><Briefcase size={18} /> Long Term Advance</h3>
                <div className="advance-actions">
                  <button className="adv-btn add" onClick={() => { setAdvType('long_term'); setShowAdvModal(true); }}><Plus size={16} /> Add Advance</button>
                </div>
                <div className="adv-stats">
                  <div className="stat-box">
                    <label>Total Taken</label>
                    <div className="amount">₹ {getAdvStats('long_term').totalTaken}</div>
                  </div>
                  <div className="stat-box">
                    <label>Balance Due</label>
                    <div className="amount" style={{ color: 'var(--error-color)' }}>₹ {getAdvStats('long_term').balanceDue}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="adv-history-grid">
              {/* Short Term History */}
              <div className="adv-history-column">
                <h4><CreditCard size={16} /> Short Term History</h4>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}></th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Balance</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.filter(a => a.type === 'short_term').map(adv => (
                        <React.Fragment key={adv.id}>
                          <tr className={expandedAdv === adv.id ? 'expanded-row-parent' : ''} onClick={() => toggleExpand(adv.id)} style={{ cursor: 'pointer' }}>
                            <td><ChevronDown size={14} style={{ transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', transition: '0.3s' }} /></td>
                            <td>{adv.date}</td>
                            <td style={{ fontWeight: '700' }}>₹ {adv.amount}</td>
                            <td style={{ color: adv.balance > 0 ? 'var(--error-color)' : '#059669', fontWeight: '700' }}>
                              ₹ {adv.balance}
                            </td>
                            <td className="adv-action-dropdown">
                              <button 
                                className="adv-dropdown-trigger" 
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === adv.id ? null : adv.id); }}
                              >
                                <MoreVertical size={16} />
                              </button>
                              {activeDropdown === adv.id && (
                                <div className="adv-dropdown-menu">
                                  {adv.balance > 0 && (
                                    <button className="adv-dropdown-item" onClick={(e) => { e.stopPropagation(); setSelectedAdv(adv); setShowInstModal(true); }}>
                                      <Plus size={14} /> Add Instalment
                                    </button>
                                  )}
                                  <button className="adv-dropdown-item" onClick={(e) => { e.stopPropagation(); toggleExpand(adv.id); }}>
                                    <History size={14} /> {expandedAdv === adv.id ? 'Hide History' : 'Show History'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {expandedAdv === adv.id && (
                            <tr className="expanded-details-row">
                              <td colSpan="5" style={{ padding: '0' }}>
                                <div className="inline-history">
                                  <div className="inline-history-header">
                                    <span>Instalment History</span>
                                    {adv.balance > 0 && (
                                      <button className="mini-add-btn" onClick={() => { setSelectedAdv(adv); setShowInstModal(true); }}>
                                        <Plus size={12} /> Add
                                      </button>
                                    )}
                                  </div>
                                  <div className="inline-hist-list">
                                    {instalments.map(inst => (
                                      <div className="inline-hist-item" key={inst.id}>
                                        <div className="hist-main">
                                          <span className="hist-amt">₹ {inst.amount}</span>
                                          <span className="hist-dt">{inst.date} • {inst.time}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {instalments.length === 0 && <div className="no-data">No instalments found</div>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {advances.filter(a => a.type === 'short_term').length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>No history</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Long Term History */}
              <div className="adv-history-column">
                <h4><Briefcase size={16} /> Long Term History</h4>
                <div className="mini-table-container">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th style={{ width: '30px' }}></th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Balance</th>
                        <th style={{ width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.filter(a => a.type === 'long_term').map(adv => (
                        <React.Fragment key={adv.id}>
                          <tr className={expandedAdv === adv.id ? 'expanded-row-parent' : ''} onClick={() => toggleExpand(adv.id)} style={{ cursor: 'pointer' }}>
                            <td><ChevronDown size={14} style={{ transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', transition: '0.3s' }} /></td>
                            <td>{adv.date}</td>
                            <td style={{ fontWeight: '700' }}>₹ {adv.amount}</td>
                            <td style={{ color: adv.balance > 0 ? 'var(--error-color)' : '#059669', fontWeight: '700' }}>
                              ₹ {adv.balance}
                            </td>
                            <td className="adv-action-dropdown">
                              <button 
                                className="adv-dropdown-trigger" 
                                onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === adv.id ? null : adv.id); }}
                              >
                                <MoreVertical size={16} />
                              </button>
                              {activeDropdown === adv.id && (
                                <div className="adv-dropdown-menu">
                                  {adv.balance > 0 && (
                                    <button className="adv-dropdown-item" onClick={(e) => { e.stopPropagation(); setSelectedAdv(adv); setShowInstModal(true); }}>
                                      <Plus size={14} /> Add Instalment
                                    </button>
                                  )}
                                  <button className="adv-dropdown-item" onClick={(e) => { e.stopPropagation(); toggleExpand(adv.id); }}>
                                    <History size={14} /> {expandedAdv === adv.id ? 'Hide History' : 'Show History'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {expandedAdv === adv.id && (
                            <tr className="expanded-details-row">
                              <td colSpan="5" style={{ padding: '0' }}>
                                <div className="inline-history">
                                  <div className="inline-history-header">
                                    <span>Instalment History</span>
                                    {adv.balance > 0 && (
                                      <button className="mini-add-btn" onClick={() => { setSelectedAdv(adv); setShowInstModal(true); }}>
                                        <Plus size={12} /> Add
                                      </button>
                                    )}
                                  </div>
                                  <div className="inline-hist-list">
                                    {instalments.map(inst => (
                                      <div className="inline-hist-item" key={inst.id}>
                                        <div className="hist-main">
                                          <span className="hist-amt">₹ {inst.amount}</span>
                                          <span className="hist-dt">{inst.date} • {inst.time}</span>
                                        </div>
                                      </div>
                                    ))}
                                    {instalments.length === 0 && <div className="no-data">No instalments found</div>}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {advances.filter(a => a.type === 'long_term').length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px' }}>No history</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Advance Modal */}
      <AnimatePresence>
        {showAdvModal && (
          <div className="modal-overlay">
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ width: '450px' }}
            >
              <div className="modal-icon-box" style={{ background: '#E6F0F9', color: 'var(--primary-color)' }}>
                <CreditCard size={32} />
              </div>
              <h3 className="modal-title">Add {advType === 'short_term' ? 'Short Term' : 'Long Term'} Advance</h3>
              
              <form onSubmit={handleAddAdvance} className="emp-data-form" style={{ textAlign: 'left', marginTop: '20px' }}>
                <div className="emp-input-group">
                  <label className="emp-input-label">Advance Amount</label>
                  <input type="number" className="emp-text-input" placeholder="Enter amount" value={advFormData.amount} onChange={(e) => setAdvFormData({...advFormData, amount: e.target.value})} required />
                </div>
                <div className="emp-form-row">
                  <div className="emp-input-group"><label className="emp-input-label">Date</label><input type="date" className="emp-text-input" value={advFormData.date} readOnly /></div>
                  <div className="emp-input-group"><label className="emp-input-label">Time</label><input type="text" className="emp-text-input" value={advFormData.time} readOnly /></div>
                </div>
                <div className="emp-input-group">
                  <label className="emp-input-label">Reason</label>
                  <textarea className="emp-text-input" style={{ height: '80px', padding: '12px', resize: 'none' }} placeholder="Reason for advance" value={advFormData.reason} onChange={(e) => setAdvFormData({...advFormData, reason: e.target.value})} required />
                </div>
                <div className="modal-actions" style={{ marginTop: '10px' }}>
                  <button type="button" className="modal-btn cancel" onClick={() => setShowAdvModal(false)}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: 'var(--primary-color)' }} disabled={submitting}>
                    {submitting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Save Advance'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Instalment Modal */}
      <AnimatePresence>
        {showInstModal && (
          <div className="modal-overlay">
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ width: '400px' }}
            >
              <div className="modal-icon-box" style={{ background: '#F0FFF4', color: '#059669' }}><FileText size={32} /></div>
              <h3 className="modal-title">Pay Instalment</h3>
              <p className="modal-text">Remaining: <strong>₹ {selectedAdv?.balance}</strong></p>
              <form onSubmit={handleAddInstalment} className="emp-data-form" style={{ textAlign: 'left' }}>
                <div className="emp-input-group">
                  <label className="emp-input-label">Instalment Amount</label>
                  <input type="number" className="emp-text-input" placeholder="Enter amount" value={instFormData.amount} onChange={(e) => setInstFormData({...instFormData, amount: e.target.value})} required />
                </div>
                <div className="emp-form-row">
                  <div className="emp-input-group"><label className="emp-input-label">Date</label><input type="date" className="emp-text-input" value={instFormData.date} readOnly /></div>
                  <div className="emp-input-group"><label className="emp-input-label">Time</label><input type="text" className="emp-text-input" value={instFormData.time} readOnly /></div>
                </div>
                <div className="modal-actions" style={{ marginTop: '10px' }}>
                  <button type="button" className="modal-btn cancel" onClick={() => setShowInstModal(false)}>Cancel</button>
                  <button type="submit" className="modal-btn confirm" style={{ background: '#059669' }} disabled={submitting}>
                    {submitting ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : 'Confirm Payment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Instalment History Modal */}
      <AnimatePresence>
        {showHistModal && (
          <div className="modal-overlay">
            <motion.div 
              className="custom-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ width: '450px' }}
            >
              <div className="modal-icon-box" style={{ background: '#F8FAFC', color: 'var(--primary-color)' }}><History size={32} /></div>
              <h3 className="modal-title">Payment History</h3>
              <p className="modal-text">History for <strong>₹ {selectedAdv?.amount}</strong> advance ({selectedAdv?.date})</p>
              
              <div className="hist-list">
                {instalments.map(inst => (
                  <div className="hist-item" key={inst.id}>
                    <div className="hist-meta">
                      <div className="hist-date">{inst.date}</div>
                      <div className="hist-time">{inst.time}</div>
                    </div>
                    <div className="hist-amount">₹ {inst.amount}</div>
                  </div>
                ))}
                {instalments.length === 0 && (
                  <div style={{ padding: '40px', color: 'var(--text-secondary)', fontSize: '14px' }}>No instalments found</div>
                )}
              </div>
              <button className="modal-btn cancel" style={{ width: '100%', marginTop: '20px' }} onClick={() => setShowHistModal(false)}>Close</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default EmployeeDetails;
