import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Factory, Package, LogOut, Users, User } from 'lucide-react';
import { auth, db } from '../../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Loader from '../../components/Loader/Loader';
import './Onboarding.css';

const Onboarding = () => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAccess = async () => {
      // In a real scenario, after OTP we get auth.currentUser.phoneNumber
      // Or we store a flag in local storage. Let's just use localStorage for user role mocking for now
      const phone = localStorage.getItem('userPhone') || auth.currentUser?.phoneNumber;
      
      try {
        let userProfile = null;
        let employeeProfile = null;
        if (auth.currentUser?.email === 'admin@ravisweets.com') {
           userProfile = {
             name: "Super Admin",
             role: 'admin',
             access: {
               stores: ['all'],
               mUnits: ['all'],
               pUnits: ['all']
             }
           };
        } else if (phone) {
           const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;
           
           // Check for both formats since the DB might store it without +91
           const q = query(collection(db, 'users'), where('mobileNumber', 'in', [phone, normalizedPhone]));
           const snap = await getDocs(q);
           if (!snap.empty) {
             userProfile = { id: snap.docs[0].id, ...snap.docs[0].data() };
           }

           // Check employees collection
           const qEmp = query(collection(db, 'employees'), where('phone', 'in', [phone, normalizedPhone]));
           const snapEmp = await getDocs(qEmp);
           if (!snapEmp.empty) {
             employeeProfile = { id: snapEmp.docs[0].id, ...snapEmp.docs[0].data() };
           }
        }
        
        if (userProfile || employeeProfile) {
          const [sSnap, mSnap, pSnap] = await Promise.all([
            getDocs(collection(db, 'stores')),
            getDocs(collection(db, 'manufacturing_units')),
            getDocs(collection(db, 'packing_units'))
          ]);
          
          const storesMap = sSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          const mUnitsMap = mSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          const pUnitsMap = pSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          
          const finalProfile = userProfile || {
            name: employeeProfile ? `${employeeProfile.firstName} ${employeeProfile.lastName || ''}` : 'Employee',
            role: 'employee',
            access: {}
          };
          
          setUserData({ profile: finalProfile, employeeProfile, storesMap, mUnitsMap, pUnitsMap });
        } else {
          toast.error("No access found for this account");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAccess();
  }, []);

  if (loading) return <Loader type="page" message="Loading your portals..." />;

  if (!userData) {
    return (
      <div className="onb-container">
        <h2>No Access Configurations Found</h2>
        <button className="onb-logout" onClick={() => signOut(auth).then(() => navigate('/login'))}>Logout</button>
      </div>
    );
  }

  const { profile, employeeProfile, storesMap, mUnitsMap, pUnitsMap } = userData;

  const getStoreName = (id) => storesMap.find(s => s.id === id)?.name || id;
  const getMUnitName = (id) => mUnitsMap.find(s => s.id === id)?.name || id;
  const getPUnitName = (id) => pUnitsMap.find(s => s.id === id)?.name || id;

  const stores = profile.access?.stores || [];
  const mUnits = profile.access?.mUnits || [];
  const pUnits = profile.access?.pUnits || [];

  return (
    <div className="onb-container">
      <div className="onb-header">
        <div>
          <h1>Welcome, {profile.name}</h1>
          <p>Select a portal to continue</p>
        </div>
        <button className="onb-logout" onClick={() => signOut(auth).then(() => { localStorage.removeItem('userPhone'); navigate('/login'); })}>
          <LogOut size={16} /> Logout
        </button>
      </div>

      <div className="onb-grid">
        {stores.map(storeId => (
          <motion.div 
            key={`store-${storeId}`} 
            className="onb-card store" 
            onClick={() => navigate(`/store-portal/${storeId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Store size={32} /></div>
            <h3>{storeId === 'all' ? 'All Stores' : getStoreName(storeId)}</h3>
            <p>Store Portal</p>
          </motion.div>
        ))}

        {mUnits.map(unitId => (
          <motion.div 
            key={`munit-${unitId}`} 
            className="onb-card munit" 
            onClick={() => navigate(`/munit-portal/${unitId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Factory size={32} /></div>
            <h3>{unitId === 'all' ? 'All Manufacturing' : getMUnitName(unitId)}</h3>
            <p>Manufacturing Portal</p>
          </motion.div>
        ))}

        {pUnits.map(unitId => (
          <motion.div 
            key={`punit-${unitId}`} 
            className="onb-card punit" 
            onClick={() => navigate(`/punit-portal/${unitId}`)}
            whileHover={{ y: -5 }}
          >
            <div className="icon-box"><Package size={32} /></div>
            <h3>{unitId === 'all' ? 'All Packing' : getPUnitName(unitId)}</h3>
            <p>Packing Portal</p>
          </motion.div>
        ))}

        {profile.access?.employees && (
          <motion.div 
            key="employee-portal" 
            className="onb-card employee" 
            onClick={() => navigate('/employee-portal')}
            whileHover={{ y: -5 }}
            style={{ borderLeft: '6px solid #8b5cf6' }}
          >
            <div className="icon-box" style={{ background: '#f5f3ff', color: '#8b5cf6' }}><Users size={32} /></div>
            <h3>Employee Operations</h3>
            <p>Employees & Timesheet Portal</p>
          </motion.div>
        )}

        {(employeeProfile || profile.access?.individual) && (
          <motion.div 
            key="individual-portal" 
            className="onb-card employee-individual" 
            onClick={() => navigate('/individual-portal')}
            whileHover={{ y: -5 }}
            style={{ borderLeft: '6px solid #a855f7' }}
          >
            <div className="icon-box" style={{ background: '#f3e8ff', color: '#a855f7' }}><User size={32} /></div>
            <h3>My Profile</h3>
            <p>Personal Details & Advances</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
