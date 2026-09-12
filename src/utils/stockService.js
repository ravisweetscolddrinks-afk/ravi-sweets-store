import { db } from '../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';

/**
 * Subscribe to real-time stock entries for a specific store.
 * Subcollection: stores/{storeId}/stock
 */
export const subscribeStoreStock = (storeId, onUpdate, onError) => {
  if (!storeId) {
    onUpdate({});
    return () => {};
  }
  const stockColl = collection(db, 'stores', storeId, 'stock');
  return onSnapshot(
    stockColl,
    (snapshot) => {
      const stockMap = {};
      snapshot.forEach((docSnap) => {
        stockMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      onUpdate(stockMap);
    },
    (err) => {
      console.error(`Error subscribing to stock for store ${storeId}:`, err);
      if (onError) onError(err);
    }
  );
};

/**
 * Fetch one-time snapshot of store stock
 */
export const getStoreStock = async (storeId) => {
  if (!storeId) return {};
  try {
    const stockColl = collection(db, 'stores', storeId, 'stock');
    const snapshot = await getDocs(stockColl);
    const stockMap = {};
    snapshot.forEach((docSnap) => {
      stockMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
    });
    return stockMap;
  } catch (err) {
    console.error(`Error fetching stock for store ${storeId}:`, err);
    return {};
  }
};

/**
 * Save stock for an individual item with an audit log entry.
 * updateType: 'set' | 'increment' | 'decrement'
 */
export const saveItemStock = async ({
  storeId,
  item,
  existingStock = 0,
  newStock,
  delta = 0,
  updateType = 'set',
  reason = 'Manual stock update',
  updatedBy = 'Admin'
}) => {
  if (!storeId || !item?.id) throw new Error("Store ID and Item ID are required.");

  const cleanNewStock = item.unit === 'Weight' 
    ? parseFloat(Number(newStock || 0).toFixed(3))
    : Math.round(Number(newStock || 0));

  const cleanExisting = item.unit === 'Weight' 
    ? parseFloat(Number(existingStock || 0).toFixed(3))
    : Math.round(Number(existingStock || 0));

  const stockRef = doc(db, 'stores', storeId, 'stock', item.id);
  const logRef = doc(collection(db, 'stores', storeId, 'stock_logs'));

  const batch = writeBatch(db);

  // Update or set the stock document
  batch.set(stockRef, {
    itemId: item.id,
    itemName: item.name || '',
    unit: item.unit || 'Weight',
    barcode: item.barcode || '',
    categoryId: item.categoryId || '',
    currentStock: Math.max(0, cleanNewStock),
    updatedAt: serverTimestamp(),
    lastAction: updateType,
    lastDelta: delta
  }, { merge: true });

  // Record audit log
  batch.set(logRef, {
    itemId: item.id,
    itemName: item.name || '',
    unit: item.unit || 'Weight',
    actionType: updateType, // 'set', 'increment', 'decrement'
    previousStock: cleanExisting,
    delta: delta,
    newStock: Math.max(0, cleanNewStock),
    reason: reason || 'Manual adjustment',
    updatedBy: updatedBy || 'Staff',
    createdAt: serverTimestamp()
  });

  await batch.commit();
  return cleanNewStock;
};

/**
 * Save multiple stock changes simultaneously in batched writes.
 * updates: Array of { item, existingStock, newStock, delta, updateType, reason }
 */
export const bulkSaveStoreStock = async (storeId, updates = [], updatedBy = 'Admin') => {
  if (!storeId) throw new Error("Store ID is required");
  if (!updates.length) return { success: true, count: 0 };

  // Firestore allows up to 500 operations per batch. Chunk if needed.
  const CHUNK_SIZE = 200; // 2 ops per item (stock + log)
  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(({ item, existingStock = 0, newStock, delta = 0, updateType = 'set', reason = 'Bulk stock adjustment' }) => {
      const cleanNewStock = item.unit === 'Weight'
        ? parseFloat(Number(newStock || 0).toFixed(3))
        : Math.round(Number(newStock || 0));

      const cleanExisting = item.unit === 'Weight'
        ? parseFloat(Number(existingStock || 0).toFixed(3))
        : Math.round(Number(existingStock || 0));

      const stockRef = doc(db, 'stores', storeId, 'stock', item.id);
      const logRef = doc(collection(db, 'stores', storeId, 'stock_logs'));

      batch.set(stockRef, {
        itemId: item.id,
        itemName: item.name || '',
        unit: item.unit || 'Weight',
        barcode: item.barcode || '',
        categoryId: item.categoryId || '',
        currentStock: Math.max(0, cleanNewStock),
        updatedAt: serverTimestamp(),
        lastAction: updateType,
        lastDelta: delta
      }, { merge: true });

      batch.set(logRef, {
        itemId: item.id,
        itemName: item.name || '',
        unit: item.unit || 'Weight',
        actionType: updateType,
        previousStock: cleanExisting,
        delta: delta,
        newStock: Math.max(0, cleanNewStock),
        reason: reason || 'Bulk stock update',
        updatedBy: updatedBy || 'Staff',
        createdAt: serverTimestamp()
      });
    });

    await batch.commit();
  }

  return { success: true, count: updates.length };
};

/**
 * Automatically deduct quantities from store stock when a POS/billing order is settled.
 * cartItems: array of { id, name, unit, quantity, price, total }
 */
export const deductStockOnBillSettle = async (storeId, cartItems = [], billId = '') => {
  if (!storeId || !cartItems || cartItems.length === 0) {
    return { success: false, message: "Missing storeId or cart items" };
  }

  try {
    const batch = writeBatch(db);
    const logBatch = writeBatch(db);
    let hasOps = false;

    for (const cartItem of cartItems) {
      const itemId = cartItem.id;
      if (!itemId) continue;

      const soldQty = cartItem.unit === 'Weight' 
        ? parseFloat(Number(cartItem.quantity || 0).toFixed(3))
        : Math.round(Number(cartItem.quantity || 0));

      if (soldQty <= 0) continue;

      const stockRef = doc(db, 'stores', storeId, 'stock', itemId);
      const stockSnap = await getDoc(stockRef);

      let prevStock = 0;
      if (stockSnap.exists()) {
        const data = stockSnap.data();
        prevStock = Number(data.currentStock || 0);
      }

      // Decrement stock (cannot be lower than 0)
      const newStock = Math.max(0, cartItem.unit === 'Weight' 
        ? parseFloat((prevStock - soldQty).toFixed(3))
        : Math.round(prevStock - soldQty)
      );

      batch.set(stockRef, {
        itemId: itemId,
        itemName: cartItem.name || '',
        unit: cartItem.unit || 'Weight',
        currentStock: newStock,
        updatedAt: serverTimestamp(),
        lastAction: 'bill_settle',
        lastDelta: -soldQty
      }, { merge: true });

      // Stock Log record
      const logRef = doc(collection(db, 'stores', storeId, 'stock_logs'));
      logBatch.set(logRef, {
        itemId: itemId,
        itemName: cartItem.name || '',
        unit: cartItem.unit || 'Weight',
        actionType: 'bill_settle',
        billId: billId || 'N/A',
        previousStock: prevStock,
        delta: -soldQty,
        newStock: newStock,
        reason: `POS Bill Settled: #${billId || 'Walk-in'}`,
        updatedBy: 'POS Billing',
        createdAt: serverTimestamp()
      });

      hasOps = true;
    }

    if (hasOps) {
      await batch.commit();
      await logBatch.commit().catch(err => console.warn("Failed to write stock logs:", err));
    }

    return { success: true, count: cartItems.length };
  } catch (err) {
    console.error(`Failed to deduct stock for bill ${billId} in store ${storeId}:`, err);
    return { success: false, error: err };
  }
};

/**
 * Fetch recent stock movement audit logs for a store
 */
export const fetchStockLogs = async (storeId, maxCount = 40) => {
  if (!storeId) return [];
  try {
    const q = query(
      collection(db, 'stores', storeId, 'stock_logs'),
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error("Error fetching stock logs:", err);
    return [];
  }
};
