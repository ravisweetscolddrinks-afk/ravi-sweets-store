/**
 * QZ Tray Utility Service
 * 
 * QZ Tray is a local Java application that bridges the browser to OS-level printers
 * (USB, Serial, Network) via raw ESC/POS commands over a secure WebSocket on port 8181.
 * 
 * Users must install QZ Tray from: https://qz.io/download/
 */
import logo from '../assets/logo.png';

const QZ_CDN = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';

let qzLoaded = false;
let qzLoadPromise = null;

/**
 * Dynamically loads the qz-tray.js script from CDN if not already loaded.
 * Returns a promise that resolves when window.qz is available.
 */
export const loadQZScript = () => {
  if (qzLoaded && window.qz) return Promise.resolve(window.qz);

  if (qzLoadPromise) return qzLoadPromise;

  qzLoadPromise = new Promise((resolve, reject) => {
    if (window.qz) {
      qzLoaded = true;
      resolve(window.qz);
      return;
    }

    const script = document.createElement('script');
    script.src = QZ_CDN;
    script.async = true;
    script.onload = () => {
      if (window.qz) {
        qzLoaded = true;
        resolve(window.qz);
      } else {
        reject(new Error('qz-tray.js loaded but window.qz not found'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load qz-tray.js from CDN'));
    document.head.appendChild(script);
  });

  return qzLoadPromise;
};

/**
 * Connect to the local QZ Tray WebSocket service.
 * QZ Tray must be running on the user's machine.
 */
export const connectQZ = async () => {
  await loadQZScript();
  const qz = window.qz;

  if (qz.websocket.isActive()) return; // already connected

  // QZ Tray 2.x security:
  // certificatePromise expects a function taking (resolve, reject)
  qz.security.setCertificatePromise((resolve, reject) => {
    resolve();
  });
  // signaturePromise expects a function taking (toSign) that RETURNS a function taking (resolve, reject)
  qz.security.setSignaturePromise((toSign) => {
    return (resolve, reject) => {
      resolve();
    };
  });

  // Wrap the connect call with a 5-second hard timeout so it fails fast
  // when QZ Tray is not running instead of hanging for 10-15 seconds.
  const connectPromise = qz.websocket.connect({
    host: 'localhost',
    port: { secure: [8181, 8182], insecure: [8182, 8181] },
    retries: 1,
    delay: 0.5,
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('QZ Tray connection timed out after 5 seconds')), 5000)
  );

  await Promise.race([connectPromise, timeoutPromise]);
};



/**
 * Disconnect from QZ Tray.
 */
export const disconnectQZ = async () => {
  if (!window.qz) return;
  if (window.qz.websocket.isActive()) {
    await window.qz.websocket.disconnect();
  }
};

/**
 * Returns true if QZ Tray WebSocket is currently active.
 */
export const isQZActive = () => {
  return !!(window.qz && window.qz.websocket.isActive());
};

/**
 * Lists all printers available on the system via QZ Tray.
 * @returns {Promise<string[]>} Array of printer names
 */
export const listQZPrinters = async () => {
  await loadQZScript();
  const qz = window.qz;
  const printers = await qz.printers.find();
  // printers can be a string (single) or array
  if (typeof printers === 'string') return [printers];
  return Array.isArray(printers) ? printers : [];
};

/**
 * Converts an image URL/DataURI to standard ESC/POS GS v 0 raster bit-image commands.
 * This runs natively in the browser's Canvas context and works on 100% of ESC/POS printers.
 * @param {string} logoUrl - Image asset URL
 * @param {number} targetWidth - Maximum width in dots (must be multiple of 8, e.g. 160)
 * @returns {Promise<Uint8Array>} Raw ESC/POS byte array
 */
export const getLogoESCPOS = (logoUrl, targetWidth = 160) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      // Calculate scaled height to maintain aspect ratio
      const aspect = img.height / img.width;
      const targetHeight = Math.round(targetWidth * aspect);

      // Create browser canvas context
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // Draw and rasterize
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const pixels = imgData.data;

      // ESC/POS GS v 0 0 horizontal/vertical parameters
      const xBytes = Math.ceil(targetWidth / 8);
      const xL = xBytes & 0xFF;
      const xH = (xBytes >> 8) & 0xFF;
      const yL = targetHeight & 0xFF;
      const yH = (targetHeight >> 8) & 0xFF;

      const header = new Uint8Array([
        0x1D, 0x76, 0x30, 0, // GS v 0 0 command
        xL, xH,
        yL, yH
      ]);

      const dataBytes = new Uint8Array(xBytes * targetHeight);

      // Pack pixels into bit array (1 for black/print, 0 for white/blank)
      for (let y = 0; y < targetHeight; y++) {
        for (let xByte = 0; xByte < xBytes; xByte++) {
          let byteVal = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = xByte * 8 + bit;
            if (x < targetWidth) {
              const idx = (y * targetWidth + x) * 4;
              const r = pixels[idx];
              const g = pixels[idx + 1];
              const b = pixels[idx + 2];
              const a = pixels[idx + 3];

              // Grayscale luminosity threshold
              const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
              if (a > 128 && grayscale < 160) {
                byteVal |= (1 << (7 - bit)); // Toggle pixel on
              }
            }
          }
          dataBytes[y * xBytes + xByte] = byteVal;
        }
      }

      // Concatenate header + binary pixel raster block
      const escposBytes = new Uint8Array(header.length + dataBytes.length);
      escposBytes.set(header, 0);
      escposBytes.set(dataBytes, header.length);
      resolve(escposBytes);
    };
    img.onerror = () => {
      resolve(new Uint8Array(0)); // Fail silently with empty array
    };
    img.src = logoUrl;
  });
};

