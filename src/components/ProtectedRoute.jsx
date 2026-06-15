import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSession } from '@descope/react-sdk';
import Loader from './Loader/Loader';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  const { isAuthenticated, isSessionLoading } = useSession();
  const location = useLocation();

  if (loading || isSessionLoading) {
    return <Loader type="page" message="Verifying secure session..." />;
  }

  // Allow access if either Firebase user is present or Descope session is authenticated
  if (!currentUser && !isAuthenticated) {
    // Redirect to login but save the current location they were trying to go to
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Strict Role-Based Security:
  // If the user is authenticated via Descope (portal operator), they are restricted
  // to their specialized portals or onboarding, and must never access Super Admin views.
  if (isAuthenticated && !currentUser) {
    const allowedPatterns = [
      /^\/onboarding/,
      /^\/munit-portal/,
      /^\/punit-portal/,
      /^\/store-portal/,
      /^\/employee-portal/,
      /^\/individual-portal/,
      /^\/scan-box/
    ];
    
    const isAllowed = allowedPatterns.some(pattern => pattern.test(location.pathname));
    
    if (!isAllowed) {
      console.warn(`Unauthorized access attempt by portal user to: ${location.pathname}. Redirecting to Onboarding.`);
      return <Navigate to="/onboarding" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;
