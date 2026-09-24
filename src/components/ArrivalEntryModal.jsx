import React, { useState, useEffect, useRef } from 'react';
import { X, Check, Plus, AlertCircle, Edit2 } from 'lucide-react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import SearchableProductSelect from './SearchableProductSelect';

export default function ArrivalEntryModal({
  isOpen,
  onClose,
  onSaved,
  prefilledSupplierId = null,
  arrivalToEdit = null,
  onOpenNewSupplier,
  dataVersion = 0,
  lastAddedSupplier = null
}) {
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
  const [billType, setBillType] = useState('gst_bill'); // 'gst_bill' or 'cash_bill'
  const [cgstRate, setCgstRate] = useState(0);
  const [sgstRate, setSgstRate] = useState(0);
  const [igstRate, setIgstRate] = useState(0);
  const [tdsRate, setTdsRate] = useState(0);
  const [tcsRate, setTcsRate] = useState(0.1);
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
    setBillType(arr.billType || 'gst_bill');
    const isHusk = (arr.product || '').toLowerCase().includes('husk');
    setCgstRate(arr.cgstRate !== undefined ? arr.cgstRate : (isHusk ? 2.5 : 0));
    setSgstRate(arr.sgstRate !== undefined ? arr.sgstRate : (isHusk ? 2.5 : 0));
    setIgstRate(arr.igstRate !== undefined ? arr.igstRate : 0);
    setTdsRate(arr.tdsRate !== undefined ? arr.tdsRate : 0);
    setTcsRate(arr.tcsRate !== undefined ? arr.tcsRate : 0.1);
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
  }, [isOpen, prefilledSupplierId, arrivalToEdit, dataVersion]);

  useEffect(() => {
    if (lastAddedSupplier && isOpen) {
      setSupplierId(lastAddedSupplier.id);
      loadData();
    }
  }, [lastAddedSupplier]);

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
      const active = (list || []).filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active' && c.remainingQty > 0);
      setCommitments(active);
      if (active.length > 0 && rateType === 'commitment') {
        setCommitmentId(active[0].id);
        setRate(active[0].rate);
      }
    } catch (e) {
      console.error(e);
    }
  };

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

  const numCgst = billType === 'gst_bill' ? (parseFloat(cgstRate) || 0) : 0;
  const numSgst = billType === 'gst_bill' ? (parseFloat(sgstRate) || 0) : 0;
  const numIgst = billType === 'gst_bill' ? (parseFloat(igstRate) || 0) : 0;
  const numTds = parseFloat(tdsRate) || 0;
  const numTcs = parseFloat(tcsRate) || 0;

  // End Product
  let endProductWeight = 0;
  if (numWeight > 0 && numOutturn > 0) {
    if (outturnType === 'percentage') {
      endProductWeight = numWeight * (numOutturn / 100);
    } else {
      endProductWeight = (numWeight / 50) * numOutturn;
    }
  }
  endProductWeight = Math.round(endProductWeight * 100) / 100;
  const outturnPercentage = numWeight > 0 ? ((endProductWeight / numWeight) * 100).toFixed(2) : 0;

  // Billing
  let taxableAmount = rateType === 'storage' ? 0 : Math.round((endProductWeight * numRate) * 100) / 100;
  let calcCgst = Math.round((taxableAmount * (numCgst / 100)) * 100) / 100;
  let calcSgst = Math.round((taxableAmount * (numSgst / 100)) * 100) / 100;
  let calcIgst = Math.round((taxableAmount * (numIgst / 100)) * 100) / 100;
  let billAmount = Math.round((taxableAmount + calcCgst + calcSgst + calcIgst) * 100) / 100;

  let tdsAmount = Math.round((taxableAmount * (numTds / 100)) * 100) / 100;
  let tcsAmount = Math.round((taxableAmount * (numTcs / 100)) * 100) / 100;
  let netAmount = Math.round((billAmount - tdsAmount + tcsAmount) * 100) / 100;

  const handleCommitmentSelect = (cId) => {
    setCommitmentId(cId);
    const selected = commitments.find(c => c.id === cId);
    if (selected) {
      setRate(selected.rate);
      setRateUnit(selected.type === 'bags' ? 'per_bag' : 'per_kg_ep');
    }
  };

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
      billType,
      cgstRate: numCgst,
      sgstRate: numSgst,
      igstRate: numIgst,
      tdsRate: numTds,
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
      <div className="modal-content" style={{ maxWidth: '840px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: '1.3rem' }}>{isEditMode ? '✏️' : '🚛'}</span>
            <span>{isEditMode ? `Edit Arrival — ${arrivalToEdit?.arrivalNo}` : 'Record Coffee Arrival (Purchase / Store In)'}</span>
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

          {/* Supplier & Vehicle */}
          <div className="form-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Supplier Account *</label>
                {!isEditMode && onOpenNewSupplier && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                    onClick={onOpenNewSupplier}
                  >
                    + New Supplier (F9)
                  </button>
                )}
              </div>

              {!showAddSupplierInline ? (
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(sId) => setSupplierId(sId)}
                  onAddNewSupplier={onOpenNewSupplier}
                  disabled={isEditMode}
                  placeholder="Type supplier name, place, phone..."
                />
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

          {/* Commodity Product Selection */}
          <div className="form-group">
            <label className="form-label">Coffee Product / Commodity *</label>
            <SearchableProductSelect
              value={product}
              onChange={(pCode, pObj) => {
                setProduct(pCode);
                if (pObj && pObj.cgstRate !== undefined) setCgstRate(pObj.cgstRate);
                if (pObj && pObj.sgstRate !== undefined) setSgstRate(pObj.sgstRate);
              }}
              category="coffee"
              placeholder="Search or select coffee commodity..."
            />
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
            </div>

            <div className="form-group">
              <label className="form-label">Bags (Weight ÷ 50)</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="Auto bags"
                value={bags}
                onChange={e => setBags(e.target.value)}
              />
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
                placeholder={outturnType === 'per_50kg' ? 'e.g. 26' : 'e.g. 52 (%)'}
                value={outturn}
                onChange={e => setOutturn(e.target.value)}
              />
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
            </div>
          </div>

          {/* Rate, GST & Settlement Options */}
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
                From Purchase Commitment ({commitments.length} Active)
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
                <strong>Storage Coffee Note:</strong> Added as storage without immediate billing. Settle rate later via Storage Settlement.
              </div>
            ) : (
              <div>
                {rateType === 'commitment' && (
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Select Purchase Commitment</label>
                    <select
                      className="form-control"
                      value={commitmentId}
                      onChange={e => handleCommitmentSelect(e.target.value)}
                    >
                      {commitments.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.commitmentNo} - {c.product} ({c.remainingQty} {c.type} @ ₹{c.rate})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Purchase Rate (₹/kg EP) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      placeholder="Rate per kg EP"
                      value={rate}
                      onChange={e => setRate(e.target.value)}
                      required={rateType !== 'storage'}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bill Type</label>
                    <select
                      className="form-control"
                      value={billType}
                      onChange={(e) => setBillType(e.target.value)}
                    >
                      <option value="gst_bill">GST Bill (Tax Invoice)</option>
                      <option value="cash_bill">Cash Purchase / Regular (No GST)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">TCS % (u/s 206C)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control num-input"
                      placeholder="0.10"
                      value={tcsRate}
                      onChange={e => setTcsRate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Tax Breakdown Controls */}
                {billType === 'gst_bill' && (
                  <div className="form-grid-3" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>CGST %</label>
                      <input type="number" step="0.1" className="form-control form-control-sm" value={cgstRate} onChange={e => setCgstRate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>SGST %</label>
                      <input type="number" step="0.1" className="form-control form-control-sm" value={sgstRate} onChange={e => setSgstRate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>TDS % (u/s 194Q)</label>
                      <input type="number" step="0.01" className="form-control form-control-sm" value={tdsRate} onChange={e => setTdsRate(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Calculation summary */}
                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', color: '#fff', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Taxable: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{taxableAmount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>GST: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>+₹{(calcCgst + calcSgst + calcIgst).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Net Payable: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', color: '#4ade80' }}>₹{netAmount.toLocaleString()}</strong>
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
              placeholder="e.g. Lot #12, Moisture 11.5%"
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
