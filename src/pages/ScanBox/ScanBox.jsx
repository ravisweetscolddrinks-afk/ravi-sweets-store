import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../../config/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, AlertCircle, ShoppingBag, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import './ScanBox.css';
import { triggerWhatsAppOrderReady } from '../../utils/whatsapp';


const ScanBox = () => {
  const { orderId, boxId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Verifying scanned box payload...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [scannedBox, setScannedBox] = useState(null);

  const calculateOverallOrderStatus = (items) => {
    if (!items || items.length === 0) return 'new';
    const getStatus = (item) => (item.status || 'preparation_started').toLowerCase().trim();
    const allDelivered = items.every(item => getStatus(item) === 'delivered');
    if (allDelivered) return 'Delivered';
    const allReceived = items.every(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (allReceived) return 'Ready for Delivery';
    const someReceived = items.some(item => {
      const st = getStatus(item);
      return st === 'received_at_store' || st === 'delivered';
    });
    if (someReceived) return 'Partially Ready for Delivery';
    const allMoved = items.every(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (allMoved) return 'Moved to Store';
    const someMoved = items.some(item => {
      const st = getStatus(item);
      return st === 'moved_to_store' || st === 'received_at_store' || st === 'delivered';
    });
    if (someMoved) return 'Partially Moved to Store';
    const hasProgressed = items.some(item => {
      const st = getStatus(item);
      return st !== 'preparation_started' && st !== 'new' && st !== '';
    });
    if (hasProgressed) return 'In Progress';
    return 'new';
  };

  useEffect(() => {
    const processScan = async () => {
      if (!orderId || !boxId) {
        setErrorMsg('Invalid QR Code. Missing Order ID or Box ID.');
        setLoading(false);
        return;
      }

      try {
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
          setErrorMsg('Order not found. It may have been deleted.');
          setLoading(false);
          return;
        }

        const order = { id: orderSnap.id, ...orderSnap.data() };
        setOrderData(order);

        // Find the box inside order.boxes
        if (!order.boxes || !Array.isArray(order.boxes)) {
          setErrorMsg('No boxes recorded on this order.');
          setLoading(false);
          return;
        }

        const boxIndex = order.boxes.findIndex(b => b.id === boxId);
        if (boxIndex === -1) {
          setErrorMsg('Scanned box ID does not match any box in this order.');
          setLoading(false);
          return;
        }

        const targetBox = order.boxes[boxIndex];
        setScannedBox(targetBox);

        // Check if already received to avoid duplicate writes
        if (targetBox.status === 'received_at_store' || targetBox.received) {
          setStatusMsg('This box has already been received at the store!');
          setLoading(false);
          return;
        }

        setStatusMsg('Updating status in database...');

        // 1. Mark the target box as scanned/received
        const updatedBoxes = order.boxes.map((b, idx) => {
          if (idx === boxIndex) {
            return {
              ...b,
              received: true,
              status: 'received_at_store',
              receivedAt: new Date().toISOString()
            };
          }
          return b;
        });

        // 2. Identify items inside the box and update their statuses
        const boxContentsLower = (targetBox.contents || '').toLowerCase();
        const updatedItems = order.items.map(item => {
          const nameMatch = boxContentsLower.includes(item.name.toLowerCase());
          const isEligible = item.status === 'packing_complete' || item.status === 'moved_to_packing';
          
          if (nameMatch || isEligible) {
            return { ...item, status: 'received_at_store' };
          }
          return item;
        });

        // 3. Recalculate overall order status
        const overallStatus = calculateOverallOrderStatus(updatedItems);
        const statusChangedToReady = (!order.status || order.status !== 'Ready for Delivery') && overallStatus === 'Ready for Delivery';

        // 4. Update the Firestore document
        await updateDoc(orderRef, {
          boxes: updatedBoxes,
          items: updatedItems,
          status: overallStatus,
          updatedAt: serverTimestamp()
        });

        if (statusChangedToReady) {
          setTimeout(() => triggerWhatsAppOrderReady({
            ...order,
            boxes: updatedBoxes,
            items: updatedItems,
            status: overallStatus
          }), 500);
        }

        toast.success(`Box #${targetBox.boxNum} scanned successfully!`);
        setLoading(false);
      } catch (err) {
        console.error('QR Scan Processing Error:', err);
        setErrorMsg('Failed to process box scan. Check database connection.');
        setLoading(false);
      }
    };

    processScan();
  }, [orderId, boxId]);

  return (
    <div className="scan-box-container">
      <div className="scan-box-card">
        {loading ? (
          <div className="scan-box-loading">
            <div className="scan-box-spinner"></div>
            <p className="loading-text">{statusMsg}</p>
          </div>
        ) : errorMsg ? (
          <div className="scan-box-error animate-fade-in">
            <div className="error-icon-container">
              <AlertCircle size={48} className="error-icon" />
            </div>
            <h2>Scan Failed</h2>
            <p className="error-text">{errorMsg}</p>
            <button className="scan-action-btn error-btn" onClick={() => navigate('/onboarding')}>
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="scan-box-success animate-fade-in">
            <div className="success-icon-container">
              <CheckCircle2 size={48} className="success-icon" />
            </div>
            <h2>Box Received!</h2>
            <p className="success-subtitle">Successfully verified and updated in database.</p>

            <div className="scan-details-panel">
              <div className="scan-detail-row">
                <span className="label">Order ID</span>
                <span className="value">#{orderData?.orderId}</span>
              </div>
              <div className="scan-detail-row">
                <span className="label">Box Details</span>
                <span className="value font-bold text-purple">Box {scannedBox?.boxNum}</span>
              </div>
              <div className="scan-detail-row items-col">
                <span className="label">Box Contents</span>
                <span className="value contents-text">{scannedBox?.contents}</span>
              </div>
            </div>

            <button className="scan-action-btn success-btn" onClick={() => navigate('/onboarding')}>
              Done <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanBox;
