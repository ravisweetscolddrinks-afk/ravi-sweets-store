import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, Factory, Package, LogOut, Users, User, Barcode } from 'lucide-react';
import { auth, db } from '../../config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Loader from '../../components/Loader/Loader';
import logo from '../../assets/logo.png';
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
        if (auth.currentUser?.email === 'admin@rajusweets.com') {
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
    <div className="onb-page-wrapper">
      {/* Dark Green Polaris Top Header */}
      <header className="onb-top-header">
        <div className="onb-header-left">
          <div className="onb-logo-wrapper">
            <img src={logo} alt="Raju Ghee Sweets" className="onb-logo-img" />
            <span className="onb-brand-title">Raju Ghee Sweets</span>
          </div>
          <span className="onb-season-tag">Portal Gateway</span>
        </div>
        <div className="onb-header-right">
          <button 
            className="onb-logout-btn" 
            onClick={() => signOut(auth).then(() => { localStorage.removeItem('userPhone'); navigate('/login'); })}
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      {/* Main Canvas Body */}
      <div className="onb-container">
        <div className="onb-welcome-banner">
          <div>
            <h1 className="onb-welcome-title">Welcome back, {profile.name} 👋</h1>
            <p className="onb-welcome-subtitle">Select a portal below to access your workspace and manage operations</p>
          </div>
        </div>

        <div className="onb-grid">
          {stores.map(storeId => (
            <motion.div 
              key={`store-${storeId}`} 
              className="onb-card store" 
              onClick={() => navigate(`/store-portal/${storeId}`)}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box store">
                <Store size={28} />
              </div>
              <div className="onb-card-body">
                <h3>{storeId === 'all' ? 'All Outlets' : getStoreName(storeId)}</h3>
                <p>Store & POS Portal</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          ))}

          {mUnits.map(unitId => (
            <motion.div 
              key={`munit-${unitId}`} 
              className="onb-card munit" 
              onClick={() => navigate(`/munit-portal/${unitId}`)}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box munit">
                <Factory size={28} />
              </div>
              <div className="onb-card-body">
                <h3>{unitId === 'all' ? 'All Kitchens' : getMUnitName(unitId)}</h3>
                <p>Manufacturing Kitchen</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          ))}

          {pUnits.map(unitId => (
            <motion.div 
              key={`punit-${unitId}`} 
              className="onb-card punit" 
              onClick={() => navigate(`/punit-portal/${unitId}`)}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box punit">
                <Package size={28} />
              </div>
              <div className="onb-card-body">
                <h3>{unitId === 'all' ? 'All Packing Units' : getPUnitName(unitId)}</h3>
                <p>Packing & Despatch</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          ))}

          {profile.access?.employees && (
            <motion.div 
              key="employee-portal" 
              className="onb-card employee" 
              onClick={() => navigate('/employee-portal')}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box employee">
                <Users size={28} />
              </div>
              <div className="onb-card-body">
                <h3>Employee Operations</h3>
                <p>Staff & Attendance Management</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          )}

          {(profile.role === 'admin' || profile.access?.barcodeGenerator) && (
            <motion.div 
              key="barcode-portal" 
              className="onb-card store" 
              onClick={() => navigate('/barcode-generator')}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box store" style={{ background: '#ecfdf5', color: '#059669' }}>
                <Barcode size={28} />
              </div>
              <div className="onb-card-body">
                <h3>Barcode Generator</h3>
                <p>Weight & Sticker Printing</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          )}

          {(employeeProfile || profile.access?.individual) && (
            <motion.div 
              key="individual-portal" 
              className="onb-card individual" 
              onClick={() => navigate('/individual-portal')}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <div className="onb-icon-box individual">
                <User size={28} />
              </div>
              <div className="onb-card-body">
                <h3>My Profile</h3>
                <p>Personal Details & Payslips</p>
              </div>
              <span className="onb-action-chip">Launch Portal &rarr;</span>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );

};

export default Onboarding;
