import React, { useState, useEffect } from 'react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import { X, Handshake, AlertCircle, Save, Scale } from 'lucide-react';

export default function CommitmentWashModal({
  isOpen,
  onClose,
  onSaved,
  onOpenNewSupplier
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');

  const [purchaseCommitments, setPurchaseCommitments] = useState([]);
  const [saleCommitments, setSaleCommitments] = useState([]);

  const [purchaseCommitmentId, setPurchaseCommitmentId] = useState('');
  const [saleCommitmentId, setSaleCommitmentId] = useState('');

  const [quantityToWash, setQuantityToWash] = useState('');
  const [purchaseRate, setPurchaseRate] = useState('');
  const [saleRate, setSaleRate] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      dbAction('suppliers:get').then(sups => setSuppliers(sups || [])).catch(() => {});
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (supplierId) {
      dbAction('commitments:get', { supplierId }).then(comms => {
        const list = comms || [];
        setPurchaseCommitments(list.filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active'));
        setSaleCommitments(list.filter(c => c.category === 'sale' && c.status === 'active'));
      }).catch(() => {});
    } else {
      setPurchaseCommitments([]);
      setSaleCommitments([]);
    }
  }, [supplierId]);

  const handlePurchaseSelect = (id) => {
    setPurchaseCommitmentId(id);
    const sel = purchaseCommitments.find(c => c.id === id);
    if (sel) {
      setPurchaseRate(String(sel.rate));
      if (!quantityToWash) setQuantityToWash(String(sel.remainingQty));
    }
  };

  const handleSaleSelect = (id) => {
    setSaleCommitmentId(id);
    const sel = saleCommitments.find(c => c.id === id);
    if (sel) {
      setSaleRate(String(sel.rate));
    }
  };

  // Calculation of Rate Difference and Adjustment Amount
  const numQty = parseFloat(quantityToWash) || 0;
  const numPRate = parseFloat(purchaseRate) || 0;
  const numSRate = parseFloat(saleRate) || 0;
  const rateDiff = Math.round((numSRate - numPRate) * 100) / 100;
  const calcAdjustment = Math.round((numQty * rateDiff) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supplierId) {
      setError('Please select a party.');
      return;
    }
    if (!purchaseCommitmentId || !saleCommitmentId) {
      setError('Please select both a Purchase Commitment and a Sale Commitment to wash.');
      return;
    }
    if (numQty <= 0) {
      setError('Please enter a valid quantity to wash.');
      return;
    }

    setIsSubmitting(true);
    try {
      await dbAction('commitments:wash', {
        supplierId,
        supplierName,
        purchaseCommitmentId,
        saleCommitmentId,
        quantityToWash: numQty,
        purchaseRate: numPRate,
        saleRate: numSRate,
        notes
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to wash commitments.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content modal-lg" style={{ maxWidth: '750px' }}>
        <div className="modal-header" style={{ background: '#7c3aed' }}>
          <div className="modal-title-group">
            <h3><Handshake size={20} /> Settle / Wash Purchase vs Sale Commitment</h3>
            <p className="modal-subtitle">Manually wash opposite commitments for a party and record rate differential</p>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <SearchableSupplierSelect
              suppliers={suppliers}
              selectedSupplierId={supplierId}
              onSelect={(id, name) => { setSupplierId(id); setSupplierName(name); setPurchaseCommitmentId(''); setSaleCommitmentId(''); }}
              onOpenNewSupplier={onOpenNewSupplier}
              label="Select Party / Contract Counterparty *"
            />
          </div>

          {supplierId && (
            <>
              <div className="form-grid-2" style={{ padding: '1rem', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                {/* Select Purchase Commitment */}
                <div className="form-group">
                  <label className="form-label">Active Purchase Commitment *</label>
                  <select
                    className="form-control"
                    value={purchaseCommitmentId}
                    onChange={(e) => handlePurchaseSelect(e.target.value)}
                    required
                  >
                    <option value="">-- Select Purchase Contract --</option>
                    {purchaseCommitments.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.commitmentNo} ({c.remainingQty} {c.type} @ ₹{c.rate})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Sale Commitment */}
                <div className="form-group">
                  <label className="form-label">Active Sale Commitment *</label>
                  <select
                    className="form-control"
                    value={saleCommitmentId}
                    onChange={(e) => handleSaleSelect(e.target.value)}
                    required
                  >
                    <option value="">-- Select Sale Contract --</option>
                    {saleCommitments.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.commitmentNo} ({c.remainingQty} {c.type} @ ₹{c.rate})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid-3" style={{ marginTop: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label">Quantity to Wash / Settle *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Bags or EP Weight"
                    value={quantityToWash}
                    onChange={(e) => setQuantityToWash(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Purchase Rate (₹/unit)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={purchaseRate}
                    onChange={(e) => setPurchaseRate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Sale Rate (₹/unit)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={saleRate}
                    onChange={(e) => setSaleRate(e.target.value)}
                  />
                </div>
              </div>

              {/* Rate Difference & Ledger Adjustment Calculation */}
              <div style={{
                marginTop: '1.25rem',
                padding: '1rem',
                background: '#0f172a',
                color: '#ffffff',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Rate Difference (Sale Rate - Purchase Rate)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, color: rateDiff >= 0 ? '#4ade80' : '#f87171' }}>
                    {rateDiff >= 0 ? `+ ₹${rateDiff}/unit (Gain)` : `- ₹${Math.abs(rateDiff)}/unit (Loss)`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Net Ledger Settlement Adjustment</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: calcAdjustment >= 0 ? '#38bdf8' : '#fbbf24' }}>
                    ₹{calcAdjustment.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Notes / Settlement Reason</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Mutual cancellation against opposite contract"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="modal-footer" style={{ marginTop: '1.5rem', padding: '1rem 0 0 0' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-purple" style={{ background: '#7c3aed', color: '#fff' }} disabled={isSubmitting || !supplierId}>
              <Save size={16} /> {isSubmitting ? 'Washing...' : 'Wash & Adjust Commitments'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
