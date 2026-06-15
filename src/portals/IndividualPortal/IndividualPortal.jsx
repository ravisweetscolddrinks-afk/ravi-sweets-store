import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  IndianRupee,
  Clock,
  FileText,
  CreditCard,
  History,
  Briefcase,
  ChevronDown,
  Printer
} from 'lucide-react';
import PortalLayout from '../Shared/PortalLayout';
import { db, auth } from '../../config/firebase';
import { 
  doc, 
  collection, 
  getDocs,
  query, 
  where, 
  onSnapshot, 
  orderBy 
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import './IndividualPortal.css';

const IndividualPortal = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const activeTab = tab || 'info';

  const [employee, setEmployee] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Attendance, Leaves, & Advances States
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [allDeductions, setAllDeductions] = useState([]);

  // Month & Year states for Payslip Tab
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const monthsList = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  // Expanded state for advance inline history
  const [expandedAdv, setExpandedAdv] = useState(null);
  const [instalments, setInstalments] = useState([]);
  const [loadingInstalments, setLoadingInstalments] = useState(false);

  // Sidebar Links
  const links = [
    { label: 'My Profile', icon: <User size={20} />, path: '/individual-portal' }
  ];

  useEffect(() => {
    const phone = localStorage.getItem('userPhone') || auth.currentUser?.phoneNumber;
    if (!phone) {
      setLoading(false);
      return;
    }
    const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;

    let unsubEmployee = null;
    let unsubAdvances = null;
    let unsubAttendance = null;
    let unsubLeaves = null;
    let unsubDeductions = null;

    const setupSubscriptions = async () => {
      try {
        const q = query(
          collection(db, 'employees'),
          where('phone', 'in', [phone, normalizedPhone])
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const empDoc = snap.docs[0];
          const empId = empDoc.id;
          setEmployeeId(empId);

          // Real-time employee info
          unsubEmployee = onSnapshot(doc(db, 'employees', empId), (docSnap) => {
            if (docSnap.exists()) {
              setEmployee({ id: empId, ...docSnap.data() });
            }
          });

          // Real-time advances
          const qAdv = query(collection(db, 'advances'), where('employeeId', '==', empId));
          unsubAdvances = onSnapshot(qAdv, (snapshot) => {
            const advs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            advs.sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
              return dateB - dateA;
            });
            setAdvances(advs);
          });

          // Real-time attendance
          const qAtt = query(collection(db, 'attendance'), where('employeeId', '==', empId));
          unsubAttendance = onSnapshot(qAtt, (snapshot) => {
            const records = snapshot.docs.map(doc => doc.data());
            records.sort((a, b) => new Date(b.date) - new Date(a.date));
            setAttendanceRecords(records);
          });

          // Real-time leaves
          const qLeaves = query(collection(db, 'leaves'), where('employeeId', '==', empId));
          unsubLeaves = onSnapshot(qLeaves, (snapshot) => {
            const records = snapshot.docs.map(doc => doc.data());
            records.sort((a, b) => new Date(b.date) - new Date(a.date));
            setLeaveRecords(records);
          });

          // Real-time deductions
          const qDeductions = query(collection(db, 'payroll_deductions'), where('employeeId', '==', empId));
          unsubDeductions = onSnapshot(qDeductions, (snapshot) => {
            setAllDeductions(snapshot.docs.map(doc => doc.data()));
          });
        } else {
          toast.error("Employee profile not found matching your credentials");
        }
      } catch (err) {
        console.error("Error setting up employee subscriptions:", err);
        toast.error("Failed to load employee records");
      } finally {
        setLoading(false);
      }
    };

    setupSubscriptions();

    return () => {
      if (unsubEmployee) unsubEmployee();
      if (unsubAdvances) unsubAdvances();
      if (unsubAttendance) unsubAttendance();
      if (unsubLeaves) unsubLeaves();
      if (unsubDeductions) unsubDeductions();
    };
  }, []);

  const toggleExpand = async (advId) => {
    if (expandedAdv === advId) {
      setExpandedAdv(null);
    } else {
      setExpandedAdv(advId);
      setLoadingInstalments(true);
      try {
        const q = query(
          collection(db, `advances/${advId}/instalments`),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const insts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setInstalments(insts);
      } catch (err) {
        console.error("Error fetching instalments: ", err);
      } finally {
        setLoadingInstalments(false);
      }
    }
  };

  const getAdvStats = (type) => {
    const filtered = advances.filter(a => a.type === type);
    const totalTaken = filtered.reduce((acc, curr) => acc + curr.amount, 0);
    const balanceDue = filtered.reduce((acc, curr) => acc + curr.balance, 0);
    return { totalTaken, balanceDue };
  };

  const calculateEmployeeStats = () => {
    if (!employee) return null;

    const monthlyRecords = attendanceRecords.filter(r => {
      const rDate = new Date(r.date);
      return rDate.getMonth() === selectedMonth && 
             rDate.getFullYear() === selectedYear;
    });

    const salary = Number(employee.salary || 0);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const perDayPay = salary / 30;
    const acceptedLeaves = Number(employee.acceptedLeaves || 0);

    // Dynamic past vs current month day evaluation limit
    const today = new Date();
    const selectedDateObj = new Date(selectedYear, selectedMonth, 1);
    const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    let endDay = 0;
    if (selectedDateObj < currentMonthStart) {
      endDay = daysInMonth; // Past month
    } else if (selectedYear === today.getFullYear() && selectedMonth === today.getMonth()) {
      endDay = today.getDate(); // Current month
    } else {
      endDay = 0; // Future month
    }

    let present = 0;
    let absent = 0;
    let halfday = 0;
    let totalRecorded = 0;

    for (let day = 1; day <= endDay; day++) {
      totalRecorded++;
      const yearStr = selectedYear;
      const monthStr = String(selectedMonth + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${yearStr}-${monthStr}-${dayStr}`;

      const record = monthlyRecords.find(r => r.date === dateKey);

      if (record) {
        if (record.status === 'present') {
          present++;
        } else if (record.status === 'absent') {
          absent++;
        } else if (record.status === 'halfday') {
          halfday++;
          present += 0.5;
          absent += 0.5;
        }
      } else {
        // Treat as absent if no attendance logged for previous days in this month
        absent++;
      }
    }

    const paidDays = Math.min(30, present);
    const debitedDays = Math.max(0, 30 - paidDays);
    const debitAmount = debitedDays * perDayPay;
    const presentPay = paidDays * perDayPay;

    const hasPerfectAttendance = present >= daysInMonth && absent === 0;
    const bonus = hasPerfectAttendance ? (2 * perDayPay) : 0;
    
    const basicNetPay = Math.max(0, salary - debitAmount + bonus);

    // Advances and Deductions logic
    const empAdvances = advances.filter(a => a.status === 'active');
    const shortTermPending = empAdvances.filter(a => a.type === 'short_term').reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const longTermPending = empAdvances.filter(a => a.type === 'long_term').reduce((sum, a) => sum + Number(a.balance || 0), 0);

    const processed = allDeductions.find(d => d.month === selectedMonth && d.year === selectedYear);
    const shortTermDeduct = processed ? Number(processed.shortTermDeduct || 0) : 0;
    const longTermDeduct = processed ? Number(processed.longTermDeduct || 0) : 0;

    const netPay = basicNetPay - shortTermDeduct - longTermDeduct;

    return {
      present,
      absent,
      halfday,
      perDayPay,
      presentPay,
      debitedDays,
      debitAmount,
      bonus,
      basicNetPay,
      shortTermPending,
      shortTermDeduct,
      longTermPending,
      longTermDeduct,
      netPay,
      daysInMonth,
      totalRecorded
    };
  };

  const handlePrintPayslip = () => {
    const stats = calculateEmployeeStats();
    if (!stats) return;

    const printContent = `
      <html>
        <head>
          <title>Payslip - ${employee.firstName} ${employee.lastName || ''}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #a855f7; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #6b21a8; font-size: 28px; }
            .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
            .section-title { font-size: 18px; font-weight: 700; color: #6b21a8; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .info-item { margin-bottom: 12px; }
            .info-item label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .info-item .value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; padding: 12px; font-size: 12px; font-weight: 700; text-align: left; color: #475569; border-bottom: 2px solid #e2e8f0; }
            td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .total-row { font-weight: bold; background: #faf5ff; font-size: 16px; }
            .total-row td { color: #6b21a8; border-top: 2px solid #e9d5ff; }
            .footer { text-align: center; margin-top: 60px; font-size: 12px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Ravi Sweets</h1>
            <p>Employee Monthly Salary Slip</p>
          </div>

          <div class="grid">
            <div>
              <div class="info-item">
                <label>Employee Name</label>
                <div class="value">${employee.firstName} ${employee.lastName || ''}</div>
              </div>
              <div class="info-item">
                <label>Employee ID</label>
                <div class="value">EMP-${employee.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div class="info-item">
                <label>Phone Number</label>
                <div class="value">${employee.phone}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div class="info-item">
                <label>Pay Period</label>
                <div class="value">${monthsList[selectedMonth]} ${selectedYear}</div>
              </div>
              <div class="info-item">
                <label>Designation</label>
                <div class="value">Staff Member</div>
              </div>
            </div>
          </div>

          <div class="section-title">Attendance Summary</div>
          <table>
            <thead>
              <tr>
                <th>Total Recorded Days</th>
                <th>Days Present</th>
                <th>Days Absent</th>
                <th>Allowed Leaves (Monthly)</th>
                <th>Debited Days</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${stats.totalRecorded} Days</td>
                <td>${stats.present} Days</td>
                <td>${stats.absent} Days</td>
                <td>${employee.acceptedLeaves || 0} Days</td>
                <td style="font-weight: 700; color: ${stats.debitedDays > 0 ? '#ef4444' : '#333'}">${stats.debitedDays} Days</td>
              </tr>
            </tbody>
          </table>

          <div class="section-title">Earnings & Deductions</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th style="text-align: right;">Earnings</th>
                <th style="text-align: right;">Deductions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly Base Salary Reference</td>
                <td style="text-align: right; color: #64748b; font-style: italic;">₹ ${Number(employee.salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right;">-</td>
              </tr>
              <tr>
                <td style="font-weight: 600;">Present Days Earnings (${stats.present} Days Present out of ${stats.daysInMonth} days)</td>
                <td style="text-align: right; font-weight: 700;">₹ ${stats.presentPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right;">-</td>
              </tr>
              ${stats.bonus > 0 ? `
              <tr>
                <td style="color: #059669; font-weight: 600;">Attendance Bonus (2 Days Extra)</td>
                <td style="text-align: right; color: #059669;">₹ ${stats.bonus.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td style="text-align: right;">-</td>
              </tr>
              ` : ''}
              ${stats.debitAmount > 0 ? `
              <tr>
                <td style="color: #ef4444;">Salary Debit (${stats.debitedDays} Days Excess Leave)</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; color: #ef4444;">₹ ${stats.debitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              ` : ''}
              ${stats.shortTermDeduct > 0 ? `
              <tr>
                <td style="color: #ef4444; font-weight: 600;">Short-Term Advance Repayment (Auto-debit)</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; color: #ef4444;">₹ ${stats.shortTermDeduct.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              ` : ''}
              ${stats.longTermDeduct > 0 ? `
              <tr>
                <td style="color: #ef4444; font-weight: 600;">Long-Term Advance Installment</td>
                <td style="text-align: right;">-</td>
                <td style="text-align: right; color: #ef4444;">₹ ${stats.longTermDeduct.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
              ` : ''}
              <tr class="total-row">
                <td>Net Payable Amount</td>
                <td colSpan="2" style="text-align: right;">₹ ${stats.netPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <p>This is a computer generated document and does not require signature.</p>
            <p>© ${selectedYear} Ravi Sweets. All rights reserved.</p>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=800,height=900');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  const tabs = [
    { id: 'info', label: 'Employee Info', mobileLabel: 'Profile', icon: <User size={20} /> },
    { id: 'timesheet', label: 'Timesheet', mobileLabel: 'Timesheet', icon: <Clock size={20} /> },
    { id: 'leaves', label: 'Leaves', mobileLabel: 'Leaves', icon: <Calendar size={20} /> },
    { id: 'advance', label: 'Advance', mobileLabel: 'Advance', icon: <CreditCard size={20} /> },
    { id: 'payslip', label: 'My Payslip', mobileLabel: 'Payslip', icon: <FileText size={20} /> },
  ];

  if (loading) {
    return (
      <PortalLayout title="Employee Portal" links={links}>
        <div className="ind-loader-container">
          <div className="loader"></div>
          <p>Fetching your personal records...</p>
        </div>
      </PortalLayout>
    );
  }

  if (!employee) {
    return (
      <PortalLayout title="Employee Portal" links={links}>
        <div className="ind-error-container animate-fade-in">
          <h2>No Associated Employee Found</h2>
          <p>Please contact the system administrator to verify your registered mobile number in the employee directory.</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Employee Portal" links={links}>
      <div className="ind-container animate-fade-in">
        {/* Dynamic Greeting Row */}
        <div className="ind-header-row">
          <div>
            <h1 className="ind-greeting-title">Hello, {employee.firstName}!</h1>
            <p className="ind-greeting-subtitle">Secure personal self-service portal (View-Only)</p>
          </div>
          <div className="ind-profile-badge">
            <div className="ind-avatar">
              {employee.firstName[0]}{employee.lastName ? employee.lastName[0] : ''}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div className="ind-badge-name">{employee.firstName} {employee.lastName || ''}</div>
              <div className="ind-badge-id">EMP-{employee.id.slice(0, 8).toUpperCase()}</div>
            </div>
          </div>
        </div>

        {/* Custom Premium Tabs Navigation */}
        <div className="ind-tabs-wrapper">
          <div className="ind-tabs">
            {tabs.map(tabItem => (
              <button
                key={tabItem.id}
                className={`ind-tab-btn ${activeTab === tabItem.id ? 'active' : ''}`}
                onClick={() => navigate(`/individual-portal/${tabItem.id}`)}
              >
                <span className="ind-tab-icon">{React.cloneElement(tabItem.icon, { size: 16 })}</span>
                <span className="ind-tab-label">{tabItem.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Card with Elegant Styling */}
        <div className="ind-content-card">
          
          {/* TAB 1: EMPLOYEE INFO */}
          {activeTab === 'info' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Personal & Professional Information</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>

              <div className="ind-info-grid">
                <div className="ind-info-item">
                  <label>First Name</label>
                  <div className="val">{employee.firstName}</div>
                </div>
                <div className="ind-info-item">
                  <label>Last Name</label>
                  <div className="val">{employee.lastName || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Phone Connection</label>
                  <div className="val">{employee.phone}</div>
                </div>
                <div className="ind-info-item">
                  <label>Monthly Base Salary</label>
                  <div className="val" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {employee.salary || '0'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Allowed Leaves Limit</label>
                  <div className="val">{employee.acceptedLeaves || '0'} Days / Year</div>
                </div>
                <div className="ind-info-item">
                  <label>City</label>
                  <div className="val">{employee.city || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>State</label>
                  <div className="val">{employee.state || 'N/A'}</div>
                </div>
                <div className="ind-info-item" style={{ gridColumn: 'span 2' }}>
                  <label>Full Residential Address</label>
                  <div className="val">{employee.address || 'No address provided'}</div>
                </div>
              </div>

              <div className="ind-group-divider">
                <span>Emergency Contact details</span>
              </div>

              <div className="ind-info-grid">
                <div className="ind-info-item">
                  <label>Contact Name</label>
                  <div className="val">{employee.emergencyContact?.name || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Relation</label>
                  <div className="val">{employee.emergencyContact?.relation || 'N/A'}</div>
                </div>
                <div className="ind-info-item">
                  <label>Mobile Connection</label>
                  <div className="val">{employee.emergencyContact?.mobile || 'N/A'}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TIMESHEET */}
          {activeTab === 'timesheet' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Attendance Timesheet Records</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>
              
              {attendanceRecords.length === 0 ? (
                <div className="ind-empty-state">
                  <Clock size={48} className="ind-empty-icon" />
                  <h3>No Attendance Logged</h3>
                  <p>Your chronological attendance history will display here once recorded.</p>
                </div>
              ) : (
                <div className="ind-table-wrapper">
                  <table className="ind-table-element">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Logged Status</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((record, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{record.date}</td>
                          <td>
                            <span className={`ind-badge-status ${record.status}`}>
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

          {/* TAB 3: LEAVES */}
          {activeTab === 'leaves' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Employee Leave History</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>
              
              {leaveRecords.length === 0 ? (
                <div className="ind-empty-state">
                  <Calendar size={48} className="ind-empty-icon" />
                  <h3>No Leaves Registered</h3>
                  <p>No previous or accepted leave applications found on file.</p>
                </div>
              ) : (
                <div className="ind-table-wrapper">
                  <table className="ind-table-element">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Leave Type</th>
                        <th>Reason for Absence</th>
                        <th>Approval Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveRecords.map((record, index) => (
                        <tr key={index}>
                          <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{record.date}</td>
                          <td style={{ fontWeight: '600' }}>{record.type}</td>
                          <td>{record.reason}</td>
                          <td>
                            <span className="ind-badge-status approved">
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

          {/* TAB 4: ADVANCE */}
          {activeTab === 'advance' && (
            <div className="ind-tab-section animate-fade-in">
              <div className="ind-section-header">
                <h2>Salary Advances Summary</h2>
                <span className="ind-view-only-badge">View Only</span>
              </div>

              {/* Advance Cards Display */}
              <div className="ind-adv-cards-container">
                {/* Short Term */}
                <div className="ind-adv-stat-card short-term">
                  <h3><CreditCard size={18} /> Short Term Advance</h3>
                  <div className="ind-adv-stats-row">
                    <div className="stat-item">
                      <label>Total Taken</label>
                      <div className="amt">₹ {getAdvStats('short_term').totalTaken}</div>
                    </div>
                    <div className="stat-item">
                      <label>Balance Due</label>
                      <div className="amt due">₹ {getAdvStats('short_term').balanceDue}</div>
                    </div>
                  </div>
                </div>

                {/* Long Term */}
                <div className="ind-adv-stat-card long-term">
                  <h3><Briefcase size={18} /> Long Term Advance</h3>
                  <div className="ind-adv-stats-row">
                    <div className="stat-item">
                      <label>Total Taken</label>
                      <div className="amt">₹ {getAdvStats('long_term').totalTaken}</div>
                    </div>
                    <div className="stat-item">
                      <label>Balance Due</label>
                      <div className="amt due">₹ {getAdvStats('long_term').balanceDue}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Symmetrical Lists for Short/Long term histories */}
              <div className="ind-adv-columns">
                
                {/* Column 1: Short Term History */}
                <div className="ind-adv-column">
                  <h4 className="ind-column-title"><CreditCard size={16} /> Short Term Logs</h4>
                  
                  <div className="ind-mini-table-container">
                    <table className="ind-mini-table">
                      <thead>
                        <tr>
                          <th style={{ width: '30px' }}></th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.filter(a => a.type === 'short_term').map(adv => (
                          <React.Fragment key={adv.id}>
                            <tr 
                              className={`ind-clickable-row ${expandedAdv === adv.id ? 'expanded' : ''}`}
                              onClick={() => toggleExpand(adv.id)}
                            >
                              <td>
                                <ChevronDown 
                                  size={14} 
                                  style={{ 
                                    transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', 
                                    transition: '0.3s',
                                    color: 'var(--text-secondary)'
                                  }} 
                                />
                              </td>
                              <td style={{ fontWeight: '500' }}>{adv.date}</td>
                              <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {adv.amount}</td>
                              <td style={{ fontWeight: '700', color: adv.balance > 0 ? 'var(--error-color)' : '#059669' }}>
                                ₹ {adv.balance}
                              </td>
                            </tr>
                            
                            {/* Instalment expanded inline */}
                            {expandedAdv === adv.id && (
                              <tr className="ind-expanded-detail-row">
                                <td colSpan="4">
                                  <div className="ind-inline-history animate-fade-in">
                                    <div className="ind-inline-history-header">
                                      <span>Instalment Breakdown</span>
                                    </div>
                                    <div className="ind-inline-hist-list">
                                      {loadingInstalments ? (
                                        <div className="ind-inline-loading"><div className="loader" style={{ width: '16px', height: '16px' }}></div></div>
                                      ) : instalments.map(inst => (
                                        <div className="ind-inline-hist-item" key={inst.id}>
                                          <div className="hist-main">
                                            <span className="hist-amt">₹ {inst.amount}</span>
                                            <span className="hist-dt">{inst.date} • {inst.time}</span>
                                          </div>
                                        </div>
                                      ))}
                                      {!loadingInstalments && instalments.length === 0 && (
                                        <div className="ind-inline-no-data">No instalment records paid yet</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {advances.filter(a => a.type === 'short_term').length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                              No short term advance history on file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Column 2: Long Term History */}
                <div className="ind-adv-column">
                  <h4 className="ind-column-title"><Briefcase size={16} /> Long Term Logs</h4>
                  
                  <div className="ind-mini-table-container">
                    <table className="ind-mini-table">
                      <thead>
                        <tr>
                          <th style={{ width: '30px' }}></th>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {advances.filter(a => a.type === 'long_term').map(adv => (
                          <React.Fragment key={adv.id}>
                            <tr 
                              className={`ind-clickable-row ${expandedAdv === adv.id ? 'expanded' : ''}`}
                              onClick={() => toggleExpand(adv.id)}
                            >
                              <td>
                                <ChevronDown 
                                  size={14} 
                                  style={{ 
                                    transform: expandedAdv === adv.id ? 'rotate(180deg)' : 'rotate(0)', 
                                    transition: '0.3s',
                                    color: 'var(--text-secondary)'
                                  }} 
                                />
                              </td>
                              <td style={{ fontWeight: '500' }}>{adv.date}</td>
                              <td style={{ fontWeight: '700', color: 'var(--text-primary)' }}>₹ {adv.amount}</td>
                              <td style={{ fontWeight: '700', color: adv.balance > 0 ? 'var(--error-color)' : '#059669' }}>
                                ₹ {adv.balance}
                              </td>
                            </tr>
                            
                            {/* Instalment expanded inline */}
                            {expandedAdv === adv.id && (
                              <tr className="ind-expanded-detail-row">
                                <td colSpan="4">
                                  <div className="ind-inline-history animate-fade-in">
                                    <div className="ind-inline-history-header">
                                      <span>Instalment Breakdown</span>
                                    </div>
                                    <div className="ind-inline-hist-list">
                                      {loadingInstalments ? (
                                        <div className="ind-inline-loading"><div className="loader" style={{ width: '16px', height: '16px' }}></div></div>
                                      ) : instalments.map(inst => (
                                        <div className="ind-inline-hist-item" key={inst.id}>
                                          <div className="hist-main">
                                            <span className="hist-amt">₹ {inst.amount}</span>
                                            <span className="hist-dt">{inst.date} • {inst.time}</span>
                                          </div>
                                        </div>
                                      ))}
                                      {!loadingInstalments && instalments.length === 0 && (
                                        <div className="ind-inline-no-data">No instalment records paid yet</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                        {advances.filter(a => a.type === 'long_term').length === 0 && (
                          <tr>
                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                              No long term advance history on file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 5: PAYSLIP */}
          {activeTab === 'payslip' && (() => {
            const stats = calculateEmployeeStats();
            return (
              <div className="ind-tab-section animate-fade-in">
                <div className="ind-section-header">
                  <h2>Monthly Salary Payslip Summary</h2>
                  <button className="ind-print-btn" onClick={handlePrintPayslip}>
                    <Printer size={16} /> Print Payslip
                  </button>
                </div>

                {/* Filters */}
                <div className="ind-payslip-filters">
                  <div className="filter-group">
                    <label>Select Month</label>
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                      {monthsList.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                    </select>
                  </div>
                  <div className="filter-group">
                    <label>Select Year</label>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                      {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {(!stats || stats.totalRecorded === 0) ? (
                  <div className="ind-empty-state" style={{ padding: '40px 20px' }}>
                    <FileText size={48} className="ind-empty-icon" />
                    <h3>No Attendance Data For Period</h3>
                    <p>No timesheet or attendance records logged for {monthsList[selectedMonth]} {selectedYear}.</p>
                  </div>
                ) : (
                  <div className="ind-payslip-dashboard">
                    {/* Attendance Grid */}
                    <div className="ind-slip-attendance-row">
                      <div className="att-box">
                        <label>Logged Days</label>
                        <div className="val">{stats.totalRecorded} Days</div>
                      </div>
                      <div className="att-box present">
                        <label>Days Present</label>
                        <div className="val">{stats.present} Days</div>
                      </div>
                      <div className="att-box absent">
                        <label>Days Absent</label>
                        <div className="val">{stats.absent} Days</div>
                      </div>
                      <div className="att-box excess">
                        <label>Excess Leaves</label>
                        <div className="val" style={{ color: stats.debitedDays > 0 ? 'var(--error-color)' : 'inherit' }}>{stats.debitedDays} Days</div>
                      </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="ind-table-wrapper" style={{ marginTop: '20px' }}>
                      <table className="ind-table-element">
                        <thead>
                          <tr>
                            <th>Description Component</th>
                            <th style={{ textAlign: 'right' }}>Earnings</th>
                            <th style={{ textAlign: 'right' }}>Deductions</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Monthly Base Salary Reference</td>
                            <td style={{ textAlign: 'right', color: '#64748b', fontStyle: 'italic' }}>₹ {Number(employee.salary).toLocaleString('en-IN')}</td>
                            <td style={{ textAlign: 'right' }}>-</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: '600' }}>Present Days Earnings ({stats.present} days present out of {stats.daysInMonth} days)</td>
                            <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)' }}>₹ {Math.round(stats.presentPay).toLocaleString('en-IN')}</td>
                            <td style={{ textAlign: 'right' }}>-</td>
                          </tr>
                          {stats.bonus > 0 && (
                            <tr style={{ color: '#10b981', fontWeight: '600' }}>
                              <td>Attendance Bonus (Perfect attendance extra pay)</td>
                              <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.bonus).toLocaleString('en-IN')}</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                            </tr>
                          )}
                          {stats.debitAmount > 0 && (
                            <tr style={{ color: '#ef4444' }}>
                              <td>Leave Deduction ({stats.debitedDays} excess absent days)</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.debitAmount).toLocaleString('en-IN')}</td>
                            </tr>
                          )}
                          {stats.shortTermDeduct > 0 && (
                            <tr style={{ color: '#ef4444', fontWeight: '600' }}>
                              <td>Short-Term Advance Repayment (Auto-debit)</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.shortTermDeduct).toLocaleString('en-IN')}</td>
                            </tr>
                          )}
                          {stats.longTermDeduct > 0 && (
                            <tr style={{ color: '#ef4444', fontWeight: '600' }}>
                              <td>Long-Term Advance Repayment Installment</td>
                              <td style={{ textAlign: 'right' }}>-</td>
                              <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.longTermDeduct).toLocaleString('en-IN')}</td>
                            </tr>
                          )}
                          <tr style={{ fontWeight: 'bold', background: 'var(--ind-primary-light)', fontSize: '15px' }}>
                            <td style={{ color: 'var(--ind-primary)' }}>Net Payable Salary</td>
                            <td colSpan="2" style={{ textAlign: 'right', color: 'var(--ind-primary)', fontWeight: '800', fontSize: '18px' }}>
                              ₹ {Math.round(stats.netPay).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="ind-mobile-bottom-nav">
        {tabs.map(tabItem => (
          <button
            key={tabItem.id}
            className={`ind-mobile-nav-btn ${activeTab === tabItem.id ? 'active' : ''}`}
            onClick={() => navigate(`/individual-portal/${tabItem.id}`)}
          >
            <span className="ind-mobile-nav-icon">{React.cloneElement(tabItem.icon, { size: 20 })}</span>
            <span className="ind-mobile-nav-label">{tabItem.mobileLabel}</span>
          </button>
        ))}
      </div>
    </PortalLayout>
  );
};

export default IndividualPortal;
