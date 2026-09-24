import React, { useState, useEffect } from 'react';
import { Handshake, Plus, CheckCircle, Clock, AlertCircle, Trash2, Edit2, UserPlus, Scale } from 'lucide-react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import CommitmentWashModal from './CommitmentWashModal';

export default function CommitmentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0, onOpenNewSupplier }) {
  const [commitments, setCommitments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const [activeTabFilter, setActiveTabFilter] = useState('all'); // 'all', 'purchase', 'sale', 'washed'
  const [showWashModal, setShowWashModal] = useState(false);

  // Commitment Modal (New / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState(null);
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('purchase'); // 'purchase' or 'sale'
  const [product, setProduct] = useState('RC Raw');
  const [type, setType] = useState('bags'); // 'bags' or 'end_product'
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [dataVersion]);

  useEffect(() => { 
    if (triggerNew > 0) {
      openNewCommitment();
    }
  }, [triggerNew]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [comms, sups] = await Promise.all([
        dbAction('commitments:get'),
        dbAction('suppliers:get')
      ]);
      setCommitments(comms || []);
      setSuppliers(sups || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openNewCommitment = (cat = 'purchase') => {
    setEditingCommitment(null);
    setSupplierId('');
    setCategory(cat);
    setProduct('RC Raw');
    setType('bags');
    setQuantity('');
    setRate('');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowModal(true);
  };

  const openEditCommitment = (c) => {
    setEditingCommitment(c);
    setSupplierId(c.supplierId);
    setCategory(c.category || 'purchase');
    setProduct(c.product);
    setType(c.type || 'bags');
    setQuantity(String(c.quantity));
    setRate(String(c.rate));
    setDate(c.date || new Date().toISOString().split('T')[0]);
    setNotes(c.notes || '');
    setShowModal(true);
  };

  const handleSaveCommitment = async (e) => {
    if (e) e.preventDefault();
    if (!supplierId || !quantity || !rate) return;

    const sup = suppliers.find(s => s.id === supplierId);

    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        supplierName: sup ? sup.name : 'Unknown',
        category,
        product,
        type,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        date,
        notes
      };

      if (editingCommitment) {
        await dbAction('commitments:update', { id: editingCommitment.id, data: payload });
      } else {
        await dbAction('commitments:add', payload);
      }

      setShowModal(false);
      setEditingCommitment(null);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error saving commitment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCommitment = async (c) => {
    if (c.fulfilledQty > 0) {
      alert(`Cannot delete ${c.commitmentNo} — it has ${c.fulfilledQty} ${c.type} already fulfilled.`);
      return;
    }
    if (!window.confirm(`Delete commitment ${c.commitmentNo} for ${c.supplierName}?`)) return;
    setDeletingId(c.id);
    try {
      await dbAction('commitments:delete', { id: c.id });
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredCommitments = commitments.filter(c => {
    if (activeTabFilter === 'purchase') return (c.category === 'purchase' || !c.category);
    if (activeTabFilter === 'sale') return c.category === 'sale';
    if (activeTabFilter === 'washed') return c.status === 'washed';
    return true;
  });

  const activePurchaseCount = commitments.filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active').length;
  const activeSaleCount = commitments.filter(c => c.category === 'sale' && c.status === 'active').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Handshake size={20} color="#2563eb" />
              <span>Purchase & Sale Commitments (Contracts)</span>
              <span className="badge badge-blue">{commitments.length} Total</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Book purchase & sales commitments. Settle opposite commitments manually using the Wash wizard.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn btn-purple" 
              style={{ background: '#7c3aed', color: '#fff' }}
              onClick={() => setShowWashModal(true)}
            >
              <Scale size={16} /> Wash / Settle Commitments
            </button>
            <button className="btn btn-primary" onClick={() => openNewCommitment('purchase')}>
              <Plus size={16} /> + Purchase Contract
            </button>
            <button className="btn btn-coffee" onClick={() => openNewCommitment('sale')}>
              <Plus size={16} /> + Sale Contract
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.5rem', borderRadius: '8px' }}>
        <button
          className={`btn btn-sm ${activeTabFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTabFilter('all')}
        >
          All Contracts ({commitments.length})
        </button>
        <button
          className={`btn btn-sm ${activeTabFilter === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTabFilter('purchase')}
        >
          🛒 Purchase Commitments ({activePurchaseCount} Active)
        </button>
        <button
          className={`btn btn-sm ${activeTabFilter === 'sale' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTabFilter('sale')}
        >
          📤 Sales Commitments ({activeSaleCount} Active)
        </button>
        <button
          className={`btn btn-sm ${activeTabFilter === 'washed' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTabFilter('washed')}
        >
          🧼 Washed Contracts ({commitments.filter(c => c.status === 'washed').length})
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract No</th>
                <th>Category</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>Product</th>
                <th>Type</th>
                <th>Total Qty</th>
                <th>Fulfilled</th>
                <th>Remaining</th>
                <th>Agreed Rate</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '2rem' }}>Loading commitments...</td></tr>
              ) : filteredCommitments.length === 0 ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commitments found.</td></tr>
              ) : (
                filteredCommitments.map(c => {
                  const isSale = c.category === 'sale';
                  return (
                    <tr key={c.id}>
                      <td><strong className="code-badge">{c.commitmentNo}</strong></td>
                      <td>
                        {isSale ? (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e' }}>📤 Sale</span>
                        ) : (
                          <span className="badge badge-info">🛒 Purchase</span>
                        )}
                      </td>
                      <td>{c.date || '-'}</td>
                      <td>
                        <a
                          href="#ledger"
                          style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                          onClick={(e) => { e.preventDefault(); onSelectSupplier(c.supplierId); }}
                        >
                          {c.supplierName}
                        </a>
                      </td>
                      <td><strong>{c.product}</strong></td>
                      <td>{c.type === 'bags' ? '50kg Bags' : 'Kg Clean EP'}</td>
                      <td><strong>{c.quantity}</strong></td>
                      <td style={{ color: '#059669' }}>{c.fulfilledQty || 0}</td>
                      <td style={{ color: c.remainingQty > 0 ? '#dc2626' : '#64748b', fontWeight: 600 }}>
                        {c.remainingQty}
                      </td>
                      <td><strong>₹{c.rate} / {c.type === 'bags' ? 'Bag' : 'Kg'}</strong></td>
                      <td>
                        {c.status === 'fulfilled' ? (
                          <span className="badge badge-success"><CheckCircle size={12} /> Fulfilled</span>
                        ) : c.status === 'washed' ? (
                          <span className="badge badge-purple" style={{ background: '#f3e8ff', color: '#6b21a8' }}>🧼 Washed</span>
                        ) : (
                          <span className="badge badge-warning"><Clock size={12} /> Active</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon" title="Edit" onClick={() => openEditCommitment(c)}>
                          <Edit2 size={15} color="#2563eb" />
                        </button>
                        <button className="btn-icon" title="Delete" onClick={() => handleDeleteCommitment(c)} disabled={deletingId === c.id}>
                          <Trash2 size={15} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Edit Commitment Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>{editingCommitment ? '✏️ Edit Commitment' : '🤝 Book New Commitment'}</h3>
                <p className="modal-subtitle">Contractual agreement for coffee purchase or sale</p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveCommitment} className="modal-body">
              <div className="form-group">
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  selectedSupplierId={supplierId}
                  onSelect={(id, name) => setSupplierId(id)}
                  onOpenNewSupplier={onOpenNewSupplier}
                  label="Party Name *"
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Contract Category</label>
                  <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="purchase">🛒 Purchase Commitment</option>
                    <option value="sale">📤 Sales Commitment</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Product *</label>
                  <select className="form-control" value={product} onChange={(e) => setProduct(e.target.value)}>
                    <option value="RC Raw">RC Raw</option>
                    <option value="RC EP">RC EP</option>
                    <option value="AC Raw">AC Raw</option>
                    <option value="prod_husk">Coffee Husk</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-3" style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Unit Type</label>
                  <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="bags">50kg Bags</option>
                    <option value="end_product">Kg EP</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Total qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Contract Rate (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Rate"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Contract terms / delivery window"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '1.25rem', padding: '1rem 0 0 0' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Commitment Wash Modal */}
      <CommitmentWashModal
        isOpen={showWashModal}
        onClose={() => setShowWashModal(false)}
        onSaved={loadData}
        onOpenNewSupplier={onOpenNewSupplier}
      />
    </div>
  );
}
