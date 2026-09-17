import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Download, ShieldCheck, ArrowUpRight, Trash2 } from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function PaymentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0 }) {
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // New Payment Modal
  const [showModal, setShowModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [dataVersion]);

  // Contextual shortcuts: Alt+P opens payment modal, Alt+E exports
  useEffect(() => { if (triggerNew > 0) setShowModal(true); }, [triggerNew]);
  useEffect(() => { if (triggerExport > 0) handleExportCsv(); }, [triggerExport]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pays, sups, mets] = await Promise.all([
        dbAction('payments:get'),
        dbAction('suppliers:get'),
        dbAction('dashboard:metrics')
      ]);
      setPayments(pays || []);
      setSuppliers(sups || []);
      setDashboardMetrics(mets);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPayment = async (e) => {
    if (e) e.preventDefault();
    if (!supplierId || !amount || parseFloat(amount) <= 0) return;

    const sup = suppliers.find(s => s.id === supplierId);
    setSubmitting(true);
    try {
      await dbAction('payments:add', {
        supplierId,
        supplierName: sup ? sup.name : 'Unknown',
        type: 'payment_paid',
        amount: parseFloat(amount),
        mode,
        reference,
        date,
        notes
      });
      setShowModal(false);
      setAmount('');
      setReference('');
      setNotes('');
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error adding payment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      { key: 'paymentNo', label: 'Payment #' },
      { key: 'date', label: 'Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'type', label: 'Type' },
      { key: 'mode', label: 'Payment Mode' },
      { key: 'reference', label: 'Reference / UTR' },
      { key: 'amount', label: 'Amount (₹)' },
      { key: 'notes', label: 'Notes' },
    ];
    exportToCsv('Payments_Register', headers, payments);
  };

  const handleDeletePayment = async (pay) => {
    if (!window.confirm(`Delete payment ${pay.paymentNo} of ₹${pay.amount.toLocaleString()} to ${pay.supplierName}?\nThis will reverse the balance.`)) return;
    setDeletingId(pay.id);
    try {
      await dbAction('payments:delete', { id: pay.id });
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const totalPaid = payments
    .filter(p => p.type === 'payment_paid' || !p.type)
    .reduce((sum, p) => sum + p.amount, 0);

  const totalTcsSum = dashboardMetrics?.global?.totalTcsAllTime || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Metrics Cards */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-box success">
          <span className="metric-label">Total Payments Paid</span>
          <span className="metric-value">₹{totalPaid.toLocaleString()}</span>
          <span className="metric-sub">Disbursed to suppliers against coffee purchases</span>
        </div>

        {/* User requirement: "normal tcs deuction i should be able to see total tcs sum" */}
        <div className="metric-box purple" style={{ background: '#faf5ff' }}>
          <span className="metric-label">Total TCS Deducted (All-Time Sum)</span>
          <span className="metric-value" style={{ color: '#7c3aed' }}>
            ₹{totalTcsSum.toLocaleString()}
          </span>
          <span className="metric-sub">TCS on purchase payments (0.1% or applicable rate)</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Total Payment Vouchers</span>
          <span className="metric-value">{payments.length}</span>
          <span className="metric-sub">Processed transactions</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ fontSize: '1rem' }}>
            <CreditCard size={18} color="#059669" />
            <span>Payments Register</span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <button className="btn btn-success btn-sm" onClick={() => setShowModal(true)}>
              <Plus size={14} /> + Record Payment Paid (Alt+P)
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Supplier Name</th>
                <th>Payment Mode</th>
                <th>Reference / UTR</th>
                <th>Notes</th>
                <th className="num">Amount (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading payments...</td></tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No payments recorded yet. Click <strong>+ Record Payment Paid</strong> to add.
                  </td>
                </tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.paymentNo}</td>
                    <td>{p.date}</td>
                    <td>
                      <span 
                        style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => onSelectSupplier && onSelectSupplier(p.supplierId)}
                      >
                        {p.supplierName}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-gray">{p.mode}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>{p.reference || '-'}</td>
                    <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{p.notes || '-'}</td>
                    <td className="num" style={{ fontWeight: 700, color: p.type === 'payment_received' ? '#2563eb' : '#059669', fontSize: '0.95rem' }}>
                      ₹{p.amount.toLocaleString()}
                    </td>
                    <td>
                      <button
                        title="Delete Payment"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === p.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                        disabled={deletingId === p.id}
                        onClick={() => handleDeletePayment(p)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Payment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <ArrowUpRight size={18} color="#059669" />
                <span>Record Payment Paid to Supplier</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAddPayment} className="modal-body">
              <div className="form-group">
                <label className="form-label">Select Supplier *</label>
                <select
                  className="form-control"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                  autoFocus
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.place ? `(${s.place})` : ''} - [Net Payable: ₹{s.netPayable.toLocaleString()}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Amount (₹) *</label>
                <input
                  type="number"
                  step="any"
                  className="form-control num-input"
                  placeholder="e.g. 50000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select className="form-control" value={mode} onChange={e => setMode(e.target.value)}>
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Reference / UTR / Cheque Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. UTR #12345678"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Part payment against Lot #5"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
