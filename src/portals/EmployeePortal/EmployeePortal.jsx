import React, { useState, useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import PortalLayout from '../Shared/PortalLayout';
import { db } from '../../config/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  Users, 
  Clock, 
  Search, 
  Calendar, 
  Eye, 
  X, 
  Check, 
  Phone, 
  MapPin, 
  AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './EmployeePortal.css';

const EmployeePortal = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab || 'employees';

  // Navigation Links
  const links = [
    { label: 'Employees', icon: <Users size={20} />, path: '/employee-portal/employees' },
    { label: 'Timesheet', icon: <Clock size={20} />, path: '/employee-portal/timesheet' }
  ];

  // Common State
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Tab 1: Employees Directory States
  const [selectedEmployee, setSelectedEmployee] = useState(null); // Detail view modal

  // Tab 2: Timesheet States
  const [attendance, setAttendance] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Fetch Employees List
  useEffect(() => {
    const q = query(collection(db, 'employees'), orderBy('firstName', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching employees: ", error);
      toast.error('Failed to load employees.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Fetch Attendance Log for Selected Date
  useEffect(() => {
    if (activeTab === 'timesheet' && employees.length > 0) {
      const fetchAttendance = async () => {
        try {
          const snap = await getDocs(collection(db, 'attendance'));
          const dayRecords = {};
          snap.docs.forEach(doc => {
            const data = doc.data();
            if (data.date === selectedDate) {
              dayRecords[data.employeeId] = data.status;
            }
          });
          
          const updatedAttendance = {};
          employees.forEach(emp => {
            updatedAttendance[emp.id] = dayRecords[emp.id] || 'present';
          });
          setAttendance(updatedAttendance);
        } catch (err) {
          console.error("Error fetching attendance: ", err);
        }
      };
      fetchAttendance();
    }
  }, [selectedDate, employees, activeTab]);

  if (!tab) return <Navigate to="/employee-portal/employees" replace />;

  const handleStatusChange = (empId, status) => {
    setAttendance(prev => ({
      ...prev,
      [empId]: status
    }));
  };

  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    try {
      const promises = Object.keys(attendance).map(async (empId) => {
        const status = attendance[empId];
        const recordId = `${empId}_${selectedDate}`;
        
        // Write to attendance collection
        await setDoc(doc(db, 'attendance', recordId), {
          employeeId: empId,
          date: selectedDate,
          status,
          updatedAt: new Date().toISOString()
        });

        // Sync with leaves collection
        const leaveRef = doc(db, 'leaves', recordId);
        if (status === 'absent') {
          await setDoc(leaveRef, {
            employeeId: empId,
            date: selectedDate,
            type: 'Absent',
            status: 'Approved',
            reason: 'Marked Absent via Employee Portal Timesheet',
            createdAt: new Date().toISOString()
          });
        } else if (status === 'halfday') {
          await setDoc(leaveRef, {
            employeeId: empId,
            date: selectedDate,
            type: 'Half Day',
            status: 'Approved',
            reason: 'Marked Half Day via Employee Portal Timesheet',
            createdAt: new Date().toISOString()
          });
        } else {
          await deleteDoc(leaveRef);
        }
      });

      await Promise.all(promises);
      toast.success("Daily attendance saved and synced successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save attendance log");
    } finally {
      setSavingAttendance(false);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    `${emp.firstName} ${emp.lastName || ''}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.phone.includes(searchQuery)
  );

  return (
    <PortalLayout title="Employee Portal" links={links}>
      <div className="ep-portal-content animate-fade-in">
        
        {/* --- EMPLOYEES DIRECTORY TAB --- */}
        {activeTab === 'employees' && (
          <div className="ep-view-section">
            <div className="ep-view-header">
              <div>
                <h2>Staff Directory</h2>
                <p className="ep-view-desc">View staff directory records and leaves quotas (View-Only)</p>
              </div>
              <div className="ep-search-wrapper">
                <Search size={18} className="ep-search-icon" />
                <input 
                  type="text" 
                  placeholder="Search staff by name or phone..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="ep-table-wrapper">
              <table className="ep-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Phone</th>
                    <th>Leaves Allowed</th>
                    <th style={{ textAlign: 'center' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '60px' }}>
                        <div className="loader"></div>
                      </td>
                    </tr>
                  ) : filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="ep-row-hover" onClick={() => setSelectedEmployee(emp)}>
                      <td>
                        <div className="ep-name-cell">
                          <div className="ep-avatar-box">
                            {emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{emp.firstName} {emp.lastName || ''}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>EMP-{emp.id.slice(0, 5).toUpperCase()}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: '600', color: '#334155' }}>{emp.phone}</td>
                      <td>
                        <div className="ep-leaves-badge">
                          <Calendar size={13} style={{ color: '#10b981' }} />
                          <span>{emp.acceptedLeaves || 0} Days</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <button 
                            className="ep-action-btn view" 
                            title="View Details"
                            onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp); }}
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontWeight: '600' }}>
                        No staff records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TIMESHEET ATTENDANCE TAB --- */}
        {activeTab === 'timesheet' && (
          <div className="ep-view-section">
            <div className="ep-view-header">
              <div>
                <h2>Daily Timesheet Log</h2>
                <p className="ep-view-desc">Select date and log staff attendance. Absents automatically synchronize leaves.</p>
              </div>
              <div className="ep-filter-bar">
                <div className="ep-search-wrapper" style={{ width: '240px' }}>
                  <Search size={18} className="ep-search-icon" />
                  <input 
                    type="text" 
                    placeholder="Search staff..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="ep-date-wrapper">
                  <Calendar size={18} className="ep-cal-icon" />
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                <button 
                  className="ep-save-attendance-btn"
                  onClick={handleSaveAttendance}
                  disabled={savingAttendance || employees.length === 0}
                >
                  {savingAttendance ? <div className="loader" style={{ borderTopColor: '#fff', width: '16px', height: '16px' }}></div> : 'Save Attendance Log'}
                </button>
              </div>
            </div>

            <div className="ep-table-wrapper">
              <table className="ep-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Phone Contact</th>
                    <th>Monthly Leaves Allowed</th>
                    <th style={{ textAlign: 'center' }}>Mark Log Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '60px' }}>
                        <div className="loader"></div>
                      </td>
                    </tr>
                  ) : filteredEmployees.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <div className="ep-name-cell">
                          <div className="ep-avatar-box">
                            {emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: '#0f172a' }}>{emp.firstName} {emp.lastName || ''}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>EMP-{emp.id.slice(0, 5).toUpperCase()}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: '#475569', fontWeight: '500' }}>{emp.phone}</td>
                      <td>
                        <div className="ep-leaves-badge">
                          <Calendar size={13} style={{ color: '#10b981' }} />
                          <span>{emp.acceptedLeaves || 0} Days</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button 
                            type="button"
                            className={`ep-log-btn present ${attendance[emp.id] === 'present' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(emp.id, 'present')}
                          >
                            Present
                          </button>
                          <button 
                            type="button"
                            className={`ep-log-btn halfday ${attendance[emp.id] === 'halfday' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(emp.id, 'halfday')}
                          >
                            Half Day
                          </button>
                          <button 
                            type="button"
                            className={`ep-log-btn absent ${attendance[emp.id] === 'absent' ? 'active' : ''}`}
                            onClick={() => handleStatusChange(emp.id, 'absent')}
                          >
                            Absent
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontWeight: '600' }}>
                        No staff records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* --- EMPLOYEE PROFILE DETAILS MODAL (VIEW ACCESS, NO SALARY DISPLAYED) --- */}
      <AnimatePresence>
        {selectedEmployee && (
          <div className="modal-overlay" style={{ zIndex: 4000 }}>
            <motion.div 
              className="custom-modal ep-details-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ width: '540px' }}
            >
              <div className="ep-modal-header">
                <h3>Staff Profile Card</h3>
                <button className="ep-modal-close" onClick={() => setSelectedEmployee(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="ep-modal-body">
                {/* Main Profile Info */}
                <div className="ep-modal-profile-header">
                  <div className="ep-modal-avatar">
                    {selectedEmployee.firstName[0]}{selectedEmployee.lastName ? selectedEmployee.lastName[0] : ''}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: '0 0 4px 0' }}>
                      {selectedEmployee.firstName} {selectedEmployee.lastName || ''}
                    </h2>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: '700', color: '#4f46e5', background: '#eff6ff', padding: '3px 8px', borderRadius: '6px' }}>
                      EMP-{selectedEmployee.id.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="ep-details-grid">
                  {/* Personal Contact */}
                  <div className="ep-details-item card">
                    <span className="label">Mobile Connection</span>
                    <div className="value">
                      <Phone size={14} style={{ color: '#3b82f6' }} />
                      <span>{selectedEmployee.phone}</span>
                    </div>
                  </div>

                  {/* Leave Quota */}
                  <div className="ep-details-item card">
                    <span className="label">Allowed Leaves</span>
                    <div className="value">
                      <Calendar size={14} style={{ color: '#10b981' }} />
                      <span>{selectedEmployee.acceptedLeaves || 0} Days / Month</span>
                    </div>
                  </div>

                  {/* Full Address Block */}
                  <div className="ep-details-item block">
                    <span className="label">Residential Address</span>
                    <div className="value">
                      <MapPin size={14} style={{ color: '#64748b', marginTop: '2px' }} />
                      <span style={{ fontSize: '13px', lineHeight: '1.4' }}>
                        {selectedEmployee.address || 'Street/Area details pending'},{' '}
                        <strong>{selectedEmployee.city || 'City Pending'}</strong>,{' '}
                        {selectedEmployee.state || 'State Pending'}
                      </span>
                    </div>
                  </div>

                  {/* Emergency Contacts details */}
                  <div className="ep-details-item block" style={{ marginTop: '5px' }}>
                    <span className="label">Emergency Contact Info</span>
                    <div className="ep-emergency-contact-box">
                      <div className="ep-contact-row">
                        <span className="lbl">Contact Name:</span>
                        <span className="val">{selectedEmployee.emergencyContact?.name || 'Pending'}</span>
                      </div>
                      <div className="ep-contact-row">
                        <span className="lbl">Relation:</span>
                        <span className="val">{selectedEmployee.emergencyContact?.relation || 'Pending'}</span>
                      </div>
                      <div className="ep-contact-row">
                        <span className="lbl">Emergency Phone:</span>
                        <span className="val">{selectedEmployee.emergencyContact?.mobile || 'Pending'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '25px', justifyContent: 'flex-end' }}>
                  <button className="modal-btn cancel" onClick={() => setSelectedEmployee(null)}>Close Profile</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </PortalLayout>
  );
};

export default EmployeePortal;
