import React, { useState, useEffect } from 'react';
import { Handshake, Plus, CheckCircle, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function CommitmentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0 }) {
  const [commitments, setCommitments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // New Commitment Modal
  const [showModal, setShowModal] = useState(false);
  const [supplierId, setSupplierId] = useState('');
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

  // Contextual shortcuts: Alt+C opens new commitment modal
  useEffect(() => { if (triggerNew > 0) setShowModal(true); }, [triggerNew]);

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

  const handleAddCommitment = async (e) => {
    if (e) e.preventDefault();
    if (!supplierId || !quantity || !rate) return;

    const sup = suppliers.find(s => s.id === supplierId);

    setSubmitting(true);
    try {
      await dbAction('commitments:add', {
        supplierId,
        supplierName: sup ? sup.name : 'Unknown',
        product,
        type,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        date,
        notes
      });
      setShowModal(false);
      setQuantity('');
      setRate('');
      setNotes('');
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error adding commitment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCommitment = async (c) => {
    if (c.fulfilledQty > 0) {
      alert(`Cannot delete ${c.commitmentNo} — it has ${c.fulfilledQty} ${c.type} already fulfilled. Delete the linked arrivals first.`);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Handshake size={20} color="#2563eb" />
              <span>Supplier Purchase Commitments (Contracts)</span>
              <span className="badge badge-blue">{commitments.length} Total</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Book purchase commitments (e.g. 500 bags @ ₹456 or 10 Ton EP @ ₹456). Arrivals auto-deduct quantity.
            </span>
          </div>

          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> + New Commitment (Alt+C)
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Commitment #</th>
                <th>Date</th>
                <th>Supplier Name</th>
                <th>Product</th>
                <th>Commitment Type</th>
                <th className="num">Total Quantity</th>
                <th className="num">Rate (₹)</th>
                <th className="num">Fulfilled Qty</th>
                <th className="num">Remaining Qty</th>
                <th>Fulfillment Progress</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading commitments...</td></tr>
              ) : commitments.length === 0 ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    No commitments found. Click <strong>+ New Commitment</strong> to create.
                  </td>
                </tr>
              ) : (
                commitments.map(c => {
                  const percent = c.quantity > 0 ? Math.min(100, Math.round((c.fulfilledQty / c.quantity) * 100)) : 0;
                  const unit = c.type === 'bags' ? 'Bags' : 'kg EP';

                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.commitmentNo}</td>
                      <td>{c.date}</td>
                      <td>
                        <span 
                          style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => onSelectSupplier && onSelectSupplier(c.supplierId)}
                        >
                          {c.supplierName}
                        </span>
                      </td>
                      <td><span className="badge badge-coffee">{c.product}</span></td>
                      <td>
                        <span className="badge badge-gray">
                          {c.type === 'bags' ? 'Bags @ Rate' : 'End Product (EP) @ Rate'}
                        </span>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        {c.quantity.toLocaleString()} {unit}
                      </td>
                      <td className="num" style={{ fontWeight: 700, color: '#0f172a' }}>
                        ₹{c.rate}/{c.type === 'bags' ? 'Bag' : 'kg'}
                      </td>
                      <td className="num" style={{ color: '#059669', fontWeight: 600 }}>
                        {c.fulfilledQty.toLocaleString()} {unit}
                      </td>
                      <td className="num" style={{ color: c.remainingQty > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
                        {c.remainingQty.toLocaleString()} {unit}
                      </td>
                      <td style={{ width: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${percent}%`, height: '100%', background: percent >= 100 ? '#10b981' : '#3b82f6' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', width: '32px' }}>{percent}%</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'fulfilled' ? 'badge-green' : 'badge-amber'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        <button
                          title="Delete Commitment"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: deletingId === c.id ? '#94a3b8' : '#dc2626', padding: '0.2rem' }}
                          disabled={deletingId === c.id}
                          onClick={() => handleDeleteCommitment(c)}
                        >
                          <Trash2 size={14} />
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

      {/* Add Commitment Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <Handshake size={18} />
                <span>Create Purchase Commitment</span>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCommitment} className="modal-body">
              <div className="form-group">
                <label className="form-label">Supplier *</label>
                <select
                  className="form-control"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.place ? `(${s.place})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">Coffee Product</label>
                  <select className="form-control" value={product} onChange={e => setProduct(e.target.value)}>
                    <option value="RC Raw">RC Raw</option>
                    <option value="RC EP">RC EP</option>
                    <option value="AC Raw">AC Raw</option>
                    <option value="RC A">RC A</option>
                    <option value="RC B">RC B</option>
                    <option value="RC AA">RC AA</option>
                    <option value="RC PB">RC PB</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Commitment Basis *</label>
                  <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
                    <option value="bags">Bags @ Rate (e.g. 500 bags @ 456)</option>
                    <option value="end_product">End Product (EP) kg @ Rate</option>
                  </select>
                </div>
              </div>

              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label className="form-label">
                    Total Quantity ({type === 'bags' ? 'Bags' : 'kg EP'}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder={type === 'bags' ? 'e.g. 500' : 'e.g. 10000'}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Agreed Rate (₹ per {type === 'bags' ? 'Bag' : 'kg EP'}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="e.g. 456"
                    value={rate}
                    onChange={e => setRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Date</label>
                <input type="date" className="form-control" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Notes / Contract Details</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Signed contract with estate broker"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Book Commitment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