/**
 * Sends raw ESC/POS byte data to the specified printer via QZ Tray.
 * @param {string} printerName - The printer name from listQZPrinters()
 * @param {Uint8Array} dataArray - Raw ESC/POS byte array
 */
export const printRawToQZ = async (printerName, dataArray) => {
  await loadQZScript();
  const qz = window.qz;

  const config = qz.configs.create(printerName);
  let finalDataArray = dataArray;

  // 1. Fetch, compile, and prepend the logo bytes natively in ESC/POS format if possible
  if (logo) {
    try {
      const logoUrl = logo.startsWith('data:') ? logo : (logo.startsWith('http') ? logo : window.location.origin + logo);
      const logoBytes = await getLogoESCPOS(logoUrl, 160); // 160 dots width fits all thermal papers perfectly
      
      if (logoBytes.length > 0) {
        const centerAlign = new Uint8Array([0x1b, 0x61, 0x01]); // Align center
        const leftAlign = new Uint8Array([0x1b, 0x61, 0x00]);   // Align left (reset)
        const lineBreak = new Uint8Array([0x0a]);               // Line feed

        // Combine alignment controls, raster logo bytes, and the bill text array in one continuous buffer
        const combined = new Uint8Array(
          centerAlign.length + 
          logoBytes.length + 
          lineBreak.length + 
          leftAlign.length + 
          dataArray.length
        );

        let offset = 0;
        combined.set(centerAlign, offset); offset += centerAlign.length;
        combined.set(logoBytes, offset); offset += logoBytes.length;
        combined.set(lineBreak, offset); offset += lineBreak.length;
        combined.set(leftAlign, offset); offset += leftAlign.length;
        combined.set(dataArray, offset);

        finalDataArray = combined;
      }
    } catch (err) {
      console.error("Failed to compile or prepend raw logo bytes:", err);
    }
  }

  // 2. Encode to Base64 (Standard unified print transaction payload format)
  const base64Text = btoa(String.fromCharCode(...finalDataArray));
  const data = [{
    type: 'raw',
    format: 'base64',
    data: base64Text,
  }];

  // 3. Print directly to QZ Tray
  await qz.print(config, data);
};

/**
 * Build ESC/POS bytes for a POS bill receipt.
 * @param {object} bill
 * @param {number} charsPerLine - Characters per line (48 for 80mm, 32 for 58mm). Default 48.
 * @returns {Uint8Array}
 */
