import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Plus, 
  Download, 
  ArrowUpDown, 
  FileText, 
  Phone, 
  MapPin, 
  Layers,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function SuppliersView({ onSelectSupplier, onAddArrivalForSupplier, dataVersion = 0, onDataChanged }) {
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('netPayable');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add Supplier Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [gst, setGst] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, [dataVersion]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const list = await dbAction('suppliers:get');
      setSuppliers(list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleAddSupplier = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await dbAction('suppliers:add', { name, phone, place, gst, notes });
      setShowAddModal(false);
      setName('');
      setPhone('');
      setPlace('');
      setGst('');
      setNotes('');
      await loadSuppliers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Failed to add supplier: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      { key: 'name', label: 'Supplier Name' },
      { key: 'place', label: 'Place' },
      { key: 'phone', label: 'Phone' },
      { key: 'totalRawWeight', label: 'Total Raw Wt (kg)' },
      { key: 'totalBags', label: 'Total Bags' },
      { key: 'totalEndProduct', label: 'Total EP (kg)' },
      { key: 'storageBags', label: 'Storage Bags' },
      { key: 'storageEndProduct', label: 'Storage EP (kg)' },
      { key: 'storageAvgOutturn', label: 'Storage Avg OT' },
      { key: 'totalBilledAmount', label: 'Total Billed (₹)' },
      { key: 'totalPaid', label: 'Total Paid (₹)' },
      { key: 'totalReceived', label: 'Total Received (₹)' },
      { key: 'totalTcsDeducted', label: 'TCS Deducted (₹)' },
      { key: 'netPayable', label: 'Net Payable (₹)' },
    ];

    exportToCsv('Suppliers_Summary_Accounts', headers, filteredSuppliers);
  };

  // Filter & Sort
  const filteredSuppliers = suppliers
    .filter(s => {
      const term = searchTerm.toLowerCase();
      return (
        s.name.toLowerCase().includes(term) ||
        (s.place && s.place.toLowerCase().includes(term)) ||
        (s.phone && s.phone.includes(term))
      );
    })
    .sort((a, b) => {
      let valA = a[sortField] || 0;
      let valB = b[sortField] || 0;
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

  // Totals across all suppliers
  const totalRawWeightAll = filteredSuppliers.reduce((sum, s) => sum + s.totalRawWeight, 0);
  const totalBagsAll = filteredSuppliers.reduce((sum, s) => sum + s.totalBags, 0);
  const totalEPAll = filteredSuppliers.reduce((sum, s) => sum + s.totalEndProduct, 0);
  const totalStorageBagsAll = filteredSuppliers.reduce((sum, s) => sum + s.storageBags, 0);
  const totalStorageEPAll = filteredSuppliers.reduce((sum, s) => sum + s.storageEndProduct, 0);
  const totalBilledAll = filteredSuppliers.reduce((sum, s) => sum + s.totalBilledAmount, 0);
  const totalPaidAll = filteredSuppliers.reduce((sum, s) => sum + s.totalPaid, 0);
  const totalReceivedAll = filteredSuppliers.reduce((sum, s) => sum + s.totalReceived, 0);
  const totalNetPayableAll = filteredSuppliers.reduce((sum, s) => sum + s.netPayable, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Controls Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <Users size={20} color="#2563eb" />
              <span>Supplier Accounts & Summary</span>
              <span className="badge badge-blue">{filteredSuppliers.length} Suppliers</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Track Total Raw Weight, End Product, Storage Coffee & Net Payable Balances
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2rem', width: '220px' }}
                placeholder="Search name, place..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn btn-secondary" onClick={handleExportCsv} title="Export to CSV (Alt+E)">
              <Download size={15} /> Export CSV
            </button>

            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Add Supplier (Alt+N)
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Supplier Name <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th>Place / Phone</th>
                <th className="num" onClick={() => handleSort('totalRawWeight')} style={{ cursor: 'pointer' }}>
                  Total Raw (kg) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" onClick={() => handleSort('totalBags')} style={{ cursor: 'pointer' }}>
                  Total Bags <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" onClick={() => handleSort('totalEndProduct')} style={{ cursor: 'pointer' }}>
                  Total EP (kg) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                  Storage Coffee (Bags & EP)
                </th>
                <th className="num" onClick={() => handleSort('totalBilledAmount')} style={{ cursor: 'pointer' }}>
                  Total Billed (₹) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" style={{ color: '#059669' }}>Paid (₹)</th>
                <th className="num" style={{ color: '#2563eb' }}>Recv (₹)</th>
                <th className="num" onClick={() => handleSort('netPayable')} style={{ cursor: 'pointer', background: '#fff1f2', color: '#dc2626' }}>
                  Net Payable (₹) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="11" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading suppliers...</td></tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No suppliers found matching your query.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(s => (
                  <tr 
                    key={s.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectSupplier(s.id)}
                  >
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{s.name}</span>
                        {s.storageBags > 0 && (
                          <span className="badge badge-coffee" title="Storage Coffee Available">
                            📦 {s.storageBags}b
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {s.place && <span>{s.place} </span>}
                      {s.phone && <span>({s.phone})</span>}
                    </td>
                    <td className="num">{s.totalRawWeight.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{s.totalBags}</td>
                    <td className="num" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {s.totalEndProduct.toLocaleString()}
                    </td>
                    <td className="num" style={{ background: s.storageBags > 0 ? '#faf5ff' : 'transparent' }}>
                      {s.storageBags > 0 ? (
                        <div style={{ color: '#7c3aed', fontWeight: 600 }}>
                          {s.storageBags} bags ({s.storageEndProduct.toLocaleString()} kg)
                          <div style={{ fontSize: '0.72rem', color: '#9333ea' }}>Avg OT: {s.storageAvgOutturn}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      ₹{s.totalBilledAmount.toLocaleString()}
                    </td>
                    <td className="num" style={{ color: '#059669', fontWeight: 500 }}>
                      ₹{s.totalPaid.toLocaleString()}
                    </td>
                    <td className="num" style={{ color: '#2563eb', fontWeight: 500 }}>
                      {s.totalReceived > 0 ? `₹${s.totalReceived.toLocaleString()}` : '-'}
                    </td>
                    <td className="num" style={{ background: '#fff1f2', fontWeight: 700, fontSize: '0.95rem', color: s.netPayable >= 0 ? '#dc2626' : '#059669' }}>
                      ₹{s.netPayable.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); onSelectSupplier(s.id); }}
                      >
                        Ledger <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredSuppliers.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                  <td colSpan="2">TOTAL ({filteredSuppliers.length} Suppliers)</td>
                  <td className="num">{totalRawWeightAll.toLocaleString()}</td>
                  <td className="num">{totalBagsAll}</td>
                  <td className="num">{totalEPAll.toLocaleString()}</td>
                  <td className="num" style={{ color: '#7c3aed' }}>
                    {totalStorageBagsAll} bags ({totalStorageEPAll.toLocaleString()} kg)
                  </td>
                  <td className="num">₹{totalBilledAll.toLocaleString()}</td>
                  <td className="num" style={{ color: '#059669' }}>₹{totalPaidAll.toLocaleString()}</td>
                  <td className="num" style={{ color: '#2563eb' }}>₹{totalReceivedAll.toLocaleString()}</td>
                  <td className="num" style={{ color: '#dc2626', fontSize: '1rem', background: '#ffe4e6' }}>
                    ₹{totalNetPayableAll.toLocaleString()}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Users size={18} />
                <span>Create New Supplier Account</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="modal-body">
              <div className="form-group">
                <label className="form-label">Supplier / Estate Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Kaveri Coffee Estate"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Phone / Mobile</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="9845012345"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Place / Location</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Chikmagalur / Coorg"
                    value={place}
                    onChange={e => setPlace(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">GST / PAN Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 29AAAAA0000A1Z5"
                  value={gst}
                  onChange={e => setGst(e.target.value.toUpperCase())}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder="Special instructions, broker info, bank details..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
