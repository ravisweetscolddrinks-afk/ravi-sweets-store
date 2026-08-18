/**
 * Receipt Printing Helper for Raju Ghee Sweets
 * Generates exact ESC/POS binary data and HTML layouts matching physical thermal receipts.
 */

// Converts numbers into Indian Rupee words (e.g., 240 -> "TWO HUNDRED FORTY RUPEES ONLY")
export const numberToWords = (num) => {
  const a = ['', 'ONE ', 'TWO ', 'THREE ', 'FOUR ', 'FIVE ', 'SIX ', 'SEVEN ', 'EIGHT ', 'NINE ', 'TEN ', 'ELEVEN ', 'TWELVE ', 'THIRTEEN ', 'FOURTEEN ', 'FIFTEEN ', 'SIXTEEN ', 'SEVENTEEN ', 'EIGHTEEN ', 'NINETEEN '];
  const b = ['', '', 'TWENTY ', 'THIRTY ', 'FORTY ', 'FIFTY ', 'SIXTY ', 'SEVENTY ', 'EIGHTY ', 'NINETY '];

  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_arr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_arr) return '';
    let str = '';
    str += (n_arr[1] != 0) ? (a[Number(n_arr[1])] || b[n_arr[1][0]] + ' ' + a[n_arr[1][1]]) + 'CRORE ' : '';
    str += (n_arr[2] != 0) ? (a[Number(n_arr[2])] || b[n_arr[2][0]] + ' ' + a[n_arr[2][1]]) + 'LAKH ' : '';
    str += (n_arr[3] != 0) ? (a[Number(n_arr[3])] || b[n_arr[3][0]] + ' ' + a[n_arr[3][1]]) + 'THOUSAND ' : '';
    str += (n_arr[4] != 0) ? (a[Number(n_arr[4])] || b[n_arr[4][0]] + ' ' + a[n_arr[4][1]]) + 'HUNDRED ' : '';
    str += (n_arr[5] != 0) ? ((str != '') ? 'AND ' : '') + (a[Number(n_arr[5])] || b[n_arr[5][0]] + ' ' + a[n_arr[5][1]]) : '';
    return str.trim();
  };

  const amountInt = Math.floor(Math.abs(Number(num) || 0));
  const paise = Math.round((Math.abs(Number(num) || 0) - amountInt) * 100);

  let result = amountInt === 0 ? 'ZERO RUPEES' : inWords(amountInt) + ' RUPEES';
  if (paise > 0) {
    result += ' AND ' + inWords(paise) + ' PAISE';
  }
  return result + ' ONLY';
};

/**
 * Returns formatted HTML for 80mm thermal receipt matching physical POS bill layout.
 */
