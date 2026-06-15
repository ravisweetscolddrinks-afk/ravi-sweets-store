import logo from '../assets/logo.png';

/**
 * Converts a number to its Indian Rupee word representation.
 */
export function numberToWords(num) {
  if (num === 0) return 'Rupees Zero Only';
  
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const g = ['', 'Thousand', 'Lakh', 'Crore'];

  function convertGroup(n) {
    let str = '';
    if (n >= 100) {
      str += a[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += b[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += a[n] + ' ';
    }
    return str.trim();
  }

  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);
  let rupeeStr = '';

  const groups = [];
  groups.push(rupees % 1000); // hundreds
  rupees = Math.floor(rupees / 1000);

  if (rupees > 0) {
    groups.push(rupees % 100); // thousands
    rupees = Math.floor(rupees / 100);
  } else groups.push(0);

  if (rupees > 0) {
    groups.push(rupees % 100); // lakhs
    rupees = Math.floor(rupees / 100);
  } else groups.push(0);

  if (rupees > 0) {
    groups.push(rupees); // crores
  } else groups.push(0);

  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const gVal = groups[i];
    if (gVal > 0) {
      const groupName = g[i];
      parts.push(convertGroup(gVal) + (groupName ? ' ' + groupName : ''));
    }
  }

  rupeeStr = parts.join(' ').trim();
  if (!rupeeStr) rupeeStr = 'Zero';

  let finalStr = 'Rupees ' + rupeeStr + ' Only';
  if (paise > 0) {
    const paiseWord = convertGroup(paise);
    finalStr = 'Rupees ' + rupeeStr + ' and ' + paiseWord.trim() + ' Paise Only';
  }
  return finalStr;
}

/**
 * Opens a print-friendly window displaying a GST Tax Invoice.
 * 
 * @param {Object} order The order object containing items, store name, customer details.
 */
