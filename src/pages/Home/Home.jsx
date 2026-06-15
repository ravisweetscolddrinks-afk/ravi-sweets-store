import React from 'react';
import { Link } from 'react-router-dom';
import { 
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
  ArrowRight,
  LifeBuoy
} from 'lucide-react';
import { motion } from 'framer-motion';
import './Home.css';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, path: '/dashboard', color: 'purple' },
  { id: 'payments', label: 'Payments', icon: <CreditCard />, path: '/payments', color: 'pink' },
  { id: 'orders', label: 'Orders', icon: <ShoppingBag />, path: '/orders', color: 'pink' },
  { id: 'store-worksheet', label: 'Store Work Sheet', icon: <ClipboardList />, path: '/store-worksheet', color: 'teal' },
  { id: 'items', label: 'Items', icon: <Box />, path: '/items', color: 'orange' },
  { id: 'categories', label: 'Categories', icon: <Tag />, path: '/categories', color: 'teal' },
  { id: 'stores', label: 'Stores', icon: <Store />, path: '/stores', color: 'violet' },
  { id: 'manufacturing', label: 'Manufacturing Units', icon: <Factory />, path: '/manufacturing', color: 'green' },
  { id: 'packing', label: 'Packing Units', icon: <Package />, path: '/packing', color: 'purple' },
  { id: 'users', label: 'Users and Roles', icon: <UserCog />, path: '/users', color: 'pink' },
  { id: 'employees', label: 'Employees', icon: <UserCircle />, path: '/employees', color: 'blue' },
  { id: 'timesheet', label: 'Timesheet', icon: <Clock />, path: '/timesheet', color: 'orange' },
  { id: 'support', label: 'Support', icon: <LifeBuoy />, path: '/support', color: 'pink' },
];

const Home = () => {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.9 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <div className="home-container">
      <motion.div 
        className="home-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="home-title">
          <span className="decoration-swirl">🍃</span>
          Select a <span className="underline">module</span> to manage your <span className="underline">sweets business</span>
          <span className="decoration-swirl">🍃</span>
        </h1>
      </motion.div>

      <motion.div 
        className="tiles-grid"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {menuItems.map((menu) => (
          <motion.div key={menu.id} variants={item}>
            <Link to={menu.path} className="nav-tile">
              <div className={`tile-header bg-${menu.color}`}>
                <div className="tile-icon-circle">
                  {menu.icon}
                </div>
              </div>
              <div className="tile-footer">
                <span className="tile-label">{menu.label}</span>
                <div className={`tile-arrow arrow-${menu.color}`}>
                  <ArrowRight size={18} />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Home;
