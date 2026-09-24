import React, { useState, useEffect } from 'react';
import { Layers, CheckSquare, Square, AlertCircle, Check, RefreshCw, Handshake, PackageCheck, Truck } from 'lucide-react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';

export default function SettlementWizard({ prefilledSupplierId = null, onSettled, dataVersion = 0, onOpenNewSupplier }) {
  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState(prefilledSupplierId || '');
  
  // Category Mode: 'purchase_storage' (Store In Arrivals) vs 'sales_storage' (Store Out Dispatches)
  const [settlementCategory, setSettlementCategory] = useState('purchase_storage');

  const [storageItems, setStorageItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
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
      loadStorageItems(selectedSupplierId, settlementCategory);
      loadSupplierCommitments(selectedSupplierId, settlementCategory);
    } else {
      setStorageItems([]);
      setSelectedItemIds([]);
      setCommitments([]);
    }
  }, [selectedSupplierId, settlementCategory, dataVersion]);

  const loadSuppliers = async () => {
    try {
      const list = await dbAction('suppliers:get');
      setSuppliers(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSupplierCommitments = async (supId, cat) => {
    try {
      const list = await dbAction('commitments:get', { supplierId: supId });
      const targetCategory = cat === 'sales_storage' ? 'sale' : 'purchase';
      const active = (list || []).filter(c => (c.category === targetCategory || !c.category) && c.status === 'active' && c.remainingQty > 0);
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

  const loadStorageItems = async (supId, cat) => {
    setLoading(true);
    setErrorMsg('');
    try {
      if (cat === 'sales_storage') {
        // Load unsettled Store Out dispatches
        const list = await dbAction('dispatches:get', { supplierId: supId });
        const pendingDispatches = (list || []).filter(d => {
          const isHusk = d.dispatchType === 'husk' || d.product === 'prod_husk' || d.product === 'Husk';
          if (isHusk) return false;
          const isStoreOut = d.rateType === 'storage_out' || d.status === 'storage_out' || d.status === 'partial_settled';
          const remBags = d.remainingBags !== undefined ? Number(d.remainingBags) : Number(d.bags);
          return isStoreOut && remBags > 0;
        });
        setStorageItems(pendingDispatches);
        const allIds = pendingDispatches.map(d => d.id);
        setSelectedItemIds(allIds);
        updateTotalBags(allIds, pendingDispatches);
      } else {
        // Load unsettled Store In arrivals
        const list = await dbAction('arrivals:get', { supplierId: supId });
        const pendingArrivals = (list || []).filter(a => {
          const remBags = a.remainingBags !== undefined ? Number(a.remainingBags) : Number(a.bags);
          return (a.status === 'storage' || a.status === 'partial_settled') && remBags > 0;
        });
        setStorageItems(pendingArrivals);
        const allIds = pendingArrivals.map(a => a.id);
        setSelectedItemIds(allIds);
        updateTotalBags(allIds, pendingArrivals);
      }
    } catch (e) {
      setErrorMsg('Failed to load storage items: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTotalBags = (ids, itemList) => {
    const activeItems = (itemList || storageItems).filter(item => ids.includes(item.id));
    const totalBags = activeItems.reduce((sum, item) => {
      const remBags = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
      return sum + remBags;
    }, 0);
    setSettleBagsInput(String(Math.round(totalBags * 100) / 100));
  };

  const handleToggleItem = (id) => {
    let newSelected;
    if (selectedItemIds.includes(id)) {
      newSelected = selectedItemIds.filter(x => x !== id);
    } else {
      newSelected = [...selectedItemIds, id];
    }
    setSelectedItemIds(newSelected);
    updateTotalBags(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === storageItems.length) {
      setSelectedItemIds([]);
      setSettleBagsInput('0');
    } else {
      const allIds = storageItems.map(item => item.id);
      setSelectedItemIds(allIds);
      updateTotalBags(allIds);
    }
  };

  // Selected items calculations
  const selectedItems = storageItems.filter(item => selectedItemIds.includes(item.id));

  let totalAvailBags = 0;
  let totalAvailWeight = 0;
  let totalAvailEndProduct = 0;

  selectedItems.forEach(item => {
    const b = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
    const ep = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
    const w = item.bags > 0 ? (b / item.bags) * Number(item.weight || (b * 50)) : Number(item.weight || 0);

    totalAvailBags += b;
    totalAvailWeight += w;
    totalAvailEndProduct += ep;
  });

  // Calculate Average Outturn of the combined batch
  const averageOutturn = totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 0;
  const averageOutturnPercentage = totalAvailWeight > 0 ? (totalAvailEndProduct / totalAvailWeight) * 100 : 0;

  // Settle calculations based on user input bags
  const bagsToSettle = Math.min(parseFloat(settleBagsInput) || 0, totalAvailBags);
  
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
      setErrorMsg('Please select a supplier / party');
      return;
    }
    if (selectedItemIds.length === 0) {
      setErrorMsg('Please select at least one storage record to settle');
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
    const isSales = settlementCategory === 'sales_storage';

    setSubmitting(true);
    try {
      const payload = {
        supplierId: selectedSupplierId,
        supplierName: supplier ? supplier.name : 'Unknown',
        settlementCategory,
        arrivalIds: isSales ? [] : selectedItemIds,
        dispatchIds: isSales ? selectedItemIds : [],
        commitmentId: rateMode === 'commitment' ? selectedCommitmentId : null,
        settleBags: bagsToSettle,
        settlementRate: numRate,
        rateUnit,
        tcsRate: numTcsRate,
        date,
        notes
      };

      const res = await dbAction('settlements:settle', payload);

      setSuccessMsg(`Settlement ${res.settlementNo} executed successfully for ₹${res.settlementNetAmount.toLocaleString()}!`);
      await loadStorageItems(selectedSupplierId, settlementCategory);
      await loadSupplierCommitments(selectedSupplierId, settlementCategory);
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
            Batch Settle Store In (Arrivals) or Store Out (Dispatches) at Agreed Settlement Rates
          </span>
        </div>

        {/* Settlement Category Pills: Purchase Storage vs Sales Storage */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn ${settlementCategory === 'purchase_storage' ? 'btn-coffee' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.65rem', fontSize: '0.88rem' }}
            onClick={() => setSettlementCategory('purchase_storage')}
          >
            <Truck size={16} /> 📦 Purchase Storage (Store In Arrivals)
          </button>
          <button
            type="button"
            className={`btn ${settlementCategory === 'sales_storage' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.65rem', fontSize: '0.88rem' }}
            onClick={() => setSettlementCategory('sales_storage')}
          >
            <PackageCheck size={16} /> 📤 Sales Storage (Store Out Dispatches)
          </button>
        </div>

        {/* Step 1: Select Party */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">
                Select Party with {settlementCategory === 'sales_storage' ? 'Store Out Dispatches' : 'Store In Arrivals'}
              </label>
              {onOpenNewSupplier && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={onOpenNewSupplier}
                >
                  + New Party (F9)
                </button>
              )}
            </div>
            <SearchableSupplierSelect
              suppliers={suppliers}
              value={selectedSupplierId}
              onChange={(sId) => setSelectedSupplierId(sId)}
              onAddNewSupplier={onOpenNewSupplier}
              placeholder="Search party account..."
            />
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              if (selectedSupplierId) {
                loadStorageItems(selectedSupplierId, settlementCategory);
                loadSupplierCommitments(selectedSupplierId, settlementCategory);
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
          {/* Left Column: Storage Items Table */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <span>{settlementCategory === 'sales_storage' ? 'Unsettled Store Out Dispatches' : 'Unsettled Store In Arrivals'}</span>
                <span className="badge badge-coffee">{storageItems.length} Available</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                disabled={storageItems.length === 0}
              >
                {selectedItemIds.length === storageItems.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading storage items...</div>
            ) : storageItems.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                No unsettled {settlementCategory === 'sales_storage' ? 'Store Out dispatches' : 'Store In arrivals'} found for this party.
              </div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Select</th>
                      <th>Date</th>
                      <th>Ref #</th>
                      <th>Product</th>
                      <th className="num">Rem. Bags</th>
                      <th className="num">Rem. EP (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageItems.map(item => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const remBags = item.remainingBags !== undefined ? item.remainingBags : item.bags;
                      const remEP = item.remainingEndProduct !== undefined ? item.remainingEndProduct : (item.endProductWeight || item.weight);

                      return (
                        <tr 
                          key={item.id} 
                          style={{ cursor: 'pointer', background: isSelected ? '#fffbeb' : 'transparent' }}
                          onClick={() => handleToggleItem(item.id)}
                        >
                          <td style={{ textAlign: 'center' }}>
                            {isSelected ? <CheckSquare size={16} color="#d97706" /> : <Square size={16} color="#94a3b8" />}
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{item.date}</td>
                          <td style={{ fontWeight: 600 }}>{item.arrivalNo || item.dispatchNo}</td>
                          <td>
                            <span className="badge badge-coffee">{item.product}</span>
                          </td>
                          <td className="num" style={{ fontWeight: 600 }}>{remBags}</td>
                          <td className="num" style={{ fontFamily: 'var(--font-mono)' }}>{remEP ? remEP.toLocaleString() : 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Column: Settle Calculation & Execution */}
          <div className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: '0.95rem' }}>
                <span>{settlementCategory === 'sales_storage' ? 'Sales Settlement Calculation' : 'Purchase Settlement Calculation'}</span>
              </div>
              <span className="badge badge-blue">{selectedItemIds.length} Selected</span>
            </div>

            {selectedItemIds.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Please select one or more storage records to view settlement calculation.
              </div>
            ) : (
              <form onSubmit={handleExecuteSettlement} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Combined Average Outturn Banner */}
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem 1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400e', textTransform: 'uppercase' }}>
                    Combined Batch Yield Across {selectedItems.length} Records
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

                {/* Settle Bags Input */}
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
                </div>

                {/* Resulting EP */}
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                      Equivalent Clean EP Weight
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                      {settledEndProduct.toLocaleString()} kg
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b' }}>
                    <div>{(settledEndProduct / 100).toFixed(2)} Quintals</div>
                  </div>
                </div>

                {/* Rate Mode */}
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
                          if (commitments.length > 0) applyCommitment(commitments[0]);
                        }}
                        disabled={commitments.length === 0}
                      />
                      <Handshake size={14} style={{ display: 'inline' }} />
                      From {settlementCategory === 'sales_storage' ? 'Sales' : 'Purchase'} Commitment ({commitments.length})
                    </label>
                  </div>

                  {rateMode === 'commitment' && (
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Select Commitment Contract *</label>
                      <select
                        className="form-control"
                        value={selectedCommitmentId}
                        onChange={e => handleCommitmentChange(e.target.value)}
                      >
                        {commitments.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.commitmentNo} - {c.product} ({c.remainingQty} {c.type === 'bags' ? 'Bags' : 'kg EP'} @ ₹{c.rate})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label className="form-label">Rate Basis</label>
                      <select
                        className="form-control"
                        value={rateUnit}
                        onChange={e => setRateUnit(e.target.value)}
                        disabled={rateMode === 'commitment'}
                      >
                        <option value="per_kg_ep">Rate per Kg EP</option>
                        <option value="per_bag">Rate per Bag (50kg)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Settlement Rate (₹) *</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder="₹ rate"
                        value={settleRate}
                        onChange={e => setSettleRate(e.target.value)}
                        required
                        disabled={rateMode === 'commitment'}
                      />
                    </div>
                  </div>
                </div>

                {/* Summary Card */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
                    <span style={{ color: '#64748b' }}>Gross Settlement:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{grossSettlementAmount.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '0.5rem', fontSize: '1.05rem' }}>
                    <span style={{ fontWeight: 600 }}>Net Bill Amount:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: settlementCategory === 'sales_storage' ? '#2563eb' : '#059669' }}>
                      ₹{netSettlementAmount.toLocaleString()}
                    </strong>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className={`btn ${settlementCategory === 'sales_storage' ? 'btn-primary' : 'btn-coffee'}`}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
                  disabled={submitting}
                >
                  <Check size={18} /> {submitting ? 'Executing Settlement...' : `Confirm & Bill ${settlementCategory === 'sales_storage' ? 'Sales' : 'Purchase'} Settlement (₹${netSettlementAmount.toLocaleString()})`}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
