/**
 * QZ Tray Utility Service
 * 
 * QZ Tray is a local Java application that bridges the browser to OS-level printers
 * (USB, Serial, Network) via raw ESC/POS commands over a secure WebSocket on port 8181.
 * 
 * Users must install QZ Tray from: https://qz.io/download/
 */
import logo from '../assets/logo.png';
import { numberToWords } from './printReceiptHelper';


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

  const isHttps = window.location.protocol === 'https:';

  const tryConnect = async (useSecure) => {
    const opts = {
      host: 'localhost',
      usingSecure: useSecure,
      port: useSecure
        ? { secure: [8181, 8182], insecure: [8182, 8181] }
        : { insecure: [8182, 8181], secure: [8181, 8182] },
      retries: 1,
      delay: 0.5,
    };

    const connectPromise = qz.websocket.connect(opts);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('QZ Tray connection timed out after 5 seconds')), 5000)
    );

    return Promise.race([connectPromise, timeoutPromise]);
  };

  try {
    await tryConnect(isHttps);
  } catch (primaryErr) {
    console.warn("Primary QZ Tray WebSocket attempt failed, trying alternative security protocol...", primaryErr);
    await tryConnect(!isHttps);
  }
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
  const solidLine = ''.padEnd(charsPerLine, '=') + '\n';

  const justifyLR = (left, right) => {
    let spaces = charsPerLine - left.length - right.length;
    if (spaces < 1) spaces = 1;
    return left + ' '.repeat(spaces) + right + '\n';
  };

  let bytes = [];
  bytes.push(...INIT);

  // Top Tag
  bytes.push(...RIGHT, ...NORMAL_SIZE);
  bytes.push(...encoder.encode('Customer Copy\n'));

  // Store Header
  bytes.push(...CENTER, ...BOLD_ON, ...DOUBLE_SIZE);
  bytes.push(...encoder.encode('SRI RAJU SWEETS\n'));
  bytes.push(...NORMAL_SIZE, ...BOLD_OFF);
  bytes.push(...encoder.encode('56-11-20B, OPP JD TOWERS, PATAMATA MAIN\nROAD, VIJAYAWADA, ANDHRA PRADESH, 520010\n'));
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode('PHONE: 9244757677\n'));
  bytes.push(...encoder.encode('GSTIN: 37DFJPK6083N1ZO\n'));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(dashedLine));

  // Customer Block
  bytes.push(...LEFT);
  bytes.push(...encoder.encode(`Customer: ${bill.customerName || 'Walk-in Customer'}\n`));
  if (bill.customerPhone) bytes.push(...encoder.encode(`Mobile:   ${bill.customerPhone}\n`));
  if (bill.companyName) bytes.push(...encoder.encode(`${bill.companyName}\n`));
  if (bill.customerGst || bill.gstNumber) bytes.push(...encoder.encode(`PH ${bill.customerPhone || ''} GST ${bill.customerGst || bill.gstNumber}\n`));

  bytes.push(...CENTER, ...BOLD_ON);
  bytes.push(...encoder.encode('Tax Invoice/Bill of Supply\n'));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(solidLine));

  // Bill Meta
  bytes.push(...LEFT);
  const formattedDate = bill.date || new Date().toLocaleDateString('en-IN');
  const formattedTime = bill.time || new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  bytes.push(...encoder.encode(justifyLR(`Bill No. ${bill.billId}`, `Date ${formattedDate} ${formattedTime}`)));
  bytes.push(...encoder.encode(solidLine));

  // Product Table Header
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode('Product\n'));
  bytes.push(...encoder.encode(
    'Qty'.padStart(10) + 
    'Mrp'.padStart(12) + 
    'S.Price'.padStart(12) + 
    'Amount'.padStart(14) + '\n'
  ));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(dashedLine));

  // Product Rows
  let totalUnits = 0;
  (bill.items || []).forEach(item => {
    const qtyNum = item.unit === 'Weight' ? parseFloat(item.quantity) : parseInt(item.quantity);
    totalUnits += (item.unit === 'Weight' ? 1 : qtyNum);

    const qtyStr = item.unit === 'Weight' ? `${Number(item.quantity).toFixed(2)} KG` : `${item.quantity} PC`;
    bytes.push(...BOLD_ON);
    bytes.push(...encoder.encode(`${item.name} ${qtyStr}\n`));
    bytes.push(...BOLD_OFF);

    const qtyVal = Number(item.quantity).toFixed(2);
    const mrpVal = Number(item.price).toFixed(2);
    const spVal = Number(item.price).toFixed(2);
    const amtVal = Number(item.total).toFixed(2);

    bytes.push(...encoder.encode(
      qtyVal.padStart(10) + 
      mrpVal.padStart(12) + 
      spVal.padStart(12) + 
      amtVal.padStart(14) + '\n'
    ));
  });

  bytes.push(...encoder.encode(solidLine));

  // Net Amount Block
  const totalVal = Number(bill.totalAmount || 0);
  bytes.push(...BOLD_ON, ...DOUBLE_SIZE);
  bytes.push(...encoder.encode(justifyLR('Net Amount :', `Rs.${totalVal.toFixed(2)}`)));
  bytes.push(...NORMAL_SIZE, ...BOLD_OFF);
  bytes.push(...encoder.encode(solidLine));

  // GST Summary Block
  const taxableVal = totalVal / 1.05;
  const taxAmtVal = totalVal - taxableVal;
  const cgstVal = taxAmtVal / 2;
  const sgstVal = taxAmtVal / 2;

  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode('GST Summary\n'));
  bytes.push(...encoder.encode(solidLine));
  bytes.push(...encoder.encode('Taxable     CGST    SGST    IGST    CESS  Tax Amt\n'));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode('GST 5%\n'));
  bytes.push(...encoder.encode(
    taxableVal.toFixed(2).padEnd(10) + 
    cgstVal.toFixed(2).padEnd(8) + 
    sgstVal.toFixed(2).padEnd(8) + 
    '0.00'.padEnd(8) + 
    '0.00'.padEnd(6) + 
    taxAmtVal.toFixed(2).padStart(8) + '\n'
  ));
  bytes.push(...encoder.encode(dashedLine));
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(
    taxableVal.toFixed(2).padEnd(10) + 
    cgstVal.toFixed(2).padEnd(8) + 
    sgstVal.toFixed(2).padEnd(8) + 
    '0.00'.padEnd(8) + 
    '0.00'.padEnd(6) + 
    taxAmtVal.toFixed(2).padStart(8) + '\n'
  ));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(solidLine));

  // Amount in Words
  bytes.push(...BOLD_ON);
  bytes.push(...encoder.encode(`Word: ${numberToWords(totalVal)}\n`));
  bytes.push(...BOLD_OFF);
  bytes.push(...encoder.encode(solidLine));

  // Footer Counters
  bytes.push(...encoder.encode(justifyLR('Counter : 1', `${bill.paymentMode || 'CASH'}-${totalVal.toFixed(0)}`)));
  bytes.push(...encoder.encode(justifyLR('User : admin', `Tot Qty : ${totalUnits}`)));
  bytes.push(...encoder.encode(dashedLine));

  // Footer Banner
  bytes.push(...CENTER, ...BOLD_ON);
  bytes.push(...encoder.encode('*** Thank you & Visit Again ***\n\n\n'));
  bytes.push(...BOLD_OFF, ...CUT);

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
  bytes.push(...encoder.encode('RAJU GHEE SWEETS\n'));
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
