import React, { useState, useEffect } from 'react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import SearchableProductSelect from './SearchableProductSelect';
import { X, ArrowRightLeft, AlertCircle, Save, Check } from 'lucide-react';

export default function EPTransferModal({
  isOpen,
  onClose,
  onSaved,
  onOpenNewSupplier
}) {
  const [suppliers, setSuppliers] = useState([]);
  const [fromPartyId, setFromPartyId] = useState('');
  const [toPartyId, setToPartyId] = useState('');
  
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [product, setProduct] = useState('');
  const [dbProducts, setDbProducts] = useState([]);
  const [bags, setBags] = useState('');
  const [weight, setWeight] = useState('');
  const [endProductWeight, setEndProductWeight] = useState('');
  const [rate, setRate] = useState('0');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [transferType, setTransferType] = useState('store_in'); // 'store_in' or 'store_out'
  const [availableEP, setAvailableEP] = useState(null);
  const [checkingStock, setCheckingStock] = useState(false);

  useEffect(() => {
    if (isOpen) {
      dbAction('suppliers:get').then(sups => setSuppliers(sups || [])).catch(() => {});
      dbAction('products:get').then(prods => {
        setDbProducts(prods || []);
        if (prods && prods.length > 0 && !product) {
          setProduct(prods[0].name);
        }
      }).catch(() => {});
      setError('');
    }
  }, [isOpen]);

  // Live Check of Source Party Available Stock
  useEffect(() => {
    if (fromPartyId && product) {
      setCheckingStock(true);
      dbAction('suppliers:get-one', { id: fromPartyId }).then(res => {
        if (!res) {
          setAvailableEP(0);
          return;
        }
        const s = res.summary || {};
        if (transferType === 'store_in') {
          const openEP = Number(s.openingStorageEP) || 0;
          const arrEP = (res.arrivals || [])
            .filter(a => a.product === product && (a.status === 'storage' || a.status === 'partial_settled'))
            .reduce((sum, a) => sum + (a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : Number(a.endProductWeight || 0)), 0);
          setAvailableEP(openEP + arrEP);
        } else {
          const dispEP = (res.dispatches || [])
            .filter(d => d.product === product && (d.status === 'storage_out' || d.rateType === 'storage_out'))
            .reduce((sum, d) => sum + Number(d.endProductWeight || d.weight || 0), 0);
          setAvailableEP(dispEP);
        }
      }).catch(() => setAvailableEP(0)).finally(() => setCheckingStock(false));
    } else {
      setAvailableEP(null);
    }
  }, [fromPartyId, product, transferType]);

  const handleBagsChange = (val) => {
    setBags(val);
    const b = parseFloat(val);
    if (!isNaN(b) && b > 0) {
      if (!weight) setWeight(String(b * 50));
      if (!endProductWeight) setEndProductWeight(String(b * 50));
    }
  };

  const handleWeightChange = (val) => {
    setWeight(val);
    const w = parseFloat(val);
    if (!isNaN(w) && w > 0 && !endProductWeight) {
      setEndProductWeight(String(w));
    }
  };

  const numBags = parseFloat(bags) || 0;
  const numWeight = parseFloat(weight) || 0;
  const numEP = parseFloat(endProductWeight) || numWeight;
  const numRate = parseFloat(rate) || 0;
  const transferValue = Math.round((numEP * numRate) * 100) / 100;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!fromPartyId || !toPartyId) {
      setError('Please select both source and destination parties.');
      return;
    }
    if (fromPartyId === toPartyId) {
      setError('Source party and destination party must be different.');
      return;
    }
    if (numEP <= 0) {
      setError('Please enter a valid transfer quantity or EP weight.');
      return;
    }
    if (availableEP !== null && numEP > availableEP + 0.001) {
      const fromPartyName = suppliers.find(s => s.id === fromPartyId)?.name || 'Source Party';
      const msg = `Transfer Cancelled: Source party '${fromPartyName}' only has ${availableEP.toLocaleString()} kg EP of '${product}' available in ${transferType === 'store_in' ? 'Store-In' : 'Store-Out'} storage. Requested ${numEP.toLocaleString()} kg EP exceeds available balance.`;
      alert(msg);
      setError(msg);
      return;
    }

    setIsSubmitting(true);
    try {
      await dbAction('ep-transfers:add', {
        fromPartyId,
        toPartyId,
        transferType,
        date,
        product,
        bags: numBags,
        weight: numWeight,
        endProductWeight: numEP,
        rate: numRate,
        notes
      });

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to execute EP stock transfer.');
      setError(err.message || 'Failed to execute EP stock transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const fromPartyObj = suppliers.find(s => s.id === fromPartyId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '780px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: '1.3rem' }}>🔄</span>
            <span>EP Commodity Stock Transfer Between Party Ledgers</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Transfer Quantity Type Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setTransferType('store_in')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: transferType === 'store_in' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: transferType === 'store_in' ? '#eff6ff' : '#fff',
                color: transferType === 'store_in' ? '#1d4ed8' : '#64748b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              📥 Transfer Store-In (Inward Storage Stock)
            </button>
            <button
              type="button"
              onClick={() => setTransferType('store_out')}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: transferType === 'store_out' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                background: transferType === 'store_out' ? '#eff6ff' : '#fff',
                color: transferType === 'store_out' ? '#1d4ed8' : '#64748b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              📤 Transfer Store-Out (Outward Storage Stock)
            </button>
          </div>

          {/* Party Selection Box */}
          <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" style={{ color: '#1e40af' }}>Source Party (Deduct EP Stock) *</label>
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  selectedSupplierId={fromPartyId}
                  onSelect={(sId) => setFromPartyId(sId)}
                  onOpenNewSupplier={onOpenNewSupplier}
                  label=""
                />
                {fromPartyId && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: checkingStock ? '#64748b' : (availableEP > 0 ? '#15803d' : '#dc2626') }}>
                    {checkingStock ? 'Checking stock availability...' : (
                      availableEP !== null ? (
                        `Available ${transferType === 'store_in' ? 'Store-In' : 'Store-Out'}: ${availableEP.toLocaleString()} kg EP for '${product}'`
                      ) : ''
                    )}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: '#1e40af' }}>Destination Party (Credit EP Stock & Billable Inward) *</label>
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  selectedSupplierId={toPartyId}
                  onSelect={(sId) => setToPartyId(sId)}
                  onOpenNewSupplier={onOpenNewSupplier}
                  label=""
                />
              </div>
            </div>
          </div>

          {/* Product / Commodity Selection & Quick Select Chips */}
          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label className="form-label">Commodity Product to Transfer *</label>
            {dbProducts && dbProducts.length > 0 && (
              <div className="product-chips" style={{ marginBottom: '0.4rem' }}>
                {dbProducts.slice(0, 6).map(p => (
                  <button
                    key={p.id || p.name}
                    type="button"
                    className={`product-chip ${product === p.name ? 'selected' : p.isMain ? 'main-highlight' : ''}`}
                    onClick={() => setProduct(p.name)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <SearchableProductSelect
              value={product}
              onChange={(code) => setProduct(code)}
              placeholder="Select commodity product to transfer..."
              category="all"
            />
          </div>

          {/* Transfer Quantities */}
          <div className="form-grid-3" style={{ marginTop: '0.5rem' }}>
            <div className="form-group">
              <label className="form-label">Transfer Date *</label>
              <input
                type="date"
                className="form-control"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Bags Count</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="No. of bags"
                value={bags}
                onChange={(e) => handleBagsChange(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Clean EP Weight (kg) *</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="End product EP weight"
                value={endProductWeight}
                onChange={(e) => setEndProductWeight(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Callout Summary Banner */}
          <div className="calc-callout">
            <div className="calc-item">
              <span className="calc-item-label">Transfer Bags</span>
              <span className="calc-item-val">{numBags} Bags</span>
            </div>
            <div className="calc-item">
              <span className="calc-item-label">Raw Weight</span>
              <span className="calc-item-val">{numWeight.toLocaleString()} kg</span>
            </div>
            <div className="calc-item" style={{ borderLeft: '2px solid #2563eb', paddingLeft: '0.75rem' }}>
              <span className="calc-item-label">Net EP Transferred</span>
              <span className="calc-item-val highlight">{numEP.toLocaleString()} kg</span>
            </div>
          </div>

          {/* Rate & Notes */}
          <div className="form-grid-2" style={{ marginTop: '0.5rem' }}>
            <div className="form-group">
              <label className="form-label">Agreed Transfer Valuation Rate (₹/kg optional)</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="₹ 0 if pure stock transfer"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <small style={{ color: '#64748b', fontSize: '0.75rem' }}>
                {transferValue > 0 ? `Posts financial value: ₹${transferValue.toLocaleString('en-IN')}` : 'Pure EP stock balance transfer (₹0 financial bill)'}
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Transfer Remarks / Notes</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. EP transferred to settle party commitment"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel (Esc)
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <Check size={16} /> {isSubmitting ? 'Transferring Stock...' : 'Execute EP Stock Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
