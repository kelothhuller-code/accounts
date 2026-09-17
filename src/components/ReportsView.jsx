import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Calendar, Filter, RefreshCw } from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function ReportsView({ dataVersion = 0 }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const [arrivals, setArrivals] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProducts();
    loadReport();
  }, [dataVersion]);

  const loadProducts = async () => {
    try {
      const prods = await dbAction('products:get');
      setProducts(prods || []);
    } catch (e) {}
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const arrs = await dbAction('arrivals:get', {
        startDate,
        endDate,
        product: selectedProduct !== 'ALL' ? selectedProduct : undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined
      });
      setArrivals(arrs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      { key: 'arrivalNo', label: 'Arrival #' },
      { key: 'date', label: 'Date' },
      { key: 'supplierName', label: 'Supplier Name' },
      { key: 'vehicleNo', label: 'Vehicle #' },
      { key: 'product', label: 'Product' },
      { key: 'weight', label: 'Gross Weight (kg)' },
      { key: 'bags', label: 'Bags' },
      { key: 'outturn', label: 'Outturn' },
      { key: 'endProductWeight', label: 'End Product (kg)' },
      { key: 'rate', label: 'Rate (₹)' },
      { key: 'status', label: 'Status' },
      { key: 'billAmount', label: 'Gross Amount (₹)' },
      { key: 'tcsAmount', label: 'TCS Deducted (₹)' },
      { key: 'netAmount', label: 'Net Payable (₹)' },
      { key: 'remarks', label: 'Remarks' },
    ];
    exportToCsv(`Coffee_Arrivals_Report_${startDate}_to_${endDate}`, headers, arrivals);
  };

  // Calculations
  const totalWeight = arrivals.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  const totalBags = arrivals.reduce((sum, a) => sum + (Number(a.bags) || 0), 0);
  const totalEP = arrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const totalBilled = arrivals
    .filter(a => a.status === 'billed')
    .reduce((sum, a) => sum + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);
  const totalTcs = arrivals
    .filter(a => a.status === 'billed')
    .reduce((sum, a) => sum + (Number(a.tcsAmount) || 0), 0);

  const billedItems = arrivals.filter(a => a.status === 'billed' && a.rate > 0);
  const avgRate = billedItems.length > 0 
    ? billedItems.reduce((sum, a) => sum + a.rate, 0) / billedItems.length 
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <BarChart3 size={20} color="#2563eb" />
              <span>Arrivals & Accounting Reports</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Filter by custom date range, product commodity, and status to view totals & averages
            </span>
          </div>

          <button className="btn btn-secondary" onClick={handleExportCsv} disabled={arrivals.length === 0}>
            <Download size={15} /> Export Report CSV (Alt+E)
          </button>
        </div>

        {/* Filter controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1rem', background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div className="form-group">
            <label className="form-label">From Date</label>
            <input type="date" className="form-control" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">To Date</label>
            <input type="date" className="form-control" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Product / Commodity</label>
            <select className="form-control" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
              <option value="ALL">All Products</option>
              {products.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-control" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="ALL">All Status</option>
              <option value="billed">Billed Only</option>
              <option value="storage">Storage Only</option>
              <option value="settled">Settled Only</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={loadReport}>
              <Filter size={15} /> Apply Filter
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate KPI Banner */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="metric-box coffee">
          <span className="metric-label">Total Raw Weight</span>
          <span className="metric-value">{totalWeight.toLocaleString()} kg</span>
          <span className="metric-sub">{(totalWeight / 1000).toFixed(2)} Tons</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Total Bags</span>
          <span className="metric-value">{totalBags.toLocaleString()}</span>
          <span className="metric-sub">50kg standard bags</span>
        </div>

        <div className="metric-box success">
          <span className="metric-label">Total End Product</span>
          <span className="metric-value">{totalEP.toLocaleString()} kg</span>
          <span className="metric-sub">{(totalEP / 100).toFixed(1)} Quintals</span>
        </div>

        <div className="metric-box purple">
          <span className="metric-label">Average Rate</span>
          <span className="metric-value">₹{Math.round(avgRate * 100) / 100}</span>
          <span className="metric-sub">Across billed arrivals</span>
        </div>

        <div className="metric-box">
          <span className="metric-label">Total Billed</span>
          <span className="metric-value">₹{totalBilled.toLocaleString()}</span>
          <span className="metric-sub">TCS: ₹{totalTcs.toLocaleString()}</span>
        </div>
      </div>

      {/* Report Table */}
      <div className="card" style={{ padding: 0 }}>
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
                <th className="num">Net Bill (₹)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Generating report...</td></tr>
              ) : arrivals.length === 0 ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>No arrivals match the selected criteria.</td></tr>
              ) : (
                arrivals.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.arrivalNo}</td>
                    <td>{a.date}</td>
                    <td style={{ fontWeight: 500 }}>{a.supplierName}</td>
                    <td>{a.vehicleNo || '-'}</td>
                    <td><span className="badge badge-coffee">{a.product}</span></td>
                    <td className="num">{a.weight.toLocaleString()}</td>
                    <td className="num">{a.bags}</td>
                    <td className="num">{a.outturn} {a.outturnType === 'percentage' ? '%' : 'kg/50k'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{a.endProductWeight.toLocaleString()}</td>
                    <td className="num">{a.status === 'storage' ? 'Unfixed' : `₹${a.rate}`}</td>
                    <td>
                      <span className={`badge ${a.status === 'billed' ? 'badge-green' : a.status === 'settled' ? 'badge-blue' : 'badge-coffee'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="num" style={{ fontWeight: 700, color: a.status === 'storage' ? '#64748b' : '#059669' }}>
                      {a.status === 'storage' ? '-' : `₹${(a.netAmount || a.billAmount).toLocaleString()}`}
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
