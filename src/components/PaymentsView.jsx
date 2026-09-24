import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Download, ArrowUpRight, ArrowDownLeft, Trash2, Edit2 } from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import SearchableSupplierSelect from './SearchableSupplierSelect';

export default function PaymentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0, onOpenNewSupplier }) {
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [dashboardMetrics, setDashboardMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'payment_paid', 'payment_received'

  // Payment Modal (New / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentType, setPaymentType] = useState('payment_paid'); // 'payment_paid' or 'payment_received'
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

  useEffect(() => { 
    if (triggerNew > 0) {
      openNewPayment('payment_paid');
    }
  }, [triggerNew]);

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

  const openNewPayment = (type = 'payment_paid') => {
    setEditingPayment(null);
    setPaymentType(type);
    setSupplierId('');
    setAmount('');
    setMode('Bank Transfer');
    setReference('');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowModal(true);
  };

  const openEditPayment = (p) => {
    setEditingPayment(p);
    setPaymentType(p.type || 'payment_paid');
    setSupplierId(p.supplierId);
    setAmount(String(p.amount));
    setMode(p.mode || 'Bank Transfer');
    setReference(p.reference || '');
    setDate(p.date || new Date().toISOString().split('T')[0]);
    setNotes(p.notes || '');
    setShowModal(true);
  };

  const handleSavePayment = async (e) => {
    if (e) e.preventDefault();
    if (!supplierId || !amount || parseFloat(amount) <= 0) return;

    const sup = suppliers.find(s => s.id === supplierId);
    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        supplierName: sup ? sup.name : 'Unknown',
        type: paymentType,
        amount: parseFloat(amount),
        mode,
        reference,
        date,
        notes
      };

      if (editingPayment) {
        await dbAction('payments:update', { id: editingPayment.id, data: payload });
      } else {
        await dbAction('payments:add', payload);
      }

      setShowModal(false);
      setEditingPayment(null);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error saving payment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayments = payments.filter(p => {
    if (typeFilter === 'payment_paid') return p.type === 'payment_paid' || !p.type;
    if (typeFilter === 'payment_received') return p.type === 'payment_received';
    return true;
  });

  const handleExportCsv = () => {
    const headers = [
      { key: 'paymentNo', label: 'Payment #' },
      { key: 'date', label: 'Date' },
      { key: 'supplierName', label: 'Party Name' },
      { key: 'type', label: 'Type' },
      { key: 'mode', label: 'Payment Mode' },
      { key: 'reference', label: 'Reference / UTR' },
      { key: 'amount', label: 'Amount (₹)' },
      { key: 'notes', label: 'Notes' },
    ];
    exportToCsv('Payments_Register', headers, filteredPayments);
  };

  const handleDeletePayment = async (pay) => {
    if (!window.confirm(`Delete payment ${pay.paymentNo} of ₹${pay.amount.toLocaleString()} for ${pay.supplierName}?\nThis will reverse the account balance.`)) return;
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

  const totalReceived = payments
    .filter(p => p.type === 'payment_received')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalTcsSum = dashboardMetrics?.global?.totalTcsAllTime || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Metrics Cards */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="metric-box success">
          <span className="metric-label">Total Payments Paid</span>
          <span className="metric-value">₹{totalPaid.toLocaleString()}</span>
          <span className="metric-sub">Disbursed to suppliers</span>
        </div>

        <div className="metric-box coffee" style={{ borderLeftColor: '#2563eb' }}>
          <span className="metric-label">Total Payments Received</span>
          <span className="metric-value" style={{ color: '#2563eb' }}>₹{totalReceived.toLocaleString()}</span>
          <span className="metric-sub">Received from customers</span>
        </div>

        <div className="metric-box purple" style={{ background: '#faf5ff' }}>
          <span className="metric-label">Total TCS Deducted (Sum)</span>
          <span className="metric-value" style={{ color: '#7c3aed' }}>
            ₹{totalTcsSum.toLocaleString()}
          </span>
          <span className="metric-sub">TCS on purchases/sales</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Total Vouchers</span>
          <span className="metric-value">{payments.length}</span>
          <span className="metric-sub">Processed payments</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="card-title" style={{ fontSize: '1rem' }}>
              <CreditCard size={18} color="#059669" />
              <span>Payments & Vouchers Register</span>
            </div>

            {/* Type Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button
                className={`btn btn-sm ${typeFilter === 'payment_paid' ? 'btn-success' : 'btn-secondary'}`}
                onClick={() => setTypeFilter('payment_paid')}
              >
                Paid (Outflow)
              </button>
              <button
                className={`btn btn-sm ${typeFilter === 'payment_received' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTypeFilter('payment_received')}
              >
                Received (Inflow)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <button className="btn btn-success btn-sm" onClick={() => openNewPayment('payment_paid')}>
              <ArrowUpRight size={14} /> + Record Paid (Alt+P)
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openNewPayment('payment_received')}>
              <ArrowDownLeft size={14} /> + Record Received
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>Type</th>
                <th>Payment Mode</th>
                <th>Reference / UTR</th>
                <th>Notes</th>
                <th className="num">Amount (₹)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading payments...</td></tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No payment vouchers found for this filter.
                  </td>
                </tr>
              ) : (
                filteredPayments.map(p => (
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
                      <span className={`badge ${p.type === 'payment_received' ? 'badge-blue' : 'badge-green'}`}>
                        {p.type === 'payment_received' ? '📥 Received' : '📤 Paid Out'}
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
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          title="Edit Payment"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                          onClick={() => openEditPayment(p)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          title="Delete Payment"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === p.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                          disabled={deletingId === p.id}
                          onClick={() => handleDeletePayment(p)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Payment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {paymentType === 'payment_received' ? <ArrowDownLeft size={18} color="#2563eb" /> : <ArrowUpRight size={18} color="#059669" />}
                <span>{editingPayment ? `Edit Payment ${editingPayment.paymentNo}` : paymentType === 'payment_received' ? 'Record Payment Received' : 'Record Payment Paid'}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSavePayment} className="modal-body">
              <div className="form-group">
                <label className="form-label">Payment Direction Category</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentType === 'payment_paid' ? 'btn-success' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setPaymentType('payment_paid')}
                  >
                    Paid Out to Party
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${paymentType === 'payment_received' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setPaymentType('payment_received')}
                  >
                    Received From Party
                  </button>
                </div>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Select Party / Customer / Supplier *</label>
                  {onOpenNewSupplier && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                      onClick={onOpenNewSupplier}
                    >
                      + New Party (F9)
                    </button>
                  )}
                </div>
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(sId) => setSupplierId(sId)}
                  onAddNewSupplier={onOpenNewSupplier}
                  placeholder="Type to search party..."
                />
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
                  placeholder="e.g. Part payment against lot/invoice"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : editingPayment ? 'Update Payment' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
