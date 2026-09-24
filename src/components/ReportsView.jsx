import React, { useState, useEffect } from 'react';
import { BarChart3, Download, Filter, RefreshCw, Truck, PackageCheck, Wheat, FileSpreadsheet } from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function ReportsView({ dataVersion = 0, triggerExport = 0 }) {
  const [reportType, setReportType] = useState('arrivals'); // 'arrivals', 'dispatches', 'insight'
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedProduct, setSelectedProduct] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  const [arrivals, setArrivals] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [insight, setInsight] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProducts();
    loadReport();
  }, [dataVersion, reportType]);

  useEffect(() => {
    if (triggerExport > 0) handleExportCsv();
  }, [triggerExport]);

  const loadProducts = async () => {
    try {
      const prods = await dbAction('products:get');
      setProducts(prods || []);
    } catch (e) {}
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      if (reportType === 'arrivals') {
        const arrs = await dbAction('arrivals:get', {
          startDate,
          endDate,
          product: selectedProduct !== 'ALL' ? selectedProduct : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined
        });
        setArrivals(arrs || []);
      } else if (reportType === 'dispatches') {
        const disps = await dbAction('dispatches:get', {
          startDate,
          endDate,
          product: selectedProduct !== 'ALL' ? selectedProduct : undefined,
          status: selectedStatus !== 'ALL' ? selectedStatus : undefined
        });
        setDispatches(disps || []);
      }
      const ins = await dbAction('stock:requirement-insight');
      if (ins) setInsight(ins);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (reportType === 'arrivals') {
      const exportData = arrivals.map(a => ({
        'Arrival No': a.arrivalNo,
        'Date': a.date,
        'Supplier Name': a.supplierName,
        'Vehicle No': a.vehicleNo || '-',
        'Product': a.product,
        'Weight (kg)': a.weight,
        'Bags': a.bags,
        'Outturn': a.outturn,
        'End Product (kg)': a.endProductWeight,
        'Rate (₹)': a.rate,
        'Bill Type': a.billType === 'cash_bill' ? 'Cash Purchase' : 'GST Bill',
        'Status': a.status,
        'CGST (₹)': a.cgstAmount || 0,
        'SGST (₹)': a.sgstAmount || 0,
        'TDS (₹)': a.tdsAmount || 0,
        'TCS (₹)': a.tcsAmount || 0,
        'Net Amount (₹)': a.netAmount || a.billAmount
      }));
      exportToCsv(exportData, `Arrivals_Report_${startDate}_to_${endDate}.csv`);
    } else {
      const exportData = dispatches.map(d => ({
        'Dispatch No': d.dispatchNo,
        'Date': d.date,
        'Party Name': d.supplierName,
        'Vehicle No': d.vehicleNo || '-',
        'Category': d.dispatchType === 'husk' ? 'Husk' : 'Coffee',
        'Product': d.product,
        'Weight (kg)': d.weight,
        'Bags': d.bags,
        'Rate (₹)': d.rate,
        'Bill Type': d.billType === 'cash_bill' ? 'Cash Sale' : 'GST Bill',
        'Status': d.status,
        'CGST (₹)': d.cgstAmount || 0,
        'SGST (₹)': d.sgstAmount || 0,
        'TDS (₹)': d.tdsAmount || 0,
        'TCS (₹)': d.tcsAmount || 0,
        'Net Invoice Amount (₹)': d.netAmount || d.billAmount
      }));
      exportToCsv(exportData, `Dispatches_Report_${startDate}_to_${endDate}.csv`);
    }
  };

  // Calculations for Arrivals
  const totalArrWeight = arrivals.reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
  const totalArrBags = arrivals.reduce((sum, a) => sum + (Number(a.bags) || 0), 0);
  const totalArrEP = arrivals.reduce((sum, a) => sum + (Number(a.endProductWeight) || 0), 0);
  const totalArrBilled = arrivals
    .filter(a => a.status === 'billed' || a.status === 'cash_bill')
    .reduce((sum, a) => sum + (Number(a.netAmount) || Number(a.billAmount) || 0), 0);

  // Calculations for Dispatches
  const totalDispWeight = dispatches.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);
  const totalDispBags = dispatches.reduce((sum, d) => sum + (Number(d.bags) || 0), 0);
  const totalDispBilled = dispatches
    .filter(d => d.status === 'billed' || d.status === 'cash_bill')
    .reduce((sum, d) => sum + (Number(d.netAmount) || Number(d.billAmount) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Filter & Report Switcher */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <BarChart3 size={20} color="#2563eb" />
              <span>Coffee & Accounts Financial Reports</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Filter by date range, commodity product, and bill status to view purchase & dispatch ledgers
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={handleExportCsv}>
              <Download size={15} /> Export Report CSV (Alt+E)
            </button>
          </div>
        </div>

        {/* Report Type Selector Pills */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            type="button"
            className={`btn ${reportType === 'arrivals' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType('arrivals')}
          >
            🚛 Coffee Purchases & Arrivals Report
          </button>
          <button
            type="button"
            className={`btn ${reportType === 'dispatches' ? 'btn-coffee' : 'btn-secondary'}`}
            onClick={() => setReportType('dispatches')}
          >
            📤 Dispatches & Sales Report (Coffee & Husk)
          </button>
        </div>

        {/* Filter Controls */}
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
                <option key={p.id} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Bill Status</label>
            <select className="form-control" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
              <option value="ALL">All Status</option>
              <option value="billed">Billed GST Invoices</option>
              <option value="cash_bill">Cash Sales / Purchases</option>
              <option value="storage">Storage Only</option>
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
      {reportType === 'arrivals' ? (
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="metric-box coffee">
            <span className="metric-label">Total Purchased Raw Wt</span>
            <span className="metric-value">{totalArrWeight.toLocaleString()} kg</span>
            <span className="metric-sub">{(totalArrWeight / 1000).toFixed(2)} Metric Tons</span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Total Bags</span>
            <span className="metric-value">{totalArrBags.toLocaleString()}</span>
            <span className="metric-sub">50kg bags</span>
          </div>

          <div className="metric-box success">
            <span className="metric-label">Total Clean EP</span>
            <span className="metric-value">{totalArrEP.toLocaleString()} kg</span>
            <span className="metric-sub">{(totalArrEP / 100).toFixed(1)} Quintals</span>
          </div>

          <div className="metric-box purple">
            <span className="metric-label">Total Purchase Billed Value</span>
            <span className="metric-value">₹{totalArrBilled.toLocaleString('en-IN')}</span>
            <span className="metric-sub">Billed Invoices</span>
          </div>
        </div>
      ) : (
        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="metric-box coffee">
            <span className="metric-label">Total Dispatched Weight</span>
            <span className="metric-value">{totalDispWeight.toLocaleString()} kg</span>
            <span className="metric-sub">{(totalDispWeight / 1000).toFixed(2)} Metric Tons</span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Total Bags</span>
            <span className="metric-value">{totalDispBags.toLocaleString()}</span>
            <span className="metric-sub">Dispatched bags</span>
          </div>

          <div className="metric-box success">
            <span className="metric-label">Total Sales Invoice Value</span>
            <span className="metric-value">₹{totalDispBilled.toLocaleString('en-IN')}</span>
            <span className="metric-sub">Sales Dispatches</span>
          </div>
        </div>
      )}

      {/* Report Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ maxHeight: '450px', overflowY: 'auto' }}>
          <table>
            <thead>
              {reportType === 'arrivals' ? (
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
                  <th className="num">Rate (₹)</th>
                  <th>Bill Type</th>
                  <th className="num">Net Bill (₹)</th>
                </tr>
              ) : (
                <tr>
                  <th>Dispatch #</th>
                  <th>Date</th>
                  <th>Party Name</th>
                  <th>Category</th>
                  <th>Product</th>
                  <th>Vehicle</th>
                  <th className="num">Weight (kg)</th>
                  <th className="num">Bags</th>
                  <th className="num">Sale Rate (₹)</th>
                  <th className="num">GST (₹)</th>
                  <th>Bill Type</th>
                  <th className="num">Net Amount (₹)</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Generating report...</td></tr>
              ) : reportType === 'arrivals' ? (
                arrivals.length === 0 ? (
                  <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>No arrivals match criteria.</td></tr>
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
                        <span className={`badge ${a.billType === 'cash_bill' ? 'badge-gray' : 'badge-green'}`}>
                          {a.billType === 'cash_bill' ? 'Cash Purchase' : 'GST Bill'}
                        </span>
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: '#059669' }}>
                        {a.status === 'storage' ? '-' : `₹${(a.netAmount || a.billAmount).toLocaleString('en-IN')}`}
                      </td>
                    </tr>
                  ))
                )
              ) : (
                dispatches.length === 0 ? (
                  <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>No dispatches match criteria.</td></tr>
                ) : (
                  dispatches.map(d => {
                    const gst = (Number(d.cgstAmount) || 0) + (Number(d.sgstAmount) || 0) + (Number(d.igstAmount) || 0);
                    return (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600 }}>{d.dispatchNo}</td>
                        <td>{d.date}</td>
                        <td style={{ fontWeight: 500 }}>{d.supplierName}</td>
                        <td>{d.dispatchType === 'husk' ? '🌾 Husk' : '☕ Coffee'}</td>
                        <td>{d.product}</td>
                        <td>{d.vehicleNo || '-'}</td>
                        <td className="num">{d.weight.toLocaleString()}</td>
                        <td className="num">{d.bags}</td>
                        <td className="num">₹{d.rate}</td>
                        <td className="num">₹{gst.toLocaleString()}</td>
                        <td>
                          <span className={`badge ${d.billType === 'cash_bill' ? 'badge-gray' : 'badge-blue'}`}>
                            {d.billType === 'cash_bill' ? 'Cash Sale' : 'GST Bill'}
                          </span>
                        </td>
                        <td className="num" style={{ fontWeight: 700, color: '#059669' }}>
                          ₹{(d.netAmount || d.billAmount).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
