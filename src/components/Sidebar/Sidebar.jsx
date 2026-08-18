import React, { useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { 
  LogOut,
  LayoutDashboard, 
  ShoppingBag, 
  ClipboardList,
  Box, 
  Tag, 
  Store, 
  Factory, 
  Package, 
  UserCog, 
  UserCircle, 
  Clock, 
  CreditCard, 
  LifeBuoy,
  Settings,
  Receipt,
  Barcode,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Sidebar.css';

export const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, path: '/dashboard' },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag />, path: '/orders' },

  { id: 'pos-billing', label: 'Billing & POS', icon: <CreditCard />, path: '/pos-billing' },
  { id: 'walkin-sales', label: 'Walk-In Sales', icon: <Receipt />, path: '/walkin-sales' },
  { id: 'barcode-generator', label: 'Barcode Generator', icon: <Barcode />, path: '/barcode-generator' },
  { id: 'items', label: 'Products', icon: <Box />, path: '/items' },
  { id: 'categories', label: 'Collections', icon: <Tag />, path: '/categories' },
  { id: 'payments', label: 'Payments', icon: <CreditCard />, path: '/payments' },
  { id: 'store-worksheet', label: 'Work Sheet', icon: <ClipboardList />, path: '/store-worksheet' },
  { id: 'stores', label: 'Stores', icon: <Store />, path: '/stores' },
  { id: 'manufacturing', label: 'Manufacturing', icon: <Factory />, path: '/manufacturing' },
  { id: 'packing', label: 'Packing Units', icon: <Package />, path: '/packing' },
  { id: 'users', label: 'Users & Roles', icon: <UserCog />, path: '/users' },
  { id: 'employees', label: 'Employees', icon: <UserCircle />, path: '/employees' },
  { id: 'timesheet', label: 'Timesheet', icon: <Clock />, path: '/timesheet' },
  { id: 'support', label: 'Support', icon: <LifeBuoy />, path: '/support' },
];


const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem('sidebar-scroll-pos');
    if (savedScroll && menuRef.current) {
      menuRef.current.scrollTop = Number(savedScroll);
    }
  }, []);

  const handleScroll = (e) => {
    sessionStorage.setItem('sidebar-scroll-pos', e.target.scrollTop);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
      if (onClose) onClose();
    } catch (error) {
      toast.error('Error logging out');
    }
  };

  const handleItemClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside className={`sidebar ${isOpen ? 'drawer-open' : ''}`}>
      <div className="sidebar-header-mobile">
        <span className="sidebar-mobile-title">Navigation</span>
        <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div 
        className="sidebar-menu" 
        ref={menuRef} 
        onScroll={handleScroll}
      >
        <div className="sidebar-section-title">Core Modules</div>
        {menuItems.slice(0, 4).map((item) => (
          <Link 
            key={item.id} 
            to={item.path} 
            onClick={handleItemClick}
            className={`sidebar-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'active' : ''}`}
          >
            {React.cloneElement(item.icon, { size: 18, className: 'sidebar-icon' })}
            <span className="sidebar-label">{item.label}</span>
            {item.badge && <span className="sidebar-badge">{item.badge}</span>}
          </Link>
        ))}

        <div className="sidebar-section-title">Operations</div>
        {menuItems.slice(4, 12).map((item) => (
          <Link 
            key={item.id} 
            to={item.path} 
            onClick={handleItemClick}
            className={`sidebar-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'active' : ''}`}
          >
            {React.cloneElement(item.icon, { size: 18, className: 'sidebar-icon' })}
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}

        <div className="sidebar-section-title">Admin & Staff</div>
        {menuItems.slice(12).map((item) => (

          <Link 
            key={item.id} 
            to={item.path} 
            onClick={handleItemClick}
            className={`sidebar-item ${location.pathname.startsWith(item.path) && item.path !== '/' ? 'active' : ''}`}
          >
            {React.cloneElement(item.icon, { size: 18, className: 'sidebar-icon' })}
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="sidebar-logout-btn">
          <LogOut size={18} />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

