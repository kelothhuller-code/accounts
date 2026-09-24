import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Layers, 
  Calendar, 
  DollarSign, 
  Scale, 
  TrendingUp, 
  Download, 
  Filter, 
  PlusCircle,
  RefreshCw,
  Search,
  Edit2,
  Trash2
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function Dashboard({ onOpenNewArrival, onEditArrival, onSelectSupplier, onOpenSettlement, dataVersion = 0, triggerExport = 0 }) {
  const [dateFilter, setDateFilter] = useState('today'); // 'today', 'yesterday', 'this_week', 'this_month', 'custom'
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [metrics, setMetrics] = useState({
    daily: { totalWeight: 0, totalBags: 0, totalEndProduct: 0, totalBill: 0, avgRate: 0, arrivalsCount: 0 },
    global: { totalSuppliers: 0, totalPurchasesValue: 0, totalStorageBags: 0, totalStorageEP: 0, totalTcsAllTime: 0, totalPaidAllTime: 0, netPayableGlobal: 0 }
  });

  const [arrivals, setArrivals] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [insight, setInsight] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [startDate, endDate, dataVersion]);

  // Trigger CSV export when parent requests it via triggerExport
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

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [mets, arrs, ins] = await Promise.all([
        dbAction('dashboard:metrics', { startDate, endDate }),
        dbAction('arrivals:get', { startDate, endDate }),
        dbAction('stock:requirement-insight')
      ]);
      if (mets) setMetrics(mets);
      if (arrs) setArrivals(arrs || []);
      if (ins) setInsight(ins);
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
      loadDashboardData();
    } catch (err) {
      alert('Error deleting arrival: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Filter arrivals by search term, product, and status
  const filteredArrivals = arrivals.filter(a => {
    const term = searchTerm.toLowerCase();
    const matchSearch = 
      a.arrivalNo.toLowerCase().includes(term) ||
      a.supplierName.toLowerCase().includes(term) ||
      (a.vehicleNo && a.vehicleNo.toLowerCase().includes(term)) ||
      a.product.toLowerCase().includes(term);

    const matchProduct = productFilter === 'ALL' || a.product === productFilter;
    const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
    return matchSearch && matchProduct && matchStatus;
  });

  const { daily, global } = metrics;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Filter & Date Selector Bar */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <span>☕ Daily Arrivals & Overview</span>
              <span className="badge badge-coffee">
                {dateFilter === 'all_time' ? 'All Time' : `${startDate} to ${endDate}`}
              </span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Filter by date to view aggregate Weights, Bags, Average Rate & End Product
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

            <button className="btn btn-secondary btn-sm" onClick={loadDashboardData} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Coffee Stock & Position Requirement Insight Widget */}
      {insight && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: '10px',
          padding: '1.25rem 1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          border: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>
                Coffee Requirement & Stock Position Insight
              </h3>
            </div>
            <span className={`badge ${insight.actionNeeded === 'BUY_COFFEE' ? 'badge-danger' : insight.actionNeeded === 'SELL_COFFEE' ? 'badge-success' : 'badge-secondary'}`} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              {insight.actionNeeded === 'BUY_COFFEE' ? '⚠️ SHORT POSITION: Need to BUY Coffee' : insight.actionNeeded === 'SELL_COFFEE' ? '🚀 LONG POSITION: Need to SELL Coffee' : '✅ BALANCED STOCK POSITION'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem', textAlign: 'center', fontSize: '0.8rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>Open Stock</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{insight.openingCoffeeEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>+ Arrivals</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#4ade80' }}>+{insight.totalArrivalEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>- Dispatches</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f87171' }}>-{insight.totalDispatchEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>- Store In</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fbbf24' }}>-{insight.totalStoreInEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>+ Store Out</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#38bdf8' }}>+{insight.totalStoreOutEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>+ Pur. Comms</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#a78bfa' }}>+{insight.purchaseCommitmentsPendingEP.toLocaleString()} kg</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '6px' }}>
              <div style={{ color: '#94a3b8' }}>- Sale Comms</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f472b6' }}>-{insight.saleCommitmentsPendingEP.toLocaleString()} kg</div>
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
              Formula: <em>Opening Stock + Total Arrival - Total Dispatch - Total Store In + Total Store Out + Pur. Comms Pending - Sale Comms Pending</em>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: insight.netPositionEP >= 0 ? '#4ade80' : '#f87171' }}>
              Net Position: {insight.netPositionEP >= 0 ? `+${insight.netPositionEP.toLocaleString()} kg EP` : `${insight.netPositionEP.toLocaleString()} kg EP`}
            </div>
          </div>
        </div>
      )}

      {/* Daily Aggregated Metrics Bar (Exact User Request) */}
      <div>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Filtered Period Arrivals Summary ({daily.arrivalsCount} Arrivals)
        </div>
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {/* Total Weight */}
          <div className="metric-box coffee">
            <span className="metric-label">Total Raw Weight</span>
            <span className="metric-value">{daily.totalWeight.toLocaleString()} kg</span>
            <span className="metric-sub">{(daily.totalWeight / 1000).toFixed(2)} Metric Tons</span>
          </div>

          {/* Total Bags */}
          <div className="metric-box">
            <span className="metric-label">Total Bags</span>
            <span className="metric-value">{daily.totalBags.toLocaleString()}</span>
            <span className="metric-sub">Standard 50kg bags</span>
          </div>

          {/* Total End Product */}
          <div className="metric-box success">
            <span className="metric-label">Total End Product (EP)</span>
            <span className="metric-value">{daily.totalEndProduct.toLocaleString()} kg</span>
            <span className="metric-sub">{(daily.totalEndProduct / 100).toFixed(1)} Quintals Clean</span>
          </div>

          {/* Average Rate */}
          <div className="metric-box purple">
            <span className="metric-label">Average Buying Rate</span>
            <span className="metric-value">₹{daily.avgRate.toLocaleString()}</span>
            <span className="metric-sub">Across billed arrivals</span>
          </div>

          {/* Total Bill */}
          <div className="metric-box">
            <span className="metric-label">Total Billed Value</span>
            <span className="metric-value">₹{daily.totalBill.toLocaleString()}</span>
            <span className="metric-sub">Period purchases</span>
          </div>
        </div>
      </div>

      {/* Global Overall Business Status Cards */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
          All-Time Company Accounts & Coffee Inventory
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: '1rem' }}>
            <span className="calc-item-label">Total Suppliers</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{global.totalSuppliers}</div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Active Accounts</span>
          </div>

          <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: '1rem' }}>
            <span className="calc-item-label">Net Storage Coffee Stock</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#7c3aed' }}>
              {global.totalStorageBags || 0} Bags
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              In: {global.totalStoreInBags || 0}b | Out: {global.totalStoreOutBags || 0}b ({(global.totalStorageEP || 0).toLocaleString()} kg EP)
            </span>
          </div>

          <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: '1rem' }}>
            <span className="calc-item-label">Total TCS Deducted (Sum)</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>
              ₹{global.totalTcsAllTime.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Tax collected on purchases</span>
          </div>

          <div>
            <span className="calc-item-label">Net Balance Payable</span>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: global.netPayableGlobal >= 0 ? '#dc2626' : '#059669' }}>
              ₹{global.netPayableGlobal.toLocaleString()}
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              After ₹{global.totalPaidAllTime.toLocaleString()} paid
            </span>
          </div>
        </div>
      </div>

      {/* Filtered Arrivals Table Card */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="card-title" style={{ fontSize: '1rem' }}>
              <Truck size={18} color="#2563eb" />
              <span>Arrival Entries</span>
              <span className="badge badge-blue">{filteredArrivals.length}</span>
            </div>

            {/* Product filter pills */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {['ALL', 'RC Raw', 'RC EP', 'AC Raw'].map(p => (
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

            {/* Status filter */}
            <select
              className="form-control"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Status</option>
              <option value="billed">Billed Only</option>
              <option value="storage">Storage Only</option>
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
              <Download size={14} /> Export CSV (Alt+E)
            </button>

            <button className="btn btn-coffee btn-sm" onClick={onOpenNewArrival}>
              <PlusCircle size={14} /> + New Arrival (Alt+A)
            </button>
          </div>
        </div>

        <div className="table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
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
                <th className="num">Outturn</th>
                <th className="num">End Product (kg)</th>
                <th className="num">Rate</th>
                <th>Status</th>
                <th className="num">Gross Bill</th>
                <th className="num">TCS</th>
                <th className="num">Net Bill</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="15" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>Loading arrivals...</td></tr>
              ) : filteredArrivals.length === 0 ? (
                <tr>
                  <td colSpan="15" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                    No arrivals recorded for this filter. Click <strong>+ New Arrival (Alt+A)</strong> to add.
                  </td>
                </tr>
              ) : (
                filteredArrivals.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.arrivalNo}</td>
                    <td>{a.date}</td>
                    <td>
                      <span 
                        style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => onSelectSupplier(a.supplierId)}
                      >
                        {a.supplierName}
                      </span>
                    </td>
                    <td>{a.vehicleNo || '-'}</td>
                    <td>
                      <span className={`badge ${
                        a.product === 'RC Raw' || a.product === 'RC EP' || a.product === 'AC Raw'
                          ? 'badge-coffee'
                          : 'badge-gray'
                      }`}>
                        {a.product}
                      </span>
                    </td>
                    <td className="num">{a.weight.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{a.bags}</td>
                    <td className="num">
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                        {a.outturn} {a.outturnType === 'percentage' ? '%' : 'kg/50k'}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {a.endProductWeight.toLocaleString()}
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
                    <td className="num">{a.status === 'storage' ? '-' : `₹${(a.billAmount || 0).toLocaleString()}`}</td>
                    <td className="num" style={{ color: '#dc2626' }}>{a.status === 'storage' ? '-' : `₹${(a.tcsAmount || 0).toLocaleString()}`}</td>
                    <td className="num" style={{ fontWeight: 700, color: a.status === 'storage' ? '#64748b' : '#059669' }}>
                      {a.status === 'storage' ? '-' : `₹${(a.netAmount || 0).toLocaleString()}`}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
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
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