export const generateReceiptHTML = (bill = {}) => {
  const totalVal = Number(bill.totalAmount || 0);
  const discountVal = Number(bill.discount || 0);
  const grossVal = totalVal + discountVal;
  const taxableVal = totalVal / 1.05;
  const taxAmtVal = totalVal - taxableVal;
  const cgstVal = taxAmtVal / 2;
  const sgstVal = taxAmtVal / 2;
  const totalQty = (bill.items || []).reduce((acc, i) => acc + (i.unit === 'Weight' ? 1 : Number(i.quantity || 1)), 0);

  const formattedDate = bill.date || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }));
  const formattedTime = bill.time || (bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));

  const itemsRows = (bill.items || []).map(item => `
    <tr>
      <td colspan="4" style="padding-top: 3px; font-weight: bold; text-align: left;">${item.name || 'Item'} ${item.unit === 'Weight' ? `${item.quantity} KG` : ''}</td>
    </tr>
    <tr>
      <td style="text-align: right;">${Number(item.quantity || 1).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price || 0).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price || 0).toFixed(2)}</td>
      <td style="text-align: right; font-weight: bold;">${Number(item.total || ((Number(item.quantity || 1) * Number(item.price || 0)))).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt - ${bill.billId || 'POS'}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            padding: 2px;
            color: #000;
            background: #fff;
          }
          .right { text-align: right; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .solid-divider { border-top: 1px solid #000; margin: 4px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: 11px; }
          th { padding: 2px 0; border-bottom: 1px dashed #000; }
          td { padding: 1px 0; }
          @media print { body { width: 72mm; } }
        </style>
      </head>
      <body>
        <div class="right" style="font-size: 10px;">Customer Copy</div>
        <div class="center bold" style="font-size: 16px; margin-top: 2px;">
          ${bill.tradeName || 'SRI RAJU SWEETS'}
        </div>
        ${bill.storeName && bill.storeName !== bill.tradeName ? `<div class="center bold" style="font-size: 12px; margin-top: 1px;">${bill.storeName}</div>` : ''}
        <div class="center" style="font-size: 10px; margin-top: 2px; line-height: 1.2;">
          ${bill.storeAddress || (bill.storeCity ? `${bill.storeCity}, ${bill.storeState || ''}` : '56-11-20B, OPP JD TOWERS, PATAMATA MAIN ROAD, VIJAYAWADA, AP 520010')}
        </div>
        <div class="center bold" style="font-size: 10px; margin-top: 2px;">
          PHONE: ${bill.storePhone || '9244757677'}
        </div>
        <div class="center bold" style="font-size: 10px;">
          GSTIN: ${bill.storeGstNumber || bill.storeGst || '37DFJPK6083N1ZO'}
        </div>
        <div class="divider"></div>

        <div style="font-size: 11px;">
          <div>Customer: ${bill.customerName || 'Walk-in Customer'}</div>
          ${bill.customerPhone ? `<div>Mobile: ${bill.customerPhone}</div>` : ''}
          ${bill.companyName ? `<div class="bold" style="margin-top: 2px;">${bill.companyName}</div>` : ''}
          ${(bill.customerGst || bill.gstNumber) ? `<div class="bold">PH ${bill.customerPhone || ''} GST ${bill.customerGst || bill.gstNumber}</div>` : ''}
        </div>

        <div class="center bold" style="font-size: 13px; margin: 6px 0 3px;">
          Tax Invoice/Bill of Supply
        </div>
        <div class="solid-divider"></div>

        <div class="info-row bold" style="font-size: 12px;">
          <span>Bill No. <span style="font-size: 16px;">${bill.billId || '-'}</span></span>
          <span>Date <b>${formattedDate}</b> &nbsp; ${formattedTime}</span>
        </div>
        <div class="solid-divider"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;" colspan="4">Product</th>
            </tr>
            <tr>
              <th class="right" style="width: 25%;">Qty</th>
              <th class="right" style="width: 25%;">Mrp</th>
              <th class="right" style="width: 25%;">S.Price</th>
              <th class="right" style="width: 25%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <div class="solid-divider"></div>

        ${discountVal > 0 ? `
          <div class="info-row"><span>Gross Total</span><span>₹ ${grossVal.toFixed(2)}</span></div>
          <div class="info-row" style="color: #dc2626;"><span>Discount</span><span>-₹ ${discountVal.toFixed(2)}</span></div>
          <div class="solid-divider"></div>
        ` : ''}

        <div class="info-row bold" style="font-size: 16px; margin: 4px 0;">
          <span>Net Amount :</span>
          <span style="font-size: 20px;">₹ ${totalVal.toFixed(2)}</span>
        </div>
        <div class="solid-divider"></div>

        <div class="bold" style="font-size: 11px; margin-bottom: 2px;">GST Summary</div>
        <div class="solid-divider" style="margin-top: 0;"></div>
        <table style="font-size: 10px; width: 100%;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">Taxable</th>
              <th class="right">CGST</th>
              <th class="right">SGST</th>
              <th class="right">IGST</th>
              <th class="right">CESS</th>
              <th class="right">Tax Amt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="6" style="padding-top: 3px;"><b>GST 5%</b></td>
            </tr>
            <tr>
              <td style="text-align: left;">${taxableVal.toFixed(2)}</td>
              <td class="right">${cgstVal.toFixed(2)}</td>
              <td class="right">${sgstVal.toFixed(2)}</td>
              <td class="right">0.00</td>
              <td class="right">0.00</td>
              <td class="right">${taxAmtVal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 1px dashed #000; font-weight: bold;">
              <td style="text-align: left;">${taxableVal.toFixed(2)}</td>
              <td class="right">${cgstVal.toFixed(2)}</td>
              <td class="right">${sgstVal.toFixed(2)}</td>
              <td class="right">0.00</td>
              <td class="right">0.00</td>
              <td class="right">${taxAmtVal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div class="solid-divider"></div>

        <div style="font-size: 10px; font-weight: bold; margin: 4px 0;">
          Word: <i>${numberToWords(totalVal)}</i>
        </div>
        <div class="solid-divider"></div>

        <div class="info-row">
          <span>Counter : 1</span>
          <span><b>${bill.paymentMode || 'CASH'}-${totalVal.toFixed(0)}</b></span>
        </div>
        <div class="info-row">
          <span>User : ${bill.storeName || 'admin'}</span>
          <span>Tot Qty : ${totalQty}</span>
        </div>
        <div class="divider"></div>

        <div class="center bold" style="font-size: 11px; margin-top: 4px;">
          *** Thank you & Visit Again ***
        </div>
      </body>
    </html>
  `;
};

