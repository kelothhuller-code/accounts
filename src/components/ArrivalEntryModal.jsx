import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Plus, AlertCircle, Edit2 } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function ArrivalEntryModal({ isOpen, onClose, onSaved, prefilledSupplierId = null, arrivalToEdit = null }) {
  const isEditMode = !!arrivalToEdit;
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [commitments, setCommitments] = useState([]);
  
  // Form State
  const [supplierId, setSupplierId] = useState(prefilledSupplierId || '');
  const [showAddSupplierInline, setShowAddSupplierInline] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierPlace, setNewSupplierPlace] = useState('');

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [product, setProduct] = useState('RC Raw');
  const [customProduct, setCustomProduct] = useState('');
  const [isCustomProduct, setIsCustomProduct] = useState(false);

  const [weight, setWeight] = useState('');
  const [bags, setBags] = useState('');
  const [outturn, setOutturn] = useState('26'); // default 26 kg per 50kg bag (=52%)
  const [outturnType, setOutturnType] = useState('per_50kg'); // 'per_50kg' or 'percentage'

  // Pricing & Accounting State
  const [rateType, setRateType] = useState('fixed'); // 'fixed', 'commitment', 'storage'
  const [commitmentId, setCommitmentId] = useState('');
  const [rateUnit, setRateUnit] = useState('per_kg_ep'); // 'per_kg_ep' or 'per_bag'
  const [rate, setRate] = useState('');
  const [tcsRate, setTcsRate] = useState('0.1'); // 0.1%
  const [remarks, setRemarks] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const firstInputRef = useRef(null);

  const populateFromArrival = (arr) => {
    setSupplierId(arr.supplierId || '');
    setDate(arr.date || new Date().toISOString().split('T')[0]);
    setVehicleNo(arr.vehicleNo || '');
    const mainProd = ['RC Raw', 'RC EP', 'AC Raw'];
    const stdProd = ['RC A', 'RC B', 'RC C', 'RC AA', 'RC PB', 'RC OG', 'RC Bits'];
    if ([...mainProd, ...stdProd].includes(arr.product)) {
      setProduct(arr.product); setIsCustomProduct(false);
    } else {
      setIsCustomProduct(true); setCustomProduct(arr.product || '');
    }
    setWeight(String(arr.weight || ''));
    setBags(String(arr.bags || ''));
    setOutturn(String(arr.outturn || '26'));
    setOutturnType(arr.outturnType || 'per_50kg');
    setRateType(arr.rateType || 'fixed');
    setRateUnit(arr.rateUnit || 'per_kg_ep');
    setRate(String(arr.rate || ''));
    setTcsRate(String(arr.tcsRate || '0.1'));
    setRemarks(arr.remarks || '');
    if (arr.commitmentId) setCommitmentId(arr.commitmentId);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      if (isEditMode && arrivalToEdit) {
        populateFromArrival(arrivalToEdit);
      } else {
        if (prefilledSupplierId) setSupplierId(prefilledSupplierId);
        setErrorMsg('');
      }
      setTimeout(() => {
        if (firstInputRef.current) firstInputRef.current.focus();
      }, 100);
    }
  }, [isOpen, prefilledSupplierId, arrivalToEdit]);

  useEffect(() => {
    if (supplierId) {
      loadSupplierCommitments(supplierId);
    } else {
      setCommitments([]);
    }
  }, [supplierId]);

  const loadData = async () => {
    try {
      const [supList, prodList] = await Promise.all([
        dbAction('suppliers:get'),
        dbAction('products:get')
      ]);
      setSuppliers(supList || []);
      setProducts(prodList || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSupplierCommitments = async (sId) => {
    try {
      const list = await dbAction('commitments:get', { supplierId: sId });
      const active = (list || []).filter(c => c.status === 'active' && c.remainingQty > 0);
      setCommitments(active);
      if (active.length > 0 && rateType === 'commitment') {
        setCommitmentId(active[0].id);
        setRate(active[0].rate);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Handle Weight change -> auto calculate bags (weight / 50)
  const handleWeightChange = (e) => {
    const val = e.target.value;
    setWeight(val);
    const numWeight = parseFloat(val);
    if (!isNaN(numWeight) && numWeight > 0) {
      const autoBags = Math.round((numWeight / 50) * 100) / 100;
      setBags(String(autoBags));
    } else {
      setBags('');
    }
  };

  // Calculations
  const numWeight = parseFloat(weight) || 0;
  const numBags = parseFloat(bags) || 0;
  const numOutturn = parseFloat(outturn) || 0;
  const numRate = parseFloat(rate) || 0;
  const numTcsRate = parseFloat(tcsRate) || 0;

  // Calculate End Product
  let endProductWeight = 0;
  if (numWeight > 0 && numOutturn > 0) {
    if (outturnType === 'percentage') {
      endProductWeight = numWeight * (numOutturn / 100);
    } else {
      // In 50kg bag basis: (weight / 50) * outturn_kg
      endProductWeight = (numWeight / 50) * numOutturn;
    }
  }
  endProductWeight = Math.round(endProductWeight * 100) / 100;

  // Calculate Outturn percentage for reference
  const outturnPercentage = numWeight > 0 ? ((endProductWeight / numWeight) * 100).toFixed(2) : 0;

  // Gross Bill Amount: ALWAYS endProductWeight * rate (even for bags-rate commitment)
  // Bags quantity is only used for commitment deduction, NOT for billing calculation
  let billAmount = 0;
  if (rateType !== 'storage') {
    billAmount = endProductWeight * numRate;
  }
  billAmount = Math.round(billAmount * 100) / 100;

  // TCS deduction against purchase payment
  const tcsAmount = Math.round((billAmount * (numTcsRate / 100)) * 100) / 100;
  const netAmount = Math.round((billAmount - tcsAmount) * 100) / 100;

  // Handle Commitment selection
  const handleCommitmentSelect = (cId) => {
    setCommitmentId(cId);
    const selectedCom = commitments.find(c => c.id === cId);
    if (selectedCom) {
      setRate(selectedCom.rate);
      setRateUnit(selectedCom.type === 'bags' ? 'per_bag' : 'per_kg_ep');
    }
  };

  // Quick Inline Add Supplier
  const handleQuickAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    try {
      const added = await dbAction('suppliers:add', {
        name: newSupplierName,
        phone: newSupplierPhone,
        place: newSupplierPlace
      });
      setSuppliers(prev => [...prev, added]);
      setSupplierId(added.id);
      setShowAddSupplierInline(false);
      setNewSupplierName('');
      setNewSupplierPhone('');
      setNewSupplierPlace('');
    } catch (e) {
      setErrorMsg('Failed to add supplier: ' + e.message);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!supplierId) {
      setErrorMsg('Please select or add a supplier');
      return;
    }
    if (numWeight <= 0) {
      setErrorMsg('Please enter a valid weight in kg');
      return;
    }
    if (rateType !== 'storage' && numRate <= 0) {
      setErrorMsg('Please enter a rate or choose "Save as Storage"');
      return;
    }

    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    const finalProduct = isCustomProduct ? (customProduct.trim() || 'Other') : product;

    const payload = {
      date,
      supplierId,
      supplierName: selectedSupplier ? selectedSupplier.name : 'Unknown',
      vehicleNo,
      product: finalProduct,
      weight: numWeight,
      bags: numBags,
      outturn: numOutturn,
      outturnType,
      endProductWeight,
      rateType,
      rateUnit,
      rate: rateType === 'storage' ? 0 : numRate,
      tcsRate: numTcsRate,
      commitmentId: rateType === 'commitment' ? commitmentId : null,
      remarks
    };

    setIsSubmitting(true);
    try {
      if (isEditMode && arrivalToEdit) {
        await dbAction('arrivals:update', { id: arrivalToEdit.id, data: payload });
      } else {
        await dbAction('arrivals:add', payload);
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save arrival');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const mainProducts = ['RC Raw', 'RC EP', 'AC Raw'];
  const standardProducts = ['RC A', 'RC B', 'RC C', 'RC AA', 'RC PB', 'RC OG', 'RC Bits'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '820px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: '1.3rem' }}>{isEditMode ? '✏️' : '🚛'}</span>
            <span>{isEditMode ? `Edit Arrival — ${arrivalToEdit?.arrivalNo}` : 'Record Coffee Arrival'}</span>
            <span className="badge badge-coffee" style={{ marginLeft: '0.5rem' }}>Enter ↵ to save</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMsg && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {isEditMode && (arrivalToEdit?.settledBags > 0 || arrivalToEdit?.status === 'settled') && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '0.65rem', borderRadius: '6px', fontSize: '0.82rem' }}>
              ⚠️ This arrival has settled quantities. Weight changes are blocked. You can edit date, vehicle, product, rate, and remarks.
            </div>
          )}

          {/* Supplier & Vehicle */}
          <div className="form-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Supplier Account *</label>
                {!isEditMode && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setShowAddSupplierInline(!showAddSupplierInline)}
                >
                  {showAddSupplierInline ? 'Cancel' : '+ Quick Add'}
                </button>
                )}
              </div>

              {!showAddSupplierInline ? (
                <select
                  ref={firstInputRef}
                  className="form-control"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                  disabled={isEditMode}
                >
                  <option value="">-- Select Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.place ? `(${s.place})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', background: '#eff6ff', padding: '0.5rem', borderRadius: '6px' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Supplier Name *"
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Phone"
                      value={newSupplierPhone}
                      onChange={e => setNewSupplierPhone(e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Place"
                      value={newSupplierPlace}
                      onChange={e => setNewSupplierPlace(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleQuickAddSupplier}>
                    Save & Select
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Arrival Date</label>
              <input
                type="date"
                className="form-control"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Vehicle Number</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. KA-12-EA-4567"
                value={vehicleNo}
                onChange={e => setVehicleNo(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* Product Selection */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label">Coffee Product / Commodity *</label>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Click to select</span>
            </div>

            {/* Main 3 Products Highlighted */}
            <div className="product-chips">
              {mainProducts.map(p => (
                <div
                  key={p}
                  className={`product-chip main-highlight ${(!isCustomProduct && product === p) ? 'selected' : ''}`}
                  onClick={() => { setProduct(p); setIsCustomProduct(false); }}
                >
                  ⭐ {p} (Main)
                </div>
              ))}

              {standardProducts.map(p => (
                <div
                  key={p}
                  className={`product-chip ${(!isCustomProduct && product === p) ? 'selected' : ''}`}
                  onClick={() => { setProduct(p); setIsCustomProduct(false); }}
                >
                  {p}
                </div>
              ))}

              <div
                className={`product-chip ${isCustomProduct ? 'selected' : ''}`}
                onClick={() => setIsCustomProduct(true)}
              >
                ✏️ Other / Custom
              </div>
            </div>

            {isCustomProduct && (
              <input
                type="text"
                className="form-control"
                placeholder="Type Commodity Name (e.g. Arabica Parchment, Robusta Blacks)..."
                value={customProduct}
                onChange={e => setCustomProduct(e.target.value)}
                style={{ marginTop: '0.5rem' }}
                autoFocus
              />
            )}
          </div>

          {/* Weight, Bags, Outturn Calculations */}
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1.2fr' }}>
            <div className="form-group">
              <label className="form-label">Raw Weight (kg) *</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="e.g. 5000"
                value={weight}
                onChange={handleWeightChange}
                required
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Gross Weight</span>
            </div>

            <div className="form-group">
              <label className="form-label">Bags (Auto: Weight ÷ 50)</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="Auto 50kg bags"
                value={bags}
                onChange={e => setBags(e.target.value)}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Standard 50kg Bags</span>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className="form-label">Outturn (OT) *</label>
                <div style={{ display: 'flex', gap: '0.35rem', fontSize: '0.72rem' }}>
                  <span 
                    style={{ cursor: 'pointer', fontWeight: outturnType === 'per_50kg' ? 700 : 400, color: outturnType === 'per_50kg' ? '#2563eb' : '#64748b' }}
                    onClick={() => setOutturnType('per_50kg')}
                  >
                    Kg / 50kg bag
                  </span>
                  <span>|</span>
                  <span 
                    style={{ cursor: 'pointer', fontWeight: outturnType === 'percentage' ? 700 : 400, color: outturnType === 'percentage' ? '#2563eb' : '#64748b' }}
                    onClick={() => setOutturnType('percentage')}
                  >
                    % Outturn
                  </span>
                </div>
              </div>

              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder={outturnType === 'per_50kg' ? 'e.g. 26 (kg per 50kg bag)' : 'e.g. 52 (%)'}
                value={outturn}
                onChange={e => setOutturn(e.target.value)}
              />
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {outturnType === 'per_50kg' ? 'Kg end product obtained per 50kg bag' : '% of end product yield'}
              </span>
            </div>
          </div>

          {/* End Product Result Banner */}
          <div className="calc-callout">
            <div className="calc-item">
              <span className="calc-item-label">Raw Weight</span>
              <span className="calc-item-val">{numWeight.toLocaleString()} kg</span>
            </div>
            <div className="calc-item">
              <span className="calc-item-label">Total Bags</span>
              <span className="calc-item-val">{numBags} Bags</span>
            </div>
            <div className="calc-item">
              <span className="calc-item-label">Outturn Yield</span>
              <span className="calc-item-val">{outturnPercentage}%</span>
            </div>
            <div className="calc-item" style={{ borderLeft: '2px solid #d97706', paddingLeft: '0.75rem' }}>
              <span className="calc-item-label">End Product (EP)</span>
              <span className="calc-item-val highlight">{endProductWeight.toLocaleString()} kg</span>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {(endProductWeight / 100).toFixed(2)} Quintals / {(endProductWeight / 50).toFixed(1)} Clean Bags
              </span>
            </div>
          </div>

          {/* Rate & Settlement Options */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="rateType"
                  value="fixed"
                  checked={rateType === 'fixed'}
                  onChange={() => setRateType('fixed')}
                />
                Fix Rate Now (Bill Arrival)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="rateType"
                  value="commitment"
                  checked={rateType === 'commitment'}
                  onChange={() => {
                    setRateType('commitment');
                    if (commitments.length > 0) {
                      setCommitmentId(commitments[0].id);
                      setRate(commitments[0].rate);
                    }
                  }}
                />
                From Supplier Commitment ({commitments.length} Active)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#92400e' }}>
                <input
                  type="radio"
                  name="rateType"
                  value="storage"
                  checked={rateType === 'storage'}
                  onChange={() => setRateType('storage')}
                />
                📦 Save as Storage (Unfixed Rate)
              </label>
            </div>

            {rateType === 'storage' ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '0.75rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                <strong>Storage Coffee Note:</strong> This arrival will be added to <strong>{suppliers.find(s => s.id === supplierId)?.name || 'Supplier'}</strong>'s account as storage without billing. You can settle it later (individually or batch settle together with other storage arrivals by average outturn) using the <em>Settle Storage</em> wizard.
              </div>
            ) : (
              <div>
                {rateType === 'commitment' && (
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Select Commitment</label>
                    {commitments.length === 0 ? (
                      <div style={{ color: '#dc2626', fontSize: '0.8rem' }}>
                        No active commitments found for this supplier. Please add one in Commitments tab or choose "Fix Rate Now".
                      </div>
                    ) : (
                      <select
                        className="form-control"
                        value={commitmentId}
                        onChange={e => handleCommitmentSelect(e.target.value)}
                      >
                        {commitments.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.commitmentNo} - {c.product} ({c.remainingQty} {c.type} remaining @ ₹{c.rate}/{c.type === 'bags' ? 'Bag' : 'Kg EP'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Rate Unit</label>
                    <select
                      className="form-control"
                      value={rateUnit}
                      onChange={e => setRateUnit(e.target.value)}
                      disabled={rateType === 'commitment'}
                    >
                      <option value="per_kg_ep">Rate per Kg End Product (Standard)</option>
                      <option value="per_bag">Rate per Bag — billed on EP qty</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Rate (₹) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      placeholder={rateUnit === 'per_bag' ? '₹ per bag (billed on EP)' : '₹ per kg EP'}
                      value={rate}
                      onChange={e => setRate(e.target.value)}
                      required={rateType !== 'storage'}
                    />
                    {rateUnit === 'per_bag' && (
                      <span style={{ fontSize: '0.7rem', color: '#92400e' }}>⚠️ Billing = EP × Rate</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">TCS Deduction (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control num-input"
                      placeholder="0.10"
                      value={tcsRate}
                      onChange={e => setTcsRate(e.target.value)}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>TCS on Purchase</span>
                  </div>
                </div>

                {/* Calculation breakdown */}
                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>EP ({endProductWeight} kg) × ₹{numRate}: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{billAmount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>TCS ({numTcsRate}%): </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#dc2626' }}>- ₹{tcsAmount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Net Payable to Supplier: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: '#059669' }}>₹{netAmount.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Remarks / Lot Number</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Lot #12, Moisture 11.5%, Estate Lot A"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel (Esc)
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isEditMode ? <Edit2 size={16} /> : <Check size={16} />}
              {isSubmitting ? 'Saving...' : isEditMode ? ' Update Arrival' : ' Save Arrival & Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
