import React, { useState } from 'react';
import Header from '../Header/Header';
import Sidebar from '../Sidebar/Sidebar';
import './Layout.css';

const Layout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <div className={`layout-wrapper ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <Header toggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
      <div className="layout-body">
        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
        {isSidebarOpen && (
          <div className="sidebar-overlay" onClick={closeSidebar}></div>
        )}
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;

