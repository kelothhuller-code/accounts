import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  PlusCircle, 
  Layers, 
  CreditCard, 
  Truck, 
  Calendar, 
  Phone, 
  MapPin, 
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  Trash2,
  Handshake,
  Search
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function SupplierLedgerModal({ isOpen, onClose, supplierId, onOpenArrivalWithSupplier, onOpenEditArrival, onOpenSettlementWithSupplier, onDataChanged }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [txSearchTerm, setTxSearchTerm] = useState('');

  // Payment Form Modal inside Supplier Account (New / Edit)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentType, setPaymentType] = useState('payment_paid'); // 'payment_paid' or 'payment_received'
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Settlement Edit Modal inside Supplier Account
  const [showSettlementEditModal, setShowSettlementEditModal] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState(null);
  const [stRate, setStRate] = useState('');
  const [stRateUnit, setStRateUnit] = useState('per_kg_ep');
  const [stTcsRate, setStTcsRate] = useState('0.1');
  const [stDate, setStDate] = useState(new Date().toISOString().split('T')[0]);
  const [stNotes, setStNotes] = useState('');
  const [savingSettlement, setSavingSettlement] = useState(false);

  // Commitment Edit Modal inside Supplier Account
  const [showCommitmentEditModal, setShowCommitmentEditModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState(null);
  const [comProduct, setComProduct] = useState('RC Raw');
  const [comType, setComType] = useState('bags');
  const [comQty, setComQty] = useState('');
  const [comRate, setComRate] = useState('');
  const [comDate, setComDate] = useState(new Date().toISOString().split('T')[0]);
  const [comNotes, setComNotes] = useState('');
  const [savingCommitment, setSavingCommitment] = useState(false);

  useEffect(() => {
    if (isOpen && supplierId) {
      loadLedger();
    }
  }, [isOpen, supplierId]);

  const loadLedger = async () => {
    setLoading(true);
    try {
      const res = await dbAction('suppliers:get-one', { id: supplierId });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openNewPayment = (type = 'payment_paid') => {
    setEditingPayment(null);
    setPaymentType(type);
    setPayAmount('');
    setPayMode('Bank Transfer');
    setPayRef('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
    setShowPaymentModal(true);
  };

  const openEditPayment = (p) => {
    setEditingPayment(p);
    setPaymentType(p.type || 'payment_paid');
    setPayAmount(String(p.amount));
    setPayMode(p.mode || 'Bank Transfer');
    setPayRef(p.reference || '');
    setPayDate(p.date || new Date().toISOString().split('T')[0]);
    setPayNotes(p.notes || '');
    setShowPaymentModal(true);
  };

  const handleRecordPayment = async (e) => {
    if (e) e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) return;

    setSavingPayment(true);
    try {
      const payload = {
        supplierId,
        supplierName: data.summary.name,
        type: paymentType,
        amount: parseFloat(payAmount),
        mode: payMode,
        reference: payRef,
        date: payDate,
        notes: payNotes
      };

      if (editingPayment) {
        await dbAction('payments:update', { id: editingPayment.id, data: payload });
      } else {
        await dbAction('payments:add', payload);
      }

      setShowPaymentModal(false);
      setEditingPayment(null);
      setPayAmount('');
      setPayRef('');
      setPayNotes('');
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error saving payment: ' + err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const openEditSettlement = (st) => {
    setEditingSettlement(st);
    setStRate(String(st.settlementRate));
    setStRateUnit(st.rateUnit || 'per_kg_ep');
    setStTcsRate(String(st.tcsRate !== undefined ? st.tcsRate : '0.1'));
    setStDate(st.date || new Date().toISOString().split('T')[0]);
    setStNotes(st.notes || '');
    setShowSettlementEditModal(true);
  };

  const handleSaveSettlement = async (e) => {
    if (e) e.preventDefault();
    if (!editingSettlement || !stRate) return;

    setSavingSettlement(true);
    try {
      await dbAction('settlements:update', {
        id: editingSettlement.id,
        data: {
          settlementRate: parseFloat(stRate),
          rateUnit: stRateUnit,
          tcsRate: parseFloat(stTcsRate),
          date: stDate,
          notes: stNotes
        }
      });

      setShowSettlementEditModal(false);
      setEditingSettlement(null);
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error updating settlement: ' + err.message);
    } finally {
      setSavingSettlement(false);
    }
  };

  const handleDeleteArrival = async (arr) => {
    if (arr.status === 'settled' || (arr.settledBags > 0)) {
      alert(`Cannot delete ${arr.arrivalNo} — it has settled quantities. Delete the settlement first.`);
      return;
    }
    if (!window.confirm(`Delete arrival ${arr.arrivalNo}?\nThis will reverse commitment deductions.`)) return;
    setDeletingId(arr.id);
    try {
      await dbAction('arrivals:delete', { id: arr.id });
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSettlement = async (st) => {
    if (!window.confirm(`Delete settlement ${st.settlementNo}?\nThis will reverse stock and commitment balances.`)) return;
    setDeletingId(st.id);
    try {
      await dbAction('settlements:delete', { id: st.id });
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeletePayment = async (pay) => {
    if (!window.confirm(`Delete payment ${pay.paymentNo} of ₹${pay.amount}?\nThis will reverse the payment from ledger.`)) return;
    setDeletingId(pay.id);
    try {
      await dbAction('payments:delete', { id: pay.id });
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const openEditCommitment = (com) => {
    setEditingCommitment(com);
    setComProduct(com.product || 'RC Raw');
    setComType(com.type || 'bags');
    setComQty(String(com.quantity || ''));
    setComRate(String(com.rate || ''));
    setComDate(com.date || new Date().toISOString().split('T')[0]);
    setComNotes(com.notes || '');
    setShowCommitmentEditModal(true);
  };

  const handleSaveCommitment = async (e) => {
    if (e) e.preventDefault();
    if (!editingCommitment || !comQty || !comRate) return;

    setSavingCommitment(true);
    try {
      await dbAction('commitments:update', {
        id: editingCommitment.id,
        data: {
          product: comProduct,
          type: comType,
          quantity: parseFloat(comQty),
          rate: parseFloat(comRate),
          date: comDate,
          notes: comNotes
        }
      });
      setShowCommitmentEditModal(false);
      setEditingCommitment(null);
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error updating commitment: ' + err.message);
    } finally {
      setSavingCommitment(false);
    }
  };

  const handleDeleteCommitment = async (com) => {
    if (com.fulfilledQty > 0) {
      alert(`Cannot delete commitment ${com.commitmentNo} — ${com.fulfilledQty} ${com.type} has already been fulfilled.`);
      return;
    }
    if (!window.confirm(`Delete commitment ${com.commitmentNo}?`)) return;
    setDeletingId(com.id);
    try {
      await dbAction('commitments:delete', { id: com.id });
      await loadLedger();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportLedgerCsv = () => {
    if (!data) return;
    const s = data.summary;
    const transactions = buildTransactionsList();

    const headers = [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Transaction Type' },
      { key: 'ref', label: 'Ref / Details' },
      { key: 'product', label: 'Product' },
      { key: 'bags', label: 'Bags' },
      { key: 'weight', label: 'Weight (kg)' },
      { key: 'endProduct', label: 'End Product (kg)' },
      { key: 'debit', label: 'Debit (Paid/Adj)' },
      { key: 'credit', label: 'Credit (Purchases/Bills)' },
      { key: 'balance', label: 'Running Balance' },
    ];

    exportToCsv(`Ledger_${s.name.replace(/\s+/g, '_')}`, headers, transactions);
  };

  const handlePrintLedgerPDF = () => {
    if (!data) return;
    const s = data.summary;
    const transactions = buildTransactionsList();

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print/export PDF ledger.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Statement of Account - ${s.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 20px; }
          .company-title { font-size: 24px; font-weight: bold; color: #0f172a; }
          .doc-title { font-size: 18px; font-weight: bold; color: #2563eb; text-align: right; }
          .party-card { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; border: 1px solid #cbd5e1; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
          th { background: #0f172a; color: #ffffff; font-weight: 600; }
          tr:nth-child(even) { background: #f8fafc; }
          .num { text-align: right; font-family: monospace; font-size: 12px; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 15px; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company-title">Coffee Trading & Processing ERP</div>
            <div style="font-size: 13px; color: #475569;">Coffee Arrival, Dispatches & Financial Accounting</div>
          </div>
          <div>
            <div class="doc-title">STATEMENT OF ACCOUNT</div>
            <div style="font-size: 12px; color: #64748b;">As of ${new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div class="party-card">
          <div>
            <strong>Party Name:</strong> ${s.name}<br/>
            <strong>Location:</strong> ${s.place || 'N/A'}<br/>
            <strong>Phone:</strong> ${s.phone || 'N/A'}<br/>
            <strong>GSTIN:</strong> ${s.gst || 'N/A'}
          </div>
          <div>
            <strong>Net Financial Balance:</strong> ${s.netPayable >= 0 ? `₹${s.netPayable.toLocaleString('en-IN')} (CREDIT / WE OWE)` : `₹${Math.abs(s.netPayable).toLocaleString('en-IN')} (DEBIT / OWES US)`}<br/>
            <strong>Storage Coffee Stock:</strong> ${s.storageBags} Bags (${s.storageEndProduct.toLocaleString()} kg EP)<br/>
            <strong>Total Billed Purchases:</strong> ₹${s.totalPurchasesBilled.toLocaleString('en-IN')}<br/>
            <strong>Total Billed Sales:</strong> ₹${s.totalSalesBilled.toLocaleString('en-IN')}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher / Ref</th>
              <th>Particulars / Product</th>
              <th>Type</th>
              <th class="num">Debit (Receivable/Paid ₹)</th>
              <th class="num">Credit (Payable/Bill ₹)</th>
              <th class="num">Running Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td><strong>${t.ref}</strong></td>
                <td>${t.product} ${t.notes ? `<br/><small style="color:#64748b">${t.notes}</small>` : ''}</td>
                <td>${t.type}</td>
                <td class="num" style="color: ${t.debit > 0 ? '#dc2626' : 'inherit'}">${t.debit > 0 ? `₹${t.debit.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num" style="color: ${t.credit > 0 ? '#059669' : 'inherit'}">${t.credit > 0 ? `₹${t.credit.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num"><strong>₹${t.runningBalance.toLocaleString('en-IN')}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>This is an official computer-generated statement of account.</div>
          <div>Authorized Signatory ___________________</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Build Chronological Transactions for Ledger View
  const buildTransactionsList = () => {
    if (!data) return [];
    const s = data.summary;
    const events = [];

    // Opening Balance
    if (s && s.openingBalance) {
      const isDebit = s.openingBalanceType === 'debit';
      events.push({
        date: s.createdAt ? s.createdAt.split('T')[0] : '2026-01-01',
        type: 'Opening Balance',
        ref: 'OPENING',
        product: 'Opening Balance',
        bags: s.openingStorageBags || '-',
        weight: '-',
        endProduct: s.openingStorageEP || '-',
        debit: isDebit ? Math.abs(s.openingBalance) : 0,
        credit: !isDebit ? Math.abs(s.openingBalance) : 0,
        notes: isDebit ? 'Debit Opening (Owes Us)' : 'Credit Opening (We Owe)',
        category: 'opening',
        rawItem: null
      });
    }

    // Arrivals (Purchases / Store In)
    (data.arrivals || []).forEach(arr => {
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        events.push({
          date: arr.date,
          type: arr.billType === 'cash_bill' ? 'Cash Purchase' : 'Purchase Bill',
          ref: arr.arrivalNo,
          product: arr.product,
          bags: arr.bags,
          weight: arr.weight,
          endProduct: arr.endProductWeight,
          debit: 0,
          credit: Number(arr.netAmount) || Number(arr.billAmount) || 0,
          notes: arr.remarks || '',
          category: 'arrival',
          rawItem: arr
        });
      } else if (arr.status === 'storage' || arr.status === 'partial_settled') {
        events.push({
          date: arr.date,
          type: 'Store In (Unfixed)',
          ref: arr.arrivalNo,
          product: arr.product,
          bags: arr.bags,
          weight: arr.weight,
          endProduct: arr.endProductWeight,
          debit: 0,
          credit: 0,
          notes: `OT: ${arr.outturn} | Rem: ${arr.remainingBags} bags`,
          category: 'arrival',
          rawItem: arr
        });
      }
    });

    // Dispatches (Sales / Store Out / Husk)
    (data.dispatches || []).forEach(disp => {
      const isHusk = disp.dispatchType === 'husk' || disp.product === 'prod_husk' || disp.product === 'Husk';
      const gstSum = (Number(disp.cgstAmount) || 0) + (Number(disp.sgstAmount) || 0) + (Number(disp.igstAmount) || 0);

      if (disp.status === 'storage_out' || disp.rateType === 'storage_out') {
        events.push({
          date: disp.date,
          type: 'Store Out (Release)',
          ref: disp.dispatchNo,
          product: disp.product,
          bags: disp.bags,
          weight: disp.weight,
          endProduct: disp.endProductWeight,
          debit: 0,
          credit: 0,
          notes: 'Storage coffee released (Unbilled)',
          category: 'dispatch',
          rawItem: disp
        });
      } else {
        events.push({
          date: disp.date,
          type: isHusk ? 'Husk Sale (GST 5%)' : (disp.billType === 'cash_bill' ? 'Cash Sale' : 'Sales Invoice'),
          ref: disp.dispatchNo,
          product: disp.product,
          bags: disp.bags,
          weight: disp.weight,
          endProduct: disp.endProductWeight,
          debit: Number(disp.netAmount) || Number(disp.billAmount) || 0,
          credit: 0,
          notes: gstSum > 0 ? `GST: ₹${gstSum}` : (disp.remarks || ''),
          category: 'dispatch',
          rawItem: disp
        });
      }
    });

    // Settlements
    (data.settlements || []).forEach(set => {
      const isSales = set.settlementCategory === 'sales_storage';
      const bill = Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0;
      events.push({
        date: set.date,
        type: isSales ? 'Sales Storage Settlement' : 'Purchase Storage Settlement',
        ref: set.settlementNo,
        product: isSales ? 'Settled Released Coffee' : 'Settled Stored Coffee',
        bags: set.settledBags,
        weight: '-',
        endProduct: set.settledEndProduct,
        debit: isSales ? bill : 0,
        credit: isSales ? 0 : bill,
        notes: `Avg OT: ${set.averageOutturn} @ ₹${set.settlementRate}`,
        category: 'settlement',
        rawItem: set
      });
    });

    // EP Transfers
    (data.epTransfers || []).forEach(trf => {
      if (trf.fromPartyId === supplierId) {
        events.push({
          date: trf.date,
          type: 'EP Transfer Out',
          ref: trf.transferNo,
          product: `EP Transferred to ${trf.toPartyName}`,
          bags: trf.bags,
          weight: trf.weight,
          endProduct: trf.endProductWeight,
          debit: Number(trf.transferValue) || 0,
          credit: 0,
          notes: trf.notes || '',
          category: 'transfer',
          rawItem: trf
        });
      }
      if (trf.toPartyId === supplierId) {
        events.push({
          date: trf.date,
          type: 'EP Transfer In',
          ref: trf.transferNo,
          product: `EP Transferred from ${trf.fromPartyName}`,
          bags: trf.bags,
          weight: trf.weight,
          endProduct: trf.endProductWeight,
          debit: 0,
          credit: Number(trf.transferValue) || 0,
          notes: trf.notes || '',
          category: 'transfer',
          rawItem: trf
        });
      }
    });

    // Washes
    (data.washes || []).forEach(w => {
      const val = Number(w.adjustmentAmount) || 0;
      events.push({
        date: w.date,
        type: 'Commitment Wash',
        ref: w.washNo,
        product: `Washed ${w.purchaseCommitmentNo} vs ${w.saleCommitmentNo}`,
        bags: w.quantityWashed,
        weight: '-',
        endProduct: '-',
        debit: val < 0 ? Math.abs(val) : 0,
        credit: val > 0 ? val : 0,
        notes: `Rate Diff: ₹${w.rateDifference}`,
        category: 'wash',
        rawItem: w
      });
    });

    // Payments
    (data.payments || []).forEach(pay => {
      if (pay.type === 'payment_paid' || !pay.type) {
        events.push({
          date: pay.date,
          type: 'Payment Paid',
          ref: pay.paymentNo,
          product: pay.mode,
          bags: '-',
          weight: '-',
          endProduct: '-',
          debit: Number(pay.amount) || 0,
          credit: 0,
          notes: pay.reference ? `Ref: ${pay.reference}` : '',
          category: 'payment',
          rawItem: pay
        });
      } else if (pay.type === 'payment_received') {
        events.push({
          date: pay.date,
          type: 'Payment Received',
          ref: pay.paymentNo,
          product: pay.mode,
          bags: '-',
          weight: '-',
          endProduct: '-',
          debit: 0,
          credit: Number(pay.amount) || 0,
          notes: pay.reference ? `Ref: ${pay.reference}` : '',
          category: 'payment',
          rawItem: pay
        });
      }
    });

    // Sort chronologically
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    let filteredEvents = events;
    if (txSearchTerm.trim()) {
      const term = txSearchTerm.toLowerCase();
      filteredEvents = events.filter(e => 
        e.ref.toLowerCase().includes(term) ||
        e.type.toLowerCase().includes(term) ||
        e.product.toLowerCase().includes(term) ||
        (e.notes && e.notes.toLowerCase().includes(term))
      );
    }

    let running = 0;
    return filteredEvents.map(e => {
      running += (e.credit - e.debit);
      return {
        ...e,
        balance: running,
        runningBalance: running
      };
    });
  };

  if (!isOpen) return null;

  const s = data ? data.summary : null;
  const transactions = buildTransactionsList();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '1050px', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '1rem 1.4rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem' }}>👤</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                {s ? s.name : 'Loading Supplier...'}
              </h2>
              {s && s.place && (
                <span className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={12} /> {s.place}
                </span>
              )}
            </div>
            {s && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                {s.phone && <span><Phone size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {s.phone}</span>}
                {s.gst && <span>GST: {s.gst}</span>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handlePrintLedgerPDF}>
              🖨️ Print / Save PDF
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportLedgerCsv}>
              <Download size={14} /> Export CSV
            </button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>

        {loading || !s ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading supplier ledger and account transactions...
          </div>
        ) : (
          <div className="modal-body" style={{ gap: '1.25rem' }}>
            {/* Top Accounting KPI Cards */}
            <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
              <div className="metric-box coffee">
                <span className="metric-label">Total Supplied</span>
                <span className="metric-value">{s.totalRawWeight.toLocaleString()} kg</span>
                <span className="metric-sub">{s.totalBags} Bags</span>
              </div>

              <div className="metric-box success">
                <span className="metric-label">Total End Product</span>
                <span className="metric-value">{s.totalEndProduct.toLocaleString()} kg</span>
                <span className="metric-sub">{(s.totalEndProduct / 100).toFixed(1)} Qtl Clean</span>
              </div>

              {/* Storage Coffee Summary Card with Store In, Store Out & Net Balance */}
              <div className="metric-box purple" style={{ background: '#faf5ff' }}>
                <span className="metric-label">Net Storage Stock</span>
                <span className="metric-value" style={{ color: '#7c3aed' }}>
                  {s.storageBags} Bags
                </span>
                <div style={{ fontSize: '0.72rem', color: '#6b21a8', marginTop: '0.15rem' }}>
                  In: <strong>{s.storeInBags || 0}b</strong> | Out: <strong>{s.storeOutBags || 0}b</strong> ({s.storageEndProduct.toLocaleString()} kg EP)
                </div>
              </div>

              <div className="metric-box">
                <span className="metric-label">Total Billed</span>
                <span className="metric-value">₹{s.totalBilledAmount.toLocaleString()}</span>
                <span className="metric-sub">TCS: ₹{s.totalTcsDeducted.toLocaleString()}</span>
              </div>

              <div className="metric-box danger" style={{ background: '#fef2f2' }}>
                <span className="metric-label">Net Payable</span>
                <span className="metric-value" style={{ color: s.netPayable >= 0 ? '#dc2626' : '#059669' }}>
                  ₹{s.netPayable.toLocaleString()}
                </span>
                <span className="metric-sub">
                  Paid: ₹{s.totalPaid.toLocaleString()} {s.totalReceived > 0 && `| Recv: ₹${s.totalReceived.toLocaleString()}`}
                </span>
              </div>
            </div>

            {/* Quick Action Bar for Supplier */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.65rem 0.85rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('ledger')}
                >
                  <FileText size={14} /> Full Ledger Statement
                </button>
                <button 
                  className={`btn btn-sm ${activeTab === 'arrivals' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('arrivals')}
                >
                  <Truck size={14} /> Arrivals ({data.arrivals.length})
                </button>
                <button 
                  className={`btn btn-sm ${activeTab === 'settlements' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('settlements')}
                >
                  <Layers size={14} /> Settlements ({data.settlements.length})
                </button>
                <button 
                  className={`btn btn-sm ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('payments')}
                >
                  <CreditCard size={14} /> Payments ({data.payments.length})
                </button>
                <button 
                  className={`btn btn-sm ${activeTab === 'commitments' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('commitments')}
                >
                  <Handshake size={14} /> Commitments ({data.commitments ? data.commitments.length : 0})
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* User explicit requirement: Payment paid & Payment received only in supplier account! */}
                <button 
                  className="btn btn-sm btn-success"
                  onClick={() => openNewPayment('payment_paid')}
                >
                  <ArrowUpRight size={14} /> + Record Paid (Voucher)
                </button>
                <button 
                  className="btn btn-sm btn-secondary"
                  style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
                  onClick={() => openNewPayment('payment_received')}
                >
                  <ArrowDownLeft size={14} /> + Record Received from Supplier
                </button>
                {s.storageBags > 0 && (
                  <button 
                    className="btn btn-sm btn-coffee"
                    onClick={() => {
                      onClose();
                      if (onOpenSettlementWithSupplier) onOpenSettlementWithSupplier(s.id);
                    }}
                  >
                    <Layers size={14} /> Settle Storage ({s.storageBags} Bags)
                  </button>
                )}
              </div>
            </div>

            {/* Tab 1: Chronological Ledger */}
            {activeTab === 'ledger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', border: '1px solid #cbd5e1', padding: '0.4rem 0.75rem', borderRadius: '6px' }}>
                  <Search size={15} color="#64748b" />
                  <input
                    type="text"
                    placeholder="🔍 Quick Filter transactions by Ref # (e.g. ARR-001, SET-002, PAY-001), Product, or Notes..."
                    value={txSearchTerm}
                    onChange={e => setTxSearchTerm(e.target.value)}
                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                  />
                  {txSearchTerm && (
                    <X size={14} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => setTxSearchTerm('')} />
                  )}
                </div>

                <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Ref #</th>
                        <th>Particulars / Product</th>
                        <th className="num">Bags</th>
                        <th className="num">Weight (kg)</th>
                        <th className="num">End Product (kg)</th>
                        <th className="num" style={{ color: '#059669' }}>Debit (Paid)</th>
                        <th className="num" style={{ color: '#dc2626' }}>Credit (Bill)</th>
                        <th className="num">Net Balance</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                            {txSearchTerm ? `No transactions match "${txSearchTerm}"` : 'No transactions recorded yet.'}
                          </td>
                        </tr>
                      ) : (
                        transactions.map((tx, idx) => (
                          <tr key={idx}>
                            <td>{tx.date}</td>
                            <td>
                              <span className={`badge ${
                                tx.type.includes('Paid') ? 'badge-green' :
                                tx.type.includes('Received') ? 'badge-blue' :
                                tx.type.includes('Settlement') ? 'badge-amber' :
                                tx.type.includes('Storage') ? 'badge-gray' :
                                tx.type.includes('Commitment') ? 'badge-purple' : 'badge-coffee'
                              }`}>
                                {tx.type}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{tx.ref}</td>
                            <td>
                              {tx.product}
                              {tx.notes && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{tx.notes}</div>}
                            </td>
                            <td className="num">{tx.bags}</td>
                            <td className="num">{typeof tx.weight === 'number' ? tx.weight.toLocaleString() : tx.weight}</td>
                            <td className="num" style={{ fontFamily: 'var(--font-mono)' }}>
                              {typeof tx.endProduct === 'number' ? tx.endProduct.toLocaleString() : tx.endProduct}
                            </td>
                            <td className="num" style={{ color: '#059669', fontWeight: tx.debit > 0 ? 600 : 400 }}>
                              {tx.debit > 0 ? `₹${tx.debit.toLocaleString()}` : '-'}
                            </td>
                            <td className="num" style={{ color: '#dc2626', fontWeight: tx.credit > 0 ? 600 : 400 }}>
                              {tx.credit > 0 ? `₹${tx.credit.toLocaleString()}` : '-'}
                            </td>
                            <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                              ₹{tx.balance.toLocaleString()}
                            </td>
                            <td>
                              {tx.rawItem ? (
                                <div style={{ display: 'flex', gap: '0.3rem' }}>
                                  <button
                                    title="Edit Transaction"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                    onClick={() => {
                                      if (tx.category === 'arrival') {
                                        if (onOpenEditArrival) { onClose(); onOpenEditArrival(tx.rawItem); }
                                      } else if (tx.category === 'settlement') {
                                        openEditSettlement(tx.rawItem);
                                      } else if (tx.category === 'payment') {
                                        openEditPayment(tx.rawItem);
                                      } else if (tx.category === 'commitment') {
                                        openEditCommitment(tx.rawItem);
                                      }
                                    }}
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    title="Delete Transaction"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === (tx.rawItem ? tx.rawItem.id : null) ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                    disabled={deletingId === (tx.rawItem ? tx.rawItem.id : null)}
                                    onClick={() => {
                                      if (tx.category === 'arrival') handleDeleteArrival(tx.rawItem);
                                      else if (tx.category === 'settlement') handleDeleteSettlement(tx.rawItem);
                                      else if (tx.category === 'payment') handleDeletePayment(tx.rawItem);
                                      else if (tx.category === 'commitment') handleDeleteCommitment(tx.rawItem);
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Opening</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Arrivals */}
            {activeTab === 'arrivals' && (
              <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Arrival #</th>
                      <th>Date</th>
                      <th>Vehicle</th>
                      <th>Product</th>
                      <th className="num">Raw Wt (kg)</th>
                      <th className="num">Bags</th>
                      <th className="num">OT</th>
                      <th className="num">End Product (kg)</th>
                      <th>Status</th>
                      <th className="num">Bill Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.arrivals.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.arrivalNo}</td>
                        <td>{a.date}</td>
                        <td>{a.vehicleNo || '-'}</td>
                        <td><span className="badge badge-coffee">{a.product}</span></td>
                        <td className="num">{a.weight.toLocaleString()}</td>
                        <td className="num">{a.bags}</td>
                        <td className="num">{a.outturn} {a.outturnType === 'percentage' ? '%' : 'kg/50k'}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{a.endProductWeight.toLocaleString()}</td>
                        <td>
                          <span className={`badge ${
                            a.status === 'billed' ? 'badge-green' :
                            a.status === 'settled' ? 'badge-blue' :
                            a.status === 'partial_settled' ? 'badge-amber' : 'badge-coffee'
                          }`}>
                            {a.status === 'storage' ? `📦 Storage (${a.remainingBags} bags)` : a.status}
                          </span>
                        </td>
                        <td className="num" style={{ fontWeight: 600 }}>
                          {a.status === 'storage' ? 'Unfixed' : `₹${(a.netAmount || a.billAmount).toLocaleString()}`}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.3rem' }}>
                            <button
                              title="Edit"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                              onClick={() => { if (onOpenEditArrival) { onClose(); onOpenEditArrival(a); } }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              title="Delete"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === a.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                              disabled={deletingId === a.id}
                              onClick={() => handleDeleteArrival(a)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Settlements */}
            {activeTab === 'settlements' && (
              <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Settlement #</th>
                      <th>Date</th>
                      <th className="num">Settled Bags</th>
                      <th className="num">Avg Outturn</th>
                      <th className="num">Settled EP (kg)</th>
                      <th className="num">Rate</th>
                      <th className="num">TCS</th>
                      <th className="num">Net Settlement Bill</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.settlements.length === 0 ? (
                      <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No settlements yet</td></tr>
                    ) : (
                      data.settlements.map(st => (
                        <tr key={st.id}>
                          <td style={{ fontWeight: 600 }}>{st.settlementNo}</td>
                          <td>{st.date}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{st.settledBags} Bags</td>
                          <td className="num">{st.averageOutturn} kg/50k</td>
                          <td className="num">{st.settledEndProduct.toLocaleString()} kg</td>
                          <td className="num">₹{st.settlementRate}/{st.rateUnit === 'per_bag' ? 'Bag' : 'Kg EP'}</td>
                          <td className="num" style={{ color: '#dc2626' }}>-₹{st.tcsAmount}</td>
                          <td className="num" style={{ fontWeight: 700, color: '#059669' }}>
                            ₹{st.settlementNetAmount.toLocaleString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                title="Edit Settlement Rate / Date"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                onClick={() => openEditSettlement(st)}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                title="Delete Settlement (Reverse Stock)"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === st.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                disabled={deletingId === st.id}
                                onClick={() => handleDeleteSettlement(st)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 4: Payments */}
            {activeTab === 'payments' && (
              <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Payment #</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Payment Mode</th>
                      <th>Reference</th>
                      <th>Notes</th>
                      <th className="num">Amount</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.length === 0 ? (
                      <tr><td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No payments recorded</td></tr>
                    ) : (
                      data.payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.paymentNo}</td>
                          <td>{p.date}</td>
                          <td>
                            <span className={`badge ${p.type === 'payment_received' ? 'badge-blue' : 'badge-green'}`}>
                              {p.type === 'payment_received' ? 'Received From Supplier' : 'Paid to Supplier'}
                            </span>
                          </td>
                          <td>{p.mode}</td>
                          <td>{p.reference || '-'}</td>
                          <td>{p.notes || '-'}</td>
                          <td className="num" style={{ fontWeight: 700, fontSize: '0.95rem', color: p.type === 'payment_received' ? '#2563eb' : '#059669' }}>
                            ₹{p.amount.toLocaleString()}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                title="Edit Payment"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                onClick={() => openEditPayment(p)}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                title="Delete Payment"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === p.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                disabled={deletingId === p.id}
                                onClick={() => handleDeletePayment(p)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 5: Commitments */}
            {activeTab === 'commitments' && (
              <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Commitment #</th>
                      <th>Date</th>
                      <th>Product</th>
                      <th className="num">Contract Qty</th>
                      <th className="num">Fulfilled</th>
                      <th className="num">Remaining</th>
                      <th className="num">Contract Rate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data.commitments || data.commitments.length === 0 ? (
                      <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commitments recorded yet</td></tr>
                    ) : (
                      data.commitments.map(com => (
                        <tr key={com.id}>
                          <td style={{ fontWeight: 600 }}>{com.commitmentNo}</td>
                          <td>{com.date}</td>
                          <td><span className="badge badge-coffee">{com.product}</span></td>
                          <td className="num" style={{ fontWeight: 600 }}>{com.quantity} {com.type}</td>
                          <td className="num" style={{ color: '#059669' }}>{com.fulfilledQty || 0}</td>
                          <td className="num" style={{ fontWeight: 700, color: com.remainingQty > 0 ? '#d97706' : '#64748b' }}>
                            {com.remainingQty} {com.type}
                          </td>
                          <td className="num" style={{ fontWeight: 700 }}>₹{com.rate}/{com.type === 'bags' ? 'Bag' : 'Kg EP'}</td>
                          <td>
                            <span className={`badge ${com.status === 'fulfilled' ? 'badge-green' : 'badge-amber'}`}>
                              {com.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              <button
                                title="Edit Commitment"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                onClick={() => openEditCommitment(com)}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                title="Delete Commitment"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === com.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                disabled={deletingId === com.id}
                                onClick={() => handleDeleteCommitment(com)}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal Sub-dialog: Record / Edit Payment (Paid or Received) */}
        {showPaymentModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1200 }} onClick={() => setShowPaymentModal(false)}>
            <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <span>{editingPayment ? `✏️ Edit Payment ${editingPayment.paymentNo}` : paymentType === 'payment_received' ? '📥 Record Payment Received' : '📤 Record Payment Paid'}</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPaymentModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleRecordPayment} className="modal-body">
                <div className="form-group">
                  <label className="form-label">Transaction Type</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${paymentType === 'payment_paid' ? 'btn-success' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setPaymentType('payment_paid')}
                    >
                      Paid to Supplier
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${paymentType === 'payment_received' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1 }}
                      onClick={() => setPaymentType('payment_received')}
                    >
                      Received from Supplier
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="Enter amount"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Payment Mode</label>
                    <select className="form-control" value={payMode} onChange={e => setPayMode(e.target.value)}>
                      <option value="Bank Transfer">Bank Transfer / NEFT / RTGS</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI / GPay / PhonePe</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input type="date" className="form-control" value={payDate} onChange={e => setPayDate(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Reference / Cheque No / UTR</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. UTR12345678 or Chq #00123"
                    value={payRef}
                    onChange={e => setPayRef(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Advance payment against Lot #2"
                    value={payNotes}
                    onChange={e => setPayNotes(e.target.value)}
                  />
                </div>

                <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPaymentModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingPayment}>
                    {savingPayment ? 'Saving...' : editingPayment ? 'Update Voucher' : 'Confirm Voucher'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Sub-dialog: Edit Settlement */}
        {showSettlementEditModal && editingSettlement && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1200 }} onClick={() => setShowSettlementEditModal(false)}>
            <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <span>✏️ Edit Settlement — {editingSettlement.settlementNo}</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowSettlementEditModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveSettlement} className="modal-body">
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Rate Unit</label>
                    <select className="form-control" value={stRateUnit} onChange={e => setStRateUnit(e.target.value)}>
                      <option value="per_kg_ep">Rate per Kg EP</option>
                      <option value="per_bag">Rate per Bag</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Settlement Rate (₹) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      value={stRate}
                      onChange={e => setStRate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">TCS Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control num-input"
                      value={stTcsRate}
                      onChange={e => setStTcsRate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={stDate}
                      onChange={e => setStDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    value={stNotes}
                    onChange={e => setStNotes(e.target.value)}
                  />
                </div>

                <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowSettlementEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingSettlement}>
                    {savingSettlement ? 'Saving...' : 'Update Settlement'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Sub-dialog: Edit Commitment */}
        {showCommitmentEditModal && editingCommitment && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1200 }} onClick={() => setShowCommitmentEditModal(false)}>
            <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <span>✏️ Edit Purchase Commitment — {editingCommitment.commitmentNo}</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCommitmentEditModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveCommitment} className="modal-body">
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Coffee Product</label>
                    <input
                      type="text"
                      className="form-control"
                      value={comProduct}
                      onChange={e => setComProduct(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contract Type</label>
                    <select className="form-control" value={comType} onChange={e => setComType(e.target.value)}>
                      <option value="bags">Bags Basis</option>
                      <option value="end_product">End Product (Kg Basis)</option>
                    </select>
                  </div>
                </div>

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Contract Quantity ({comType === 'bags' ? 'Bags' : 'Kg'}) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      value={comQty}
                      onChange={e => setComQty(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contract Rate (₹) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      value={comRate}
                      onChange={e => setComRate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Contract Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={comDate}
                    onChange={e => setComDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    value={comNotes}
                    onChange={e => setComNotes(e.target.value)}
                  />
                </div>

                <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCommitmentEditModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingCommitment}>
                    {savingCommitment ? 'Saving...' : 'Update Commitment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
