import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, Plus, Download, ArrowUpRight, ArrowDownLeft, Trash2, Edit2, Search, X, FileText, Percent, ShieldCheck, Tag } from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import SearchableSupplierSelect from './SearchableSupplierSelect';

export default function PaymentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0, onOpenNewSupplier }) {
  const [payments, setPayments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Tab & Type Filters
  const [activeTab, setActiveTab] = useState('vouchers'); // 'vouchers' or 'tax_register'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all', 'payment_paid', 'payment_received'
  const [taxFilter, setTaxFilter] = useState('all'); // 'all', 'tcs', 'tds'

  // Global Filters (Party, Date, Search)
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Payment Modal (New / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentType, setPaymentType] = useState('payment_paid');
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

  useEffect(() => {
    if (triggerExport > 0) {
      if (activeTab === 'vouchers') handleExportCsv();
      else handleExportTaxCsv();
    }
  }, [triggerExport, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pays, sups, arrs, disps, sets] = await Promise.all([
        dbAction('payments:get'),
        dbAction('suppliers:get'),
        dbAction('arrivals:get'),
        dbAction('dispatches:get'),
        dbAction('settlements:get')
      ]);
      setPayments(pays || []);
      setSuppliers(sups || []);
      setArrivals(arrs || []);
      setDispatches(disps || []);
      setSettlements(sets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

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
      setEndDate(toYMD(today));
    } else if (type === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Compile All TCS & TDS Tax Records Across Purchases, Sales, and Storage Settlements
  const allTaxRecords = useMemo(() => {
    const list = [];

    // 1. Inward Arrivals (Purchases)
    (arrivals || []).forEach(a => {
      const tcs = Number(a.tcsAmount) || 0;
      const tds = Number(a.tdsAmount) || 0;
      const tcsR = Number(a.tcsRate) || 0;
      const tdsR = Number(a.tdsRate) || 0;
      if (tcs > 0 || tds > 0 || tcsR > 0 || tdsR > 0) {
        list.push({
          id: 'tax_arr_' + a.id,
          date: a.date,
          ref: a.arrivalNo,
          docType: 'Arrival Purchase',
          supplierId: a.supplierId,
          supplierName: a.supplierName || 'Unknown Party',
          product: a.product,
          taxableAmount: Number(a.taxableAmount) || Number(a.weight * a.rate) || 0,
          tcsRate: tcsR,
          tcsAmount: tcs,
          tdsRate: tdsR,
          tdsAmount: tds,
          netAmount: Number(a.netAmount) || Number(a.billAmount) || 0,
          rawItem: a
        });
      }
    });

    // 2. Dispatches (Sales)
    (dispatches || []).forEach(d => {
      const tcs = Number(d.tcsAmount) || 0;
      const tds = Number(d.tdsAmount) || 0;
      const tcsR = Number(d.tcsRate) || 0;
      const tdsR = Number(d.tdsRate) || 0;
      if (tcs > 0 || tds > 0 || tcsR > 0 || tdsR > 0) {
        list.push({
          id: 'tax_disp_' + d.id,
          date: d.date,
          ref: d.dispatchNo,
          docType: 'Dispatch Sale',
          supplierId: d.supplierId || d.partyId,
          supplierName: d.supplierName || d.partyName || 'Unknown Party',
          product: d.product,
          taxableAmount: Number(d.calcTaxable) || Number(d.taxableAmount) || Number(d.weight * d.rate) || 0,
          tcsRate: tcsR,
          tcsAmount: tcs,
          tdsRate: tdsR,
          tdsAmount: tds,
          netAmount: Number(d.netAmount) || Number(d.billAmount) || 0,
          rawItem: d
        });
      }
    });

    // 3. Storage Settlements
    (settlements || []).forEach(st => {
      const tcs = Number(st.tcsAmount) || 0;
      const tds = Number(st.tdsAmount) || 0;
      const tcsR = Number(st.tcsRate) || 0;
      const tdsR = Number(st.tdsRate) || 0;
      if (tcs > 0 || tds > 0 || tcsR > 0 || tdsR > 0) {
        list.push({
          id: 'tax_set_' + st.id,
          date: st.date,
          ref: st.settlementNo,
          docType: st.settlementCategory === 'sales_storage' ? 'Sales Storage Settlement' : 'Purchase Storage Settlement',
          supplierId: st.supplierId,
          supplierName: st.supplierName || 'Unknown Party',
          product: st.product || 'Settled Commodity',
          taxableAmount: Number(st.settlementGrossAmount) || 0,
          tcsRate: tcsR,
          tcsAmount: tcs,
          tdsRate: tdsR,
          tdsAmount: tds,
          netAmount: Number(st.settlementNetAmount) || Number(st.settlementGrossAmount) || 0,
          rawItem: st
        });
      }
    });

    // Chronological Sort
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [arrivals, dispatches, settlements]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (partyFilter && partyFilter !== 'ALL' && p.supplierId !== partyFilter) return false;
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;
      if (typeFilter === 'payment_paid' && (p.type !== 'payment_paid' && p.type)) return false;
      if (typeFilter === 'payment_received' && p.type !== 'payment_received') return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNo = (p.paymentNo || '').toLowerCase().includes(term);
        const matchParty = (p.supplierName || '').toLowerCase().includes(term);
        const matchRef = (p.reference || '').toLowerCase().includes(term);
        const matchNotes = (p.notes || '').toLowerCase().includes(term);
        const matchMode = (p.mode || '').toLowerCase().includes(term);
        if (!matchNo && !matchParty && !matchRef && !matchNotes && !matchMode) return false;
      }
      return true;
    });
  }, [payments, partyFilter, startDate, endDate, typeFilter, searchTerm]);

  // Filtered Tax Records
  const filteredTaxRecords = useMemo(() => {
    return allTaxRecords.filter(r => {
      if (partyFilter && partyFilter !== 'ALL' && r.supplierId !== partyFilter) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      if (taxFilter === 'tcs' && r.tcsAmount <= 0) return false;
      if (taxFilter === 'tds' && r.tdsAmount <= 0) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchRef = (r.ref || '').toLowerCase().includes(term);
        const matchParty = (r.supplierName || '').toLowerCase().includes(term);
        const matchDoc = (r.docType || '').toLowerCase().includes(term);
        const matchProd = (r.product || '').toLowerCase().includes(term);
        if (!matchRef && !matchParty && !matchDoc && !matchProd) return false;
      }
      return true;
    });
  }, [allTaxRecords, partyFilter, startDate, endDate, taxFilter, searchTerm]);

  // Aggregated Totals
  const totalPaid = useMemo(() => filteredPayments.filter(p => p.type === 'payment_paid' || !p.type).reduce((sum, p) => sum + p.amount, 0), [filteredPayments]);
  const totalReceived = useMemo(() => filteredPayments.filter(p => p.type === 'payment_received').reduce((sum, p) => sum + p.amount, 0), [filteredPayments]);
  const totalTcsSum = useMemo(() => filteredTaxRecords.reduce((sum, r) => sum + r.tcsAmount, 0), [filteredTaxRecords]);
  const totalTdsSum = useMemo(() => filteredTaxRecords.reduce((sum, r) => sum + r.tdsAmount, 0), [filteredTaxRecords]);

  // Payment CRUD
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

  const handleExportTaxCsv = () => {
    const headers = [
      { key: 'date', label: 'Date' },
      { key: 'ref', label: 'Document Ref #' },
      { key: 'docType', label: 'Document Type' },
      { key: 'supplierName', label: 'Party Name' },
      { key: 'product', label: 'Commodity Product' },
      { key: 'taxableAmount', label: 'Taxable Amount (₹)' },
      { key: 'tcsRate', label: 'TCS %' },
      { key: 'tcsAmount', label: 'TCS Amount (₹)' },
      { key: 'tdsRate', label: 'TDS %' },
      { key: 'tdsAmount', label: 'TDS Amount (₹)' },
      { key: 'netAmount', label: 'Net Bill Amount (₹)' },
    ];
    exportToCsv('TCS_TDS_Tax_Deduction_Register', headers, filteredTaxRecords);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Financial KPI Metrics Cards */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="metric-box success">
          <span className="metric-label">Total Payments Paid</span>
          <span className="metric-value">₹{totalPaid.toLocaleString()}</span>
          <span className="metric-sub">Disbursed out to suppliers</span>
        </div>

        <div className="metric-box coffee" style={{ borderLeftColor: '#2563eb' }}>
          <span className="metric-label">Total Payments Received</span>
          <span className="metric-value" style={{ color: '#2563eb' }}>₹{totalReceived.toLocaleString()}</span>
          <span className="metric-sub">Received in from buyers</span>
        </div>

        <div className="metric-box amber" style={{ background: '#fffbeb', borderColor: '#f59e0b' }}>
          <span className="metric-label" style={{ color: '#b45309' }}>Total TCS Charged (u/s 206C)</span>
          <span className="metric-value" style={{ color: '#d97706' }}>
            ₹{totalTcsSum.toLocaleString()}
          </span>
          <span className="metric-sub">Tax collected on purchases/sales</span>
        </div>

        <div className="metric-box danger" style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
          <span className="metric-label" style={{ color: '#991b1b' }}>Total TDS Deducted (u/s 194Q)</span>
          <span className="metric-value" style={{ color: '#dc2626' }}>
            ₹{totalTdsSum.toLocaleString()}
          </span>
          <span className="metric-sub">Tax deducted on payments/bills</span>
        </div>
      </div>

      {/* Filter Control Bar (Party, Date Range, Text Search) */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* Searchable Party Selection Filter */}
          <div style={{ flex: 1.2, minWidth: '260px' }}>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
              👤 Filter by Party Account (Searchable)
            </label>
            <SearchableSupplierSelect
              suppliers={suppliers}
              value={partyFilter === 'ALL' ? '' : partyFilter}
              onChange={(sId) => setPartyFilter(sId || 'ALL')}
              placeholder="All Parties / Accounts (Search)..."
            />
          </div>

          {/* Date Presets & Custom Range */}
          <div style={{ flex: 1.5, minWidth: '320px' }}>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
              📅 Date Filter
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setPresetDate('today')}>Today</button>
              <button className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setPresetDate('this_month')}>This Month</button>
              <button className={`btn btn-sm ${dateFilter === 'all_time' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setPresetDate('all_time')}>All Time</button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <input type="date" className="form-control form-control-sm" style={{ padding: '0.15rem 0.35rem', fontSize: '0.76rem' }} value={startDate} onChange={e => { setDateFilter('custom'); setStartDate(e.target.value); }} />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to</span>
                <input type="date" className="form-control form-control-sm" style={{ padding: '0.15rem 0.35rem', fontSize: '0.76rem' }} value={endDate} onChange={e => { setDateFilter('custom'); setEndDate(e.target.value); }} />
              </div>
            </div>
          </div>

          {/* Quick Search */}
          <div style={{ flex: 1, minWidth: '220px' }}>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.25rem' }}>
              🔍 Search Ref / UTR / Voucher
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} color="#64748b" style={{ position: 'absolute', left: '0.6rem' }} />
              <input
                type="text"
                placeholder="Search..."
                className="form-control form-control-sm"
                style={{ paddingLeft: '2rem', paddingRight: '2rem', fontSize: '0.8rem' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <X size={14} color="#94a3b8" style={{ position: 'absolute', right: '0.6rem', cursor: 'pointer' }} onClick={() => setSearchTerm('')} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card with Tabs */}
      <div className="card" style={{ padding: 0 }}>
        {/* Header Navigation & Action Bar */}
        <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${activeTab === 'vouchers' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('vouchers')}
              style={{ fontWeight: 600 }}
            >
              <CreditCard size={15} /> 💳 Payment Vouchers ({filteredPayments.length})
            </button>

            <button
              className={`btn btn-sm ${activeTab === 'tax_register' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('tax_register')}
              style={{ fontWeight: 600 }}
            >
              <Percent size={15} /> 📑 TCS & TDS Tax Register ({filteredTaxRecords.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {activeTab === 'vouchers' ? (
              <>
                <div style={{ display: 'flex', gap: '0.35rem', marginRight: '0.5rem' }}>
                  <button className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTypeFilter('all')}>All</button>
                  <button className={`btn btn-sm ${typeFilter === 'payment_paid' ? 'btn-success' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTypeFilter('payment_paid')}>Paid Out</button>
                  <button className={`btn btn-sm ${typeFilter === 'payment_received' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTypeFilter('payment_received')}>Received</button>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                  <Download size={14} /> Export CSV
                </button>
                <button className="btn btn-success btn-sm" onClick={() => openNewPayment('payment_paid')}>
                  <ArrowUpRight size={14} /> + Record Paid (Alt+P)
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => openNewPayment('payment_received')}>
                  <ArrowDownLeft size={14} /> + Record Received
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.35rem', marginRight: '0.5rem' }}>
                  <button className={`btn btn-sm ${taxFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTaxFilter('all')}>All Taxes</button>
                  <button className={`btn btn-sm ${taxFilter === 'tcs' ? 'btn-coffee' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTaxFilter('tcs')}>TCS Only (u/s 206C)</button>
                  <button className={`btn btn-sm ${taxFilter === 'tds' ? 'btn-danger' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.76rem' }} onClick={() => setTaxFilter('tds')}>TDS Only (u/s 194Q)</button>
                </div>

                <button className="btn btn-secondary btn-sm" onClick={handleExportTaxCsv}>
                  <Download size={14} /> Export Tax Register CSV
                </button>
              </>
            )}
          </div>
        </div>

        {/* TAB 1: Payment Vouchers Register */}
        {activeTab === 'vouchers' && (
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
                      No payment vouchers found for the selected party or date filters.
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
        )}

        {/* TAB 2: Separate TCS & TDS Tax Transactions Register Table */}
        {activeTab === 'tax_register' && (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref #</th>
                  <th>Source Document</th>
                  <th>Party / Account Name</th>
                  <th>Commodity Product</th>
                  <th className="num">Taxable Amount (₹)</th>
                  <th className="num" style={{ color: '#d97706' }}>TCS Amount (u/s 206C)</th>
                  <th className="num" style={{ color: '#dc2626' }}>TDS Amount (u/s 194Q)</th>
                  <th className="num">Net Bill Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading TCS & TDS tax records...</td></tr>
                ) : filteredTaxRecords.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      No TCS or TDS tax records found for the selected party or date filters.
                    </td>
                  </tr>
                ) : (
                  filteredTaxRecords.map(r => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.ref}</td>
                      <td>
                        <span className={`badge ${
                          r.docType.includes('Arrival') ? 'badge-green' :
                          r.docType.includes('Dispatch') ? 'badge-blue' : 'badge-amber'
                        }`}>
                          {r.docType}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => onSelectSupplier && onSelectSupplier(r.supplierId)}
                        >
                          {r.supplierName}
                        </span>
                      </td>
                      <td>{r.product || '-'}</td>
                      <td className="num" style={{ fontFamily: 'var(--font-mono)' }}>
                        ₹{r.taxableAmount.toLocaleString()}
                      </td>
                      <td className="num" style={{ color: r.tcsAmount > 0 ? '#b45309' : '#94a3b8', fontWeight: r.tcsAmount > 0 ? 700 : 400 }}>
                        {r.tcsAmount > 0 ? (
                          <div>
                            <div>₹{r.tcsAmount.toLocaleString()}</div>
                            <small style={{ fontSize: '0.7rem', color: '#d97706' }}>({r.tcsRate}%)</small>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="num" style={{ color: r.tdsAmount > 0 ? '#dc2626' : '#94a3b8', fontWeight: r.tdsAmount > 0 ? 700 : 400 }}>
                        {r.tdsAmount > 0 ? (
                          <div>
                            <div>₹{r.tdsAmount.toLocaleString()}</div>
                            <small style={{ fontSize: '0.7rem', color: '#dc2626' }}>({r.tdsRate}%)</small>
                          </div>
                        ) : '-'}
                      </td>
                      <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.92rem' }}>
                        ₹{r.netAmount.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
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
