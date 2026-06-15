import React from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getMessagingInstance } from '../config/firebase';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Request browser notification permission and get an FCM token.
 * Returns the token string, or null if denied/unsupported.
 */
export const requestNotificationPermission = async () => {
  try {
    // Check if the browser supports notifications
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return null;
    }

    // Check if service worker is available (required for FCM)
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers not supported');
      return null;
    }

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) {
      console.log('Firebase Messaging not supported in this browser');
      return null;
    }

    if (!VAPID_KEY) {
      console.warn('⚠️ VITE_FIREBASE_VAPID_KEY is not set in .env — FCM push will not work');
      return null;
    }

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      console.log('✅ FCM Token obtained:', token.substring(0, 20) + '...');
      return token;
    } else {
      console.log('No FCM token — check VAPID key and service worker setup');
      return null;
    }
  } catch (err) {
    // Don't throw — silently fail so notification issues don't break the app
    console.error('FCM token request error:', err);
    return null;
  }
};

/**
 * Save an FCM token to the user's Firestore document.
 * Uses arrayUnion to avoid duplicates.
 */
export const saveTokenToFirestore = async (userId, token) => {
  if (!userId || !token) return;
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      fcmTokens: arrayUnion(token)
    });
    console.log('✅ FCM token saved to Firestore for user:', userId);
  } catch (err) {
    console.error('Failed to save FCM token to Firestore:', err);
  }
};

/**
 * Initialize foreground FCM message listener.
 * Shows toast notifications when the user is actively using the app.
 * Returns an unsubscribe function.
 */
export const initForegroundNotifications = async () => {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return () => {};

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('📬 Foreground FCM message received:', payload);

      const title = payload.notification?.title || '🔔 Ravi Sweets';
      const body = payload.notification?.body || 'You have a new update';

      // Show an in-app toast notification
      toast.custom(
        (t) => React.createElement(
          'div',
          {
            style: {
              background: '#0a2a1b',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '12px 16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              maxWidth: '360px',
              cursor: 'pointer',
              opacity: t.visible ? 1 : 0,
              transition: 'opacity 0.3s ease'
            },
            onClick: () => toast.dismiss(t.id)
          },
          React.createElement('div', { style: { fontSize: '24px', flexShrink: 0 } }, '🔔'),
          React.createElement(
            'div',
            null,
            React.createElement(
              'div',
              { style: { fontSize: '13px', fontWeight: '800', marginBottom: '3px' } },
              title
            ),
            React.createElement(
              'div',
              { style: { fontSize: '12px', opacity: 0.85, lineHeight: '1.4' } },
              body
            )
          )
        ),
        { duration: 6000, position: 'top-right' }
      );
    });

    return unsubscribe;
  } catch (err) {
    console.error('Error initializing foreground notifications:', err);
    return () => {};
  }
};

/**
 * Trigger a role-based notification via the API.
 * Called at the point of action (e.g., when marking an item as moved_to_packing).
 *
 * @param {string} eventType - 'item_moved_to_store' | 'order_assigned_to_munit' | 'item_moved_to_packing'
 * @param {string} entityId  - The ID of the store / mUnit / pUnit to notify users of
 * @param {object} data      - Additional context data for the notification message
 */
export const sendEventNotification = async (eventType, entityId, data = {}) => {
  if (!eventType || !entityId) return;

  try {
    const response = await fetch(`${API_URL}/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, entityId, data })
    });

    const result = await response.json();
    if (!response.ok) {
      console.warn('Notification API returned error:', result.message);
    } else {
      console.log(`📤 Notification sent — ${result.sent} devices notified`);
    }
  } catch (err) {
    // Silent fail — notification errors should never break the main workflow
    console.error('sendEventNotification error:', err);
  }
};