/**
 * Returns formatted HTML for 80mm thermal receipt for customer orders.
 */
export const generateOrderReceiptHTML = (order = {}) => {
  const totalVal = Number(order.totalAmount || 0);
  const discountVal = Number(order.discount || 0);
  const grossVal = totalVal + discountVal;
  const taxableVal = totalVal / 1.05;
  const taxAmtVal = totalVal - taxableVal;
  const cgstVal = taxAmtVal / 2;
  const sgstVal = taxAmtVal / 2;
  const receivedVal = Number(order.receivedAmount || 0);
  const balanceVal = Math.max(0, totalVal - receivedVal);

  const orderNumStr = order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId || '-'}`;
  const formattedDate = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN') : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));
  const formattedTime = order.deliveryTime || (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '');

  const itemsRows = (order.items || []).map(item => `
    <tr>
      <td colspan="4" style="padding-top: 3px; font-weight: bold; text-align: left;">
        ${item.name || 'Item'} ${item.unit === 'Weight' ? `${item.quantity} KG` : ''}
        ${item.description ? `<div style="font-size: 10px; font-weight: normal; color: #444;">(${item.description})</div>` : ''}
      </td>
    </tr>
    <tr>
      <td style="text-align: right;">${Number(item.quantity || 1).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price || (Number(item.total || 0) / Number(item.quantity || 1))).toFixed(2)}</td>
      <td style="text-align: right;">${Number(item.price || (Number(item.total || 0) / Number(item.quantity || 1))).toFixed(2)}</td>
      <td style="text-align: right; font-weight: bold;">${Number(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Order Receipt - ${orderNumStr}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            width: 72mm;
            max-width: 72mm;
            margin: 0 auto;
            padding: 2px;
            color: #000;
            background: #fff;
          }
          .right { text-align: right; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .solid-divider { border-top: 1px solid #000; margin: 4px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: 11px; }
          th { padding: 2px 0; border-bottom: 1px dashed #000; }
          td { padding: 1px 0; }
          @media print { body { width: 72mm; } }
        </style>
      </head>
      <body>
        <div class="right" style="font-size: 10px;">Order Copy</div>
        <div class="center bold" style="font-size: 16px; margin-top: 2px;">
          ${order.tradeName || 'SRI RAJU SWEETS'}
        </div>
        <div class="center bold" style="font-size: 12px; margin-top: 1px;">
          ${order.storeName || 'Store Outlet'}
        </div>
        <div class="center" style="font-size: 10px; line-height: 1.2;">
          ${order.storeAddress || (order.storeCity ? `${order.storeCity}, ${order.storeState || ''}` : '56-11-20B, OPP JD TOWERS, PATAMATA MAIN ROAD, VIJAYAWADA')}
        </div>
        <div class="center bold" style="font-size: 10px; margin-top: 2px;">
          PHONE: ${order.storePhone || '9244757677'} | GSTIN: ${order.storeGstNumber || order.storeGst || '37DFJPK6083N1ZO'}
        </div>
        <div class="divider"></div>

        <div style="font-size: 11px;">
          <div><b>Customer:</b> ${order.customerName || 'Customer'}</div>
          ${order.customerPhone ? `<div><b>Phone:</b> ${order.customerPhone}</div>` : ''}
          ${order.deliveryDate ? `<div><b>Delivery Date:</b> ${order.deliveryDate} ${order.deliveryTime || ''}</div>` : ''}
          ${order.orderType ? `<div><b>Type:</b> ${order.orderType}</div>` : ''}
        </div>

        <div class="center bold" style="font-size: 13px; margin: 6px 0 3px;">
          ORDER RECEIPT
        </div>
        <div class="solid-divider"></div>

        <div class="info-row bold" style="font-size: 12px;">
          <span>Order No: <span style="font-size: 15px;">${orderNumStr}</span></span>
          <span>Date: <b>${formattedDate}</b></span>
        </div>
        <div class="solid-divider"></div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;" colspan="4">Product</th>
            </tr>
            <tr>
              <th class="right" style="width: 25%;">Qty</th>
              <th class="right" style="width: 25%;">Mrp</th>
              <th class="right" style="width: 25%;">Rate</th>
              <th class="right" style="width: 25%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <div class="solid-divider"></div>

        ${discountVal > 0 ? `
          <div class="info-row"><span>Gross Total</span><span>₹ ${grossVal.toFixed(2)}</span></div>
          <div class="info-row" style="color: #dc2626;"><span>Discount</span><span>-₹ ${discountVal.toFixed(2)}</span></div>
          <div class="solid-divider"></div>
        ` : ''}

        <div class="info-row bold" style="font-size: 14px; margin: 3px 0;">
          <span>Grand Total :</span>
          <span style="font-size: 17px;">₹ ${totalVal.toFixed(2)}</span>
        </div>

        <div class="info-row" style="font-size: 11px;">
          <span>Advance Paid :</span>
          <span>₹ ${receivedVal.toFixed(2)}</span>
        </div>

        <div class="info-row bold" style="font-size: 14px; color: ${balanceVal > 0 ? '#b91c1c' : '#047857'}; margin-bottom: 3px;">
          <span>Balance Due :</span>
          <span style="font-size: 16px;">₹ ${balanceVal.toFixed(2)}</span>
        </div>
        <div class="solid-divider"></div>

        <div class="bold" style="font-size: 10px; margin-bottom: 2px;">GST (5% Included in Total)</div>
        <div class="info-row" style="font-size: 10px;">
          <span>Taxable: ₹${taxableVal.toFixed(2)}</span>
          <span>CGST (2.5%): ₹${cgstVal.toFixed(2)}</span>
          <span>SGST (2.5%): ₹${sgstVal.toFixed(2)}</span>
        </div>
        <div class="solid-divider"></div>

        <div style="font-size: 10px; font-weight: bold; margin: 3px 0;">
          Word: <i>${numberToWords(totalVal)}</i>
        </div>
        <div class="solid-divider"></div>

        <div class="info-row">
          <span>Payment: <b>${order.paymentMode || order.paymentType || 'CASH'}</b></span>
          <span>Outlet: ${order.storeName || 'Vijayawada'}</span>
        </div>
        <div class="divider"></div>

        <div class="center bold" style="font-size: 11px; margin-top: 4px;">
          *** Thank you for your business! ***
        </div>
      </body>
    </html>
  `;
};

/**
 * Generates raw ESC/POS binary data for 80mm thermal receipt for Walk-in Bills.
 */
export const buildReceiptESCPOS = (bill = {}) => {
  const enc = new TextEncoder();
  const bytes = [];
  const push = (...arrs) => arrs.forEach(a => bytes.push(...a));

  const ESC = 0x1B, GS = 0x1D;
  const INIT    = [ESC, 0x40];
  const CENTER  = [ESC, 0x61, 0x01];
  const LEFT    = [ESC, 0x61, 0x00];
  const DBL     = [GS,  0x21, 0x11];
  const NORMAL  = [GS,  0x21, 0x00];
  const DBL_H   = [GS,  0x21, 0x01];
  const BOLD_ON = [ESC, 0x45, 0x01];
  const BOLD_OFF= [ESC, 0x45, 0x00];
  const DIV     = '-'.repeat(42) + '\n';
  const DIV_S   = '=' .repeat(42) + '\n';

  const txt = (s) => enc.encode(String(s ?? ''));

  const totalVal    = Number(bill?.totalAmount || 0);
  const discountVal = Number(bill?.discount || 0);
  const grossVal    = totalVal + discountVal;
  const taxableVal  = totalVal / 1.05;
  const taxAmt      = totalVal - taxableVal;
  const cgst        = taxAmt / 2;
  const sgst        = taxAmt / 2;

  const fmtDate = bill?.date || (bill?.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' }));
  const fmtTime = bill?.time || (bill?.createdAt?.toDate ? bill.createdAt.toDate().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true }) : new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true }));

  // --- Header ---
  push(INIT, CENTER, DBL);
  push(txt((bill?.tradeName || 'SRI RAJU SWEETS') + '\n'));
  push(NORMAL);
  if (bill?.storeName && bill?.storeName !== bill?.tradeName) {
    push(txt(bill.storeName + '\n'));
  }
  push(txt((bill?.storeAddress || '56-11-20B, OPP JD TOWERS\nPATAMATA MAIN ROAD, VIJAYAWADA') + '\n'));
  push(txt(`Ph: ${bill?.storePhone || '9244757677'}\n`));
  push(txt(`GSTIN: ${bill?.storeGstNumber || bill?.storeGst || '37DFJPK6083N1ZO'}\n`));
  push(txt(DIV));

  // --- Customer Info ---
  push(LEFT);
  push(txt(`Customer: ${bill?.customerName || 'Walk-in Customer'}\n`));
  if (bill?.customerPhone) push(txt(`Mobile: ${bill.customerPhone}\n`));
  if (bill?.companyName)   push(txt(`Company: ${bill.companyName}\n`));
  if (bill?.customerGst || bill?.gstNumber) push(txt(`GST: ${bill.customerGst || bill.gstNumber}\n`));
  push(txt(DIV));

  // --- Bill Info ---
  push(CENTER, BOLD_ON);
  push(txt('Tax Invoice / Bill of Supply\n'));
  push(BOLD_OFF, txt(DIV_S));
  push(LEFT);
  push(BOLD_ON);
  push(txt(`Bill No: ${bill?.billId || '-'}    Date: ${fmtDate}  ${fmtTime}\n`));
  push(BOLD_OFF, txt(DIV));

  // --- Items header ---
  push(BOLD_ON);
  const hdr = 'Item'.padEnd(20) + 'Qty'.padStart(6) + 'Price'.padStart(8) + 'Amt'.padStart(8) + '\n';
  push(txt(hdr));
  push(BOLD_OFF, txt(DIV));

  // --- Items ---
  (bill?.items || []).forEach(item => {
    const name  = String(item.name || '');
    const qty   = Number(item.quantity || 0).toFixed(2);
    const price = Number(item.price || 0).toFixed(2);
    const total = Number(item.total || 0).toFixed(2);
    const unit  = item.unit === 'Weight' ? 'KG' : 'pc';

    push(BOLD_ON, txt(name.substring(0, 20).padEnd(20)));
    push(BOLD_OFF);
    push(txt(qty.padStart(6) + price.padStart(8) + total.padStart(8) + '\n'));

    if (name.length > 20) {
      push(txt('  ' + name.substring(20, 38) + (item.unit === 'Weight' ? `  ${item.quantity}${unit}` : '') + '\n'));
    }
  });
  push(txt(DIV));

  // --- Totals ---
  if (discountVal > 0) {
    push(txt(`Gross Total:  ${ ('Rs.' + grossVal.toFixed(2)).padStart(28) }\n`));
    push(txt(`Discount:    ${('-Rs.' + discountVal.toFixed(2)).padStart(28) }\n`));
    push(txt(DIV));
  }
  push(DBL_H, BOLD_ON);
  push(txt(`Net Amount: ${ ('Rs.' + totalVal.toFixed(2)).padStart(29) }\n`));
  push(BOLD_OFF, NORMAL, txt(DIV));

  // --- GST Summary ---
  push(BOLD_ON, txt('GST Summary\n'), BOLD_OFF);
  push(txt(DIV));
  push(txt('Taxable     CGST    SGST    Tax Amt\n'));
  push(txt(
    taxableVal.toFixed(2).padEnd(12) +
    cgst.toFixed(2).padStart(6)  +
    sgst.toFixed(2).padStart(8)  +
    taxAmt.toFixed(2).padStart(10) + '\n'
  ));
  push(txt(DIV));

  // --- Payment & Footer ---
  push(txt(`Payment: ${bill?.paymentMode || 'CASH'}\n`));
  push(txt(DIV));
  push(CENTER);
  push(txt('*** Thank You & Visit Again ***\n\n\n'));

  // Feed + cut
  push([ESC, 0x64, 0x04]);
  push([GS,  0x56, 0x41, 0x10]);

  return new Uint8Array(bytes);
};

/**
 * Generates raw ESC/POS binary data for 80mm thermal receipt for Orders.
 */
export const buildOrderESCPOS = (order = {}) => {
  const enc = new TextEncoder();
  const bytes = [];
  const push = (...arrs) => arrs.forEach(a => bytes.push(...a));

  const ESC = 0x1B, GS = 0x1D;
  const INIT    = [ESC, 0x40];
  const CENTER  = [ESC, 0x61, 0x01];
  const LEFT    = [ESC, 0x61, 0x00];
  const DBL     = [GS,  0x21, 0x11];
  const NORMAL  = [GS,  0x21, 0x00];
  const DBL_H   = [GS,  0x21, 0x01];
  const BOLD_ON = [ESC, 0x45, 0x01];
  const BOLD_OFF= [ESC, 0x45, 0x00];
  const DIV     = '-'.repeat(42) + '\n';
  const DIV_S   = '=' .repeat(42) + '\n';

  const txt = (s) => enc.encode(String(s ?? ''));

  const totalVal    = Number(order?.totalAmount || 0);
  const discountVal = Number(order?.discount || 0);
  const grossVal    = totalVal + discountVal;
  const receivedVal = Number(order?.receivedAmount || 0);
  const balanceVal  = Math.max(0, totalVal - receivedVal);
  const orderNumStr = order.serialNumber ? `S${order.serialNumber}-${order.orderId}` : `#${order.orderId || '-'}`;

  const fmtDate = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN') : (order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'));

  // --- Header ---
  push(INIT, CENTER, DBL);
  push(txt((order?.tradeName || 'SRI RAJU SWEETS') + '\n'));
  push(NORMAL);
  push(txt(`${order?.storeName || 'Vijayawada'}\n`));
  if (order?.storeAddress) {
    push(txt(`${order.storeAddress}\n`));
  }
  push(txt(`Ph: ${order?.storePhone || '9244757677'} | GSTIN: ${order?.storeGstNumber || order?.storeGst || '37DFJPK6083N1ZO'}\n`));
  push(txt(DIV));

  // --- Order Info ---
  push(LEFT);
  push(txt(`Order No: ${orderNumStr}\n`));
  push(txt(`Customer: ${order.customerName || 'Customer'}\n`));
  if (order.customerPhone) push(txt(`Phone: ${order.customerPhone}\n`));
  push(txt(`Date: ${fmtDate} ${order.deliveryTime || ''}\n`));
  push(txt(DIV_S));

  // --- Items header ---
  push(BOLD_ON);
  const hdr = 'Item'.padEnd(20) + 'Qty'.padStart(6) + 'Rate'.padStart(8) + 'Amt'.padStart(8) + '\n';
  push(txt(hdr));
  push(BOLD_OFF, txt(DIV));

  // --- Items ---
  (order?.items || []).forEach(item => {
    const name  = String(item.name || '');
    const qty   = Number(item.quantity || 0).toFixed(2);
    const price = Number(item.price || (Number(item.total || 0) / Math.max(1, Number(item.quantity || 1)))).toFixed(2);
    const total = Number(item.total || 0).toFixed(2);

    push(BOLD_ON, txt(name.substring(0, 20).padEnd(20)));
    push(BOLD_OFF);
    push(txt(qty.padStart(6) + price.padStart(8) + total.padStart(8) + '\n'));
  });
  push(txt(DIV));

  // --- Totals ---
  if (discountVal > 0) {
    push(txt(`Gross Total:  ${ ('Rs.' + grossVal.toFixed(2)).padStart(28) }\n`));
    push(txt(`Discount:    ${('-Rs.' + discountVal.toFixed(2)).padStart(28) }\n`));
  }
  push(DBL_H, BOLD_ON);
  push(txt(`Grand Total:  ${ ('Rs.' + totalVal.toFixed(2)).padStart(28) }\n`));
  push(BOLD_OFF, NORMAL);
  push(txt(`Advance Paid: ${ ('Rs.' + receivedVal.toFixed(2)).padStart(28) }\n`));
  push(BOLD_ON);
  push(txt(`Balance Due:  ${ ('Rs.' + balanceVal.toFixed(2)).padStart(28) }\n`));
  push(BOLD_OFF, txt(DIV));

  // --- Footer ---
  push(CENTER);
  push(txt('*** Thank You & Visit Again ***\n\n\n'));

  // Feed + cut
  push([ESC, 0x64, 0x04]);
  push([GS,  0x56, 0x41, 0x10]);

  return new Uint8Array(bytes);
};
