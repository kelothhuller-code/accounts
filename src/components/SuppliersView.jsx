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
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Edit2,
  Trash2,
  ShoppingBag,
  Truck
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function SuppliersView({ onSelectSupplier, onAddArrivalForSupplier, dataVersion = 0, onDataChanged, onOpenNewSupplier }) {
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [partyTypeFilter, setPartyTypeFilter] = useState('all'); // 'all', 'suppliers', 'buyers'
  const [sortField, setSortField] = useState('netPayable');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, partyTypeFilter]);

  // Add / Edit Supplier Modal
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [gst, setGst] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingBalanceType, setOpeningBalanceType] = useState('credit');
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

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setPlace('');
    setGst('');
    setOpeningBalance('0');
    setOpeningBalanceType('credit');
    setNotes('');
    setShowModal(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone || '');
    setPlace(s.place || '');
    setGst(s.gst || '');
    setOpeningBalance(String(s.openingBalance || 0));
    setOpeningBalanceType(s.openingBalanceType || 'credit');
    setNotes(s.notes || '');
    setShowModal(true);
  };

  const handleSaveSupplier = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        await dbAction('suppliers:update', {
          id: editingSupplier.id,
          data: { name, phone, place, gst, openingBalance: parseFloat(openingBalance) || 0, openingBalanceType, notes }
        });
      } else {
        await dbAction('suppliers:add', { name, phone, place, gst, openingBalance: parseFloat(openingBalance) || 0, openingBalanceType, notes });
      }
      setShowModal(false);
      setEditingSupplier(null);
      await loadSuppliers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Failed to save party: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (s) => {
    if (!window.confirm(`Delete party account "${s.name}"?\nWarning: Only accounts without active transactions can be deleted.`)) return;
    setDeletingId(s.id);
    try {
      await dbAction('suppliers:delete', { id: s.id });
      await loadSuppliers();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Cannot delete: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      { key: 'name', label: 'Party Name' },
      { key: 'place', label: 'Place' },
      { key: 'phone', label: 'Phone' },
      { key: 'gst', label: 'GSTIN' },
      { key: 'totalRawWeight', label: 'Total Raw Wt (kg)' },
      { key: 'totalBags', label: 'Total Bags' },
      { key: 'totalEndProduct', label: 'Total EP (kg)' },
      { key: 'storageBags', label: 'Storage Bags' },
      { key: 'storageEndProduct', label: 'Storage EP (kg)' },
      { key: 'totalPurchasesBilled', label: 'Total Billed Purchases (₹)' },
      { key: 'totalSalesBilled', label: 'Total Billed Sales (₹)' },
      { key: 'totalPaid', label: 'Total Paid (₹)' },
      { key: 'totalReceived', label: 'Total Received (₹)' },
      { key: 'netPayable', label: 'Net Financial Balance (₹)' },
    ];

    exportToCsv('Party_Master_Accounts_Summary', headers, filteredSuppliers);
  };

  // Filter & Sort
  const filteredSuppliers = suppliers
    .filter(s => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = s.name.toLowerCase().includes(term) ||
        (s.place && s.place.toLowerCase().includes(term)) ||
        (s.phone && s.phone.includes(term));

      if (!matchesSearch) return false;

      if (partyTypeFilter === 'suppliers') return s.totalPurchasesBilled > 0 || s.netPayable > 0 || (s.totalSalesBilled === 0 && s.totalPurchasesBilled === 0);
      if (partyTypeFilter === 'buyers') return s.totalSalesBilled > 0 || s.netPayable < 0 || (s.totalSalesBilled === 0 && s.totalPurchasesBilled === 0);

      return true;
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

  const totalPayableAll = filteredSuppliers.filter(s => s.netPayable > 0).reduce((sum, s) => sum + s.netPayable, 0);
  const totalReceivableAll = filteredSuppliers.filter(s => s.netPayable < 0).reduce((sum, s) => sum + Math.abs(s.netPayable), 0);
  const totalArrivalEPMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalArrivalEPMain !== undefined ? s.totalArrivalEPMain : Math.max(0, (s.totalEndProduct || 0) - (s.totalArrivalEPSecondary || 0))), 0);
  const totalArrivalEPSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalArrivalEPSecondary || 0), 0);
  const totalRawWeightMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalRawWeightMain !== undefined ? s.totalRawWeightMain : (s.totalRawWeight || 0)), 0);
  const totalRawWeightSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalRawWeightSecondary || 0), 0);
  const totalBagsMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalBagsMain !== undefined ? s.totalBagsMain : (s.totalBags || 0)), 0);
  const totalBagsSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalBagsSecondary || 0), 0);
  const totalDispatchEPMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalDispatchEP || 0), 0);
  const totalDispatchEPSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalDispatchEPSecondary || 0), 0);
  const totalStoreInEPMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.storeInEPMain !== undefined ? s.storeInEPMain : (s.storeInEP || 0)), 0);
  const totalStoreInEPSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalStoreInEPSecondary || 0), 0);
  const totalStoreOutEPMainAll = filteredSuppliers.reduce((sum, s) => sum + (s.storeOutEPMain !== undefined ? s.storeOutEPMain : (s.storeOutEP || 0)), 0);
  const totalStoreOutEPSecondaryAll = filteredSuppliers.reduce((sum, s) => sum + (s.totalStoreOutEPSecondary || 0), 0);

  // Pagination
  const totalPages = Math.ceil(filteredSuppliers.length / pageSize) || 1;
  const paginatedSuppliers = filteredSuppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const renderPaginationControls = (totalItems) => {
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(totalItems, currentPage * pageSize);

    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span>Showing <strong>{startItem}–{endItem}</strong> of <strong>{totalItems}</strong> accounts</span>
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
        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.45rem' }} disabled={currentPage === 1} onClick={() => setCurrentPage(1)} title="First Page">
            <ChevronsLeft size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.45rem' }} disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))} title="Previous Page">
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0 0.5rem', color: '#0f172a' }}>Page {currentPage} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.45rem' }} disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} title="Next Page">
            Next <ChevronRight size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.45rem' }} disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)} title="Last Page">
            <ChevronsRight size={14} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Controls Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <Users size={20} color="#2563eb" />
              <span>Party Accounts (Suppliers & Buyers Ledger)</span>
              <span className="badge badge-blue">{filteredSuppliers.length} Accounts</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Manage suppliers (sellers) and buyers (customers) with itemized ledger statements and storage stock tracking
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '2rem', width: '220px' }}
                placeholder="Search party, place, phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <button className="btn btn-secondary" onClick={handleExportCsv} title="Export to CSV (Alt+E)">
              <Download size={15} /> Export CSV
            </button>

            <button className="btn btn-primary" onClick={openNewSupplier}>
              <Plus size={16} /> + New Party Account (F9)
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            className={`btn btn-sm ${partyTypeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPartyTypeFilter('all')}
          >
            All Accounts ({suppliers.length})
          </button>
          <button
            className={`btn btn-sm ${partyTypeFilter === 'suppliers' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPartyTypeFilter('suppliers')}
          >
            🛒 Suppliers (Coffee Sellers)
          </button>
          <button
            className={`btn btn-sm ${partyTypeFilter === 'buyers' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPartyTypeFilter('buyers')}
          >
            📤 Buyers (Coffee & Husk Customers)
          </button>
        </div>
      </div>

      {/* Summary KPI Cards — Primary vs Secondary Separation */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {/* Card 1: Financial Balance */}
        <div className="metric-box danger" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <span className="metric-label">Financial Balance Overview</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>We Owe (Suppliers)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>₹{totalPayableAll.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>Owes Us (Buyers)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>₹{totalReceivableAll.toLocaleString('en-IN')}</div>
            </div>
          </div>
          <span className="metric-sub">Net Ledger Balances Across All Accounts</span>
        </div>

        {/* Card 2: 🌿 Primary / Main Products */}
        <div className="metric-box success" style={{ background: '#f0fdf4', borderColor: '#86efac', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label" style={{ color: '#166534', fontWeight: 800 }}>🌿 Primary / Main Products (All Parties)</span>
            <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Primary</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.78rem', color: '#166534' }}>
            <div>Inward Raw: <strong>{totalRawWeightMainAll.toLocaleString()} kg</strong> ({totalBagsMainAll} Bags)</div>
            <div>Inward EP: <strong>{totalArrivalEPMainAll.toLocaleString()} kg</strong> | Disp EP: <strong>{totalDispatchEPMainAll.toLocaleString()} kg</strong></div>
            <div>Storage (In / Out): <strong>{totalStoreInEPMainAll.toLocaleString()} kg</strong> / <strong>{totalStoreOutEPMainAll.toLocaleString()} kg</strong></div>
          </div>
        </div>

        {/* Card 3: 📦 Secondary Products */}
        <div className="metric-box" style={{ background: '#fffbeb', borderColor: '#fcd34d', borderLeftColor: '#d97706', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label" style={{ color: '#92400e', fontWeight: 800 }}>📦 Secondary Products (All Parties)</span>
            <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>Secondary</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.78rem', color: '#92400e' }}>
            <div>Inward Raw: <strong>{totalRawWeightSecondaryAll.toLocaleString()} kg</strong> ({totalBagsSecondaryAll} Bags)</div>
            <div>Inward EP: <strong>{totalArrivalEPSecondaryAll.toLocaleString()} kg</strong> | Disp EP: <strong>{totalDispatchEPSecondaryAll.toLocaleString()} kg</strong></div>
            <div>Storage (In / Out): <strong>{totalStoreInEPSecondaryAll.toLocaleString()} kg</strong> / <strong>{totalStoreOutEPSecondaryAll.toLocaleString()} kg</strong></div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                  Party Name <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th>Place / Phone / GST</th>
                <th className="num" onClick={() => handleSort('totalPurchasesBilled')} style={{ cursor: 'pointer' }}>
                  Purchases (₹) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" onClick={() => handleSort('totalSalesBilled')} style={{ cursor: 'pointer' }}>
                  Sales (₹) <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th className="num" style={{ background: '#faf5ff', color: '#7c3aed' }}>
                  EP Stock (Arrival, Dispatch, Store In/Out)
                </th>
                <th className="num" style={{ color: '#059669' }}>Paid (₹)</th>
                <th className="num" style={{ color: '#2563eb' }}>Received (₹)</th>
                <th className="num" onClick={() => handleSort('netPayable')} style={{ cursor: 'pointer', background: '#f8fafc' }}>
                  Financial Balance <ArrowUpDown size={12} style={{ display: 'inline' }} />
                </th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading accounts...</td></tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No party accounts found matching your query.
                  </td>
                </tr>
              ) : (
                paginatedSuppliers.map(s => (
                  <tr 
                    key={s.id} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectSupplier(s.id)}
                  >
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{s.name}</span>
                        {(s.storeInEP > 0 || s.storeOutEP > 0 || s.totalEndProduct > 0) && (
                          <span className="badge badge-coffee" title={`Arr EP: ${s.totalEndProduct || 0} kg | Store-In: ${s.storeInEP || 0} kg`}>
                            ☕ EP Account
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {s.place && <span>{s.place} </span>}
                      {s.phone && <span>({s.phone}) </span>}
                      {s.gst && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>GST: {s.gst}</div>}
                    </td>
                    <td className="num">₹{(s.totalPurchasesBilled || 0).toLocaleString('en-IN')}</td>
                    <td className="num" style={{ color: '#0284c7' }}>₹{(s.totalSalesBilled || 0).toLocaleString('en-IN')}</td>
                    <td className="num" style={{ background: (s.storeInEP > 0 || s.storeOutEP > 0 || s.totalEndProduct > 0 || s.totalDispatchEP > 0 || s.totalHuskWeight > 0) ? '#faf5ff' : 'transparent' }}>
                      {(s.storeInEP > 0 || s.storeOutEP > 0 || s.totalEndProduct > 0 || s.totalDispatchEP > 0 || s.totalHuskWeight > 0 || s.totalArrivalEPSecondary > 0) ? (
                        <div style={{ color: '#7c3aed', fontWeight: 600, fontSize: '0.78rem' }}>
                          <div style={{ fontSize: '0.73rem', color: '#166534', fontWeight: 700 }}>
                            🌿 Arr: {(s.totalArrivalEPMain || (s.totalEndProduct || 0) - (s.totalArrivalEPSecondary || 0)).toLocaleString()} kg | Disp: {(s.totalDispatchEP || 0).toLocaleString()} kg
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#6b21a8', fontWeight: 500 }}>
                            In: {(s.storeInEPMain || s.storeInEP || 0).toLocaleString()} kg | Out: {(s.storeOutEPMain || s.storeOutEP || 0).toLocaleString()} kg
                          </div>
                          {(s.totalArrivalEPSecondary > 0 || s.totalDispatchEPSecondary > 0 || s.totalStoreInEPSecondary > 0) && (
                            <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>
                              📦 Arr: {(s.totalArrivalEPSecondary || 0).toLocaleString()} kg | Disp: {(s.totalDispatchEPSecondary || 0).toLocaleString()} kg
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>

                    <td className="num" style={{ color: '#059669', fontWeight: 500 }}>
                      ₹{s.totalPaid.toLocaleString('en-IN')}
                    </td>
                    <td className="num" style={{ color: '#2563eb', fontWeight: 500 }}>
                      {s.totalReceived > 0 ? `₹${s.totalReceived.toLocaleString('en-IN')}` : '-'}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {s.netPayable > 0 ? (
                        <span style={{ color: '#dc2626' }}>
                          ₹{s.netPayable.toLocaleString('en-IN')} <small style={{ fontSize: '0.7rem' }}>(We Owe)</small>
                        </span>
                      ) : s.netPayable < 0 ? (
                        <span style={{ color: '#059669' }}>
                          ₹{Math.abs(s.netPayable).toLocaleString('en-IN')} <small style={{ fontSize: '0.7rem' }}>(Owes Us)</small>
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>₹0 (Cleared)</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem' }}
                          onClick={() => onSelectSupplier(s.id)}
                          title="Open Ledger Statement"
                        >
                          <FileText size={13} /> Ledger
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => openEditSupplier(s)}
                          title="Edit Party Info"
                        >
                          <Edit2 size={14} color="#2563eb" />
                        </button>
                        <button
                          className="btn-icon"
                          disabled={deletingId === s.id}
                          onClick={() => handleDeleteSupplier(s)}
                          title="Delete Party"
                        >
                          <Trash2 size={14} color={deletingId === s.id ? '#94a3b8' : '#ef4444'} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {renderPaginationControls(filteredSuppliers.length)}
      </div>

      {/* New / Edit Supplier Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span>{editingSupplier ? '✏️' : '👤'}</span>
                <span>{editingSupplier ? `Edit Party — ${editingSupplier.name}` : 'Create Party Account (Supplier / Buyer)'}</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveSupplier} className="modal-body">
              <div className="form-group">
                <label className="form-label">Party / Firm Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Chikmagalur Estate Coffee Growers / Standard Traders"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 9845012345"
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

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">GSTIN / Tax ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="29ABCDE1234F1Z5"
                    value={gst}
                    onChange={e => setGst(e.target.value.toUpperCase())}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opening Balance (₹)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Opening ₹"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Opening Balance Type</label>
                <select
                  className="form-control"
                  value={openingBalanceType}
                  onChange={e => setOpeningBalanceType(e.target.value)}
                >
                  <option value="credit">Credit (We Owe Party ₹)</option>
                  <option value="debit">Debit (Party Owes Us ₹)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Notes / Credit Limits / Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Premium Arabica seller, credit period 15 days"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingSupplier ? 'Update Account' : 'Create Party Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
