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
  Trash2
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function SupplierLedgerModal({ isOpen, onClose, supplierId, onOpenArrivalWithSupplier, onOpenEditArrival, onOpenSettlementWithSupplier, onDataChanged }) {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('ledger');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Payment Form Modal inside Supplier Account
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState('payment_paid'); // 'payment_paid' or 'payment_received'
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Bank Transfer');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

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

  const handleRecordPayment = async (e) => {
    if (e) e.preventDefault();
    if (!payAmount || parseFloat(payAmount) <= 0) return;

    setSavingPayment(true);
    try {
      await dbAction('payments:add', {
        supplierId,
        supplierName: data.summary.name,
        type: paymentType,
        amount: parseFloat(payAmount),
        mode: payMode,
        reference: payRef,
        date: payDate,
        notes: payNotes
      });

      setShowPaymentModal(false);
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

  // Build Chronological Transactions for Ledger View
  const buildTransactionsList = () => {
    if (!data) return [];
    const events = [];

    // Billed arrivals
    (data.arrivals || []).forEach(arr => {
      if (arr.status === 'billed') {
        events.push({
          date: arr.date,
          type: 'Purchase Bill',
          ref: arr.arrivalNo,
          product: arr.product,
          bags: arr.bags,
          weight: arr.weight,
          endProduct: arr.endProductWeight,
          debit: 0,
          credit: Number(arr.netAmount) || Number(arr.billAmount) || 0,
          notes: arr.remarks || ''
        });
      } else if (arr.status === 'storage' || arr.status === 'partial_settled') {
        events.push({
          date: arr.date,
          type: 'Storage Arrival (Unfixed)',
          ref: arr.arrivalNo,
          product: arr.product,
          bags: arr.bags,
          weight: arr.weight,
          endProduct: arr.endProductWeight,
          debit: 0,
          credit: 0,
          notes: `OT: ${arr.outturn} | Rem: ${arr.remainingBags} bags`
        });
      }
    });

    // Settlements
    (data.settlements || []).forEach(set => {
      events.push({
        date: set.date,
        type: 'Storage Settlement',
        ref: set.settlementNo,
        product: 'Settled Coffee',
        bags: set.settledBags,
        weight: '-',
        endProduct: set.settledEndProduct,
        debit: 0,
        credit: Number(set.settlementNetAmount) || Number(set.settlementGrossAmount) || 0,
        notes: `Avg OT: ${set.averageOutturn} @ ₹${set.settlementRate}`
      });
    });

    // Payments
    (data.payments || []).forEach(pay => {
      if (pay.type === 'payment_paid' || !pay.type) {
        // Paid to supplier -> Debits their payable balance (reduces what we owe)
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
          notes: pay.reference ? `Ref: ${pay.reference}` : ''
        });
      } else if (pay.type === 'payment_received') {
        // Received from supplier -> Adds to balance or offsets
        events.push({
          date: pay.date,
          type: 'Payment Received from Supplier',
          ref: pay.paymentNo,
          product: pay.mode,
          bags: '-',
          weight: '-',
          endProduct: '-',
          debit: 0,
          credit: Number(pay.amount) || 0, // Reduces net payable in formula
          notes: pay.reference ? `Ref: ${pay.reference}` : ''
        });
      }
    });

    // Sort chronologically
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance
    let running = 0;
    return events.map(e => {
      if (e.type === 'Payment Received from Supplier') {
        running += e.credit; // Or reduces payable depending on accounting perspective
      } else {
        running += (e.credit - e.debit);
      }
      return {
        ...e,
        balance: running
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

              {/* Storage Coffee Summary Card with Average Outturn */}
              <div className="metric-box purple" style={{ background: '#faf5ff' }}>
                <span className="metric-label">Storage Coffee</span>
                <span className="metric-value" style={{ color: '#7c3aed' }}>
                  {s.storageBags} Bags
                </span>
                <div style={{ fontSize: '0.72rem', color: '#6b21a8', marginTop: '0.15rem' }}>
                  {s.storageEndProduct.toLocaleString()} kg EP (Avg OT: <strong>{s.storageAvgOutturn}</strong>)
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
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* User explicit requirement: Payment paid & Payment received only in supplier account! */}
                <button 
                  className="btn btn-sm btn-success"
                  onClick={() => { setPaymentType('payment_paid'); setShowPaymentModal(true); }}
                >
                  <ArrowUpRight size={14} /> + Record Paid (Voucher)
                </button>
                <button 
                  className="btn btn-sm btn-secondary"
                  style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
                  onClick={() => { setPaymentType('payment_received'); setShowPaymentModal(true); }}
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
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                          No transactions recorded yet.
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
                              tx.type.includes('Storage') ? 'badge-gray' : 'badge-coffee'
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
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
                            <button
                              title="Delete Settlement (Reverse Stock)"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === st.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                              disabled={deletingId === st.id}
                              onClick={() => handleDeleteSettlement(st)}
                            >
                              <Trash2 size={13} />
                            </button>
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
                            <button
                              title="Delete Payment"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === p.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                              disabled={deletingId === p.id}
                              onClick={() => handleDeletePayment(p)}
                            >
                              <Trash2 size={13} />
                            </button>
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

        {/* Modal Sub-dialog: Record Payment (Paid or Received) */}
        {showPaymentModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowPaymentModal(false)}>
            <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <span>{paymentType === 'payment_received' ? '📥 Record Payment Received' : '📤 Record Payment Paid'}</span>
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
                    {savingPayment ? 'Saving...' : 'Confirm Voucher'}
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
