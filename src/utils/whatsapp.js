import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { getInvoiceHtml } from './invoice';

/**
 * Sends a WhatsApp notification to the customer when the order status is "Ready for Delivery"
 * @param {Object} order - The order document from Firestore
 */
export const triggerWhatsAppOrderReady = async (order) => {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    
    const to = order.customerPhone || '';
    const customerName = order.customerName || 'Customer';
    const boxes = order.boxes?.length || 1;
    const totalAmt = Number(order.totalAmount || 0);
    const recAmt = Number(order.receivedAmount || 0);
    const balance = Math.max(0, totalAmt - recAmt);
    const pendingAmount = `Rs.${balance.toFixed(2)}`;
    
    let paymentStatus = 'Pending';
    if (order.paymentStatus) {
      const ps = order.paymentStatus.toLowerCase();
      if (ps === 'done' || ps === 'paid') {
        paymentStatus = 'Paid';
      } else if (ps === 'partial' || ps === 'partially paid') {
        paymentStatus = 'Partially Paid';
      }
    } else {
      if (recAmt > 0) {
        paymentStatus = recAmt >= totalAmt ? 'Paid' : 'Partially Paid';
      }
    }

    const payload = {
      to,
      customerName,
      boxes,
      pendingAmount,
      paymentStatus
    };

    console.log("Sending WhatsApp template notification:", payload);

    const response = await fetch(`${apiUrl}/whatsapp/send-order-ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'API request failed');
    }
    
    toast.success(`WhatsApp notification sent to ${customerName}!`);
    return true;
  } catch (err) {
    console.error("WhatsApp trigger error:", err);
    toast.error(`WhatsApp notification failed: ${err.message}`);
    return false;
  }
};

/**
 * Sends a WhatsApp order confirmation notification to the customer with an image invoice
 * @param {Object} order - The order document from Firestore
 */
export const triggerWhatsAppOrderConfirmation = async (order) => {
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    
    let invoiceImage = '';
    
    try {
      console.log("Generating invoice image using html2canvas...");
      const tempDiv = document.createElement('div');
      tempDiv.className = 'invoice-image-temp-container';
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.style.background = '#ffffff';
      tempDiv.innerHTML = getInvoiceHtml(order);
      document.body.appendChild(tempDiv);

      // Wait a short delay to ensure any layout rendering and image loading is complete
      await new Promise(resolve => setTimeout(resolve, 400));

      const canvas = await html2canvas(tempDiv, {
        useCORS: true,
        scale: 1.5,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      invoiceImage = canvas.toDataURL('image/jpeg', 0.9);
      document.body.removeChild(tempDiv);
      console.log("Invoice image generated successfully (length:", invoiceImage?.length, ")");
    } catch (imageErr) {
      console.error("Failed to generate invoice image on frontend:", imageErr);
    }
    
    console.log("Sending WhatsApp order confirmation trigger:", order.orderId);
    const response = await fetch(`${apiUrl}/whatsapp/send-order-confirmation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ order, invoiceImage })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || 'API request failed');
    }
    
    toast.success(`WhatsApp confirmation sent to ${order.customerName}!`);
    return true;
  } catch (err) {
    console.error("WhatsApp confirmation trigger error:", err);
    toast.error(`WhatsApp confirmation failed: ${err.message}`);
    return false;
  }
};
