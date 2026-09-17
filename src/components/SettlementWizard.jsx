import React, { useState, useEffect } from 'react';
import { Layers, CheckSquare, Square, AlertCircle, Check, RefreshCw, Handshake } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SettlementWizard({ prefilledSupplierId = null, onSettled, dataVersion = 0 }) {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState(prefilledSupplierId || '');
  const [storageArrivals, setStorageArrivals] = useState([]);
  const [selectedArrivalIds, setSelectedArrivalIds] = useState([]);
  const [commitments, setCommitments] = useState([]);
  
  // Rate & Commitment mode
  const [rateMode, setRateMode] = useState('manual'); // 'manual' or 'commitment'
  const [selectedCommitmentId, setSelectedCommitmentId] = useState('');

  // Settlement calculation states
  const [settleBagsInput, setSettleBagsInput] = useState('');
  const [settleRate, setSettleRate] = useState('');
  const [rateUnit, setRateUnit] = useState('per_kg_ep'); // 'per_kg_ep' or 'per_bag'
  const [tcsRate, setTcsRate] = useState('0.1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, [dataVersion]);

  useEffect(() => {
    if (selectedSupplierId) {
      loadStorageArrivals(selectedSupplierId);
      loadSupplierCommitments(selectedSupplierId);
    } else {
      setStorageArrivals([]);
      setSelectedArrivalIds([]);
      setCommitments([]);
    }
  }, [selectedSupplierId, dataVersion]);

  const loadSuppliers = async () => {
    try {
      const list = await dbAction('suppliers:get');
      setSuppliers(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSupplierCommitments = async (supId) => {
    try {
      const list = await dbAction('commitments:get', { supplierId: supId });
      const active = (list || []).filter(c => c.status === 'active' && c.remainingQty > 0);
      setCommitments(active);
      if (active.length > 0 && rateMode === 'commitment') {
        applyCommitment(active[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const applyCommitment = (com) => {
    if (!com) return;
    setSelectedCommitmentId(com.id);
    setSettleRate(String(com.rate));
    setRateUnit(com.type === 'bags' ? 'per_bag' : 'per_kg_ep');
  };

  const handleCommitmentChange = (comId) => {
    setSelectedCommitmentId(comId);
    const com = commitments.find(c => c.id === comId);
    if (com) {
      applyCommitment(com);
    }
  };

  const loadStorageArrivals = async (supId) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const list = await dbAction('arrivals:get', { supplierId: supId });
      const pendingStorage = (list || []).filter(a => {
        const remBags = a.remainingBags !== undefined ? Number(a.remainingBags) : Number(a.bags);
        return (a.status === 'storage' || a.status === 'partial_settled') && remBags > 0;
      });
      setStorageArrivals(pendingStorage);
      const allIds = pendingStorage.map(a => a.id);
      setSelectedArrivalIds(allIds);
      updateTotalBags(allIds, pendingStorage);
    } catch (e) {
      setErrorMsg('Failed to load arrivals: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTotalBags = (ids, arrivalsList) => {
    const activeArrivals = (arrivalsList || storageArrivals).filter(a => ids.includes(a.id));
    const totalBags = activeArrivals.reduce((sum, a) => {
      const remBags = a.remainingBags !== undefined ? Number(a.remainingBags) : Number(a.bags);
      return sum + remBags;
    }, 0);
    setSettleBagsInput(String(Math.round(totalBags * 100) / 100));
  };

  const handleToggleArrival = (id) => {
    let newSelected;
    if (selectedArrivalIds.includes(id)) {
      newSelected = selectedArrivalIds.filter(x => x !== id);
    } else {
      newSelected = [...selectedArrivalIds, id];
    }
    setSelectedArrivalIds(newSelected);
    updateTotalBags(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedArrivalIds.length === storageArrivals.length) {
      setSelectedArrivalIds([]);
      setSettleBagsInput('0');
    } else {
      const allIds = storageArrivals.map(a => a.id);
      setSelectedArrivalIds(allIds);
      updateTotalBags(allIds);
    }
  };

  // Selected arrivals calculations
  const selectedArrivals = storageArrivals.filter(a => selectedArrivalIds.includes(a.id));

  let totalAvailBags = 0;
  let totalAvailWeight = 0;
  let totalAvailEndProduct = 0;

  selectedArrivals.forEach(arr => {
    const b = arr.remainingBags !== undefined ? Number(arr.remainingBags) : Number(arr.bags);
    const ep = arr.remainingEndProduct !== undefined ? Number(arr.remainingEndProduct) : Number(arr.endProductWeight);
    const w = arr.bags > 0 ? (b / arr.bags) * Number(arr.weight) : 0;

    totalAvailBags += b;
    totalAvailWeight += w;
    totalAvailEndProduct += ep;
  });

  // Calculate Average Outturn of the combined batch
  const averageOutturn = totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 0;
  const averageOutturnPercentage = totalAvailWeight > 0 ? (totalAvailEndProduct / totalAvailWeight) * 100 : 0;

  // Settle calculations based on user input bags (full 500 or partial 450)
  const bagsToSettle = Math.min(parseFloat(settleBagsInput) || 0, totalAvailBags);
  
  // Calculate equivalent end product to settle using average outturn!
  let settledEndProduct = 0;
  if (bagsToSettle >= totalAvailBags) {
    settledEndProduct = totalAvailEndProduct;
  } else {
    settledEndProduct = bagsToSettle * averageOutturn;
  }
  settledEndProduct = Math.round(settledEndProduct * 100) / 100;

  const numRate = parseFloat(settleRate) || 0;
  const numTcsRate = parseFloat(tcsRate) || 0;

  let grossSettlementAmount = 0;
  if (rateUnit === 'per_bag') {
    grossSettlementAmount = bagsToSettle * numRate;
  } else {
    grossSettlementAmount = settledEndProduct * numRate;
  }
  grossSettlementAmount = Math.round(grossSettlementAmount * 100) / 100;

  const tcsAmount = Math.round((grossSettlementAmount * (numTcsRate / 100)) * 100) / 100;
  const netSettlementAmount = Math.round((grossSettlementAmount - tcsAmount) * 100) / 100;

  const handleExecuteSettlement = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedSupplierId) {
      setErrorMsg('Please select a supplier');
      return;
    }
    if (selectedArrivalIds.length === 0) {
      setErrorMsg('Please select at least one storage arrival to settle');
      return;
    }
    if (bagsToSettle <= 0) {
      setErrorMsg('Please enter bags to settle');
      return;
    }
    if (numRate <= 0) {
      setErrorMsg('Please enter or select a valid settlement rate');
      return;
    }

    const supplier = suppliers.find(s => s.id === selectedSupplierId);

    setSubmitting(true);
    try {
      const res = await dbAction('settlements:settle', {
        supplierId: selectedSupplierId,
        supplierName: supplier ? supplier.name : 'Unknown',
        arrivalIds: selectedArrivalIds,
        commitmentId: rateMode === 'commitment' ? selectedCommitmentId : null,
        settleBags: bagsToSettle,
        settlementRate: numRate,
        rateUnit,
        tcsRate: numTcsRate,
        date,
        notes
      });

      setSuccessMsg(`Settlement ${res.settlementNo} executed successfully for ₹${res.settlementNetAmount.toLocaleString()}!`);
      // Reload remaining storage arrivals and commitments
      await loadStorageArrivals(selectedSupplierId);
      await loadSupplierCommitments(selectedSupplierId);
      if (onSettled) onSettled();
    } catch (err) {
      setErrorMsg(err.message || 'Settlement failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Layers size={20} color="#92400e" />
            <span>Storage Coffee Settlement Wizard</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Batch Settle Multiple Arrivals with Combined Average Outturn or Against Commitments
          </span>
        </div>

        {/* Step 1: Select Supplier */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Select Supplier with Storage Coffee</label>
            <select
              className="form-control"
              value={selectedSupplierId}
              onChange={e => setSelectedSupplierId(e.target.value)}
            >
              <option value="">-- Choose Supplier --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.place ? `(${s.place})` : ''} - [Storage: {s.storageBags} Bags / {s.storageEndProduct} kg EP]
                </option>
              ))}
            </select>
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              if (selectedSupplierId) {
                loadStorageArrivals(selectedSupplierId);
                loadSupplierCommitments(selectedSupplierId);
              }
            }}
            disabled={!selectedSupplierId || loading}
          >
            <RefreshCw size={15} /> Refresh Storage
          </button>
        </div>

        {errorMsg && (
          <div style={{ marginTop: '1rem', background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div style={{ marginTop: '1rem', background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {selectedSupplierId && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.25rem' }}>
          {/* Left Column: Storage Arrivals List */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <span>Unsettled Storage Arrivals</span>
                <span className="badge badge-coffee">{storageArrivals.length} Available</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                disabled={storageArrivals.length === 0}
              >
                {selectedArrivalIds.length === storageArrivals.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading storage arrivals...</div>
            ) : storageArrivals.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                No unsettled storage coffee found for this supplier.
                <br />
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Arrivals saved with "Save as Storage" will show up here.
                </span>
              </div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Select</th>
                      <th>Date</th>
                      <th>Arrival #</th>
                      <th>Product</th>
                      <th className="num">Rem. Bags</th>
                      <th className="num">Rem. EP (kg)</th>
                      <th className="num">Outturn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageArrivals.map(arr => {
                      const isSelected = selectedArrivalIds.includes(arr.id);
                      const remBags = arr.remainingBags !== undefined ? arr.remainingBags : arr.bags;
                      const remEP = arr.remainingEndProduct !== undefined ? arr.remainingEndProduct : arr.endProductWeight;

                      return (
                        <tr 
                          key={arr.id} 
                          style={{ cursor: 'pointer', background: isSelected ? '#fffbeb' : 'transparent' }}
                          onClick={() => handleToggleArrival(arr.id)}
                        >
                          <td style={{ textAlign: 'center' }}>
                            {isSelected ? <CheckSquare size={16} color="#d97706" /> : <Square size={16} color="#94a3b8" />}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{arr.date}</td>
                          <td style={{ fontWeight: 600 }}>{arr.arrivalNo}</td>
                          <td>
                            <span className="badge badge-coffee">{arr.product}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>{remBags}</td>
                          <td className="num" style={{ fontFamily: 'var(--font-mono)' }}>{remEP.toLocaleString()}</td>
                          <td className="num">
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              {arr.outturn} {arr.outturnType === 'percentage' ? '%' : 'kg/50k'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Column: Combined Average Outturn & Settlement Execution */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <span>Average Outturn & Settle Calculation</span>
              </div>
              <span className="badge badge-blue">{selectedArrivalIds.length} Selected</span>
            </div>

            {selectedArrivalIds.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Please select one or more storage arrivals to view combined average outturn.
              </div>
            ) : (
              <form onSubmit={handleExecuteSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Combined Average Outturn Banner */}
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>
                    Combined Batch Outturn (Across {selectedArrivals.length} Arrivals)
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.35rem' }}>
                    <div>
                      <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#78350f', fontFamily: 'var(--font-mono)' }}>
                        {averageOutturn.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: '#92400e', marginLeft: '0.25rem' }}>kg per 50kg bag</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#78350f' }}>
                        {averageOutturnPercentage.toFixed(2)}%
                      </span>
                      <div style={{ fontSize: '0.72rem', color: '#92400e' }}>Yield Percentage</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #fcd34d', paddingTop: '0.35rem' }}>
                    <span>Total Selected: {totalAvailBags} Bags</span>
                    <span>Total EP: {totalAvailEndProduct.toLocaleString()} kg</span>
                  </div>
                </div>

                {/* Settle Bags Input (Full or Partial) */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <label className="form-label">Bags to Settle Now *</label>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      Max: {totalAvailBags} Bags
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    max={totalAvailBags}
                    className="form-control num-input"
                    value={settleBagsInput}
                    onChange={e => setSettleBagsInput(e.target.value)}
                    required
                  />
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.2rem' }}>
                    {bagsToSettle < totalAvailBags ? (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>
                        ⚠️ Partial Settlement: {bagsToSettle} bags settled. {(totalAvailBags - bagsToSettle).toFixed(1)} bags will remain in storage!
                      </span>
                    ) : (
                      <span>Full Settlement of all selected arrivals ({bagsToSettle} bags).</span>
                    )}
                  </div>
                </div>

                {/* Resulting Equivalent End Product */}
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Equivalent End Product (EP)
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                      {settledEndProduct.toLocaleString()} kg
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b' }}>
                    <div>{(settledEndProduct / 100).toFixed(2)} Quintals</div>
                    <div>Calculation: {bagsToSettle} bags × {averageOutturn.toFixed(2)} OT</div>
                  </div>
                </div>

                {/* Rate Option: Manual Rate vs Settle against Supplier Commitment */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="rateMode"
                        checked={rateMode === 'manual'}
                        onChange={() => setRateMode('manual')}
                      />
                      Fix Agreed Rate Manually
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: commitments.length > 0 ? '#2563eb' : '#94a3b8' }}>
                      <input
                        type="radio"
                        name="rateMode"
                        checked={rateMode === 'commitment'}
                        onChange={() => {
                          setRateMode('commitment');
                          if (commitments.length > 0) {
                            applyCommitment(commitments[0]);
                          }
                        }}
                        disabled={commitments.length === 0}
                      />
                      <Handshake size={14} style={{ display: 'inline' }} />
                      Settle Against Commitment ({commitments.length} Active)
                    </label>
                  </div>

                  {rateMode === 'commitment' && (
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Select Commitment Contract *</label>
                      {commitments.length === 0 ? (
                        <div style={{ color: '#dc2626', fontSize: '0.8rem' }}>
                          No active commitments found for this supplier.
                        </div>
                      ) : (
                        <select
                          className="form-control"
                          value={selectedCommitmentId}
                          onChange={e => handleCommitmentChange(e.target.value)}
                        >
                          {commitments.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.commitmentNo} - {c.product} ({c.remainingQty} {c.type === 'bags' ? 'Bags' : 'kg EP'} remaining @ ₹{c.rate}/{c.type === 'bags' ? 'Bag' : 'kg'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Rate & Unit Inputs */}
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">Rate Basis</label>
                      <select
                        className="form-control"
                        value={rateUnit}
                        onChange={e => setRateUnit(e.target.value)}
                        disabled={rateMode === 'commitment'}
                      >
                        <option value="per_kg_ep">Rate per Kg EP (Standard)</option>
                        <option value="per_bag">Rate per Bag (50kg)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Settlement Rate (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder={rateUnit === 'per_bag' ? '₹ per bag' : '₹ per kg EP'}
                        value={settleRate}
                        onChange={e => setSettleRate(e.target.value)}
                        required
                        disabled={rateMode === 'commitment'}
                      />
                    </div>
                  </div>
                </div>

                {/* TCS & Date */}
                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">TCS Deduction (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control num-input"
                      value={tcsRate}
                      onChange={e => setTcsRate(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Settlement Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Bill Amounts Summary */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>Gross Settlement:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{grossSettlementAmount.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>TCS Deduction ({numTcsRate}%):</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#dc2626' }}>- ₹{tcsAmount.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '0.5rem', fontSize: '1.05rem' }}>
                    <span style={{ fontWeight: 600 }}>Net Bill Amount:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#059669' }}>₹{netSettlementAmount.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Settlement Notes</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Settle 450 bags at average OT 26.4 against contract"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
                  disabled={submitting}
                >
                  <Check size={18} /> {submitting ? 'Processing Settlement...' : `Confirm & Bill Settlement (₹${netSettlementAmount.toLocaleString()})`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
