import React, { useState, useEffect } from 'react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';
import { 
  PackageCheck, 
  Search, 
  Filter, 
  Download, 
  Plus, 
  Trash2, 
  Edit2, 
  FileSpreadsheet,
  Wheat,
  Coffee,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Truck
} from 'lucide-react';

export default function DispatchesView({
  dataVersion = 0,
  onOpenNewDispatch,
  onEditDispatch,
  onSelectSupplier,
  triggerNew,
  triggerExport
}) {
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  
  // Date Filters
  const [dateFilter, setDateFilter] = useState('all_time'); // 'today', 'yesterday', 'this_week', 'this_month', 'all_time', 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dispatchTypeFilter, setDispatchTypeFilter] = useState('all'); // 'all', 'coffee', 'husk'
  const [billTypeFilter, setBillTypeFilter] = useState('all'); // 'all', 'gst_bill', 'cash_bill', 'storage_out'
  const [productFilter, setProductFilter] = useState('ALL');

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
      setDispatches(res || []);
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
  const filteredDispatches = dispatches.filter(d => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || 
      (d.dispatchNo && d.dispatchNo.toLowerCase().includes(q)) ||
      (d.supplierName && d.supplierName.toLowerCase().includes(q)) ||
      (d.vehicleNo && d.vehicleNo.toLowerCase().includes(q)) ||
      (d.product && d.product.toLowerCase().includes(q));

    const matchesType = dispatchTypeFilter === 'all' || d.dispatchType === dispatchTypeFilter;
    
    const matchesBill = billTypeFilter === 'all' || 
      d.billType === billTypeFilter || 
      d.status === billTypeFilter || 
      (billTypeFilter === 'storage_out' && (d.rateType === 'storage_out' || d.status === 'storage_out'));

    const matchesProduct = productFilter === 'ALL' || d.product === productFilter;

    return matchesSearch && matchesType && matchesBill && matchesProduct;
  });

  // Calculate Metrics
  const totalWeight = filteredDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const totalBags = filteredDispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const totalEpWeight = filteredDispatches.reduce((sum, d) => sum + (Number(d.endProductWeight) || Number(d.weight) || 0), 0);
  const totalBilledSales = filteredDispatches.reduce((sum, d) => sum + (Number(d.netAmount) || Number(d.billAmount) || 0), 0);
  const totalGst = filteredDispatches.reduce((sum, d) => sum + ((Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0)), 0);

  const huskDispatches = filteredDispatches.filter(d => d.dispatchType === 'husk' || d.product === 'prod_husk' || d.product === 'Husk');
  const totalHuskWeight = huskDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);

  const storeOutDispatches = filteredDispatches.filter(d => d.rateType === 'storage_out' || d.status === 'storage_out');
  const totalStoreOutBags = storeOutDispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const totalStoreOutWeight = storeOutDispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);

  const handleExportCsv = async () => {
    const exportData = filteredDispatches.map(d => ({
      'Dispatch No': d.dispatchNo,
      'Date': d.date,
      'Party Name': d.supplierName,
      'Vehicle No': d.vehicleNo || '-',
      'Category': d.dispatchType === 'husk' ? 'Husk' : 'Coffee',
      'Product': d.product,
      'Weight (Kg)': d.weight,
      'Bags': d.bags,
      'EP Wt (Kg)': d.endProductWeight || d.weight,
      'Sale Rate (₹)': d.rate,
      'Taxable Amount': d.taxableAmount || 0,
      'CGST (₹)': d.cgstAmount || 0,
      'SGST (₹)': d.sgstAmount || 0,
      'IGST (₹)': d.igstAmount || 0,
      'TDS (₹)': d.tdsAmount || 0,
      'TCS (₹)': d.tcsAmount || 0,
      'Net Invoice Amount (₹)': d.netAmount || d.billAmount,
      'Bill Type': d.billType === 'cash_bill' ? 'Cash Sale' : d.status === 'storage_out' ? 'Store Release' : 'GST Bill',
      'Status': d.status,
      'Remarks': d.remarks || ''
    }));

    exportToCsv(`Dispatches_Report_${startDate || 'all'}_to_${endDate || 'all'}`, exportData);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Filter & Date Selector Bar */}
      <div className="card" style={{ background: '#ffffff', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
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
                onChange={e => { setDateFilter('custom'); setStartDate(e.target.value); }}
              />
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>to</span>
              <input
                type="date"
                className="form-control"
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                value={endDate}
                onChange={e => { setDateFilter('custom'); setEndDate(e.target.value); }}
              />
            </div>

            <button className="btn btn-secondary btn-sm" onClick={loadDispatches} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Filtered Period Dispatches Summary ({filteredDispatches.length} Entries)
        </div>

        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {/* Total Dispatches */}
          <div className="metric-box coffee">
            <span className="metric-label">Total Dispatched Weight</span>
            <span className="metric-value">{totalWeight.toLocaleString()} kg</span>
            <span className="metric-sub">{totalBags.toLocaleString()} Bags | Clean EP: {totalEpWeight.toLocaleString()} kg</span>
          </div>

          {/* Storage Release (Store Out) */}
          <div className="metric-box purple" style={{ background: '#faf5ff' }}>
            <span className="metric-label">Storage Release (Store Out)</span>
            <span className="metric-value" style={{ color: '#7c3aed' }}>{totalStoreOutBags.toLocaleString()} Bags</span>
            <span className="metric-sub">{totalStoreOutWeight.toLocaleString()} kg EP | {storeOutDispatches.length} Releases</span>
          </div>

          {/* Husk Dispatches */}
          <div className="metric-box warning" style={{ borderLeftColor: '#d97706' }}>
            <span className="metric-label">Husk Dispatches (2.5%+2.5% GST)</span>
            <span className="metric-value" style={{ color: '#d97706' }}>{totalHuskWeight.toLocaleString()} kg</span>
            <span className="metric-sub">{huskDispatches.length} Husk Entries (5% Tax)</span>
          </div>

          {/* Total Sales Billed */}
          <div className="metric-box success">
            <span className="metric-label">Total Sales Billed Value</span>
            <span className="metric-value">₹{totalBilledSales.toLocaleString()}</span>
            <span className="metric-sub">Total GST Billed: ₹{totalGst.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Filtered Dispatches Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="card-title" style={{ fontSize: '1rem' }}>
              <PackageCheck size={18} color="#2563eb" />
              <span>Dispatch Entries</span>
              <span className="badge badge-coffee">{filteredDispatches.length}</span>
            </div>

            {/* Product filter pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['ALL', 'RC EP', 'AC EP', 'RC Raw', 'HUSK'].map(p => (
                <button
                  key={p}
                  className={`btn btn-sm ${productFilter === p ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  onClick={() => setProductFilter(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Category filter dropdown */}
            <select 
              className="form-control" 
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
              value={dispatchTypeFilter}
              onChange={(e) => setDispatchTypeFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="coffee">☕ Coffee Dispatches</option>
              <option value="husk">🌾 Husk Dispatches</option>
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
                style={{ paddingLeft: '1.8rem', padding: '0.35rem 0.6rem 0.35rem 1.8rem', fontSize: '0.8rem', width: '180px' }}
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
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
                <th>Category</th>
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
                <tr><td colSpan="14" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>Loading dispatches...</td></tr>
              ) : filteredDispatches.length === 0 ? (
                <tr>
                  <td colSpan="14" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No dispatch records found for this filter. Click <strong>+ New Dispatch (Alt+K)</strong> to add.
                  </td>
                </tr>
              ) : (
                filteredDispatches.map(d => {
                  const isHusk = d.dispatchType === 'husk' || d.product === 'prod_husk' || d.product === 'Husk';
                  const isStoreOut = d.status === 'storage_out' || d.rateType === 'storage_out';
                  const gstSum = (Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0);

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
                        {isHusk ? (
                          <span className="badge badge-amber" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                            🌾 Husk (5% GST)
                          </span>
                        ) : (
                          <span className="badge badge-coffee">☕ Coffee</span>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-gray">{d.product}</span>
                      </td>
                      <td>{d.vehicleNo || '-'}</td>
                      <td className="num">{d.weight ? d.weight.toLocaleString() : 0} kg</td>
                      <td className="num" style={{ fontWeight: 600 }}>{d.bags || 0}</td>
                      <td className="num" style={{ color: '#0f172a' }}>{(d.endProductWeight || d.weight || 0).toLocaleString()} kg</td>
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
                          <span className="badge badge-secondary" style={{ background: '#f1f5f9', color: '#475569' }}>💵 Cash Sale</span>
                        ) : isStoreOut ? (
                          <span className="badge badge-blue">📦 Store Release</span>
                        ) : (
                          <span className="badge badge-green">🧾 GST Bill</span>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: isStoreOut ? '#64748b' : '#059669' }}>
                        {isStoreOut ? 'Store Out' : `₹${(d.netAmount || d.billAmount || 0).toLocaleString()}`}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button
                            title="Edit Dispatch"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '0.2rem' }}
                            onClick={() => onEditDispatch && onEditDispatch(d)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            title="Delete Dispatch"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === d.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                            disabled={deletingId === d.id}
                            onClick={() => handleDelete(d.id, d.dispatchNo)}
                          >
                            <Trash2 size={14} />
                          </button>
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
                  <td colSpan="6" style={{ textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.04em', color: '#475569' }}>
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
                  <td className="num" style={{ fontFamily: 'var(--font-mono)', color: '#059669', fontSize: '0.95rem' }}>
                    ₹{totalBilledSales.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
