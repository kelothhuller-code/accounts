import React, { useState, useEffect, useMemo } from 'react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import SearchableProductSelect from './SearchableProductSelect';
import {
  PackageCheck,
  Search,
  Download,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
} from 'lucide-react';

export default function DispatchesView({
  dataVersion = 0,
  onOpenNewDispatch,
  onEditDispatch,
  onSelectSupplier,
  triggerNew,
  triggerExport,
}) {
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchTypeFilter, setDispatchTypeFilter] = useState('all');
  const [billTypeFilter, setBillTypeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('ALL');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dispatchTypeFilter, billTypeFilter, productFilter, dateFilter, startDate, endDate]);

  useEffect(() => {
    loadDispatches();
  }, [dataVersion, startDate, endDate]);

  useEffect(() => {
    if (triggerNew > 0) onOpenNewDispatch();
  }, [triggerNew]);

  useEffect(() => {
    if (triggerExport > 0) handleExportCsv();
  }, [triggerExport]);

  const setPresetDate = (type) => {
    setDateFilter(type);
    const today = new Date();
    const toYMD = (d) => d.toISOString().split('T')[0];

    if (type === 'today') {
      setStartDate(toYMD(today));
      setEndDate(toYMD(today));
    } else if (type === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setStartDate(toYMD(y));
      setEndDate(toYMD(y));
    } else if (type === 'this_week') {
      const first = new Date(today.setDate(today.getDate() - today.getDay() + 1));
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (type === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (type === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadDispatches = async () => {
    setLoading(true);
    try {
      const res = await dbAction('dispatches:get', { startDate, endDate });
      const list = Array.isArray(res) ? res : (res?.items || []);
      setDispatches(list);
    } catch (e) {
      console.error('Error loading dispatches:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, dispatchNo) => {
    if (!window.confirm(`Are you sure you want to delete dispatch record ${dispatchNo}?`)) return;
    setDeletingId(id);
    try {
      await dbAction('dispatches:delete', { id });
      await loadDispatches();
    } catch (e) {
      alert(e.message || 'Failed to delete dispatch.');
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered List
  const filteredDispatches = (dispatches || []).filter((d) => {
    if (!d) return false;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (d.dispatchNo && d.dispatchNo.toLowerCase().includes(q)) ||
      (d.supplierName && d.supplierName.toLowerCase().includes(q)) ||
      (d.vehicleNo && d.vehicleNo.toLowerCase().includes(q)) ||
      (d.product && d.product.toLowerCase().includes(q));

    const isSecRec =
      d.isSecondary !== undefined
        ? d.isSecondary
        : d.dispatchType === 'husk' || (d.product || '').toLowerCase().includes('husk');
    const matchesType =
      dispatchTypeFilter === 'all' ||
      (dispatchTypeFilter === 'primary' && !isSecRec) ||
      (dispatchTypeFilter === 'secondary' && isSecRec) ||
      d.dispatchType === dispatchTypeFilter;

    const matchesBill =
      billTypeFilter === 'all' ||
      d.billType === billTypeFilter ||
      d.status === billTypeFilter ||
      (billTypeFilter === 'storage_out' && (d.rateType === 'storage_out' || d.status === 'storage_out'));

    const matchesProduct = productFilter === 'ALL' || d.product === productFilter;

    return matchesSearch && matchesType && matchesBill && matchesProduct;
  });

  // Load available products for searchable filter
  const [dbProducts, setDbProducts] = useState([]);
  useEffect(() => {
    dbAction('products:get')
      .then((res) => setDbProducts(res || []))
      .catch(() => { });
  }, []);

  const availableProductsList = useMemo(() => {
    const set = new Set();
    (dbProducts || []).forEach((p) => p && p.name && set.add(p.name));
    (dispatches || []).forEach((d) => d && d.product && set.add(d.product));
    return Array.from(set);
  }, [dbProducts, dispatches]);

  // Helper — record flag first, dispatchType/name fallback
  const isSecDisp = (d) =>
    d.isSecondary !== undefined
      ? d.isSecondary
      : d.dispatchType === 'husk' || (d.product || '').toLowerCase().includes('husk');

  // Calculate Metrics — split by main vs secondary
  const totalWeight = filteredDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const totalBags = filteredDispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const totalEpWeight = filteredDispatches.reduce(
    (sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );

  const mainDispatches = filteredDispatches.filter((d) => !isSecDisp(d));
  const secondaryDispatches = filteredDispatches.filter((d) => isSecDisp(d));

  // Main product metrics
  const mainOutwardWeight = mainDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const mainOutwardBags = mainDispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const mainOutwardEP = mainDispatches.reduce(
    (sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const mainStoreOut = mainDispatches.filter(
    (d) => d.rateType === 'storage_out' || d.status === 'storage_out'
  );
  const mainPendingEP = mainStoreOut.reduce(
    (sum, d) =>
      sum +
      (d.remainingEndProduct !== undefined
        ? Number(d.remainingEndProduct)
        : Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const mainBilledDisps = mainDispatches.filter(
    (d) => d.rateType !== 'storage_out' && d.status !== 'storage_out'
  );
  const mainBilledEP = mainBilledDisps.reduce(
    (sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const mainBilledValue = mainBilledDisps.reduce(
    (sum, d) => sum + (Number(d.netAmount) || Number(d.billAmount) || 0),
    0
  );
  const mainAvgRate = mainBilledEP > 0 ? (mainBilledValue / mainBilledEP).toFixed(2) : '0';

  // Secondary product metrics
  const secondaryOutwardWeight = secondaryDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const secondaryOutwardBags = secondaryDispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const secondaryOutwardEP = secondaryDispatches.reduce(
    (sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const secStoreOut = secondaryDispatches.filter(
    (d) => d.rateType === 'storage_out' || d.status === 'storage_out'
  );
  const secPendingEP = secStoreOut.reduce(
    (sum, d) =>
      sum +
      (d.remainingEndProduct !== undefined
        ? Number(d.remainingEndProduct)
        : Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const secBilledDisps = secondaryDispatches.filter(
    (d) => d.rateType !== 'storage_out' && d.status !== 'storage_out'
  );
  const secondaryBilledEP = secBilledDisps.reduce(
    (sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0),
    0
  );
  const secondaryBilledValue = secBilledDisps.reduce(
    (sum, d) => sum + (Number(d.netAmount) || Number(d.billAmount) || 0),
    0
  );
  const secondaryAvgRate = secondaryBilledEP > 0 ? (secondaryBilledValue / secondaryBilledEP).toFixed(2) : '0';

  const totalBilledSales = filteredDispatches.reduce(
    (sum, d) => sum + (Number(d.netAmount) || Number(d.billAmount) || 0),
    0
  );
  const totalGst = filteredDispatches.reduce(
    (sum, d) =>
      sum +
      ((Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0)),
    0
  );

  // Pagination calculations
  const totalPages = Math.ceil(filteredDispatches.length / pageSize) || 1;
  const paginatedDispatches = filteredDispatches.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const renderPaginationControls = (totalItems) => {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, currentPage * pageSize);
    return (
      <div
        style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          padding: '0.45rem 1rem',
          borderTop: '1px solid #e2e8f0',
          background: '#f8fafc',
          fontSize: '0.85rem',
          color: '#64748b',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>
            Showing <strong>{startItem} - {endItem}</strong> of <strong>{totalItems}</strong> dispatches
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '0.15rem 0.35rem',
                fontSize: '0.8rem',
                outline: 'none',
                background: '#fff',
              }}
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
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
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
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
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

  const handleExportCsv = async () => {
    const exportData = filteredDispatches.map((d) => ({
      'Dispatch No': d.dispatchNo,
      Date: d.date,
      'Party Name': d.supplierName,
      'Vehicle No': d.vehicleNo || '-',
      Category: d.dispatchType === 'husk' ? 'Husk' : 'Coffee',
      Product: d.product,
      'Weight (Kg)': d.weight,
      Bags: d.bags,
      'EP Wt (Kg)': d.endProductWeight || d.weight,
      'Sale Rate (₹)': d.rate,
      'Taxable Amount': d.taxableAmount || 0,
      'CGST (₹)': d.cgstAmount || 0,
      'SGST (₹)': d.sgstAmount || 0,
      'IGST (₹)': d.igstAmount || 0,
      'TDS (₹)': d.tdsAmount || 0,
      'TCS (₹)': d.tcsAmount || 0,
      'Net Invoice Amount (₹)': d.netAmount || d.billAmount,
      'Bill Type':
        d.billType === 'cash_bill' ? 'Cash Sale' : d.status === 'storage_out' ? 'Store Release' : 'GST Bill',
      Status: d.status,
      Remarks: d.remarks || '',
    }));

    exportToCsv(`Dispatches_Report_${startDate || 'all'}_to_${endDate || 'all'}`, exportData);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Filter & Date Selector Bar */}
      <div className="card" style={{ background: '#ffffff', boxShadow: 'var(--shadow-sm)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div className="card-title" style={{ fontSize: '1.15rem' }}>
              <span>📤 Dispatches & Sales Master Overview</span>
              <span className="badge badge-coffee">
                {dateFilter === 'all_time' ? 'All Time' : `${startDate} to ${endDate}`}
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Monitor sales dispatches, GST invoices, cash sales, and unbilled storage releases
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPresetDate('today')}
            >
              Today
            </button>
            <button
              className={`btn btn-sm ${dateFilter === 'yesterday' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPresetDate('yesterday')}
            >
              Yesterday
            </button>
            <button
              className={`btn btn-sm ${dateFilter === 'this_week' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPresetDate('this_week')}
            >
              This Week
            </button>
            <button
              className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPresetDate('this_month')}
            >
              This Month
            </button>
            <button
              className={`btn btn-sm ${dateFilter === 'all_time' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPresetDate('all_time')}
            >
              All Time
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
              <input
                type="date"
                className="form-control"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                value={startDate}
                onChange={(e) => {
                  setDateFilter('custom');
                  setStartDate(e.target.value);
                }}
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
              <input
                type="date"
                className="form-control"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                value={endDate}
                onChange={(e) => {
                  setDateFilter('custom');
                  setEndDate(e.target.value);
                }}
              />
            </div>

            <button className="btn btn-secondary btn-sm" onClick={loadDispatches} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards — Main & Secondary split */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Main Product Card */}
        <div className="metric-box success" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span className="metric-label" style={{ color: '#166534', fontWeight: 700 }}>
            🌿 Main Products — Outward Summary
          </span>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Raw Weight
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>
                {mainOutwardWeight.toLocaleString()} kg
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Bags
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>
                {mainOutwardBags.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Net EP
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>
                {mainOutwardEP.toLocaleString()} kg
              </div>
            </div>
          </div>
          <span className="metric-sub" style={{ color: '#15803d', fontWeight: 600 }}>
            Billed EP: {mainBilledEP.toLocaleString()} kg | Avg Rate: ₹{mainAvgRate}/kg | Pending EP:{' '}
            {mainPendingEP.toLocaleString()} kg
          </span>
        </div>

        {/* Secondary Product Card */}
        <div
          className="metric-box warning"
          style={{ borderLeftColor: '#d97706', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}
        >
          <span className="metric-label" style={{ color: '#92400e', fontWeight: 700 }}>
            📦 Secondary Products — Outward Summary
          </span>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Raw Weight
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>
                {secondaryOutwardWeight.toLocaleString()} kg
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Bags
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>
                {secondaryOutwardBags.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>
                Net EP
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>
                {secondaryOutwardEP.toLocaleString()} kg
              </div>
            </div>
          </div>
          <span className="metric-sub" style={{ color: '#92400e', fontWeight: 600 }}>
            Billed EP: {secondaryBilledEP.toLocaleString()} kg | Avg Rate: ₹{secondaryAvgRate}/kg | Pending EP:{' '}
            {secPendingEP.toLocaleString()} kg
          </span>
        </div>
      </div>

      {/* Filtered Dispatches Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="card-title" style={{ fontSize: '1rem' }}>
              <PackageCheck size={18} color="#2563eb" />
              <span>Dispatch Entries</span>
              <span className="badge badge-coffee">{filteredDispatches.length}</span>
            </div>

            {/* Searchable Commodity Filter */}
            <div style={{ width: '230px' }}>
              <SearchableProductSelect
                value={productFilter === 'ALL' ? '' : productFilter}
                onChange={(val) => setProductFilter(val || 'ALL')}
                showChips={false}
                placeholder="Filter Commodity (All Products)..."
              />
            </div>

            {/* Category filter dropdown */}
            <select
              className="form-control"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
              value={dispatchTypeFilter}
              onChange={(e) => setDispatchTypeFilter(e.target.value)}
            >
              <option value="all">All Commodities</option>
              <option value="primary">🌟 Primary Commodities</option>
              <option value="secondary">📦 Secondary Products / Byproducts</option>
            </select>

            {/* Bill type filter dropdown */}
            <select
              className="form-control"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
              value={billTypeFilter}
              onChange={(e) => setBillTypeFilter(e.target.value)}
            >
              <option value="all">All Bill Types</option>
              <option value="gst_bill">GST Bills Only</option>
              <option value="cash_bill">Cash Sales Only</option>
              <option value="storage_out">Storage Release (Store Out)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control"
                style={{
                  paddingLeft: '1.8rem',
                  padding: '0.35rem 0.6rem 0.35rem 1.8rem',
                  fontSize: '0.8rem',
                  width: '180px',
                }}
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
              <Download size={14} /> Export CSV (Alt+E)
            </button>

            <button className="btn btn-coffee btn-sm" onClick={onOpenNewDispatch}>
              <PlusCircle size={14} /> + New Dispatch (Alt+K)
            </button>
          </div>
        </div>

        <div className="table-wrapper" style={{ maxHeight: '460px', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Dispatch #</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>Product</th>
                <th>Vehicle No</th>
                <th className="num">Weight (kg)</th>
                <th className="num">Bags</th>
                <th className="num">Clean EP (kg)</th>
                <th className="num">Sale Rate</th>
                <th className="num">GST / Tax</th>
                <th>Status / Mode</th>
                <th className="num">Net Invoice Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    Loading dispatches...
                  </td>
                </tr>
              ) : filteredDispatches.length === 0 ? (
                <tr>
                  <td colSpan="13" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No dispatch records found for this filter. Click <strong>+ New Dispatch (Alt+K)</strong> to add.
                  </td>
                </tr>
              ) : (
                paginatedDispatches.map((d) => {
                  const isStoreOut = d.status === 'storage_out' || d.rateType === 'storage_out';
                  const gstSum =
                    (Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0);

                  return (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{d.dispatchNo}</td>
                      <td>{d.date}</td>
                      <td>
                        <span
                          style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => onSelectSupplier && onSelectSupplier(d.supplierId || d.partyId)}
                        >
                          {d.supplierName || d.partyName}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-gray">{d.product}</span>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: isSecDisp(d) ? '#b45309' : '#166534',
                              letterSpacing: '0.02em',
                            }}
                          >
                            {isSecDisp(d) ? '📦 Secondary' : '🌿 Main'}
                          </span>
                        </div>
                      </td>
                      <td>{d.vehicleNo || '-'}</td>
                      <td className="num">{d.weight ? d.weight.toLocaleString() : 0} kg</td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {d.bags || 0}
                      </td>
                      <td className="num" style={{ color: '#0f172a' }}>
                        {(d.endProductWeight || d.weight || 0).toLocaleString()} kg
                      </td>
                      <td className="num">
                        {isStoreOut ? (
                          <span style={{ color: '#0369a1', fontSize: '0.78rem' }}>Unbilled</span>
                        ) : (
                          `₹${d.rate || 0}`
                        )}
                      </td>
                      <td className="num">
                        {gstSum > 0 ? (
                          <span style={{ color: '#0284c7', fontSize: '0.82rem' }}>
                            ₹{gstSum.toLocaleString()}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                      <td>
                        {d.billType === 'cash_bill' ? (
                          <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#475569' }}>
                            💵 Cash Sale
                          </span>
                        ) : isStoreOut ? (
                          <span className="badge badge-blue">📦 Store Release</span>
                        ) : (
                          <span className="badge badge-green">🧾 GST Bill</span>
                        )}
                      </td>
                      <td
                        className="num"
                        style={{
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          color: isStoreOut ? '#64748b' : '#059669',
                        }}
                      >
                        {isStoreOut ? 'Store Out' : `₹${(d.netAmount || d.billAmount || 0).toLocaleString()}`}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {d.isLocked ? (
                            <span 
                              title={`Audited & Locked (FY ${d.fy || 'Closed'}). Reopen FY in Settings to modify.`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}
                            >
                              <Lock size={11} /> Locked
                            </span>
                          ) : (
                            <>
                              <button
                                title="Edit Dispatch"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                onClick={() => onEditDispatch && onEditDispatch(d)}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                title="Delete Dispatch"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: deletingId === d.id ? '#94a3b8' : '#dc2626',
                                  padding: '0.2rem',
                                }}
                                disabled={deletingId === d.id}
                                onClick={() => handleDelete(d.id, d.dispatchNo)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredDispatches.length > 0 && (
              <tfoot style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                <tr>
                  <td
                    colSpan="6"
                    style={{
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      letterSpacing: '0.04em',
                      color: '#475569',
                    }}
                  >
                    Grand Totals ({filteredDispatches.length} Items)
                  </td>
                  <td className="num" style={{ fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                    {totalWeight.toLocaleString()} kg
                  </td>
                  <td className="num" style={{ fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                    {totalBags.toLocaleString()}
                  </td>
                  <td className="num" style={{ fontFamily: 'var(--font-mono)', color: '#92400e' }}>
                    {totalEpWeight.toLocaleString()} kg
                  </td>
                  <td></td>
                  <td className="num" style={{ fontFamily: 'var(--font-mono)', color: '#0284c7' }}>
                    ₹{totalGst.toLocaleString()}
                  </td>
                  <td></td>
                  <td
                    className="num"
                    style={{ fontFamily: 'var(--font-mono)', color: '#059669', fontSize: '0.95rem' }}
                  >
                    ₹{totalBilledSales.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {renderPaginationControls(filteredDispatches.length)}
      </div>
    </div>
  );
}