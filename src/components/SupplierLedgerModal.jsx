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
  Search,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import SearchableProductSelect from './SearchableProductSelect';

export const safeDateStr = (val, fallback = '2026-01-01') => {
  if (!val) return fallback;
  if (typeof val === 'string') {
    return val.includes('T') ? val.split('T')[0] : val.slice(0, 10);
  }
  if (val instanceof Date) {
    return !isNaN(val.getTime()) ? val.toISOString().split('T')[0] : fallback;
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  return fallback;
};

export default function SupplierLedgerModal({ isOpen, onClose, supplierId, onOpenArrivalWithSupplier, onOpenEditArrival, onOpenEditDispatch, onOpenSettlementWithSupplier, onDataChanged }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('ALL');
  const [settlementTypeFilter, setSettlementTypeFilter] = useState('ALL'); // 'ALL', 'purchase', 'sales'
  const [commitmentCategoryFilter, setCommitmentCategoryFilter] = useState('ALL'); // 'ALL', 'purchase', 'sale'

  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const setPresetDate = (type) => {
    setDateFilter(type);
    const today = new Date();
    const toYMD = (d) => d.toISOString().split('T')[0];

    if (type === 'today') {
      setStartDate(toYMD(today));
      setEndDate(toYMD(today));
    } else if (type === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (type === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Available Products for Primary vs Secondary classification
  const [dbProducts, setDbProducts] = useState([]);

  useEffect(() => {
    dbAction('products:get')
      .then(res => setDbProducts(res || []))
      .catch(() => { });
  }, []);

  // Strict Primary / Main vs Secondary classifier
  const isSecItem = (item) => {
    if (!item) return false;
    if (item.isSecondary === true) return true;
    if (item.isMain === true || item.isPrimary === true) return false;
    if (item.isSecondary === false) return false;
    const pName = (item.product || item.name || '').trim().toLowerCase();
    const found = (dbProducts || []).find(p => p.name && p.name.trim().toLowerCase() === pName);
    if (found) {
      if (found.isSecondary === true || found.category === 'Secondary Product' || found.category === 'husk') return true;
      if (found.isMain === true || found.category === 'Primary Product') return false;
    }
    return item.dispatchType === pName || 'husk'
  };

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
  const [stTdsRate, setStTdsRate] = useState('0');
  const [stDate, setStDate] = useState(new Date().toISOString().split('T')[0]);
  const [stNotes, setStNotes] = useState('');
  const [savingSettlement, setSavingSettlement] = useState(false);

  // Commitment Edit Modal inside Supplier Account
  const [showCommitmentEditModal, setShowCommitmentEditModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState(null);
  const [comProduct, setComProduct] = useState('');
  const [comType, setComType] = useState('bags');
  const [comQty, setComQty] = useState('');
  const [comRate, setComRate] = useState('');
  const [comDate, setComDate] = useState(new Date().toISOString().split('T')[0]);
  const [comNotes, setComNotes] = useState('');
  const [savingCommitment, setSavingCommitment] = useState(false);

  useEffect(() => {
    if (isOpen && supplierId) {
      loadLedger();
    } else if (!isOpen) {
      setData(null);
      setLoading(true);
    }
  }, [isOpen, supplierId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, txSearchTerm, supplierId, selectedProductFilter, settlementTypeFilter, commitmentCategoryFilter, dateFilter, startDate, endDate]);

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
    setPayDate(safeDateStr(p.date, new Date().toISOString().split('T')[0]));
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
    setStTdsRate(String(st.tdsRate !== undefined ? st.tdsRate : '0'));
    setStDate(safeDateStr(st.date, new Date().toISOString().split('T')[0]));
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
          tcsRate: parseFloat(stTcsRate) || 0,
          tdsRate: parseFloat(stTdsRate) || 0,
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

  const handleDeleteDispatch = async (disp) => {
    if (!window.confirm(`Delete dispatch ${disp.dispatchNo}?\nThis will reverse dispatch stock and billing.`)) return;
    setDeletingId(disp.id);
    try {
      await dbAction('dispatches:delete', { id: disp.id });
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
    setComProduct(com.product || '');
    setComType(com.type || 'bags');
    setComQty(String(com.quantity || ''));
    setComRate(String(com.rate || ''));
    setComDate(safeDateStr(com.date, new Date().toISOString().split('T')[0]));
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
    const arrivals = data.arrivals || [];
    const dispatches = data.dispatches || [];
    const settlements = data.settlements || [];
    const payments = data.payments || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print/export PDF statement.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprehensive Statement & Stock Report - ${s.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .company-title { font-size: 22px; font-weight: bold; color: #0f172a; }
          .doc-title { font-size: 16px; font-weight: bold; color: #2563eb; text-align: right; }
          
          .grid-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; }
          .summary-card { background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #cbd5e1; }
          .card-title { font-weight: 800; font-size: 13px; text-transform: uppercase; color: #334155; margin-bottom: 8px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; }
          
          .section-heading { font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 25px; margin-bottom: 8px; border-left: 4px solid #2563eb; padding-left: 8px; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px; font-size: 11px; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          th { background: #0f172a; color: #ffffff; font-weight: 600; text-transform: uppercase; font-size: 10px; }
          tr:nth-child(even) { background: #f8fafc; }
          .num { text-align: right; font-family: monospace; font-size: 11px; }
          .badge { font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: 10px; display: inline-block; }
          .badge-green { background: #dcfce7; color: #166534; }
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-purple { background: #f3e8ff; color: #6b21a8; }
          .badge-amber { background: #fef3c7; color: #92400e; }
          
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 15px; }
          @media print {
            body { padding: 0; }
            .section-heading { page-break-after: avoid; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="company-title">Global Commodity Trading & Processing ERP</div>
            <div style="font-size: 12px; color: #475569;">Detailed Party Financial Statement & Storage Stock Ledger</div>
          </div>
          <div>
            <div class="doc-title">OFFICIAL PARTY STATEMENT</div>
            <div style="font-size: 11px; color: #64748b;">Generated on ${new Date().toLocaleDateString('en-IN')}</div>
          </div>
        </div>

        <div class="grid-summary">
          <div class="summary-card">
            <div class="card-title">👤 Party Information</div>
            <strong>Name:</strong> ${s.name}<br/>
            <strong>Location / Place:</strong> ${s.place || 'N/A'}<br/>
            <strong>Contact Phone:</strong> ${s.phone || 'N/A'}<br/>
            <strong>GSTIN:</strong> ${s.gst || 'N/A'}
          </div>

          <div class="summary-card">
            <div class="card-title">💰 Financial Account Summary</div>
            <strong>Net Financial Position:</strong> <span style="font-size: 13px; font-weight: 800; color: ${s.netPayable >= 0 ? '#dc2626' : '#059669'};">${s.netPayable >= 0 ? `₹${s.netPayable.toLocaleString('en-IN')} (CREDIT / WE OWE)` : `₹${Math.abs(s.netPayable).toLocaleString('en-IN')} (DEBIT / OWES US)`}</span><br/>
            <strong>Total Billed Purchases:</strong> ₹${(s.totalPurchasesBilled || 0).toLocaleString('en-IN')}<br/>
            <strong>Total Billed Sales:</strong> ₹${(s.totalSalesBilled || 0).toLocaleString('en-IN')}<br/>
            <strong>Total Payments Paid:</strong> ₹${(s.totalPaid || 0).toLocaleString('en-IN')} | <strong>Received:</strong> ₹${(s.totalReceived || 0).toLocaleString('en-IN')}
          </div>

          <div class="summary-card" style="grid-column: span 2; background: #faf5ff; border-color: #e9d5ff;">
            <div class="card-title" style="color: #6b21a8; border-color: #d8b4fe;">📦 Storage Stock Inventory Summary</div>
            <div style="display: flex; justify-content: space-between; gap: 15px;">
              <div>
                <span>Total Store-In Receipts:</span><br/>
                <strong style="color: #0284c7; font-size: 13px;">${(s.storeInBags || 0).toLocaleString()} Bags</strong> (${(s.storeInEP || 0).toLocaleString()} kg EP)
              </div>
              <div>
                <span>Total Store-Out Releases:</span><br/>
                <strong style="color: #e11d48; font-size: 13px;">${(s.storeOutBags || 0).toLocaleString()} Bags</strong> (${(s.storeOutEP || 0).toLocaleString()} kg EP)
              </div>
              <div>
                <span>Current Balance Storage Stock:</span><br/>
                <strong style="color: #7c3aed; font-size: 14px;">${(s.storageBags || 0).toLocaleString()} Bags</strong> (${(s.storageEndProduct || 0).toLocaleString()} kg EP)
              </div>
            </div>
          </div>
        </div>

        <!-- 1. Billed Financial Ledger -->
        <div class="section-heading">1. Billed Financial Ledger Statement</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher / Ref</th>
              <th>Particulars / Details</th>
              <th>Type</th>
              <th class="num">Debit (Paid / Recv ₹)</th>
              <th class="num">Credit (Bill Amount ₹)</th>
              <th class="num">Running Balance (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.length === 0 ? '<tr><td colSpan="7" style="text-align:center; padding:12px;">No billed transactions recorded.</td></tr>' : transactions.map(t => `
              <tr>
                <td>${t.date}</td>
                <td><strong>${t.ref}</strong></td>
                <td>${t.product} ${t.notes ? `<br/><small style="color:#64748b">${t.notes}</small>` : ''}</td>
                <td><span class="badge ${t.type.includes('Paid') ? 'badge-green' : t.type.includes('Received') ? 'badge-blue' : 'badge-amber'}">${t.type}</span></td>
                <td class="num" style="color: ${t.debit > 0 ? '#059669' : 'inherit'}">${t.debit > 0 ? `₹${t.debit.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num" style="color: ${t.credit > 0 ? '#dc2626' : 'inherit'}">${t.credit > 0 ? `₹${t.credit.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num"><strong>₹${Math.abs(t.runningBalance).toLocaleString('en-IN')} ${t.balanceLabel}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- 2. Inward Coffee Receipts & EP Transfers -->
        <div class="section-heading">2. Inward Coffee Arrivals & EP Transfers</div>
        <table>
          <thead>
            <tr>
              <th>Arrival #</th>
              <th>Date</th>
              <th>Vehicle #</th>
              <th>Product</th>
              <th class="num">Raw Wt (kg)</th>
              <th class="num">Bags</th>
              <th class="num">OT</th>
              <th class="num">End Product (kg)</th>
              <th>Status / Remarks</th>
              <th class="num">Gross Bill</th>
              <th class="num">TCS (+)</th>
              <th class="num">TDS (-)</th>
              <th class="num">Net Bill</th>
            </tr>
          </thead>
          <tbody>
            ${arrivals.length === 0 ? '<tr><td colSpan="13" style="text-align:center; padding:12px;">No inward arrivals recorded.</td></tr>' : arrivals.map(a => {
              const gross = Number(a.billAmount) || Number(a.taxableAmount) || 0;
              const tcs = Number(a.tcsAmount) || 0;
              const tds = Number(a.tdsAmount) || 0;
              let net = Number(a.netAmount);
              if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                net = gross + tcs - tds;
              }
              return `
              <tr>
                <td><strong>${a.arrivalNo}</strong></td>
                <td>${a.date}</td>
                <td>${a.vehicleNo || '-'}</td>
                <td>${a.product}</td>
                <td class="num">${a.weight ? a.weight.toLocaleString() : '-'}</td>
                <td class="num">${a.bags}</td>
                <td class="num">${a.outturn || '-'}</td>
                <td class="num"><strong>${a.endProductWeight ? a.endProductWeight.toLocaleString() : '-'}</strong></td>
                <td>${a.remarks || a.status}</td>
                <td class="num">${a.status === 'storage' ? 'Unfixed' : `₹${gross.toLocaleString('en-IN')}`}</td>
                <td class="num" style="color: #059669;">${tcs > 0 ? `+₹${tcs.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num" style="color: #dc2626;">${tds > 0 ? `-₹${tds.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num"><strong>${a.status === 'storage' ? 'Unfixed' : `₹${net.toLocaleString('en-IN')}`}</strong></td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>

        <!-- 3. Outward Coffee Releases & EP Transfers -->
        <div class="section-heading">3. Outward Dispatches & Storage Releases</div>
        <table>
          <thead>
            <tr>
              <th>Dispatch #</th>
              <th>Date</th>
              <th>Vehicle #</th>
              <th>Product</th>
              <th class="num">Weight (kg)</th>
              <th class="num">Bags</th>
              <th class="num">End Product (kg)</th>
              <th>Type / Remarks</th>
              <th class="num">Gross Bill</th>
              <th class="num">TCS (+)</th>
              <th class="num">TDS (-)</th>
              <th class="num">Net Bill</th>
            </tr>
          </thead>
          <tbody>
            ${dispatches.length === 0 ? '<tr><td colSpan="12" style="text-align:center; padding:12px;">No dispatches recorded.</td></tr>' : dispatches.map(d => {
              const gross = Number(d.billAmount) || Number(d.taxableAmount) || 0;
              const tcs = Number(d.tcsAmount) || 0;
              const tds = Number(d.tdsAmount) || 0;
              let net = Number(d.netAmount);
              if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                net = gross + tcs - tds;
              }
              return `
              <tr>
                <td><strong>${d.dispatchNo}</strong></td>
                <td>${d.date}</td>
                <td>${d.vehicleNo || '-'}</td>
                <td>${d.product}</td>
                <td class="num">${d.weight ? d.weight.toLocaleString() : '-'}</td>
                <td class="num">${d.bags}</td>
                <td class="num"><strong>${d.endProductWeight ? d.endProductWeight.toLocaleString() : '-'}</strong></td>
                <td>${d.remarks || d.dispatchType || d.status}</td>
                <td class="num">${d.status === 'storage_out' ? 'Unbilled' : `₹${gross.toLocaleString('en-IN')}`}</td>
                <td class="num" style="color: #059669;">${tcs > 0 ? `+₹${tcs.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num" style="color: #dc2626;">${tds > 0 ? `-₹${tds.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num"><strong>${d.status === 'storage_out' ? 'Unbilled' : `₹${net.toLocaleString('en-IN')}`}</strong></td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>

        <!-- 4. Storage Coffee Settlements -->
        <div class="section-heading">4. Storage Coffee Settlements</div>
        <table>
          <thead>
            <tr>
              <th>Settlement #</th>
              <th>Date</th>
              <th class="num">Settled Bags</th>
              <th class="num">Avg Outturn</th>
              <th class="num">Settled EP (kg)</th>
              <th class="num">Settlement Rate</th>
              <th class="num">Gross Bill</th>
              <th class="num">TCS (+)</th>
              <th class="num">TDS (-)</th>
              <th class="num">Net Settlement Bill</th>
            </tr>
          </thead>
          <tbody>
            ${settlements.length === 0 ? '<tr><td colSpan="10" style="text-align:center; padding:12px;">No settlements recorded.</td></tr>' : settlements.map(st => {
              const gross = Number(st.settlementGrossAmount) || 0;
              const tcs = Number(st.tcsAmount) || 0;
              const tds = Number(st.tdsAmount) || 0;
              let net = Number(st.settlementNetAmount);
              if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                net = gross + tcs - tds;
              }
              return `
              <tr>
                <td><strong>${st.settlementNo}</strong></td>
                <td>${st.date}</td>
                <td class="num">${st.settledBags} Bags</td>
                <td class="num">${st.averageOutturn} kg/50k</td>
                <td class="num">${(st.settledEndProduct || 0).toLocaleString()} kg</td>
                <td class="num">₹${st.settlementRate}/${st.rateUnit === 'per_bag' ? 'Bag' : 'Kg EP'}</td>
                <td class="num">₹${gross.toLocaleString('en-IN')}</td>
                <td class="num" style="color: #059669;">${tcs > 0 ? `+₹${tcs.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num" style="color: #dc2626;">${tds > 0 ? `-₹${tds.toLocaleString('en-IN')}` : '-'}</td>
                <td class="num"><strong>₹${net.toLocaleString('en-IN')}</strong></td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>

        <!-- 5. Payment Vouchers -->
        <div class="section-heading">5. Payment Vouchers & Cash Flow</div>
        <table>
          <thead>
            <tr>
              <th>Voucher #</th>
              <th>Date</th>
              <th>Type</th>
              <th>Mode</th>
              <th>Reference / UTR</th>
              <th>Notes</th>
              <th class="num">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${payments.length === 0 ? '<tr><td colSpan="7" style="text-align:center; padding:12px;">No payment vouchers recorded.</td></tr>' : payments.map(p => `
              <tr>
                <td><strong>${p.paymentNo}</strong></td>
                <td>${p.date}</td>
                <td><span class="badge ${p.type === 'payment_received' ? 'badge-blue' : 'badge-green'}">${p.type === 'payment_received' ? 'Received From Supplier' : 'Paid to Supplier'}</span></td>
                <td>${p.mode}</td>
                <td>${p.reference || '-'}</td>
                <td>${p.notes || '-'}</td>
                <td class="num"><strong>₹${(p.amount || 0).toLocaleString('en-IN')}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>This is an official computer-generated statement of account & stock summary.</div>
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
        date: safeDateStr(s.createdAt, '2026-01-01'),
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

    // Billed Purchases (Arrivals)
    (data.arrivals || []).forEach(arr => {
      if (arr.status === 'billed' || arr.status === 'cash_bill') {
        const gross = Number(arr.billAmount) || Number(arr.taxableAmount) || 0;
        const tcs = Number(arr.tcsAmount) || 0;
        const tds = Number(arr.tdsAmount) || 0;
        let net = Number(arr.netAmount);
        if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
          net = gross + tcs - tds;
        }

        events.push({
          date: safeDateStr(arr.date, '2026-01-01'),
          type: arr.billType === 'cash_bill' ? 'Cash Purchase' : 'Purchase Bill',
          ref: arr.arrivalNo,
          product: arr.product,
          bags: arr.bags,
          weight: arr.weight,
          endProduct: arr.endProductWeight,
          debit: 0,
          credit: net,
          notes: arr.remarks || '',
          tcsAmount: tcs,
          tdsAmount: tds,
          category: 'arrival',
          rawItem: arr
        });
      }
    });

    // Billed Sales (Dispatches)
    (data.dispatches || []).forEach(disp => {
      const gross = Number(disp.billAmount) || Number(disp.taxableAmount) || 0;
      const gstSum = (Number(disp.cgstAmount) || 0) + (Number(disp.sgstAmount) || 0) + (Number(disp.igstAmount) || 0);
      const tds = Number(disp.tdsAmount) || 0;
      const tcs = Number(disp.tcsAmount) || 0;
      let net = Number(disp.netAmount);
      if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
        net = gross + tcs - tds;
      }
      const noteParts = [];
      if (gstSum > 0) noteParts.push(`GST: ₹${gstSum.toLocaleString()}`);
      if (disp.remarks) noteParts.push(disp.remarks);

      const isSec = isSecItem(disp);
      if (disp.status !== 'storage_out' && disp.rateType !== 'storage_out') {
        events.push({
          date: safeDateStr(disp.date, '2026-01-01'),
          type: isSec ? 'Secondary Product Sale' : (disp.billType === 'cash_bill' ? 'Cash Sale' : 'Sales Invoice'),
          ref: disp.dispatchNo,
          product: disp.product,
          bags: disp.bags,
          weight: disp.weight,
          endProduct: disp.endProductWeight,
          debit: net,
          credit: 0,
          notes: noteParts.join(' | '),
          tcsAmount: tcs,
          tdsAmount: tds,
          category: 'dispatch',
          rawItem: disp
        });
      }
    });

    // Settlements
    (data.settlements || []).forEach(set => {
      const isSales = set.settlementCategory === 'sales_storage';
      const gross = Number(set.settlementGrossAmount) || 0;
      const cgst = Number(set.cgstAmount) || 0;
      const sgst = Number(set.sgstAmount) || 0;
      const igst = Number(set.igstAmount) || 0;
      const tcs = Number(set.tcsAmount) || 0;
      const tds = Number(set.tdsAmount) || 0;
      let net = Number(set.settlementNetAmount);
      if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
        net = gross + cgst + sgst + igst + tcs - tds;
      }
      const setWeight = set.settledWeight || (set.averageOutturn ? Math.round((set.settledEndProduct / (set.averageOutturn / 50))) : Math.round(set.settledBags * 50));
      const noteParts = [`Avg OT: ${set.averageOutturn} @ ₹${set.settlementRate}`];

      events.push({
        date: safeDateStr(set.date, '2026-01-01'),
        type: isSales ? 'Sales Storage Settlement' : 'Purchase Storage Settlement',
        ref: set.settlementNo,
        product: set.product || (isSales ? 'Settled Released Coffee' : 'Settled Stored Coffee'),
        bags: set.settledBags,
        weight: setWeight || (set.settledBags * 50),
        endProduct: set.settledEndProduct,
        debit: isSales ? net : 0,
        credit: isSales ? 0 : net,
        notes: noteParts.join(' | '),
        tcsAmount: tcs,
        tdsAmount: tds,
        category: 'settlement',
        rawItem: set
      });
    });

    // Washes
    (data.washes || []).forEach(w => {
      const val = Number(w.adjustmentAmount) || 0;
      events.push({
        date: safeDateStr(w.date, '2026-01-01'),
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
          date: safeDateStr(pay.date, '2026-01-01'),
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
          date: safeDateStr(pay.date, '2026-01-01'),
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

    // Compute running balance FIRST on the full chronological history
    let running = 0;
    const eventsWithBalance = events.map(e => {
      running += (e.credit - e.debit);
      return {
        ...e,
        balance: running,
        runningBalance: running,
        balanceLabel: running >= 0 ? 'Cr' : 'Dr'
      };
    });

    // Date Filter
    let filteredEvents = eventsWithBalance;
    if (startDate) {
      filteredEvents = filteredEvents.filter(e => e.category === 'opening' || e.date >= startDate);
    }
    if (endDate) {
      filteredEvents = filteredEvents.filter(e => e.category === 'opening' || e.date <= endDate);
    }

    // Product Filter
    if (selectedProductFilter && selectedProductFilter !== 'ALL') {
      filteredEvents = filteredEvents.filter(e => e.product === selectedProductFilter || e.category === 'opening' || e.category === 'payment');
    }

    // Search Filter
    if (txSearchTerm.trim()) {
      const term = txSearchTerm.toLowerCase();
      return filteredEvents.filter(e =>
        (e.ref && e.ref.toLowerCase().includes(term)) ||
        (e.type && e.type.toLowerCase().includes(term)) ||
        (e.product && e.product.toLowerCase().includes(term)) ||
        (e.notes && e.notes.toLowerCase().includes(term))
      );
    }

    return filteredEvents;

  };


  const renderPaginationControls = (totalItems) => {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, currentPage * pageSize);

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
        <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>Showing <strong>{startItem} - {endItem}</strong> of <strong>{totalItems}</strong> entries</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.15rem 0.35rem', fontSize: '0.78rem', outline: 'none' }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.2rem 0.4rem' }}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(1)}
            title="First Page"
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.2rem 0.45rem' }}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            title="Previous Page"
          >
            <ChevronLeft size={14} /> Prev
          </button>

          <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0 0.4rem', color: '#0f172a' }}>
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.2rem 0.45rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            title="Next Page"
          >
            Next <ChevronRight size={14} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.2rem 0.4rem' }}
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            title="Last Page"
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  const s = data ? data.summary : null;
  const transactions = React.useMemo(() => {
    try {
      return buildTransactionsList();
    } catch (err) {
      console.error('Error computing transactions list in SupplierLedgerModal:', err);
      return [];
    }
  }, [data, startDate, endDate, selectedProductFilter, txSearchTerm, pageSize, currentPage]);

  const availableProducts = React.useMemo(() => {
    if (!data) return [];
    const set = new Set();
    (data.arrivals || []).forEach(a => a.product && set.add(a.product));
    (data.dispatches || []).forEach(d => d.product && set.add(d.product));
    (data.commitments || []).forEach(c => c.product && set.add(c.product));
    return Array.from(set);
  }, [data]);

  const commodityTotals = React.useMemo(() => {
    if (!data || selectedProductFilter === 'ALL') return null;
    let bags = 0;
    let weight = 0;
    let ep = 0;

    (data.arrivals || []).forEach(a => {
      if (a.product === selectedProductFilter) {
        bags += Number(a.bags) || 0;
        weight += Number(a.weight) || 0;
        ep += Number(a.endProductWeight) || 0;
      }
    });

    (data.dispatches || []).forEach(d => {
      if (d.product === selectedProductFilter) {
        bags += Number(d.bags) || 0;
        weight += Number(d.weight) || 0;
        ep += Number(d.endProductWeight) || 0;
      }
    });

    return { bags, weight, ep };
  }, [data, selectedProductFilter]);

  const {
    mainRawWeight,
    secRawWeight,
    mainBags,
    secBags,
    mainArrEP,
    secArrEP,
    mainDispEP,
    secDispEP,
    mainStoreInEP,
    secStoreInEP,
    mainStoreOutEP,
    secStoreOutEP,
    mainPendingEP,
    secPendingEP,
    mainBilledEP,
    secBilledEP,
    mainBilledValue,
    secBilledValue,
    mainAvgRate,
    secAvgRate,
  } = React.useMemo(() => {
    if (!data) return {
      mainRawWeight: 0, secRawWeight: 0,
      mainBags: 0, secBags: 0,
      mainArrEP: 0, secArrEP: 0,
      mainDispEP: 0, secDispEP: 0,
      mainStoreInEP: 0, secStoreInEP: 0,
      mainStoreOutEP: 0, secStoreOutEP: 0,
      mainPendingEP: 0, secPendingEP: 0,
      mainBilledEP: 0, secBilledEP: 0,
      mainBilledValue: 0, secBilledValue: 0,
      mainAvgRate: '0', secAvgRate: '0',
    };
    let mainRawWeight = 0, secRawWeight = 0;
    let mainBags = 0, secBags = 0;
    let mainArrEP = 0, secArrEP = 0;
    let mainStoreInEP = 0, secStoreInEP = 0;
    let mainPendingEP = 0, secPendingEP = 0;
    let mainBilledEP = 0, secBilledEP = 0;
    let mainBilledValue = 0, secBilledValue = 0;

    (data.arrivals || []).forEach(arr => {
      const isSec = isSecItem(arr);
      const w = Number(arr.weight) || 0;
      const b = Number(arr.bags) || 0;
      const ep = Number(arr.endProductWeight) || 0;
      const val = Number(arr.netAmount) || Number(arr.billAmount) || 0;
      if (isSec) {
        secRawWeight += w;
        secBags += b;
        secArrEP += ep;
        if (arr.status === 'storage' || arr.status === 'partial_settled') {
          const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep;
          secStoreInEP += remEP;
          secPendingEP += remEP;
        } else if (arr.status === 'billed' || arr.status === 'cash_bill') {
          secBilledEP += ep;
          secBilledValue += val;
        }
      } else {
        mainRawWeight += w;
        mainBags += b;
        mainArrEP += ep;
        if (arr.status === 'storage' || arr.status === 'partial_settled') {
          const remEP = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : ep;
          mainStoreInEP += remEP;
          mainPendingEP += remEP;
        } else if (arr.status === 'billed' || arr.status === 'cash_bill') {
          mainBilledEP += ep;
          mainBilledValue += val;
        }
      }
    });

    let mainDispEP = 0, secDispEP = 0;
    let mainStoreOutEP = 0, secStoreOutEP = 0;
    (data.dispatches || []).forEach(d => {
      const isSec = isSecItem(d);
      const ep = Number(d.endProductWeight || d.weight) || 0;
      if (isSec) {
        secDispEP += ep;
        if (d.status === 'storage_out' || d.rateType === 'storage_out') {
          secStoreOutEP += (d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep);
        }
      } else {
        mainDispEP += ep;
        if (d.status === 'storage_out' || d.rateType === 'storage_out') {
          mainStoreOutEP += (d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep);
        }
      }
    });

    const mainAvgRate = mainBilledEP > 0 ? (mainBilledValue / mainBilledEP).toFixed(2) : '0';
    const secAvgRate = secBilledEP > 0 ? (secBilledValue / secBilledEP).toFixed(2) : '0';

    return {
      mainRawWeight,
      secRawWeight,
      mainBags,
      secBags,
      mainArrEP,
      secArrEP,
      mainDispEP,
      secDispEP,
      mainStoreInEP,
      secStoreInEP,
      mainStoreOutEP,
      secStoreOutEP,
      mainPendingEP,
      secPendingEP,
      mainBilledEP,
      secBilledEP,
      mainBilledValue,
      secBilledValue,
      mainAvgRate,
      secAvgRate,
    };
  }, [data, dbProducts]);

  if (!isOpen) return null;

  return (

    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 9999, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
      <div className="modal-content" style={{ width: '100vw', height: '100vh', maxWidth: '100vw', maxHeight: '100vh', borderRadius: 0, display: 'flex', flexDirection: 'column', background: '#ffffff', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header" style={{ padding: '0.85rem 1.4rem', background: '#0f172a', color: '#ffffff' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem' }}>👤</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                {s ? s.name : 'Loading Party Account...'}
              </h2>
              {s && s.place && (
                <span className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPin size={12} /> {s.place}
                </span>
              )}
            </div>
            {s && (
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
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
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto', gap: '1.1rem', padding: '1.25rem 1.4rem' }}>
            {/* Top Accounting KPI Cards — Primary vs Secondary Separation */}
            <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {/* Card 1: Net Financial Balance */}
              <div className="metric-box danger" style={{ background: s.netPayable >= 0 ? '#fef2f2' : '#f0fdf4', borderColor: s.netPayable >= 0 ? '#fca5a5' : '#86efac' }}>
                <span className="metric-label">Financial Position</span>
                <span className="metric-value" style={{ color: s.netPayable >= 0 ? '#dc2626' : '#059669' }}>
                  ₹{Math.abs(s.netPayable).toLocaleString()}
                </span>
                <span className="metric-sub" style={{ fontWeight: 600, color: s.netPayable >= 0 ? '#dc2626' : '#059669' }}>
                  {s.netPayable >= 0 ? '(We Owe / Credit)' : '(Party Owes Us / Debit)'}
                </span>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Billed: ₹{s.totalBilledAmount.toLocaleString()} | Paid: ₹{s.totalPaid.toLocaleString()}
                </div>
                {(Number(s.totalTcsDeducted) > 0 || Number(s.totalTdsDeducted) > 0) && (
                  <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {Number(s.totalTcsDeducted) > 0 && (
                      <span style={{ color: '#059669', fontWeight: 600, background: '#ffffff', padding: '0.05rem 0.35rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                        TCS (+): +₹{s.totalTcsDeducted.toLocaleString()}
                      </span>
                    )}
                    {Number(s.totalTdsDeducted) > 0 && (
                      <span style={{ color: '#dc2626', fontWeight: 600, background: '#ffffff', padding: '0.05rem 0.35rem', borderRadius: '4px', border: '1px solid #fecaca' }}>
                        TDS (-): -₹{s.totalTdsDeducted.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card 2: 🌿 Primary / Main Products */}
              <div className="metric-box success" style={{ background: '#f0fdf4', borderColor: '#86efac', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="metric-label" style={{ color: '#166534', fontWeight: 800 }}>🌿 Primary / Main Products</span>
                  <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Primary</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.78rem', color: '#166534' }}>
                  <div>Inward: <strong>{mainRawWeight.toLocaleString()} kg</strong> ({mainBags} Bags)</div>
                  <div>Inward EP: <strong>{mainArrEP.toLocaleString()} kg</strong></div>
                  <div>Dispatched EP: <strong>{mainDispEP.toLocaleString()} kg</strong></div>
                  <div>Storage (In / Out): <strong>{mainStoreInEP.toLocaleString()} kg</strong> / <strong>{mainStoreOutEP.toLocaleString()} kg</strong></div>
                </div>
              </div>

              {/* Card 3: 📦 Secondary Products */}
              <div className="metric-box" style={{ background: '#fffbeb', borderColor: '#fcd34d', borderLeftColor: '#d97706', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="metric-label" style={{ color: '#92400e', fontWeight: 800 }}>📦 Secondary Products</span>
                  <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>Secondary</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.78rem', color: '#92400e' }}>
                  <div>Inward: <strong>{secRawWeight.toLocaleString()} kg</strong> ({secBags} Bags)</div>
                  <div>Inward EP: <strong>{secArrEP.toLocaleString()} kg</strong></div>
                  <div>Dispatched EP: <strong>{secDispEP.toLocaleString()} kg</strong></div>
                  <div>Storage (In / Out): <strong>{secStoreInEP.toLocaleString()} kg</strong> / <strong>{secStoreOutEP.toLocaleString()} kg</strong></div>
                </div>
              </div>

              {/* Card 4: Total Volume */}
              <div className="metric-box coffee">
                <span className="metric-label">Total Volume (All Products)</span>
                <span className="metric-value">{(mainRawWeight + secRawWeight).toLocaleString()} kg</span>
                <span className="metric-sub">{(mainBags + secBags)} Total Bags</span>
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.2rem' }}>
                  Total EP: <strong>{(mainArrEP + secArrEP).toLocaleString()} kg</strong> ({((mainArrEP + secArrEP) / 100).toFixed(1)} Qtl)
                </div>
              </div>
            </div>

            {/* Date Selector & Commodity Filter Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>📅 Account Period:</span>
                <button className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('today')}>Today</button>
                <button className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('this_month')}>This Month</button>
                <button className={`btn btn-sm ${dateFilter === 'all_time' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('all_time')}>All Time</button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.25rem' }}>
                  <input type="date" className="form-control" style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', width: 'auto' }} value={startDate} onChange={e => { setDateFilter('custom'); setStartDate(e.target.value); }} />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to</span>
                  <input type="date" className="form-control" style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', width: 'auto' }} value={endDate} onChange={e => { setDateFilter('custom'); setEndDate(e.target.value); }} />
                </div>
              </div>

              {/* Searchable Commodity Filter Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>📦 Commodity:</span>
                <div style={{ width: '230px' }}>
                  <SearchableProductSelect
                    value={selectedProductFilter === 'ALL' ? '' : selectedProductFilter}
                    onChange={(val) => { setSelectedProductFilter(val || 'ALL'); setCurrentPage(1); }}
                    showChips={false}
                    placeholder="All Commodities (Search)..."
                  />
                </div>
              </div>
            </div>

            {/* Quick Action Bar & Tab Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.65rem 0.85rem', borderRadius: '8px', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className={`btn btn-sm ${activeTab === 'ledger' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('ledger')}
                >
                  <FileText size={14} /> Full Billed Ledger
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'arrivals' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('arrivals')}
                >
                  <Truck size={14} /> Arrivals ({(data.arrivals || []).length})
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'dispatches' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('dispatches')}
                >
                  <PackageCheck size={14} /> Dispatches ({(data.dispatches || []).length})
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'settlements' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('settlements')}
                >
                  <Layers size={14} /> Settlements ({(data.settlements || []).length})
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('payments')}
                >
                  <CreditCard size={14} /> Payments ({(data.payments || []).length})
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'commitments' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveTab('commitments')}
                >
                  <Handshake size={14} /> Commitments ({data.commitments ? data.commitments.length : 0})
                </button>
              </div>


              <div style={{ display: 'flex', gap: '0.5rem' }}>
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

            {/* Commodity Specific Filter KPI Banner */}
            {selectedProductFilter !== 'ALL' && commodityTotals && (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.65rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '0.9rem' }}>🎯 Commodity Filtered: {selectedProductFilter}</span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                  <span>Total Inward/Outward Bags: <strong>{commodityTotals.bags.toLocaleString()} Bags</strong></span>
                  <span>Total Raw Wt: <strong>{commodityTotals.weight.toLocaleString()} kg</strong></span>
                  <span>Total Net EP: <strong style={{ color: '#7c3aed' }}>{commodityTotals.ep.toLocaleString()} kg EP</strong></span>
                </div>
              </div>
            )}

            {/* Tab 1: Chronological Billed Ledger */}
            {activeTab === 'ledger' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                        transactions
                          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                          .map((tx, idx) => (
                            <tr key={idx}>
                              <td>{tx.date}</td>
                              <td>
                                <span className={`badge ${tx.type.includes('Paid') ? 'badge-green' :
                                    tx.type.includes('Received') ? 'badge-blue' :
                                      tx.type.includes('Settlement') ? 'badge-amber' :
                                        tx.type.includes('Storage') ? 'badge-purple' :
                                          tx.type.includes('Commitment') ? 'badge-purple' : 'badge-coffee'
                                  }`}>
                                  {tx.type}
                                </span>
                              </td>
                              <td style={{ fontWeight: 600 }}>{tx.ref}</td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{tx.product}</div>
                                <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.1rem' }}>
                                  {tx.tcsAmount > 0 && (
                                    <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.7rem' }}>
                                      TCS: +₹{tx.tcsAmount.toLocaleString()}
                                    </span>
                                  )}
                                  {tx.tdsAmount > 0 && (
                                    <span style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 700, fontSize: '0.7rem' }}>
                                      TDS: -₹{tx.tdsAmount.toLocaleString()}
                                    </span>
                                  )}
                                  {tx.notes && <span>{tx.notes}</span>}
                                </div>
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
                              <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: tx.balance >= 0 ? '#059669' : '#dc2626' }}>
                                ₹{Math.abs(tx.balance).toLocaleString()} <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>{tx.balanceLabel}</span>
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
                                        } else if (tx.category === 'dispatch') {
                                          if (onOpenEditDispatch) { onClose(); onOpenEditDispatch(tx.rawItem); }
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
                                        else if (tx.category === 'dispatch') handleDeleteDispatch(tx.rawItem);
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
                {renderPaginationControls(transactions.length)}
              </div>
            )}

            {/* Tab 2: Arrivals */}
            {activeTab === 'arrivals' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                        <th className="num">Gross Bill</th>
                        <th className="num">TCS (+)</th>
                        <th className="num">TDS (-)</th>
                        <th className="num">Net Bill</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.arrivals.length === 0 ? (
                        <tr><td colSpan="14" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No arrivals recorded</td></tr>
                      ) : (
                        data.arrivals
                          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                          .map(a => {
                            const isSec = isSecItem(a);
                            const gross = Number(a.billAmount) || Number(a.taxableAmount) || 0;
                            const tcs = Number(a.tcsAmount) || 0;
                            const tds = Number(a.tdsAmount) || 0;
                            let net = Number(a.netAmount);
                            if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                              net = gross + tcs - tds;
                            }
                            return (
                              <tr key={a.id}>
                                <td style={{ fontWeight: 600 }}>{a.arrivalNo}</td>
                                <td>{a.date}</td>
                                <td>{a.vehicleNo || '-'}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span className="badge badge-coffee">{a.product}</span>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isSec ? '#b45309' : '#166534' }}>
                                      {isSec ? '📦 Secondary' : '🌿 Main'}
                                    </span>
                                  </div>
                                </td>
                                <td className="num">{typeof a.weight === 'number' ? a.weight.toLocaleString() : a.weight}</td>
                                <td className="num">{a.bags}</td>
                                <td className="num">{a.outturn} {a.outturnType === 'percentage' ? '%' : 'kg/50k'}</td>
                                <td className="num" style={{ fontWeight: 600 }}>{typeof a.endProductWeight === 'number' ? a.endProductWeight.toLocaleString() : a.endProductWeight}</td>
                                <td>
                                  <span className={`badge ${a.status === 'billed' ? 'badge-green' :
                                      a.status === 'settled' ? 'badge-blue' :
                                        a.status === 'partial_settled' ? 'badge-amber' : 'badge-coffee'
                                    }`}>
                                    {a.status === 'storage' ? `📦 Storage (${a.remainingBags} bags)` : a.status}
                                  </span>
                                </td>
                                <td className="num">{a.status === 'storage' ? 'Unfixed' : `₹${gross.toLocaleString()}`}</td>
                                <td className="num" style={{ color: tcs > 0 ? '#059669' : '#94a3b8' }}>
                                  {tcs > 0 ? `+₹${tcs.toLocaleString()}` : '-'}
                                </td>
                                <td className="num" style={{ color: tds > 0 ? '#dc2626' : '#94a3b8' }}>
                                  {tds > 0 ? `-₹${tds.toLocaleString()}` : '-'}
                                </td>
                                <td className="num" style={{ fontWeight: 600, color: a.status === 'storage' ? '#64748b' : '#059669' }}>
                                  {a.status === 'storage' ? 'Unfixed' : `₹${net.toLocaleString()}`}
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
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
                {renderPaginationControls(data.arrivals.length)}
              </div>
            )}

            {/* Tab 2.5: Dispatches */}
            {activeTab === 'dispatches' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Dispatch #</th>
                        <th>Date</th>
                        <th>Vehicle #</th>
                        <th>Product</th>
                        <th className="num">Weight (kg)</th>
                        <th className="num">Bags</th>
                        <th className="num">End Product (kg)</th>
                        <th>Type / Status</th>
                        <th className="num">Gross Bill</th>
                        <th className="num">TCS (+)</th>
                        <th className="num">TDS (-)</th>
                        <th className="num">Net Bill</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dispatches.length === 0 ? (
                        <tr>
                          <td colSpan="13" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                            No dispatches recorded for this party.
                          </td>
                        </tr>
                      ) : (
                        data.dispatches
                          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                          .map(d => {
                            const isStorageOut = d.status === 'storage_out' || d.rateType === 'storage_out';
                            const isSec = isSecItem(d);
                            const gross = Number(d.billAmount) || Number(d.taxableAmount) || 0;
                            const tcs = Number(d.tcsAmount) || 0;
                            const tds = Number(d.tdsAmount) || 0;
                            let net = Number(d.netAmount);
                            if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                              net = gross + tcs - tds;
                            }
                            return (
                              <tr key={d.id}>
                                <td style={{ fontWeight: 600 }}>{d.dispatchNo}</td>
                                <td>{d.date}</td>
                                <td>{d.vehicleNo || '-'}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span className="badge badge-coffee">{d.product}</span>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isSec ? '#b45309' : '#166534' }}>
                                      {isSec ? '📦 Secondary' : '🌿 Main'}
                                    </span>
                                  </div>
                                </td>
                                <td className="num">{typeof d.weight === 'number' ? d.weight.toLocaleString() : d.weight}</td>
                                <td className="num">{d.bags}</td>
                                <td className="num" style={{ fontWeight: 600 }}>
                                  {typeof d.endProductWeight === 'number' ? d.endProductWeight.toLocaleString() : (d.endProductWeight || d.weight || '-')}
                                </td>
                                <td>
                                  <span className={`badge ${isStorageOut ? 'badge-purple' :
                                      isSec ? 'badge-amber' :
                                        d.billType === 'cash_bill' ? 'badge-blue' : 'badge-green'
                                    }`}>
                                    {isStorageOut ? '📦 Storage Out' : isSec ? '📦 Secondary Sale' : (d.billType === 'cash_bill' ? '💵 Cash Sale' : '🧾 Sales Invoice')}
                                  </span>
                                </td>
                                <td className="num">{isStorageOut ? 'Unbilled' : `₹${gross.toLocaleString()}`}</td>
                                <td className="num" style={{ color: tcs > 0 ? '#059669' : '#94a3b8' }}>
                                  {tcs > 0 ? `+₹${tcs.toLocaleString()}` : '-'}
                                </td>
                                <td className="num" style={{ color: tds > 0 ? '#dc2626' : '#94a3b8' }}>
                                  {tds > 0 ? `-₹${tds.toLocaleString()}` : '-'}
                                </td>
                                <td className="num" style={{ fontWeight: 600, color: isStorageOut ? '#64748b' : '#059669' }}>
                                  {isStorageOut ? 'Unbilled' : `₹${net.toLocaleString()}`}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                                    <button
                                      title="Edit Dispatch"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                      onClick={() => { if (onOpenEditDispatch) { onClose(); onOpenEditDispatch(d); } }}
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      title="Delete Dispatch"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === d.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                      disabled={deletingId === d.id}
                                      onClick={() => handleDeleteDispatch(d)}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
                {renderPaginationControls(data.dispatches.length)}
              </div>
            )}

            {/* Tab 3: Settlements */}
            {activeTab === 'settlements' && (() => {
              const filteredList = (data.settlements || []).filter(st => {
                const matchProd = selectedProductFilter === 'ALL' || st.product === selectedProductFilter;
                const isSales = st.settlementCategory === 'sales_storage';
                const matchType = settlementTypeFilter === 'ALL' ||
                  (settlementTypeFilter === 'purchase' && !isSales) ||
                  (settlementTypeFilter === 'sales' && isSales);
                return matchProd && matchType;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Settlement Filter Pills */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <button
                      className={`btn btn-sm ${settlementTypeFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setSettlementTypeFilter('ALL'); setCurrentPage(1); }}
                    >
                      All Settlements ({data.settlements.length})
                    </button>
                    <button
                      className={`btn btn-sm ${settlementTypeFilter === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setSettlementTypeFilter('purchase'); setCurrentPage(1); }}
                    >
                      🛒 Purchase Settlements ({data.settlements.filter(s => s.settlementCategory !== 'sales_storage').length})
                    </button>
                    <button
                      className={`btn btn-sm ${settlementTypeFilter === 'sales' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setSettlementTypeFilter('sales'); setCurrentPage(1); }}
                    >
                      📤 Sales Storage Settlements ({data.settlements.filter(s => s.settlementCategory === 'sales_storage').length})
                    </button>
                  </div>

                  <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Settlement #</th>
                          <th>Date</th>
                          <th>Category</th>
                          <th className="num">Settled Bags</th>
                          <th className="num">Weight (kg)</th>
                          <th className="num">Avg OT</th>
                          <th className="num">Settled EP (kg)</th>
                          <th className="num">Rate</th>
                          <th className="num">Gross Bill</th>
                          <th className="num">TCS (+)</th>
                          <th className="num">TDS (-)</th>
                          <th className="num">Net Settlement Bill</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredList.length === 0 ? (
                          <tr><td colSpan="13" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No settlements found for selected filter</td></tr>
                        ) : (
                          filteredList
                            .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                            .map(st => {
                              const isSales = st.settlementCategory === 'sales_storage';
                              const gross = Number(st.settlementGrossAmount) || 0;
                              const tcs = Number(st.tcsAmount) || 0;
                              const tds = Number(st.tdsAmount) || 0;
                              let net = Number(st.settlementNetAmount);
                              if (!net || (tcs > 0 && Math.abs(net - gross) < 0.01)) {
                                net = gross + (Number(st.cgstAmount) || 0) + (Number(st.sgstAmount) || 0) + (Number(st.igstAmount) || 0) + tcs - tds;
                              }
                              const stWeight = st.settledWeight || (st.averageOutturn ? Math.round((st.settledEndProduct / (st.averageOutturn / 50))) : Math.round(st.settledBags * 50));
                              return (
                                <tr key={st.id}>
                                  <td style={{ fontWeight: 600 }}>{st.settlementNo}</td>
                                  <td>{st.date}</td>
                                  <td>
                                    <span className={`badge ${isSales ? 'badge-blue' : 'badge-coffee'}`}>
                                      {isSales ? '📤 Sales Settlement' : '🛒 Purchase Settlement'}
                                    </span>
                                  </td>
                                  <td className="num" style={{ fontWeight: 600 }}>{st.settledBags} Bags</td>
                                  <td className="num">{stWeight ? stWeight.toLocaleString() : '-'}</td>
                                  <td className="num">{st.averageOutturn} kg/50k</td>
                                  <td className="num" style={{ fontWeight: 600 }}>{typeof st.settledEndProduct === 'number' ? st.settledEndProduct.toLocaleString() : st.settledEndProduct} kg</td>
                                  <td className="num">₹{st.settlementRate}/{st.rateUnit === 'per_bag' ? 'Bag' : 'Kg EP'}</td>
                                  <td className="num">₹{gross.toLocaleString()}</td>
                                  <td className="num" style={{ color: tcs > 0 ? '#059669' : '#94a3b8' }}>
                                    {tcs > 0 ? `+₹${tcs.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="num" style={{ color: tds > 0 ? '#dc2626' : '#94a3b8' }}>
                                    {tds > 0 ? `-₹${tds.toLocaleString()}` : '-'}
                                  </td>
                                  <td className="num" style={{ fontWeight: 700, color: isSales ? '#2563eb' : '#059669' }}>
                                    ₹{net.toLocaleString()} <small>({isSales ? 'Debit' : 'Credit'})</small>
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
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                  {renderPaginationControls(filteredList.length)}
                </div>
              );
            })()}

            {/* Tab 4: Payments */}
            {activeTab === 'payments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                        data.payments
                          .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                          .map(p => (
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
                {renderPaginationControls(data.payments.length)}
              </div>
            )}

            {/* Tab 5: Commitments */}
            {activeTab === 'commitments' && (() => {
              const allComs = data.commitments || [];
              const filteredComs = allComs.filter(com => {
                const matchProd = selectedProductFilter === 'ALL' || com.product === selectedProductFilter;
                const matchCategory = commitmentCategoryFilter === 'ALL' ||
                  (commitmentCategoryFilter === 'purchase' && (com.category === 'purchase' || !com.category)) ||
                  (commitmentCategoryFilter === 'sale' && com.category === 'sale');
                return matchProd && matchCategory;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Commitment Category Filter Pills */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <button
                      className={`btn btn-sm ${commitmentCategoryFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setCommitmentCategoryFilter('ALL'); setCurrentPage(1); }}
                    >
                      All Contracts ({allComs.length})
                    </button>
                    <button
                      className={`btn btn-sm ${commitmentCategoryFilter === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setCommitmentCategoryFilter('purchase'); setCurrentPage(1); }}
                    >
                      🛒 Purchase Contracts ({allComs.filter(c => c.category === 'purchase' || !c.category).length})
                    </button>
                    <button
                      className={`btn btn-sm ${commitmentCategoryFilter === 'sale' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => { setCommitmentCategoryFilter('sale'); setCurrentPage(1); }}
                    >
                      📤 Sales Contracts ({allComs.filter(c => c.category === 'sale').length})
                    </button>
                  </div>

                  <div className="table-wrapper" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Commitment #</th>
                          <th>Date</th>
                          <th>Contract Category</th>
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
                        {filteredComs.length === 0 ? (
                          <tr><td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commitments found for selected filter</td></tr>
                        ) : (
                          filteredComs
                            .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                            .map(com => (
                              <tr key={com.id}>
                                <td style={{ fontWeight: 600 }}>{com.commitmentNo}</td>
                                <td>{com.date}</td>
                                <td>
                                  <span className={`badge ${com.category === 'sale' ? 'badge-blue' : 'badge-coffee'}`}>
                                    {com.category === 'sale' ? '📤 Sales Contract' : '🛒 Purchase Contract'}
                                  </span>
                                </td>
                                <td><span className="badge badge-gray">{com.product}</span></td>
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
                  {renderPaginationControls(filteredComs.length)}
                </div>
              );
            })()}
          </div>
        )}

        {/* Permanent Sticky Bottom Storage Stock Footer */}
        {s && (
          <div style={{
            background: '#0f172a',
            color: '#ffffff',
            padding: '0.65rem 1.4rem',
            display: 'flex',
            justify: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #334155',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <PackageCheck size={16} /> STORAGE STOCK SUMMARY:
              </span>
              <div>
                <span style={{ color: '#cbd5e1' }}>Total Store In: </span>
                <strong style={{ color: '#38bdf8' }}>{(s.storeInBags || 0).toLocaleString()} Bags</strong> ({(s.storeInEP || 0).toLocaleString()} kg EP)
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.4rem' }}>
                  [🌿 Main: {mainStoreInEP.toLocaleString()} kg | 📦 Sec: {secStoreInEP.toLocaleString()} kg]
                </span>
              </div>
              <div>
                <span style={{ color: '#cbd5e1' }}>Total Store Out: </span>
                <strong style={{ color: '#f43f5e' }}>{(s.storeOutBags || 0).toLocaleString()} Bags</strong> ({(s.storeOutEP || 0).toLocaleString()} kg EP)
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.4rem' }}>
                  [🌿 Main: {mainStoreOutEP.toLocaleString()} kg | 📦 Sec: {secStoreOutEP.toLocaleString()} kg]
                </span>
              </div>
            </div>

            <div style={{ background: '#1e293b', padding: '0.35rem 0.85rem', borderRadius: '6px', border: '1px solid #475569', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Balance Storage Stock:</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#a855f7' }}>
                {(s.storageBags || 0).toLocaleString()} Bags
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e9d5ff' }}>
                ({(s.storageEndProduct || 0).toLocaleString()} kg EP)
              </span>
            </div>
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

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
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
                    <label className="form-label">TDS Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control num-input"
                      value={stTdsRate}
                      onChange={e => setStTdsRate(e.target.value)}
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
