import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useSession } from '@descope/react-sdk';
import { db } from '../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  requestNotificationPermission,
  saveTokenToFirestore,
  initForegroundNotifications
} from '../utils/notificationService';

const NotificationContext = createContext(null);

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { isAuthenticated } = useSession();
  const initialized = useRef(false);
  const unsubscribeForegroundRef = useRef(null);

  useEffect(() => {
    const phone = localStorage.getItem('userPhone') || currentUser?.phoneNumber;
    const isLoggedIn = currentUser || (isAuthenticated && phone);

    // Only initialize when user is logged in and we haven't done it yet this session
    if (!isLoggedIn || initialized.current) return;

    const initNotifications = async () => {
      try {
        // 1. Request FCM permission & get token
        const token = await requestNotificationPermission();
        if (!token) return; // User denied or browser unsupported — silently skip

        // 2. Find the Firestore user document matching this user
        let userDocId = null;

        if (currentUser?.email === 'admin@ravisweets.com') {
          const snap = await getDocs(
            query(
              collection(db, 'users'),
              where('email', '==', currentUser.email)
            )
          );
          if (!snap.empty) {
            userDocId = snap.docs[0].id;
          } else {
            const newAdminDoc = await addDoc(collection(db, 'users'), {
              name: "Super Admin",
              email: currentUser.email,
              role: 'admin',
              access: {
                stores: ['all'],
                mUnits: ['all'],
                pUnits: ['all']
              },
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
            userDocId = newAdminDoc.id;
          }
        } else if (phone) {
          // Normalize phone: strip +91 prefix if present for comparison
          const normalizedPhone = phone.startsWith('+91') ? phone.slice(3) : phone;

          const snap = await getDocs(
            query(
              collection(db, 'users'),
              where('mobileNumber', 'in', [
                phone,
                normalizedPhone,
                `+91${normalizedPhone}`,
                `91${normalizedPhone}`
              ])
            )
          );

          if (!snap.empty) {
            userDocId = snap.docs[0].id;
          } else {
            console.log('No matching user doc in Firestore for phone:', phone);
          }
        }

        if (userDocId) {
          // 3. Save token to this user's Firestore doc
          await saveTokenToFirestore(userDocId, token);
        } else {
          console.log('No phone number or admin email available for matching user document');
        }

        // 4. Start listening for foreground push messages
        if (unsubscribeForegroundRef.current) {
          unsubscribeForegroundRef.current(); // cleanup old listener
        }
        unsubscribeForegroundRef.current = await initForegroundNotifications();
        initialized.current = true;

      } catch (err) {
        // Never let notification errors crash the app
        console.error('NotificationContext init error:', err);
      }
    };

    initNotifications();

    // Cleanup foreground listener on unmount / logout
    return () => {
      if (unsubscribeForegroundRef.current) {
        unsubscribeForegroundRef.current();
      }
    };
  }, [currentUser, isAuthenticated]);

  // Reset on logout
  useEffect(() => {
    const phone = localStorage.getItem('userPhone') || currentUser?.phoneNumber;
    const isLoggedIn = currentUser || (isAuthenticated && phone);
    if (!isLoggedIn) {
      initialized.current = false;
      if (unsubscribeForegroundRef.current) {
        unsubscribeForegroundRef.current();
        unsubscribeForegroundRef.current = null;
      }
    }
  }, [currentUser, isAuthenticated]);

  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
};

