import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrinterProvider } from './context/PrinterContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';
import Login from './pages/Login/Login';
import Home from './pages/Home/Home';
import Support from './pages/Support/Support';
import Employees from './pages/Employees/Employees';
import EmployeeDetails from './pages/Employees/EmployeeDetails';
import TimeSheet from './pages/Employees/TimeSheet';
import ManufacturingUnits from './pages/ManufacturingUnits/ManufacturingUnits';
import PackingUnits from './pages/PackingUnits/PackingUnits';
import PackingUnitDetails from './pages/PackingUnits/PackingUnitDetails';
import Items from './pages/Items/Items';
import Stores from './pages/Stores/Stores';
import StoreDetails from './pages/Stores/StoreDetails';
import Customers from './pages/Customers/Customers';
import CustomerDetails from './pages/Customers/CustomerDetails';
import Orders from './pages/Orders/Orders';
import ManufacturingUnitDetails from './pages/ManufacturingUnits/ManufacturingUnitDetails';
import Users from './pages/Users/Users';
import Payments from './pages/Payments/Payments';
import Onboarding from './pages/Onboarding/Onboarding';
import Categories from './pages/Categories/Categories';
import MUnitPortal from './portals/MUnitPortal/MUnitPortal';
import PUnitPortal from './portals/PUnitPortal/PUnitPortal';
import StorePortal from './portals/StorePortal/StorePortal';
import EmployeePortal from './portals/EmployeePortal/EmployeePortal';
import IndividualPortal from './portals/IndividualPortal/IndividualPortal';
import StoreWorkSheet from './pages/StoreWorkSheet/StoreWorkSheet';
import ScanBox from './pages/ScanBox/ScanBox';
import Dashboard from './pages/Dashboard/Dashboard';
import { Toaster } from 'react-hot-toast';
import { NotificationProvider } from './context/NotificationContext';



// Placeholder for other pages
const PlaceholderPage = ({ title }) => (
  <Layout>
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2 style={{ color: 'var(--accent-color)', fontSize: '32px', marginBottom: '20px' }}>{title}</h2>
      <p style={{ color: 'var(--text-secondary)' }}>This module is currently under development.</p>
    </div>
  </Layout>
);

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
      <PrinterProvider>
        <Router>
        <Toaster 
          position="top-right"
          toastOptions={{
            style: {
              background: '#FFFFFF',
              color: '#1A202C',
              border: '1px solid #E2E8F0',
              fontFamily: 'IBM Plex Sans',
              borderRadius: '12px',
              padding: '8px 16px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <Home />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Onboarding & Specialized Portals */}
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/munit-portal/:id" element={<ProtectedRoute><MUnitPortal /></ProtectedRoute>} />
          <Route path="/munit-portal/:id/:tab" element={<ProtectedRoute><MUnitPortal /></ProtectedRoute>} />
          <Route path="/punit-portal/:id" element={<ProtectedRoute><PUnitPortal /></ProtectedRoute>} />
          <Route path="/punit-portal/:id/:tab" element={<ProtectedRoute><PUnitPortal /></ProtectedRoute>} />
          <Route path="/store-portal/:id" element={<ProtectedRoute><StorePortal /></ProtectedRoute>} />
          <Route path="/store-portal/:id/:tab" element={<ProtectedRoute><StorePortal /></ProtectedRoute>} />
          <Route path="/employee-portal" element={<ProtectedRoute><EmployeePortal /></ProtectedRoute>} />
          <Route path="/employee-portal/:tab" element={<ProtectedRoute><EmployeePortal /></ProtectedRoute>} />
          <Route path="/individual-portal" element={<ProtectedRoute><IndividualPortal /></ProtectedRoute>} />
          <Route path="/individual-portal/:tab" element={<ProtectedRoute><IndividualPortal /></ProtectedRoute>} />
          <Route path="/scan-box/:orderId/:boxId" element={<ProtectedRoute><ScanBox /></ProtectedRoute>} />

          {/* Super Admin Module Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Layout><Orders /></Layout></ProtectedRoute>} />
          <Route path="/store-worksheet" element={<ProtectedRoute><Layout><StoreWorkSheet /></Layout></ProtectedRoute>} />
          <Route path="/customers" element={<ProtectedRoute><Layout><Customers /></Layout></ProtectedRoute>} />
          <Route path="/customers/:id" element={<ProtectedRoute><Layout><CustomerDetails /></Layout></ProtectedRoute>} />
          <Route path="/items" element={<ProtectedRoute><Layout><Items /></Layout></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute><Layout><Categories /></Layout></ProtectedRoute>} />
          <Route path="/stores" element={<ProtectedRoute><Layout><Stores /></Layout></ProtectedRoute>} />
          <Route path="/stores/:id" element={<ProtectedRoute><Layout><StoreDetails /></Layout></ProtectedRoute>} />


          <Route path="/manufacturing" element={<ProtectedRoute><Layout><ManufacturingUnits /></Layout></ProtectedRoute>} />
          <Route path="/manufacturing/:id" element={<ProtectedRoute><Layout><ManufacturingUnitDetails /></Layout></ProtectedRoute>} />
          <Route path="/packing" element={<ProtectedRoute><Layout><PackingUnits /></Layout></ProtectedRoute>} />
          <Route path="/packing/:id" element={<ProtectedRoute><Layout><PackingUnitDetails /></Layout></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Layout><Users /></Layout></ProtectedRoute>} />
          <Route path="/employees" element={<ProtectedRoute><Layout><Employees /></Layout></ProtectedRoute>} />
          <Route path="/employees/:id" element={<ProtectedRoute><Layout><EmployeeDetails /></Layout></ProtectedRoute>} />
          <Route path="/timesheet" element={<ProtectedRoute><TimeSheet /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><PlaceholderPage title="Reports" /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute><Layout><Support /></Layout></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute><PlaceholderPage title="Audit Logs" /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute><Layout><Payments /></Layout></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><PlaceholderPage title="Settings" /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><PlaceholderPage title="Notifications" /></ProtectedRoute>} />
          <Route path="/documents" element={<ProtectedRoute><PlaceholderPage title="Documents" /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
      </PrinterProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
