import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Search, 
  Download, 
  PlusCircle, 
  RefreshCw, 
  Edit2, 
  Trash2, 
  Layers, 
  DollarSign, 
  Scale,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import SearchableProductSelect from './SearchableProductSelect';

export default function ArrivalsView({ onOpenNewArrival, onEditArrival, onSelectSupplier, onOpenSettlement, dataVersion = 0, triggerExport = 0 }) {
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [metrics, setMetrics] = useState({
    daily: { totalWeight: 0, totalBags: 0, totalEndProduct: 0, totalBill: 0, avgRate: 0, arrivalsCount: 0 }
  });

  const [arrivals, setArrivals] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    loadArrivalsData();
  }, [startDate, endDate, dataVersion]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, productFilter, statusFilter, startDate, endDate]);

  useEffect(() => {
    if (triggerExport > 0) handleExportDailyCsv();
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

  const loadArrivalsData = async () => {
    setLoading(true);
    try {
      const [mets, arrs] = await Promise.all([
        dbAction('dashboard:metrics', { startDate, endDate }),
        dbAction('arrivals:get', { startDate, endDate })
      ]);
      if (mets) setMetrics(mets);
      const list = Array.isArray(arrs) ? arrs : (arrs?.items || []);
      setArrivals(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportDailyCsv = () => {
    const headers = [
      { key: 'arrivalNo', label: 'Arrival #' },
      { key: 'date', label: 'Date' },
      { key: 'supplierName', label: 'Supplier' },
      { key: 'vehicleNo', label: 'Vehicle' },
      { key: 'product', label: 'Product' },
      { key: 'weight', label: 'Raw Weight (kg)' },
      { key: 'bags', label: 'Bags' },
      { key: 'outturn', label: 'Outturn' },
      { key: 'endProductWeight', label: 'End Product (kg)' },
      { key: 'rate', label: 'Rate (₹)' },
      { key: 'status', label: 'Status' },
      { key: 'billAmount', label: 'Gross Bill (₹)' },
      { key: 'tcsAmount', label: 'TCS (₹)' },
      { key: 'tdsAmount', label: 'TDS (₹)' },
      { key: 'netAmount', label: 'Net Bill (₹)' },
      { key: 'remarks', label: 'Remarks' },
    ];

    exportToCsv(`Arrivals_Report_${startDate || 'all'}_to_${endDate || 'all'}`, headers, filteredArrivals);
  };

  const handleDeleteArrival = async (arr) => {
    if (arr.status === 'settled' || (arr.settledBags > 0)) {
      alert(`Cannot delete ${arr.arrivalNo} — it has settled quantities. Please delete the settlement first.`);
      return;
    }
    if (!window.confirm(`Delete arrival ${arr.arrivalNo} for ${arr.supplierName}?\nThis will reverse any commitment deductions.`)) return;
    setDeletingId(arr.id);
    try {
      await dbAction('arrivals:delete', { id: arr.id });
      loadArrivalsData();
    } catch (err) {
      alert('Error deleting arrival: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Load available products for searchable filter
  const [dbProducts, setDbProducts] = useState([]);
  useEffect(() => {
    dbAction('products:get').then(res => setDbProducts(res || [])).catch(() => {});
  }, []);

  const availableProductsList = React.useMemo(() => {
    const set = new Set();
    (dbProducts || []).forEach(p => p.name && set.add(p.name));
    (arrivals || []).forEach(a => a.product && set.add(a.product));
    return Array.from(set);
  }, [dbProducts, arrivals]);

  const filteredArrivals = arrivals.filter(a => {
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      (a.arrivalNo && a.arrivalNo.toLowerCase().includes(term)) ||
      (a.supplierName && a.supplierName.toLowerCase().includes(term)) ||
      (a.vehicleNo && a.vehicleNo.toLowerCase().includes(term)) ||
      (a.product && a.product.toLowerCase().includes(term));

    const matchProduct = productFilter === 'ALL' || a.product === productFilter;
    const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
    return matchSearch && matchProduct && matchStatus;
  });

  // Helper — use record flag first, name fallback second
  const isSecArr = (a) => a.isSecondary !== undefined ? a.isSecondary : (a.product || '').toLowerCase().includes('husk');

  // Dynamic metrics calculation – split by main vs secondary using record flag
  const totalInwardRawWeight = filteredArrivals.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  const totalInwardBags     = filteredArrivals.reduce((sum, a) => sum + (Number(a.bags) || 0), 0);
  const totalNetEP          = filteredArrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);

  const mainArrivals      = filteredArrivals.filter(a => !isSecArr(a));
  const secondaryArrivals = filteredArrivals.filter(a =>  isSecArr(a));

  // Main product metrics
  const mainInwardRawWeight = mainArrivals.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  const mainInwardBags      = mainArrivals.reduce((sum, a) => sum + (Number(a.bags) || 0), 0);
  const mainInwardEP        = mainArrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const mainPendingArrivals = mainArrivals.filter(a => a.status === 'storage' || a.status === 'partial_settled');
  const mainPendingEP       = mainPendingArrivals.reduce((sum, a) => sum + (a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : (Number(a.endProductWeight) || 0)), 0);
  const mainBilledArrivals  = mainArrivals.filter(a => a.status === 'billed' || a.status === 'cash_bill');
  const mainBilledEP        = mainBilledArrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const mainBilledValue     = mainBilledArrivals.reduce((sum, a) => sum + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);
  const mainAvgRate         = mainBilledEP > 0 ? (mainBilledValue / mainBilledEP).toFixed(2) : '0';

  // Secondary product metrics
  const secondaryInwardRawWeight = secondaryArrivals.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  const secondaryInwardBags      = secondaryArrivals.reduce((sum, a) => sum + (Number(a.bags) || 0), 0);
  const secondaryInwardEP        = secondaryArrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const secPendingArrivals = secondaryArrivals.filter(a => a.status === 'storage' || a.status === 'partial_settled');
  const secondaryPendingEP = secPendingArrivals.reduce((sum, a) => sum + (a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : (Number(a.endProductWeight) || 0)), 0);
  const secBilledArrivals  = secondaryArrivals.filter(a => a.status === 'billed' || a.status === 'cash_bill');
  const secondaryBilledEP  = secBilledArrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const secondaryBilledValue = secBilledArrivals.reduce((sum, a) => sum + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);
  const secondaryAvgRate   = secondaryBilledEP > 0 ? (secondaryBilledValue / secondaryBilledEP).toFixed(2) : '0';

  // Legacy totals (for combined cards)
  const pendingBilledRawWeight = [...mainPendingArrivals, ...secPendingArrivals].reduce((sum, a) => sum + (a.remainingBags !== undefined ? Number(a.remainingBags) * 50 : (Number(a.weight) || 0)), 0);


  const renderPaginationControls = (totalItems) => {
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, currentPage * pageSize);

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.45rem 1rem', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>Showing <strong>{startItem} - {endItem}</strong> of <strong>{totalItems}</strong> arrivals</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>Per page:</span>
            <select 
              value={pageSize} 
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.15rem 0.35rem', fontSize: '0.8rem', outline: 'none' }}
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Date Selector & Top Filter Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <Truck size={20} color="#2563eb" />
              <span>Coffee Arrival Register (Inward Raw Coffee)</span>
              <span className="badge badge-coffee">
                {dateFilter === 'all_time' ? 'All Time' : `${startDate} to ${endDate}`}
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Record, inspect outturns, filter by date & product, and manage supplier inward coffee lots
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPresetDate('today')}>Today</button>
            <button className={`btn btn-sm ${dateFilter === 'yesterday' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPresetDate('yesterday')}>Yesterday</button>
            <button className={`btn btn-sm ${dateFilter === 'this_week' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPresetDate('this_week')}>This Week</button>
            <button className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPresetDate('this_month')}>This Month</button>
            <button className={`btn btn-sm ${dateFilter === 'all_time' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPresetDate('all_time')}>All Time</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.5rem' }}>
              <input type="date" className="form-control" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} value={startDate} onChange={e => { setDateFilter('custom'); setStartDate(e.target.value); }} />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
              <input type="date" className="form-control" style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }} value={endDate} onChange={e => { setDateFilter('custom'); setEndDate(e.target.value); }} />
            </div>

            <button className="btn btn-secondary btn-sm" onClick={loadArrivalsData} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards for Arrivals — Main & Secondary split */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Main Product Card */}
        <div className="metric-box success" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span className="metric-label" style={{ color: '#166534', fontWeight: 700 }}>🌿 Main Products — Inward Summary</span>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Raw Weight</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>{mainInwardRawWeight.toLocaleString()} kg</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Bags</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>{mainInwardBags.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Net EP</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>{mainInwardEP.toLocaleString()} kg</div>
            </div>
          </div>
          <span className="metric-sub" style={{ color: '#15803d', fontWeight: 600 }}>
            Billed EP: {mainBilledEP.toLocaleString()} kg | Avg Rate: ₹{mainAvgRate}/kg | Pending EP: {mainPendingEP.toLocaleString()} kg
          </span>
        </div>

        {/* Secondary Product Card */}
        <div className="metric-box warning" style={{ borderLeftColor: '#d97706', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span className="metric-label" style={{ color: '#92400e', fontWeight: 700 }}>📦 Secondary Products — Inward Summary</span>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.1rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Raw Weight</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{secondaryInwardRawWeight.toLocaleString()} kg</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Bags</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{secondaryInwardBags.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#374151', fontWeight: 600, textTransform: 'uppercase' }}>Net EP</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{secondaryInwardEP.toLocaleString()} kg</div>
            </div>
          </div>
          <span className="metric-sub" style={{ color: '#92400e', fontWeight: 600 }}>
            Billed EP: {secondaryBilledEP.toLocaleString()} kg | Avg Rate: ₹{secondaryAvgRate}/kg | Pending EP: {secondaryPendingEP.toLocaleString()} kg
          </span>
        </div>
      </div>

      {/* Filtered Arrivals Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="card-title" style={{ fontSize: '1rem' }}>
              <Truck size={18} color="#2563eb" />
              <span>Inward Arrival Entries</span>
              <span className="badge badge-blue">{filteredArrivals.length}</span>
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


            <select
              className="form-control"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="billed">Billed Only</option>
              <option value="storage">Storage Only (Unfixed)</option>
              <option value="settled">Settled</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '9px', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '1.8rem', padding: '0.35rem 0.6rem 0.35rem 1.8rem', fontSize: '0.8rem', width: '180px' }}
                placeholder="Search..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn btn-secondary btn-sm" onClick={handleExportDailyCsv}>
              <Download size={14} /> Export CSV
            </button>

            <button className="btn btn-coffee btn-sm" onClick={onOpenNewArrival}>
              <PlusCircle size={14} /> + New Arrival (Alt+A)
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Arrival #</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Vehicle</th>
                <th>Product</th>
                <th className="num">Raw Wt (kg)</th>
                <th className="num">Bags</th>
                <th className="num">OT</th>
                <th className="num">End Product (kg)</th>
                <th className="num">Rate</th>
                <th>Status</th>
                <th className="num">Gross Bill</th>
                <th className="num">TCS (+)</th>
                <th className="num">TDS (-)</th>
                <th className="num">Net Bill</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="16" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>Loading arrivals...</td></tr>
              ) : filteredArrivals.length === 0 ? (
                <tr>
                  <td colSpan="16" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No arrivals recorded for this filter. Click <strong>+ New Arrival (Alt+A)</strong> to add.
                  </td>
                </tr>
              ) : (
                filteredArrivals
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.arrivalNo}</td>
                      <td>{a.date}</td>
                      <td>
                        <span 
                          style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => onSelectSupplier && onSelectSupplier(a.supplierId)}
                        >
                          {a.supplierName}
                        </span>
                      </td>
                      <td>{a.vehicleNo || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span className="badge badge-blue">{a.product}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isSecArr(a) ? '#b45309' : '#166534', letterSpacing: '0.02em' }}>
                            {isSecArr(a) ? '📦 Secondary' : '🌿 Main'}
                          </span>
                        </div>
                      </td>
                      <td className="num">{(Number(a.weight) || 0).toLocaleString()}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{a.bags}</td>
                      <td className="num">
                        <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                          {a.outturn} {a.outturnType === 'percentage' ? '%' : 'kg/50k'}
                        </span>
                      </td>
                      <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {(Number(a.endProductWeight) || 0).toLocaleString()}
                      </td>
                      <td className="num">
                        {a.status === 'storage' ? (
                          <span style={{ color: '#92400e', fontSize: '0.78rem' }}>Unfixed</span>
                        ) : (
                          `₹${a.rate}`
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          a.status === 'billed' ? 'badge-green' :
                          a.status === 'settled' ? 'badge-blue' :
                          a.status === 'partial_settled' ? 'badge-amber' : 'badge-coffee'
                        }`}>
                          {a.status === 'storage' ? `📦 Storage (${a.remainingBags}b)` : a.status}
                        </span>
                      </td>
                      <td className="num">{a.status === 'storage' ? '-' : `₹${(Number(a.billAmount) || Number(a.taxableAmount) || 0).toLocaleString()}`}</td>
                      <td className="num" style={{ color: Number(a.tcsAmount) > 0 ? '#059669' : '#94a3b8' }}>
                        {a.status === 'storage' ? '-' : (Number(a.tcsAmount) > 0 ? `+₹${(a.tcsAmount || 0).toLocaleString()}` : '-')}
                      </td>
                      <td className="num" style={{ color: Number(a.tdsAmount) > 0 ? '#dc2626' : '#94a3b8' }}>
                        {a.status === 'storage' ? '-' : (Number(a.tdsAmount) > 0 ? `-₹${(a.tdsAmount || 0).toLocaleString()}` : '-')}
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: a.status === 'storage' ? '#64748b' : '#059669' }}>
                        {a.status === 'storage' ? '-' : `₹${(Number(a.netAmount) || (Number(a.billAmount) || 0) + (Number(a.tcsAmount) || 0) - (Number(a.tdsAmount) || 0)).toLocaleString()}`}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                          {a.isLocked ? (
                            <span 
                              title={`Audited & Locked (FY ${a.fy || 'Closed'}). Reopen FY in Settings to modify.`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}
                            >
                              <Lock size={11} /> Locked
                            </span>
                          ) : (
                            <>
                              <button
                                title="Edit Arrival"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                                onClick={() => onEditArrival && onEditArrival(a)}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                title="Delete Arrival"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === a.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                                disabled={deletingId === a.id}
                                onClick={() => handleDeleteArrival(a)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        {renderPaginationControls(filteredArrivals.length)}
      </div>
    </div>
  );
}