export function getInvoiceHtml(order) {
  const invoiceNo = order.orderId;
  const invoiceDate = order.createdAt?.toDate 
    ? order.createdAt.toDate().toLocaleDateString('en-IN') 
    : new Date().toLocaleDateString('en-IN');
  const invoiceTime = order.createdAt?.toDate 
    ? order.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
    : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Retrieve customer details
  const customerName = order.customerName || '';
  const customerPhone = order.customerPhone || '';
  const businessName = order.businessName || '';
  const customerGST = order.gstNumber || '';
  const customerState = (order.state || 'Andhra Pradesh').trim();

  // Determine if it is Intrastate (within AP) or Interstate
  const isIntrastate = customerState.toLowerCase().replace(/\s+/g, '') === 'andhrapradesh';

  // State Code Mapping
  const stateCodes = {
    'andhrapradesh': '37',
    'telangana': '36',
    'karnataka': '29',
    'tamilnadu': '33',
    'maharashtra': '27',
    'delhi': '07',
    'kerala': '32',
    'gujarat': '24'
  };
  const customerStateNorm = customerState.toLowerCase().replace(/\s+/g, '');
  const customerStateCode = stateCodes[customerStateNorm] || 'N/A';

  // GST Calculation (5% total)
  const totalAmount = order.totalAmount || 0;
  const taxableValue = totalAmount / 1.05;
  const totalGST = totalAmount - taxableValue;

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  if (isIntrastate) {
    cgstAmount = totalGST / 2;
    sgstAmount = totalGST / 2;
  } else {
    igstAmount = totalGST;
  }

  // Retrieve store/seller details
  const storeName = order.storeName || 'Ravi Sweets';
  const sellerGSTIN = '37AEQPK1348P1ZS'; // Official GSTIN

  const tableHeadersHtml = isIntrastate
    ? `
        <th style="width: 5%; text-align: center;">S.No</th>
        <th style="width: 35%; text-align: left;">Product Name / Description</th>
        <th style="width: 8%; text-align: center;">HSN</th>
        <th style="width: 10%; text-align: center;">Qty</th>
        <th style="width: 10%; text-align: right;">Rate</th>
        <th style="width: 10%; text-align: right;">Taxable Val</th>
        <th style="width: 11%; text-align: right;">CGST</th>
        <th style="width: 11%; text-align: right;">SGST</th>
        <th style="width: 12%; text-align: right;">Total Amount</th>
      `
    : `
        <th style="width: 5%; text-align: center;">S.No</th>
        <th style="width: 40%; text-align: left;">Product Name / Description</th>
        <th style="width: 10%; text-align: center;">HSN</th>
        <th style="width: 10%; text-align: center;">Qty</th>
        <th style="width: 10%; text-align: right;">Rate</th>
        <th style="width: 13%; text-align: right;">Taxable Val</th>
        <th style="width: 12%; text-align: right;">IGST</th>
        <th style="width: 12%; text-align: right;">Total Amount</th>
      `;

  const itemsHtml = order.items.map((item, idx) => {
    const itemTotal = item.total || 0;
    const itemTaxable = itemTotal / 1.05;
    const itemGST = itemTotal - itemTaxable;
    const itemRate = item.price || 0;
    
    if (isIntrastate) {
      const itemCGST = itemGST / 2;
      const itemSGST = itemGST / 2;
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${item.name}</strong>${item.description ? `<br/><span style="font-size: 10px; color: #555;">${item.description}</span>` : ''}</td>
          <td style="text-align: center;">2106</td> <!-- Sweets HSN -->
          <td style="text-align: center;">${item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
          <td style="text-align: right;">₹${itemRate.toFixed(2)}</td>
          <td style="text-align: right;">₹${itemTaxable.toFixed(2)}</td>
          <td style="text-align: right;">2.5%<br/>₹${itemCGST.toFixed(2)}</td>
          <td style="text-align: right;">2.5%<br/>₹${itemSGST.toFixed(2)}</td>
          <td style="text-align: right;">₹${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    } else {
      return `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${item.name}</strong>${item.description ? `<br/><span style="font-size: 10px; color: #555;">${item.description}</span>` : ''}</td>
          <td style="text-align: center;">2106</td> <!-- Sweets HSN -->
          <td style="text-align: center;">${item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pcs`}</td>
          <td style="text-align: right;">₹${itemRate.toFixed(2)}</td>
          <td style="text-align: right;">₹${itemTaxable.toFixed(2)}</td>
          <td style="text-align: right;">5%<br/>₹${itemGST.toFixed(2)}</td>
          <td style="text-align: right;">₹${itemTotal.toFixed(2)}</td>
        </tr>
      `;
    }
  }).join('');

  const summaryRowHtml = isIntrastate
    ? `
        <tr style="font-weight: bold; background-color: #f9f9f9;">
          <td colspan="5" style="text-align: right;">Total / Taxable Value:</td>
          <td style="text-align: right;">₹${taxableValue.toFixed(2)}</td>
          <td style="text-align: right;">₹${cgstAmount.toFixed(2)}</td>
          <td style="text-align: right;">₹${sgstAmount.toFixed(2)}</td>
          <td style="text-align: right;">₹${totalAmount.toFixed(2)}</td>
        </tr>
      `
    : `
        <tr style="font-weight: bold; background-color: #f9f9f9;">
          <td colspan="5" style="text-align: right;">Total / Taxable Value:</td>
          <td style="text-align: right;">₹${taxableValue.toFixed(2)}</td>
          <td style="text-align: right;">₹${igstAmount.toFixed(2)}</td>
          <td style="text-align: right;">₹${totalAmount.toFixed(2)}</td>
        </tr>
      `;

  const gstBreakupHtml = isIntrastate
    ? `
        <strong>GST Summary Breakup:</strong><br/>
        - CGST @ 2.5%: ₹${cgstAmount.toFixed(2)}<br/>
        - SGST @ 2.5%: ₹${sgstAmount.toFixed(2)}<br/>
        - Total Tax Amount: ₹${totalGST.toFixed(2)}
      `
    : `
        <strong>GST Summary Breakup:</strong><br/>
        - IGST @ 5%: ₹${igstAmount.toFixed(2)}<br/>
        - Total Tax Amount: ₹${totalGST.toFixed(2)}
      `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GST Tax Invoice - #${invoiceNo}</title>
        <style>
          @page {
            size: A4;
            margin: 15mm;
          }
          body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            font-size: 12px;
            line-height: 1.4;
          }
          .invoice-box {
            max-width: 800px;
            margin: auto;
            border: 1px solid #ddd;
            padding: 20px;
            background: #fff;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .header-table td {
            vertical-align: top;
            border: none;
          }
          .logo {
            max-height: 60px;
            margin-bottom: 10px;
          }
          .title-badge {
            text-align: right;
          }
          .title-badge h1 {
            margin: 0;
            font-size: 24px;
            color: #0c4a24;
            letter-spacing: 1px;
            text-transform: uppercase;
          }
          .title-badge span {
            font-size: 11px;
            color: #666;
            font-weight: bold;
          }
          .details-section {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            border: 1px solid #ddd;
          }
          .details-section th {
            background-color: #f1f8f3;
            color: #0c4a24;
            text-align: left;
            padding: 8px;
            font-size: 11px;
            text-transform: uppercase;
            border: 1px solid #ddd;
          }
          .details-section td {
            padding: 10px;
            vertical-align: top;
            width: 50%;
            border: 1px solid #ddd;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .items-table th {
            background-color: #0c4a24;
            color: #fff;
            font-size: 11px;
            padding: 8px;
            text-transform: uppercase;
            border: 1px solid #ddd;
          }
          .items-table td {
            padding: 8px;
            border: 1px solid #ddd;
            vertical-align: middle;
          }
          .totals-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          .totals-table td {
            padding: 6px;
            border: 1px solid #ddd;
          }
          .amount-words {
            background-color: #f9f9f9;
            padding: 10px;
            border: 1px solid #ddd;
            font-style: italic;
            font-weight: 600;
            color: #333;
            margin-bottom: 20px;
          }
          .footer-section {
            margin-top: 40px;
            width: 100%;
            border-collapse: collapse;
          }
          .footer-section td {
            border: none;
            vertical-align: bottom;
          }
          .signature-box {
            border-top: 1px dashed #333;
            text-align: center;
            padding-top: 8px;
            width: 200px;
            float: right;
            margin-top: 30px;
          }
          .terms {
            font-size: 10px;
            color: #666;
            margin-top: 20px;
            border-top: 1px solid #eee;
            padding-top: 10px;
          }
          @media print {
            body {
              font-size: 11px;
            }
            .invoice-box {
              border: none;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <table class="header-table">
            <tr>
              <td>
                <img src="${logo}" alt="Logo" class="logo" /><br/>
                <strong style="font-size: 16px; color: #0c4a24;">RAVI SWEETS</strong><br/>
                <span>Store: ${storeName}</span><br/>
                <span>Andhra Pradesh, India</span><br/>
                <strong>GSTIN: ${sellerGSTIN}</strong>
              </td>
              <td class="title-badge">
                <h1>Tax Invoice</h1>
                <span>(ORIGINAL FOR RECIPIENT)</span>
                <div style="margin-top: 15px; font-size: 12px; text-align: right; line-height: 1.5;">
                  <strong>Invoice No:</strong> ${invoiceNo}<br/>
                  <strong>Date:</strong> ${invoiceDate} &nbsp; <strong>Time:</strong> ${invoiceTime}<br/>
                  <strong>Seller State Code:</strong> 37 (Andhra Pradesh)<br/>
                  <strong>Payment Mode:</strong> ${order.paymentMode || 'N/A'}
                </div>
              </td>
            </tr>
          </table>

          <table class="details-section">
            <thead>
              <tr>
                <th style="width: 50%;">Details of Seller (Bill From)</th>
                <th style="width: 50%;">Details of Receiver / Buyer (Bill To)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>RAVI SWEETS</strong><br/>
                  Store Location: ${storeName}<br/>
                  Andhra Pradesh, India<br/>
                  GSTIN: <strong>${sellerGSTIN}</strong><br/>
                  State: Andhra Pradesh (State Code: 37)
                </td>
                <td>
                  <strong>${businessName || customerName}</strong><br/>
                  ${order.address || 'Address Not Provided'}<br/>
                  ${order.city ? `${order.city}, ` : ''}${customerState}<br/>
                  GSTIN: <strong>${customerGST || 'N/A'}</strong><br/>
                  State: ${customerState} (State Code: ${customerStateCode})<br/>
                  Contact Person: ${customerName}<br/>
                  Mobile: +91 ${customerPhone}
                </td>
              </tr>
            </tbody>
          </table>

          <table class="items-table">
            <thead>
              <tr>
                ${tableHeadersHtml}
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
              ${summaryRowHtml}
            </tbody>
          </table>

          <div class="amount-words">
            Amount Chargeable (in words):<br/>
            <span style="font-size: 13px; color: #0c4a24;">${numberToWords(totalAmount)}</span>
          </div>

          <table class="totals-table">
            <tr>
              <td style="width: 55%; vertical-align: top; font-size: 11px; color: #333; line-height: 1.5; padding: 10px;">
                ${gstBreakupHtml}
                <div style="margin-top: 12px; border-top: 1px dashed #ddd; padding-top: 8px;">
                  <strong style="color: #0c4a24;">Bank Details for Payment:</strong><br/>
                  <strong>Bank Name:</strong> HDFC Bank<br/>
                  <strong>Account Name:</strong> RAVI SWEETS<br/>
                  <strong>Account Number:</strong> 50200046843751<br/>
                  <strong>IFSC Code:</strong> HDFC0009088<br/>
                  <strong>Branch:</strong> Satyanayanapuram, vijayawada
                </div>
              </td>
              <td style="width: 45%; padding: 0; border: none; vertical-align: top;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                  <tr>
                    <td style="font-weight: bold; width: 60%; padding: 8px;">Total Taxable Amount:</td>
                    <td style="text-align: right; width: 40%; padding: 8px;">₹${taxableValue.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="font-weight: bold; padding: 8px;">Total GST Tax Amount:</td>
                    <td style="text-align: right; padding: 8px;">₹${totalGST.toFixed(2)}</td>
                  </tr>
                  <tr style="background-color: #e2f0d9; font-size: 14px; font-weight: bold; color: #0c4a24;">
                    <td style="padding: 10px;">Grand Total (Incl. GST):</td>
                    <td style="text-align: right; padding: 10px;">₹${totalAmount.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px;">Advance Paid:</td>
                    <td style="text-align: right; padding: 8px;">₹${(order.receivedAmount || 0).toFixed(2)}</td>
                  </tr>
                  <tr style="font-weight: bold; color: #ef4444;">
                    <td style="padding: 8px;">Balance Due:</td>
                    <td style="text-align: right; padding: 8px;">₹${Math.max(0, totalAmount - (order.receivedAmount || 0)).toFixed(2)}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <div style="width: 100%; overflow: hidden; margin-top: 30px;">
            <div style="float: left; width: 60%;">
              <div class="terms">
                <strong>Terms & Conditions:</strong><br/>
                1. Goods once sold will not be taken back.<br/>
                2. Subject to local jurisdiction.<br/>
                3. This is a computer-generated invoice and requires no physical signature.
              </div>
            </div>
            <div style="float: right; width: 40%; text-align: right;">
              <div class="signature-box">
                <span style="font-size: 10px; color: #555;">for Ravi Sweets</span><br/><br/><br/>
                <strong>Authorized Signatory</strong>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

export function generateGSTInvoice(order) {
  const printContent = getInvoiceHtml(order);
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = function() {
      printWindow.focus();
      printWindow.print();
    };
  }
}