export const buildBillESCPOS = (bill, charsPerLine = 48) => {
  const encoder = new TextEncoder();

  const INIT        = new Uint8Array([0x1b, 0x40]);
  const CENTER      = new Uint8Array([0x1b, 0x61, 0x01]);
  const LEFT        = new Uint8Array([0x1b, 0x61, 0x00]);
  const RIGHT       = new Uint8Array([0x1b, 0x61, 0x02]);
  const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
  const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
  const BOLD_ON     = new Uint8Array([0x1b, 0x45, 0x01]);
  const BOLD_OFF    = new Uint8Array([0x1b, 0x45, 0x00]);
  const CUT         = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);

  const dashedLine = ''.padEnd(charsPerLine, '-') + '\n';
  
  // Helper to justify left and right text on the same line
  const justifyLR = (left, right) => {
    let spaces = charsPerLine - left.length - right.length;
    if (spaces < 1) spaces = 1;
    return left + ' '.repeat(spaces) + right + '\n';
  };

  let bytes = [];

  bytes.push(...INIT);

  // Header
  bytes.push(...CENTER, ...DOUBLE_SIZE);
  bytes.push(...encoder.encode('RAVI SWEETS\n'));
  bytes.push(...NORMAL_SIZE);
  bytes.push(...encoder.encode(`${bill.storeName || 'Outlet Store'}\n`));
  bytes.push(...encoder.encode('Quality Sweets & Savouries\n'));
  bytes.push(...encoder.encode(dashedLine));

  // Bill Meta
  bytes.push(...LEFT);
  bytes.push(...encoder.encode(justifyLR('Bill ID:', bill.billId.toString())));
  bytes.push(...encoder.encode(justifyLR('Date:', bill.date || new Date().toLocaleDateString('en-IN'))));
  bytes.push(...encoder.encode(justifyLR('Payment:', bill.paymentMode || 'Cash')));
  bytes.push(...encoder.encode(dashedLine));

  // Table Header (Dynamic width calculation)
  // Divide available space: Item (50%), Qty (20%), Total (30%)
  const itemW = Math.floor(charsPerLine * 0.5);
  const qtyW = Math.floor(charsPerLine * 0.2);
  const totalW = charsPerLine - itemW - qtyW;

  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(
    'Item'.padEnd(itemW) + 
    'Qty'.padEnd(qtyW) + 
    'Total'.padStart(totalW) + '\n'
  ));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(dashedLine));

  // Items
  (bill.items || []).forEach(item => {
    const qtyText = item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pc`;
    const priceText = `Rs.${Number(item.total).toFixed(0)}`;
    
    const maxNameLen = itemW - 1;
    let namePart1 = item.name;
    let namePart2 = '';
    
    if (namePart1.length > maxNameLen) {
      namePart1 = item.name.substring(0, maxNameLen);
      namePart2 = item.name.substring(maxNameLen);
    }
    
    bytes.push(...encoder.encode(
      namePart1.padEnd(itemW) + 
      qtyText.padEnd(qtyW) + 
      priceText.padStart(totalW) + '\n'
    ));
    
    while (namePart2.length > 0) {
      const chunk = namePart2.substring(0, maxNameLen);
      bytes.push(...encoder.encode(
        chunk.padEnd(itemW) + 
        ' '.repeat(qtyW + totalW) + '\n'
      ));
      namePart2 = namePart2.substring(maxNameLen);
    }
  });

  bytes.push(...encoder.encode(dashedLine));

  // Grand Total with GST Details
  const totalVal = Number(bill.totalAmount || 0);
  const discountVal = Number(bill.discount || 0);
  const grossTotal = totalVal + discountVal;
  const subtotalVal = totalVal / 1.05;
  const gstVal = totalVal - subtotalVal;

  if (discountVal > 0) {
    bytes.push(...encoder.encode(justifyLR('Cart Total:', `Rs.${grossTotal.toFixed(2)}`)));
    bytes.push(...encoder.encode(justifyLR('Discount:', `-Rs.${discountVal.toFixed(2)}`)));
  }
  bytes.push(...encoder.encode(justifyLR('Subtotal (Excl. Tax):', `Rs.${subtotalVal.toFixed(2)}`)));
  bytes.push(...encoder.encode(justifyLR('GST (5%):', `Rs.${gstVal.toFixed(2)}`)));
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(justifyLR('GRAND TOTAL:', `Rs.${totalVal.toFixed(2)}`)));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(dashedLine));

  // Footer
  bytes.push(...CENTER);
  bytes.push(...encoder.encode('Thank you for shopping!\n'));
  bytes.push(...encoder.encode('Please visit again.\n\n\n'));
  bytes.push(...CUT);

  return new Uint8Array(bytes);
};

/**
 * Build ESC/POS bytes for an Order receipt.
 * @param {object} order
 * @param {number} charsPerLine - Characters per line (48 for 80mm, 32 for 58mm). Default 48.
 * @returns {Uint8Array}
 */
export const buildOrderESCPOS = (order, charsPerLine = 48) => {
  const encoder = new TextEncoder();

  const INIT        = new Uint8Array([0x1b, 0x40]);
  const CENTER      = new Uint8Array([0x1b, 0x61, 0x01]);
  const LEFT        = new Uint8Array([0x1b, 0x61, 0x00]);
  const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
  const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
  const BOLD_ON     = new Uint8Array([0x1b, 0x45, 0x01]);
  const BOLD_OFF    = new Uint8Array([0x1b, 0x45, 0x00]);
  const CUT         = new Uint8Array([0x1d, 0x56, 0x41, 0x00]);

  const dashedLine = ''.padEnd(charsPerLine, '-') + '\n';

  const justifyLR = (left, right) => {
    let spaces = charsPerLine - left.length - right.length;
    if (spaces < 1) spaces = 1;
    return left + ' '.repeat(spaces) + right + '\n';
  };

  let bytes = [];

  bytes.push(...INIT);

  // Header
  bytes.push(...CENTER, ...DOUBLE_SIZE);
  bytes.push(...encoder.encode('RAVI SWEETS\n'));
  bytes.push(...NORMAL_SIZE);
  bytes.push(...encoder.encode(`${order.storeName || 'Outlet Store'}\n`));
  bytes.push(...encoder.encode('Quality Sweets & Savouries\n'));
  bytes.push(...encoder.encode(dashedLine));

  // Order Details
  bytes.push(...LEFT);
  bytes.push(...encoder.encode(justifyLR('Order:', `#${order.orderId}`)));
  bytes.push(...encoder.encode(justifyLR('Customer:', order.customerName || '')));
  bytes.push(...encoder.encode(justifyLR('Phone:', order.customerPhone || '')));
  
  if (order.deliveryAddress) {
    bytes.push(...encoder.encode(`Address: ${order.deliveryAddress}\n`));
  }
  
  bytes.push(...encoder.encode(justifyLR('Expected Delivery:', order.expectedDelivery || 'N/A')));
  bytes.push(...encoder.encode(dashedLine));

  // Table Header
  const itemW = Math.floor(charsPerLine * 0.5);
  const qtyW = Math.floor(charsPerLine * 0.2);
  const totalW = charsPerLine - itemW - qtyW;

  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(
    'Item'.padEnd(itemW) + 
    'Qty'.padEnd(qtyW) + 
    'Total'.padStart(totalW) + '\n'
  ));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(dashedLine));

  // Items
  (order.items || []).forEach(item => {
    const qtyText = item.unit === 'Weight' ? `${item.quantity}kg` : `${item.quantity}pc`;
    const priceText = `Rs.${Number(item.total).toFixed(0)}`;
    
    const maxNameLen = itemW - 1;
    let namePart1 = item.name;
    let namePart2 = '';
    
    if (namePart1.length > maxNameLen) {
      namePart1 = item.name.substring(0, maxNameLen);
      namePart2 = item.name.substring(maxNameLen);
    }
    
    bytes.push(...encoder.encode(
      namePart1.padEnd(itemW) + 
      qtyText.padEnd(qtyW) + 
      priceText.padStart(totalW) + '\n'
    ));
    
    while (namePart2.length > 0) {
      const chunk = namePart2.substring(0, maxNameLen);
      bytes.push(...encoder.encode(
        chunk.padEnd(itemW) + 
        ' '.repeat(qtyW + totalW) + '\n'
      ));
      namePart2 = namePart2.substring(maxNameLen);
    }
  });

  bytes.push(...encoder.encode(dashedLine));

  // Totals with GST details
  const totalVal = Number(order.totalAmount || 0);
  const discountVal = Number(order.discount || 0);
  const grossTotal = totalVal + discountVal;
  const subtotalVal = totalVal / 1.05;
  const gstVal = totalVal - subtotalVal;
  const advStr = `Rs.${Number(order.receivedAmount || 0).toFixed(2)}`;
  const balStr = `Rs.${(totalVal - Number(order.receivedAmount || 0)).toFixed(2)}`;

  if (discountVal > 0) {
    bytes.push(...encoder.encode(justifyLR('Cart Total:', `Rs.${grossTotal.toFixed(2)}`)));
    bytes.push(...encoder.encode(justifyLR('Discount:', `-Rs.${discountVal.toFixed(2)}`)));
  }
  bytes.push(...encoder.encode(justifyLR('Subtotal (Excl. Tax):', `Rs.${subtotalVal.toFixed(2)}`)));
  bytes.push(...encoder.encode(justifyLR('GST (5%):', `Rs.${gstVal.toFixed(2)}`)));
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(justifyLR('GRAND TOTAL:', `Rs.${totalVal.toFixed(2)}`)));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(justifyLR('ADVANCE PAID:', advStr)));
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(justifyLR('BALANCE DUE:', balStr)));
  bytes.push(...BOLD_OFF);
  
  bytes.push(...encoder.encode(dashedLine));

  // Status
  bytes.push(...CENTER, ...BOLD_ON);
  bytes.push(...encoder.encode(`STATUS: ${order.paymentStatus || 'PENDING'}\n`));
  bytes.push(...BOLD_OFF);

  // Footer
  bytes.push(...CENTER);
  bytes.push(...encoder.encode('Thank you for shopping!\n'));
  bytes.push(...encoder.encode('Please visit again.\n\n\n'));
  bytes.push(...CUT);

  return new Uint8Array(bytes);
};
