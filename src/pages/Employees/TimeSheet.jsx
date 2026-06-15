import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';
import { 
  Calendar, 
  Check, 
  X, 
  AlertCircle, 
  User, 
  Search, 
  Clock, 
  IndianRupee, 
  Printer, 
  TrendingUp, 
  Percent, 
  Award,
  ChevronRight,
  Sparkles,
  FileText,
  CreditCard,
  Coins,
  MinusCircle,
  PlusCircle,
  Edit,
  Save
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../../components/Layout/Layout';
import './TimeSheet.css';

const TimeSheet = () => {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [activeTab, setActiveTab] = useState('attendance');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState({}); // tracking per employee loading: { [empId]: boolean }

  // Advances State
  const [advances, setAdvances] = useState([]);
  
  // Persistent monthly payroll deductions fetched from Firestore
  // { [empId]: { shortTermDeduct, longTermDeduct, shortTermInstalments: {...}, shortTermInstalmentIds: {...}, ... } }
  const [processedDeductions, setProcessedDeductions] = useState({});
  
  // Track inline editing status per employee: { [empId]: boolean }
  const [isEditingDeduction, setIsEditingDeduction] = useState({});
  
  // Temporary input state for debits while editing: { [empId]: { shortTerm, longTerm } }
  const [tempDeductions, setTempDeductions] = useState({});

  // Month selection for Analytics & Payroll
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Analytics & Payroll stats
  const [allAttendanceRecords, setAllAttendanceRecords] = useState([]);
  const [selectedPayee, setSelectedPayee] = useState(null); // for payslip modal

  const monthsList = [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(collection(db, 'employees'));
      const emps = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(emps);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch employees");
    }
  };

  const fetchAdvances = async () => {
    try {
      const snap = await getDocs(collection(db, 'advances'));
      setAdvances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProcessedDeductions = async () => {
    try {
      const snap = await getDocs(collection(db, 'payroll_deductions'));
      const deductionsMap = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.month === selectedMonth && data.year === selectedYear) {
          deductionsMap[data.employeeId] = { id: doc.id, ...data };
        }
      });
      setProcessedDeductions(deductionsMap);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAttendanceForDate = async (date) => {
    try {
      const snap = await getDocs(collection(db, 'attendance'));
      const dayRecords = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.date === date) {
          dayRecords[data.employeeId] = data.status;
        }
      });
      
      const updatedAttendance = {};
      employees.forEach(emp => {
        updatedAttendance[emp.id] = dayRecords[emp.id] || 'present';
      });
      setAttendance(updatedAttendance);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllAttendanceRecords = async () => {
    try {
      const snap = await getDocs(collection(db, 'attendance'));
      setAllAttendanceRecords(snap.docs.map(doc => doc.data()));
    } catch (err) {
      console.error(err);
    }
  };

  const initData = async () => {
    setLoading(true);
    await fetchEmployees();
    await fetchAdvances();
    await fetchProcessedDeductions();
    setLoading(false);
  };

  useEffect(() => {
    initData();
  }, []);

  useEffect(() => {
    if (employees.length > 0) {
      fetchAttendanceForDate(selectedDate);
    }
  }, [selectedDate, employees]);

  useEffect(() => {
    fetchAllAttendanceRecords();
    fetchAdvances();
    fetchProcessedDeductions();
  }, [activeTab, selectedMonth, selectedYear]);

  const handleStatusChange = (empId, status) => {
    setAttendance(prev => ({
      ...prev,
      [empId]: status
    }));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const promises = Object.keys(attendance).map(async (empId) => {
        const status = attendance[empId];
        const recordId = `${empId}_${selectedDate}`;
        
        await setDoc(doc(db, 'attendance', recordId), {
          employeeId: empId,
          date: selectedDate,
          status,
          updatedAt: new Date().toISOString()
        });

        const leaveRef = doc(db, 'leaves', recordId);
        if (status === 'absent') {
          await setDoc(leaveRef, {
            employeeId: empId,
            date: selectedDate,
            type: 'Absent',
            status: 'Approved',
            reason: 'Marked Absent via Timesheet',
            createdAt: new Date().toISOString()
          });
        } else if (status === 'halfday') {
          await setDoc(leaveRef, {
            employeeId: empId,
            date: selectedDate,
            type: 'Half Day',
            status: 'Approved',
            reason: 'Marked Half Day via Timesheet',
            createdAt: new Date().toISOString()
          });
        } else {
          await deleteDoc(leaveRef);
        }
      });

      await Promise.all(promises);
      toast.success("Attendance saved and leaves synchronized successfully!");
      fetchAllAttendanceRecords();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save attendance");
    } finally {
      setSaving(false);
    }
  };

  // Calculations for payroll / analytics
  const calculateEmployeeStats = (emp) => {
    const monthlyRecords = allAttendanceRecords.filter(r => {
      const rDate = new Date(r.date);
      return r.employeeId === emp.id && 
             rDate.getMonth() === selectedMonth && 
             rDate.getFullYear() === selectedYear;
    });

    const salary = Number(emp.salary || 0);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const perDayPay = salary / 30;
    const acceptedLeaves = Number(emp.acceptedLeaves || 0);

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

    // ADVANCES LOGIC
    const empAdvances = advances.filter(a => a.employeeId === emp.id && a.status === 'active');
    
    // Short Term Advance pending
    const shortTermActive = empAdvances.filter(a => a.type === 'short_term');
    const shortTermPending = shortTermActive.reduce((sum, a) => sum + Number(a.balance || 0), 0);

    // Long Term Advance pending
    const longTermActive = empAdvances.filter(a => a.type === 'long_term');
    const longTermPending = longTermActive.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    
    // Check if deduction is already saved/processed in database for this month
    const processed = processedDeductions[emp.id];
    const isDebited = !!processed;

    const shortTermDeduct = isDebited ? Number(processed.shortTermDeduct || 0) : 0;
    const longTermDeduct = isDebited ? Number(processed.longTermDeduct || 0) : 0;

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
      totalRecorded: monthlyRecords.length,
      shortTermActive,
      longTermActive,
      isDebited,
      hasAdvance: shortTermPending > 0 || longTermPending > 0 || isDebited
    };
  };

  // Click handler for "Debit Advance"
  // It initializes the inline temp deductions inputs and activates edit mode immediately
  const handleDebitAdvanceToggle = (empId) => {
    const emp = employees.find(e => e.id === empId);
    const stats = calculateEmployeeStats(emp);

    const defaultST = Math.min(stats.basicNetPay, stats.shortTermPending);
    const defaultLT = Math.min(Math.max(0, stats.basicNetPay - defaultST), stats.longTermPending);

    setTempDeductions(prev => ({
      ...prev,
      [empId]: {
        shortTerm: defaultST,
        longTerm: defaultLT
      }
    }));
    
    setIsEditingDeduction(prev => ({
      ...prev,
      [empId]: true
    }));
  };

  const handleTempSTChange = (empId, val, maxVal, basicNetPay) => {
    const numericVal = Number(val);
    if (numericVal < 0) return;
    
    const constrainedVal = Math.min(numericVal, maxVal, basicNetPay);
    setTempDeductions(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        shortTerm: val === '' ? '' : constrainedVal
      }
    }));
  };

  const handleTempLTChange = (empId, val, maxVal, maxLimit) => {
    const numericVal = Number(val);
    if (numericVal < 0) return;
    
    const constrainedVal = Math.min(numericVal, maxVal, maxLimit);
    setTempDeductions(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        longTerm: val === '' ? '' : constrainedVal
      }
    }));
  };

  // Click handler for "Edit Debit" on an already debited employee
  const handleEditExistingDebit = (empId) => {
    const processed = processedDeductions[empId];
    setTempDeductions(prev => ({
      ...prev,
      [empId]: {
        shortTerm: processed.shortTermDeduct,
        longTerm: processed.longTermDeduct
      }
    }));
    setIsEditingDeduction(prev => ({
      ...prev,
      [empId]: true
    }));
  };

  // Cancel/Reset current inline edit action
  const handleCancelInlineEdit = (empId) => {
    setIsEditingDeduction(prev => ({ ...prev, [empId]: false }));
    setTempDeductions(prev => ({ ...prev, [empId]: undefined }));
  };

  // Save the debit deduction directly into Firestore (immediately updating advances & employee details!)
  const handleSaveDebitDeduction = async (empId) => {
    setSavingDeduction(prev => ({ ...prev, [empId]: true }));
    const emp = employees.find(e => e.id === empId);
    const stats = calculateEmployeeStats(emp);
    const inputST = Number(tempDeductions[empId]?.shortTerm || 0);
    const inputLT = Number(tempDeductions[empId]?.longTerm || 0);

    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const deductionDocId = `${empId}_${selectedMonth}_${selectedYear}`;

    try {
      const processed = processedDeductions[empId];
      const shortTermInstalmentIds = processed?.shortTermInstalmentIds || {};
      const longTermInstalmentIds = processed?.longTermInstalmentIds || {};

      // A. PROCESS SHORT TERM ADVANCE
      const newShortTermInstalmentIds = { ...shortTermInstalmentIds };
      if (stats.shortTermActive.length > 0 || processed?.shortTermDeduct > 0) {
        const oldDeduct = processed?.shortTermDeduct || 0;
        const diff = inputST - oldDeduct;

        if (diff !== 0) {
          // Adjust advance document in Firestore
          const adv = stats.shortTermActive[0] || (processed?.shortTermAdvId ? { id: processed.shortTermAdvId, balance: 0 } : null);
          if (adv) {
            const currentAdvSnap = await getDoc(doc(db, 'advances', adv.id));
            const currentBalance = currentAdvSnap.exists() ? Number(currentAdvSnap.data().balance || 0) : 0;
            const updatedBalance = Math.max(0, currentBalance - diff);

            await updateDoc(doc(db, 'advances', adv.id), {
              balance: updatedBalance,
              status: updatedBalance <= 0 ? 'paid' : 'active'
            });

            // Adjust installment history
            if (processed && shortTermInstalmentIds[adv.id]) {
              const instId = shortTermInstalmentIds[adv.id];
              if (inputST === 0) {
                // If reset to 0, delete the instalment document
                await deleteDoc(doc(db, `advances/${adv.id}/instalments`, instId));
                delete newShortTermInstalmentIds[adv.id];
              } else {
                // Update existing instalment
                await setDoc(doc(db, `advances/${adv.id}/instalments`, instId), {
                  amount: inputST,
                  date: todayStr,
                  time: timeStr,
                  updatedAt: serverTimestamp(),
                  remark: `Payroll Debit Adjustment for ${monthsList[selectedMonth]} ${selectedYear}`
                }, { merge: true });
              }
            } else if (inputST > 0) {
              // Create brand new instalment document
              const instRef = await addDoc(collection(db, `advances/${adv.id}/instalments`), {
                amount: inputST,
                date: todayStr,
                time: timeStr,
                createdAt: serverTimestamp(),
                remark: `Payroll Auto-debit for ${monthsList[selectedMonth]} ${selectedYear}`
              });
              newShortTermInstalmentIds[adv.id] = instRef.id;
            }
          }
        }
      }

      // B. PROCESS LONG TERM ADVANCE
      const newLongTermInstalmentIds = { ...longTermInstalmentIds };
      if (stats.longTermActive.length > 0 || processed?.longTermDeduct > 0) {
        const oldDeduct = processed?.longTermDeduct || 0;
        const diff = inputLT - oldDeduct;

        if (diff !== 0) {
          const adv = stats.longTermActive[0] || (processed?.longTermAdvId ? { id: processed.longTermAdvId, balance: 0 } : null);
          if (adv) {
            const currentAdvSnap = await getDoc(doc(db, 'advances', adv.id));
            const currentBalance = currentAdvSnap.exists() ? Number(currentAdvSnap.data().balance || 0) : 0;
            const updatedBalance = Math.max(0, currentBalance - diff);

            await updateDoc(doc(db, 'advances', adv.id), {
              balance: updatedBalance,
              status: updatedBalance <= 0 ? 'paid' : 'active'
            });

            // Adjust installment history
            if (processed && longTermInstalmentIds[adv.id]) {
              const instId = longTermInstalmentIds[adv.id];
              if (inputLT === 0) {
                await deleteDoc(doc(db, `advances/${adv.id}/instalments`, instId));
                delete newLongTermInstalmentIds[adv.id];
              } else {
                await setDoc(doc(db, `advances/${adv.id}/instalments`, instId), {
                  amount: inputLT,
                  date: todayStr,
                  time: timeStr,
                  updatedAt: serverTimestamp(),
                  remark: `Payroll Debit Adjustment for ${monthsList[selectedMonth]} ${selectedYear}`
                }, { merge: true });
              }
            } else if (inputLT > 0) {
              const instRef = await addDoc(collection(db, `advances/${adv.id}/instalments`), {
                amount: inputLT,
                date: todayStr,
                time: timeStr,
                createdAt: serverTimestamp(),
                remark: `Payroll Debit for ${monthsList[selectedMonth]} ${selectedYear}`
              });
              newLongTermInstalmentIds[adv.id] = instRef.id;
            }
          }
        }
      }

      // C. SAVE PROCESS DEDUCTIONS LOG
      const activeSTAdv = stats.shortTermActive[0];
      const activeLTAdv = stats.longTermActive[0];

      await setDoc(doc(db, 'payroll_deductions', deductionDocId), {
        employeeId: empId,
        month: selectedMonth,
        year: selectedYear,
        shortTermDeduct: inputST,
        longTermDeduct: inputLT,
        shortTermAdvId: activeSTAdv?.id || processed?.shortTermAdvId || '',
        longTermAdvId: activeLTAdv?.id || processed?.longTermAdvId || '',
        shortTermInstalmentIds: newShortTermInstalmentIds,
        longTermInstalmentIds: newLongTermInstalmentIds,
        updatedAt: new Date().toISOString()
      });

      toast.success("Deduction saved and updated inside Employee Details successfully!");
      setIsEditingDeduction(prev => ({ ...prev, [empId]: false }));
      setTempDeductions(prev => ({ ...prev, [empId]: undefined }));

      // Reload fresh database values instantly
      await fetchAdvances();
      await fetchProcessedDeductions();
    } catch (err) {
      console.error(err);
      toast.error("Failed to update deduction details");
    } finally {
      setSavingDeduction(prev => ({ ...prev, [empId]: false }));
    }
  };

  // Revert/Delete the entire payroll advance deduction for this month
  const handleCancelDebitDeduction = async (empId) => {
    if (!window.confirm("Are you sure you want to cancel the debit for this month? This will refund the outstanding balance back to the employee's pending advances in their details page.")) return;

    setSavingDeduction(prev => ({ ...prev, [empId]: true }));
    const processed = processedDeductions[empId];

    try {
      // 1. Rollback short term advances
      if (processed.shortTermDeduct > 0 && processed.shortTermAdvId) {
        const advId = processed.shortTermAdvId;
        const currentAdvSnap = await getDoc(doc(db, 'advances', advId));
        const currentBalance = currentAdvSnap.exists() ? Number(currentAdvSnap.data().balance || 0) : 0;
        const rolledBackBalance = currentBalance + processed.shortTermDeduct;

        await updateDoc(doc(db, 'advances', advId), {
          balance: rolledBackBalance,
          status: 'active'
        });

        // Delete installment history record
        const instId = processed.shortTermInstalmentIds[advId];
        if (instId) {
          await deleteDoc(doc(db, `advances/${advId}/instalments`, instId));
        }
      }

      // 2. Rollback long term advances
      if (processed.longTermDeduct > 0 && processed.longTermAdvId) {
        const advId = processed.longTermAdvId;
        const currentAdvSnap = await getDoc(doc(db, 'advances', advId));
        const currentBalance = currentAdvSnap.exists() ? Number(currentAdvSnap.data().balance || 0) : 0;
        const rolledBackBalance = currentBalance + processed.longTermDeduct;

        await updateDoc(doc(db, 'advances', advId), {
          balance: rolledBackBalance,
          status: 'active'
        });

        const instId = processed.longTermInstalmentIds[advId];
        if (instId) {
          await deleteDoc(doc(db, `advances/${advId}/instalments`, instId));
        }
      }

      // 3. Delete the monthly process deduction document
      await deleteDoc(doc(db, 'payroll_deductions', processed.id));

      toast.success("Debit canceled! Outstanding balances updated inside Employee Details.");
      await fetchAdvances();
      await fetchProcessedDeductions();
    } catch (err) {
      console.error(err);
      toast.error("Failed to cancel debit deduction");
    } finally {
      setSavingDeduction(prev => ({ ...prev, [empId]: false }));
    }
  };

  const handlePrintPayslip = (payee) => {
    const stats = calculateEmployeeStats(payee);
    const printContent = `
      <html>
        <head>
          <title>Payslip - ${payee.firstName} ${payee.lastName}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; color: #1e3a8a; font-size: 28px; }
            .header p { margin: 5px 0 0 0; color: #64748b; font-size: 14px; }
            .section-title { font-size: 18px; font-weight: 700; color: #1e3a8a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .info-item { margin-bottom: 12px; }
            .info-item label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .info-item .value { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f8fafc; padding: 12px; font-size: 12px; font-weight: 700; text-align: left; color: #475569; border-bottom: 2px solid #e2e8f0; }
            td { padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .total-row { font-weight: bold; background: #eff6ff; font-size: 16px; }
            .total-row td { color: #1d4ed8; border-top: 2px solid #bfdbfe; }
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
                <div class="value">${payee.firstName} ${payee.lastName || ''}</div>
              </div>
              <div class="info-item">
                <label>Employee ID</label>
                <div class="value">EMP-${payee.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <div class="info-item">
                <label>Phone Number</label>
                <div class="value">${payee.phone}</div>
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
                <td>${payee.acceptedLeaves || 0} Days</td>
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
                <td style="text-align: right; color: #64748b; font-style: italic;">₹ ${Number(payee.salary).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
    const phone = emp.phone || '';
    const empId = `EMP-${emp.id.slice(0, 5).toUpperCase()}`;
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || phone.includes(query) || empId.toLowerCase().includes(query);
  });

  return (
    <Layout>
      <div className="ts-container">
        {/* Header */}
        <div className="ts-header">
          <div>
            <h1 className="ts-title">Employee Timesheet & Payroll</h1>
            <p className="ts-subtitle">Manage attendance, view analytics, and generate monthly payslips</p>
          </div>
          <div className="ts-tabs">
            <button className={`ts-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
              <Clock size={16} /> Attendance
            </button>
            <button className={`ts-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
              <TrendingUp size={16} /> Analytics
            </button>
            <button className={`ts-tab-btn ${activeTab === 'payroll' ? 'active' : ''}`} onClick={() => setActiveTab('payroll')}>
              <IndianRupee size={16} /> Payroll
            </button>
          </div>
        </div>

        {/* Content Tabs */}
        {loading ? (
          <div className="ts-loading"><div className="loader"></div></div>
        ) : (
          <div className="ts-content-card">
            {/* 1. ATTENDANCE TAB */}
            {activeTab === 'attendance' && (
              <div className="ts-tab-view">
                <div className="ts-filter-bar">
                  <div className="ts-search-wrapper">
                    <Search size={18} className="ts-search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search employees..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="ts-date-wrapper">
                    <Calendar size={18} className="ts-cal-icon" />
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="ts-table-wrapper">
                  <table className="ts-table attendance-tab">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Phone</th>
                        <th>Accepted Leaves</th>
                        <th style={{ textAlign: 'center' }}>Mark Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp) => (
                        <tr key={emp.id}>
                          <td>
                            <div className="ts-emp-cell">
                              <div className="ts-avatar">{emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}</div>
                              <div>
                                <span className="name">{emp.firstName} {emp.lastName || ''}</span>
                                <span className="id">EMP-{emp.id.slice(0, 5).toUpperCase()}</span>
                              </div>
                            </div>
                          </td>
                          <td>{emp.phone}</td>
                          <td style={{ fontWeight: '600' }}>{emp.acceptedLeaves || 0} Days/mo</td>
                          <td>
                            <div className="ts-status-group">
                              <button 
                                className={`ts-status-btn present ${attendance[emp.id] === 'present' ? 'active' : ''}`}
                                onClick={() => handleStatusChange(emp.id, 'present')}
                              >
                                Present
                              </button>
                              <button 
                                className={`ts-status-btn halfday ${attendance[emp.id] === 'halfday' ? 'active' : ''}`}
                                onClick={() => handleStatusChange(emp.id, 'halfday')}
                              >
                                Half Day
                              </button>
                              <button 
                                className={`ts-status-btn absent ${attendance[emp.id] === 'absent' ? 'active' : ''}`}
                                onClick={() => handleStatusChange(emp.id, 'absent')}
                              >
                                Absent
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No employees found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="ts-actions">
                  <button className="ts-save-btn" onClick={saveAttendance} disabled={saving}>
                    {saving ? <div className="loader" style={{ width: '16px', height: '16px', borderTopColor: '#fff' }}></div> : <><Check size={16} /> Save Daily Attendance</>}
                  </button>
                </div>
              </div>
            )}

            {/* 2. ANALYTICS TAB */}
            {activeTab === 'analytics' && (
              <div className="ts-tab-view">
                <div className="ts-filter-bar">
                  <div className="ts-search-wrapper">
                    <Search size={18} className="ts-search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search employees..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="ts-month-selectors">
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                      {monthsList.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                    </select>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                      {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                <div className="ts-table-wrapper">
                  <table className="ts-table analytics-tab">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Present Days</th>
                        <th>Half Days</th>
                        <th>Absent Days</th>
                        <th>Attendance Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp) => {
                        const stats = calculateEmployeeStats(emp);
                        const rate = stats.totalRecorded > 0 ? ((stats.present / stats.totalRecorded) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={emp.id}>
                            <td>
                              <div className="ts-emp-cell">
                                <div className="ts-avatar">{emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}</div>
                                <div>
                                  <span className="name">{emp.firstName} {emp.lastName || ''}</span>
                                  <span className="id">EMP-{emp.id.slice(0, 5).toUpperCase()}</span>
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: '700', color: '#10b981' }}>{stats.present} Days</td>
                            <td style={{ fontWeight: '600', color: '#f59e0b' }}>{stats.halfday} Days</td>
                            <td style={{ fontWeight: '600', color: '#ef4444' }}>{stats.absent} Days</td>
                            <td>
                              <div className="ts-rate-cell">
                                <div className="ts-progress-bar-bg">
                                  <div className="ts-progress-bar-fill" style={{ width: `${rate}%`, backgroundColor: Number(rate) > 85 ? '#10b981' : Number(rate) > 65 ? '#f59e0b' : '#ef4444' }}></div>
                                </div>
                                <span className="rate-text">{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No employees found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. PAYROLL TAB */}
            {activeTab === 'payroll' && (
              <div className="ts-tab-view">
                <div className="ts-filter-bar">
                  <div className="ts-search-wrapper">
                    <Search size={18} className="ts-search-icon" />
                    <input 
                      type="text" 
                      placeholder="Search employees..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="ts-month-selectors">
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
                      {monthsList.map((m, idx) => <option key={idx} value={idx}>{m}</option>)}
                    </select>
                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
                      {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {(() => {
                  const totalNetSalaryAll = filteredEmployees.reduce((sum, emp) => {
                    const stats = calculateEmployeeStats(emp);
                    return sum + stats.netPay;
                  }, 0);
                  const totalBasicSalaryAll = filteredEmployees.reduce((sum, emp) => sum + Number(emp.salary || 0), 0);
                  const totalDebitsAll = filteredEmployees.reduce((sum, emp) => {
                    const stats = calculateEmployeeStats(emp);
                    return sum + stats.debitAmount + stats.shortTermDeduct + stats.longTermDeduct;
                  }, 0);

                  return (
                    <div className="ts-payroll-summary-banner" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '20px',
                      marginBottom: '20px',
                      background: 'linear-gradient(135deg, #1e293b, #0f172a)',
                      padding: '20px',
                      borderRadius: '16px',
                      color: 'white',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Net Salary Payable</span>
                        <h2 style={{ fontSize: '26px', fontWeight: '900', color: '#10b981', margin: 0 }}>₹ {Math.round(totalNetSalaryAll).toLocaleString('en-IN')}</h2>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>For {filteredEmployees.length} active staff members</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid #334155', paddingLeft: '20px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Basic Salary Reference</span>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#e2e8f0', margin: 0 }}>₹ {Math.round(totalBasicSalaryAll).toLocaleString('en-IN')}</h3>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Combined contract salaries</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid #334155', paddingLeft: '20px' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Deductions & Advances</span>
                        <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444', margin: 0 }}>₹ {Math.round(totalDebitsAll).toLocaleString('en-IN')}</h3>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>Debits for leaves & advance repayments</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="ts-table-wrapper">
                  <table className="ts-table payroll-tab">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Basic Salary</th>
                        <th>Debit (Leaves)</th>
                        <th>Short Term Adv</th>
                        <th>Long Term Adv</th>
                        <th style={{ textAlign: 'center' }}>Debit Advance Option</th>
                        <th>Net Salary</th>
                        <th style={{ textAlign: 'center' }}>Payslip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp) => {
                        const stats = calculateEmployeeStats(emp);
                        const isEditing = !!isEditingDeduction[emp.id];
                        
                        return (
                          <tr key={emp.id}>
                            <td>
                              <div className="ts-emp-cell">
                                <div className="ts-avatar">{emp.firstName[0]}{emp.lastName ? emp.lastName[0] : ''}</div>
                                <div>
                                  <span className="name">{emp.firstName} {emp.lastName || ''}</span>
                                  <span className="id">EMP-{emp.id.slice(0, 5).toUpperCase()}</span>
                                </div>
                              </div>
                            </td>
                             <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: '600' }}>₹ {Number(emp.salary || 0).toLocaleString('en-IN')}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  {stats.present}d Present / {stats.absent}d Absent
                                </span>
                              </div>
                            </td>
                            <td style={{ color: stats.debitAmount > 0 ? '#ef4444' : '#475569', fontWeight: stats.debitAmount > 0 ? '700' : '500' }}>
                              {stats.debitAmount > 0 ? `- ₹ ${Math.round(stats.debitAmount).toLocaleString('en-IN')}` : '₹ 0'}
                              {stats.debitedDays > 0 && <span className="ts-days-sub">({stats.debitedDays}d excess)</span>}
                            </td>
                            
                            {/* Short Term Advance Column */}
                            <td>
                              {stats.shortTermPending > 0 || stats.shortTermDeduct > 0 ? (
                                <div className="ts-adv-column-info">
                                  <span className="pending-badge warning">Pending: ₹ {stats.shortTermPending}</span>
                                  {isEditing ? (
                                    <div className="ts-input-deduct-wrapper active-edit">
                                      <span className="rupee-symbol">₹</span>
                                      <input 
                                        type="number"
                                        className="ts-deduct-input"
                                        value={tempDeductions[emp.id]?.shortTerm ?? ''}
                                        onChange={(e) => handleTempSTChange(
                                          emp.id, 
                                          e.target.value, 
                                          stats.shortTermPending, 
                                          stats.basicNetPay
                                        )}
                                      />
                                      <Edit size={10} className="edit-indicator-icon" />
                                    </div>
                                  ) : (
                                    <span className={`deduct-badge ${stats.shortTermDeduct > 0 ? 'danger' : 'disabled'}`}>
                                      Deducted: ₹ {stats.shortTermDeduct}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="ts-light-text">₹ 0</span>
                              )}
                            </td>

                            {/* Long Term Advance Column */}
                            <td>
                              {stats.longTermPending > 0 || stats.longTermDeduct > 0 ? (
                                <div className="ts-adv-column-info">
                                  <span className="pending-badge info">Pending: ₹ {stats.longTermPending}</span>
                                  {isEditing ? (
                                    <div className="ts-input-deduct-wrapper active-edit">
                                      <span className="rupee-symbol">₹</span>
                                      <input 
                                        type="number"
                                        className="ts-deduct-input"
                                        placeholder="Deduct amount..."
                                        value={tempDeductions[emp.id]?.longTerm ?? ''}
                                        onChange={(e) => handleTempLTChange(
                                          emp.id, 
                                          e.target.value, 
                                          stats.longTermPending, 
                                          Math.max(0, stats.basicNetPay - Number(tempDeductions[emp.id]?.shortTerm || 0))
                                        )}
                                      />
                                      <Edit size={10} className="edit-indicator-icon" />
                                    </div>
                                  ) : (
                                    <span className={`deduct-badge ${stats.longTermDeduct > 0 ? 'danger' : 'disabled'}`}>
                                      Deducted: ₹ {stats.longTermDeduct}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="ts-light-text">₹ 0</span>
                              )}
                            </td>

                            {/* Debit Advance Option Button Column */}
                            <td style={{ textAlign: 'center' }}>
                              {stats.hasAdvance ? (
                                <div className="ts-row-actions">
                                  {savingDeduction[emp.id] ? (
                                    <div className="loader" style={{ width: '16px', height: '16px' }}></div>
                                  ) : isEditing ? (
                                    <div className="ts-inline-edit-group">
                                      <button 
                                        className="ts-inline-save-btn"
                                        onClick={() => handleSaveDebitDeduction(emp.id)}
                                        title="Save and update details immediately"
                                      >
                                        <Save size={13} /> Save
                                      </button>
                                      <button 
                                        className="ts-inline-cancel-btn"
                                        onClick={() => handleCancelInlineEdit(emp.id)}
                                        title="Cancel editing"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  ) : stats.isDebited ? (
                                    <div className="ts-inline-edit-group">
                                      <button 
                                        className="ts-debit-toggle-btn debited"
                                        onClick={() => handleCancelDebitDeduction(emp.id)}
                                        title="Cancel debit and refund details page balance"
                                      >
                                        <MinusCircle size={13} /> Cancel Debit
                                      </button>
                                      <button 
                                        className="ts-debit-edit-btn"
                                        onClick={() => handleEditExistingDebit(emp.id)}
                                        title="Edit debit amount"
                                      >
                                        <Edit size={13} /> Edit
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      className="ts-debit-toggle-btn"
                                      onClick={() => handleDebitAdvanceToggle(emp.id)}
                                    >
                                      <PlusCircle size={13} /> Debit Advance
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="ts-light-text">-</span>
                              )}
                            </td>

                            <td style={{ fontWeight: '800', color: 'var(--primary-color)', fontSize: '15px' }}>
                              ₹ {Math.round(stats.netPay).toLocaleString('en-IN')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button className="ts-btn-payslip" onClick={() => setSelectedPayee(emp)}>
                                <FileText size={14} /> Payslip
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>No employees found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payslip & Salary processing Modal */}
      <AnimatePresence>
        {selectedPayee && (() => {
          const stats = calculateEmployeeStats(selectedPayee);
          return (
            <div className="modal-overlay">
              <motion.div 
                className="ts-payslip-modal"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
              >
                <div className="payslip-modal-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Sparkles size={20} color="var(--primary-color)" />
                    <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Salary Payslip Preview</h3>
                  </div>
                  <button className="emp-close-circle" onClick={() => setSelectedPayee(null)}><X size={18} /></button>
                </div>

                <div className="payslip-print-area">
                  <div className="payslip-brand">
                    <h2>Ravi Sweets</h2>
                    <p>Employee Monthly Payslip</p>
                  </div>

                  <div className="payslip-meta-grid">
                    <div>
                      <span className="label">Employee Name</span>
                      <span className="value">{selectedPayee.firstName} {selectedPayee.lastName || ''}</span>
                    </div>
                    <div>
                      <span className="label">Period</span>
                      <span className="value">{monthsList[selectedMonth]} {selectedYear}</span>
                    </div>
                    <div>
                      <span className="label">Employee ID</span>
                      <span className="value">EMP-{selectedPayee.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="label">Phone</span>
                      <span className="value">{selectedPayee.phone}</span>
                    </div>
                  </div>

                  <div className="payslip-table-section">
                    <h4>Attendance Details</h4>
                    <table className="slip-subtable">
                      <thead>
                        <tr>
                          <th>Days Present</th>
                          <th>Days Absent</th>
                          <th>Allowed Leaves</th>
                          <th>Excess Debited Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{stats.present} Days</td>
                          <td>{stats.absent} Days</td>
                          <td>{selectedPayee.acceptedLeaves || 0} Days</td>
                          <td style={{ fontWeight: '700', color: stats.debitedDays > 0 ? '#ef4444' : '#0f172a' }}>{stats.debitedDays} Days</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="payslip-table-section" style={{ marginTop: '20px' }}>
                    <h4>Earnings & Deductions Summary</h4>
                    <table className="slip-subtable">
                      <thead>
                        <tr>
                          <th>Component</th>
                          <th style={{ textAlign: 'right' }}>Earnings</th>
                          <th style={{ textAlign: 'right' }}>Deductions</th>
                        </tr>
                      </thead>
                      <tbody>
                         <tr>
                          <td>Monthly Base Salary Reference</td>
                          <td style={{ textAlign: 'right', color: '#64748b', fontStyle: 'italic' }}>₹ {Number(selectedPayee.salary).toLocaleString('en-IN')}</td>
                          <td style={{ textAlign: 'right' }}>-</td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: '600' }}>Present Days Earnings ({stats.present} days out of {stats.daysInMonth} days)</td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>₹ {Math.round(stats.presentPay).toLocaleString('en-IN')}</td>
                          <td style={{ textAlign: 'right' }}>-</td>
                        </tr>
                        {stats.bonus > 0 && (
                          <tr style={{ color: '#10b981', fontWeight: '600' }}>
                            <td>Attendance Bonus (Perfect attendance)</td>
                            <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.bonus).toLocaleString('en-IN')}</td>
                            <td style={{ textAlign: 'right' }}>-</td>
                          </tr>
                        )}
                        {stats.debitAmount > 0 && (
                          <tr style={{ color: '#ef4444' }}>
                            <td>Leave Deduction ({stats.debitedDays} excess days)</td>
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
                            <td>Long-Term Advance Installment Deduction</td>
                            <td style={{ textAlign: 'right' }}>-</td>
                            <td style={{ textAlign: 'right' }}>₹ {Math.round(stats.longTermDeduct).toLocaleString('en-IN')}</td>
                          </tr>
                        )}
                        <tr className="slip-total-row">
                          <td style={{ fontWeight: '800' }}>Net payable amount</td>
                          <td colSpan="2" style={{ textAlign: 'right', fontWeight: '800', color: 'var(--primary-color)', fontSize: '18px' }}>
                            ₹ {Math.round(stats.netPay).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="payslip-modal-footer">
                  <button className="modal-btn cancel" onClick={() => setSelectedPayee(null)}>Close</button>
                  <button className="ts-print-btn" onClick={() => handlePrintPayslip(selectedPayee)}>
                    <Printer size={16} /> Print Payslip
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </Layout>
  );
};

export default TimeSheet;
