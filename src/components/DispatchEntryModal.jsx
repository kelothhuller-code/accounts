import React, { useState, useEffect, useRef } from 'react';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import SearchableProductSelect from './SearchableProductSelect';
import { dbAction } from '../utils/api';
import { X, Save, AlertCircle, Calculator, Tag, FileText, Check, Edit2 } from 'lucide-react';

export default function DispatchEntryModal({
  isOpen,
  onClose,
  prefilledSupplierId = null,
  dispatchToEdit = null,
  onSaved,
  onOpenNewSupplier,
  dataVersion = 0,
  lastAddedSupplier = null
}) {
  const isEditMode = !!dispatchToEdit;
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [commitments, setCommitments] = useState([]);

  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [vehicleNo, setVehicleNo] = useState('');
  const [dispatchType, setDispatchType] = useState('coffee'); // 'coffee' or 'husk'
  const [product, setProduct] = useState('RC EP');
  const [customProduct, setCustomProduct] = useState('');
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  
  const [weight, setWeight] = useState('');
  const [bags, setBags] = useState('');
  const [outturn, setOutturn] = useState('26');
  const [outturnType, setOutturnType] = useState('per_50kg'); // 'per_50kg' or 'percentage'
  const [endProductWeight, setEndProductWeight] = useState('');
  
  const [rateType, setRateType] = useState('fixed'); // 'fixed', 'commitment', 'storage_out'
  const [commitmentId, setCommitmentId] = useState('');
  const [rateUnit, setRateUnit] = useState('per_kg_ep'); // 'per_kg_ep', 'per_kg_raw', 'per_bag'
  const [rate, setRate] = useState('');
  
  const [billType, setBillType] = useState('gst_bill'); // 'gst_bill' or 'cash_bill'
  const [cgstRate, setCgstRate] = useState(0);
  const [sgstRate, setSgstRate] = useState(0);
  const [igstRate, setIgstRate] = useState(0);
  const [tdsRate, setTdsRate] = useState(0);
  const [tcsRate, setTcsRate] = useState(0);

  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      loadDependencies();
    }
  }, [isOpen, dataVersion]);

  useEffect(() => {
    if (!isOpen) return;

    if (dispatchToEdit) {
      setSupplierId(dispatchToEdit.supplierId || dispatchToEdit.partyId || '');
      setSupplierName(dispatchToEdit.supplierName || dispatchToEdit.partyName || '');
      setDate(dispatchToEdit.date || new Date().toISOString().split('T')[0]);
      setVehicleNo(dispatchToEdit.vehicleNo || '');
      setDispatchType(dispatchToEdit.dispatchType || 'coffee');
      
      setProduct(dispatchToEdit.product || '');
      setIsCustomProduct(false);

      setWeight(dispatchToEdit.weight ? String(dispatchToEdit.weight) : '');
      setBags(dispatchToEdit.bags ? String(dispatchToEdit.bags) : '');
      setOutturn(dispatchToEdit.outturn ? String(dispatchToEdit.outturn) : '26');
      setOutturnType(dispatchToEdit.outturnType || 'per_50kg');
      setEndProductWeight(dispatchToEdit.endProductWeight ? String(dispatchToEdit.endProductWeight) : '');
      setRateType(dispatchToEdit.rateType || 'fixed');
      setRateUnit(dispatchToEdit.rateUnit || 'per_kg_ep');
      setCommitmentId(dispatchToEdit.commitmentId || '');
      setRate(dispatchToEdit.rate !== undefined ? String(dispatchToEdit.rate) : '');
      setBillType(dispatchToEdit.billType || 'gst_bill');
      setCgstRate(dispatchToEdit.cgstRate !== undefined ? dispatchToEdit.cgstRate : 0);
      setSgstRate(dispatchToEdit.sgstRate !== undefined ? dispatchToEdit.sgstRate : 0);
      setIgstRate(dispatchToEdit.igstRate !== undefined ? dispatchToEdit.igstRate : 0);
      setTdsRate(dispatchToEdit.tdsRate !== undefined ? dispatchToEdit.tdsRate : 0);
      setTcsRate(dispatchToEdit.tcsRate !== undefined ? dispatchToEdit.tcsRate : 0);
      setRemarks(dispatchToEdit.remarks || '');
    } else {
      resetForm();
      if (prefilledSupplierId) {
        setSupplierId(prefilledSupplierId);
      }
    }

    setTimeout(() => {
      if (firstInputRef.current) firstInputRef.current.focus();
    }, 100);
  }, [isOpen, dispatchToEdit, prefilledSupplierId]);

  const loadDependencies = async () => {
    try {
      const [sups, prods] = await Promise.all([
        dbAction('suppliers:get'),
        dbAction('products:get')
      ]);
      setSuppliers(sups || []);
      setProducts(prods || []);
    } catch (e) {
      console.error('Error loading dispatch dependencies:', e);
    }
  };

  useEffect(() => {
    if (lastAddedSupplier && isOpen) {
      setSupplierId(lastAddedSupplier.id);
      if (lastAddedSupplier.name) setSupplierName(lastAddedSupplier.name);
      loadDependencies();
    }
  }, [lastAddedSupplier]);

  useEffect(() => {
    if (supplierId) {
      dbAction('commitments:get', { supplierId }).then(comms => {
        const activeSale = (comms || []).filter(c => c.category === 'sale' && c.status === 'active' && c.remainingQty > 0);
        setCommitments(activeSale);
        if (activeSale.length > 0 && rateType === 'commitment') {
          setCommitmentId(activeSale[0].id);
          setRate(String(activeSale[0].rate));
          setRateUnit(activeSale[0].type === 'bags' ? 'per_bag' : 'per_kg_ep');
        }
      }).catch(e => setCommitments([]));
    } else {
      setCommitments([]);
    }
  }, [supplierId]);

  // Weight / Bags auto-calculation
  const handleWeightChange = (e) => {
    const val = e.target.value;
    setWeight(val);
    const numW = parseFloat(val);
    if (!isNaN(numW) && numW > 0) {
      const autoBags = Math.round((numW / 50) * 100) / 100;
      setBags(String(autoBags));
    } else {
      setBags('');
    }
  };

  const handleCommitmentChange = (comId) => {
    setCommitmentId(comId);
    const selected = commitments.find(c => c.id === comId);
    if (selected) {
      setRate(String(selected.rate));
      setRateUnit(selected.type === 'bags' ? 'per_bag' : 'per_kg_ep');
    }
  };

  const resetForm = () => {
    setSupplierId('');
    setSupplierName('');
    setDate(new Date().toISOString().split('T')[0]);
    setVehicleNo('');
    setDispatchType('coffee');
    setProduct('RC EP');
    setIsCustomProduct(false);
    setCustomProduct('');
    setWeight('');
    setBags('');
    setOutturn('26');
    setOutturnType('per_50kg');
    setEndProductWeight('');
    setRateType('fixed');
    setRateUnit('per_kg_ep');
    setCommitmentId('');
    setRate('');
    setBillType('gst_bill');
    setCgstRate(0);
    setSgstRate(0);
    setIgstRate(0);
    setTdsRate(0);
    setTcsRate(0);
    setRemarks('');
    setError('');
  };

  // Live Calculations
  const currentProdName = isCustomProduct ? customProduct : product;
  const selectedProductObj = products.find(p => p.name === currentProdName || p.code === currentProdName);
  const isDirectBasis = selectedProductObj 
    ? selectedProductObj.calculationBasis === 'direct' 
    : (!currentProdName.toLowerCase().includes('raw') && !currentProdName.toLowerCase().includes('cherry') && !currentProdName.toLowerCase().includes('parchment'));

  const numWeight = parseFloat(weight) || 0;
  const numBags = parseFloat(bags) || 0;
  const numOutturn = isDirectBasis ? 50 : (parseFloat(outturn) || 0);
  const numRate = parseFloat(rate) || 0;

  const numCgst = billType === 'gst_bill' ? (parseFloat(cgstRate) || 0) : 0;
  const numSgst = billType === 'gst_bill' ? (parseFloat(sgstRate) || 0) : 0;
  const numIgst = billType === 'gst_bill' ? (parseFloat(igstRate) || 0) : 0;
  const numTds = parseFloat(tdsRate) || 0;
  const numTcs = parseFloat(tcsRate) || 0;

  let calculatedEP = 0;
  if (isDirectBasis) {
    calculatedEP = numWeight;
  } else if (numWeight > 0 && numOutturn > 0) {
    if (outturnType === 'percentage') {
      calculatedEP = numWeight * (numOutturn / 100);
    } else {
      calculatedEP = (numWeight / 50) * numOutturn;
    }
  }
  calculatedEP = Math.round(calculatedEP * 100) / 100;

  const numEP = parseFloat(endProductWeight) || calculatedEP;
  const outturnPercentage = numWeight > 0 ? ((numEP / numWeight) * 100).toFixed(2) : (isDirectBasis ? 100 : 0);

  let calcTaxable = 0;
  if (rateType !== 'storage_out') {
    if (rateUnit === 'per_bag') {
      calcTaxable = Math.round((numBags * numRate) * 100) / 100;
    } else if (isDirectBasis || rateUnit === 'per_kg_raw') {
      calcTaxable = Math.round((numWeight * numRate) * 100) / 100;
    } else {
      calcTaxable = Math.round((numEP * numRate) * 100) / 100;
    }
  }

  const calcCgst = Math.round((calcTaxable * (numCgst / 100)) * 100) / 100;
  const calcSgst = Math.round((calcTaxable * (numSgst / 100)) * 100) / 100;
  const calcIgst = Math.round((calcTaxable * (numIgst / 100)) * 100) / 100;
  const calcGstTotal = calcCgst + calcSgst + calcIgst;
  const calcBillGross = calcTaxable + calcGstTotal;
  
  const calcTdsAmount = Math.round((calcTaxable * (numTds / 100)) * 100) / 100;
  const calcTcsAmount = Math.round((calcTaxable * (numTcs / 100)) * 100) / 100;
  const calcNetAmount = Math.round((calcBillGross - calcTdsAmount + calcTcsAmount) * 100) / 100;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!supplierId) {
      setError('Please select a party/customer account.');
      return;
    }
    if (!weight || numWeight <= 0) {
      setError('Please enter a valid weight in kg.');
      return;
    }
    if (rateType !== 'storage_out' && (rate === '' || isNaN(parseFloat(rate)))) {
      setError('Please enter a valid sale rate.');
      return;
    }

    const selSup = suppliers.find(s => s.id === supplierId);
    const finalSupplierName = selSup ? selSup.name : supplierName;
    const finalProduct = isCustomProduct ? (customProduct.trim() || 'Other') : product;

    setIsSubmitting(true);

    try {
      const payload = {
        supplierId,
        supplierName: finalSupplierName,
        date,
        vehicleNo,
        dispatchType,
        product: finalProduct,
        isMain: selectedProductObj ? (selectedProductObj.isMain === true) : !finalProduct.toLowerCase().includes('husk'),
        isSecondary: selectedProductObj ? (selectedProductObj.isSecondary === true) : finalProduct.toLowerCase().includes('husk'),
        calculationBasis: isDirectBasis ? 'direct' : 'end_product',
        weight: numWeight,
        bags: numBags,
        outturn: isDirectBasis ? 50 : numOutturn,
        outturnType,
        endProductWeight: numEP,
        rateType,
        rateUnit,
        rate: rateType === 'storage_out' ? 0 : numRate,
        billType,
        cgstRate: numCgst,
        cgstAmount: calcCgst,
        sgstRate: numSgst,
        sgstAmount: calcSgst,
        igstRate: numIgst,
        igstAmount: calcIgst,
        taxableAmount: calcTaxable,
        billAmount: calcBillGross,
        tdsRate: numTds,
        tdsAmount: calcTdsAmount,
        tcsRate: numTcs,
        tcsAmount: calcTcsAmount,
        netAmount: calcNetAmount,
        commitmentId: rateType === 'commitment' ? commitmentId : null,
        remarks
      };

      if (dispatchToEdit) {
        await dbAction('dispatches:update', { id: dispatchToEdit.id, data: payload });
        if (onSaved) onSaved();
        onClose();
      } else {
        await dbAction('dispatches:add', payload);
        if (onSaved) onSaved();
        if (saveAndAddAnother) {
          setWeight('');
          setBags('');
          setRate('');
          setVehicleNo('');
          setRemarks('');
          setSuccessBanner('✓ Dispatch recorded successfully! Ready for next entry.');
          setTimeout(() => setSuccessBanner(''), 4000);
          if (firstInputRef.current) firstInputRef.current.focus();
        } else {
          onClose();
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save dispatch entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, supplierId, weight, rate, rateType, product, date, vehicleNo, saveAndAddAnother]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '840px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: '1.3rem' }}>{isEditMode ? '✏️' : '📤'}</span>
            <span>{isEditMode ? `Edit Sales Dispatch Record` : 'Record Sales Dispatch / Store Out'}</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {successBanner && (
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
              <Check size={16} />
              <span>{successBanner}</span>
            </div>
          )}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Supplier & Vehicle Details */}
          <div className="form-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">Party / Customer Name *</label>
                {!isEditMode && onOpenNewSupplier && (
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
                value={supplierId}
                onChange={(sId, sObj) => {
                  setSupplierId(sId);
                  if (sObj) setSupplierName(sObj.name);
                }}
                onAddNewSupplier={onOpenNewSupplier}
                disabled={isEditMode}
                placeholder="Type party name, place, phone..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Dispatch Date *</label>
              <input
                type="date"
                className="form-control"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Vehicle Number</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. KA-12-AB-1234"
                value={vehicleNo}
                onChange={e => setVehicleNo(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* Commodity Product Selection */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>Dispatch Commodity Product *</label>
              <span style={{
                fontSize: '0.73rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                background: isDirectBasis ? '#ecfdf5' : '#eff6ff',
                color: isDirectBasis ? '#047857' : '#1d4ed8'
              }}>
                {isDirectBasis ? '🏷️ Main Product (Direct Weight)' : '☕ Raw Commodity (EP via Outturn)'}
              </span>
            </div>

            <SearchableProductSelect
              value={product}
              onChange={(pCode, pObj) => {
                setProduct(pCode);
                if (pObj) {
                  if (pObj.cgstRate !== undefined) setCgstRate(pObj.cgstRate);
                  if (pObj.sgstRate !== undefined) setSgstRate(pObj.sgstRate);
                  if (pObj.igstRate !== undefined) setIgstRate(pObj.igstRate);
                  if (pObj.calculationBasis === 'end_product' && pObj.defaultOutturn) {
                    setOutturn(String(pObj.defaultOutturn));
                    if (pObj.defaultOutturnType) setOutturnType(pObj.defaultOutturnType);
                  } else if (pObj.calculationBasis === 'direct') {
                    setOutturn('50');
                  }
                }
              }}
              category="all"
              placeholder="Search or select commodity product..."
            />
          </div>

          {/* Weight, Bags, Outturn Calculations */}
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1.2fr' }}>
            <div className="form-group">
              <label className="form-label">Gross Weight (kg) *</label>
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

            <div className="form-group" style={{ opacity: isDirectBasis ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className="form-label">
                  Outturn (OT) {isDirectBasis ? '(Direct 50kg)' : '*'}
                </label>
                {!isDirectBasis && (
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
                )}
              </div>

              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder={isDirectBasis ? '50 (Direct 100%)' : (outturnType === 'per_50kg' ? 'e.g. 26' : 'e.g. 52 (%)')}
                value={isDirectBasis ? '50' : outturn}
                onChange={e => setOutturn(e.target.value)}
                disabled={isDirectBasis}
              />
            </div>
          </div>

          {/* End Product Result Callout Banner */}
          <div className="calc-callout">
            <div className="calc-item">
              <span className="calc-item-label">Dispatch Gross Wt</span>
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
            <div className="calc-item" style={{ borderLeft: '2px solid #2563eb', paddingLeft: '0.75rem' }}>
              <span className="calc-item-label">Clean EP Quantity</span>
              <span className="calc-item-val highlight">{numEP.toLocaleString()} kg</span>
            </div>
          </div>

          {/* Pricing & Billing Mode Card */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                <input
                  type="radio"
                  name="rateType"
                  value="fixed"
                  checked={rateType === 'fixed'}
                  onChange={() => setRateType('fixed')}
                />
                Fix Sale Rate Now (Bill Invoice)
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
                      setRate(String(commitments[0].rate));
                      setRateUnit(commitments[0].type === 'bags' ? 'per_bag' : 'per_kg_ep');
                    }
                  }}
                />
                From Sales Commitment ({commitments.length} Active)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#0369a1' }}>
                <input
                  type="radio"
                  name="rateType"
                  value="storage_out"
                  checked={rateType === 'storage_out'}
                  onChange={() => {
                    setRateType('storage_out');
                    setRate('0');
                  }}
                />
                📦 Store Out (Unbilled Storage Release)
              </label>
            </div>

            {rateType === 'storage_out' ? (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.2rem' }}>📦</span>
                <div>
                  <strong>Store Out Storage Release:</strong> This dispatch will deduct <strong>{numBags} Bags / {numEP.toLocaleString()} kg EP</strong> directly from party stored stock without creating any bill receivable balance.
                </div>
              </div>
            ) : (
              <div>
                {rateType === 'commitment' && (
                  <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Link Active Sales Commitment</label>
                    <select
                      className="form-control"
                      value={commitmentId}
                      onChange={(e) => handleCommitmentChange(e.target.value)}
                    >
                      <option value="">-- Select Active Commitment --</option>
                      {commitments.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.commitmentNo} - {c.product} ({c.remainingQty} {c.type === 'bags' ? 'Bags' : 'kg'} remaining @ ₹{c.rate})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Sale Rate (₹) *</label>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder="Sale Rate"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        required={rateType !== 'storage_out'}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <select
                        className="form-control"
                        style={{ width: '100px', flexShrink: 0, fontSize: '0.75rem', padding: '0.3rem' }}
                        value={rateUnit}
                        onChange={e => setRateUnit(e.target.value)}
                      >
                        <option value="per_kg_ep">₹ / kg EP</option>
                        <option value="per_kg_raw">₹ / kg Raw</option>
                        <option value="per_bag">₹ / Bag</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bill Type</label>
                    <select
                      className="form-control"
                      value={billType}
                      onChange={(e) => setBillType(e.target.value)}
                    >
                      <option value="gst_bill">GST Bill (Tax Invoice)</option>
                      <option value="cash_bill">Cash Sale / Regular Bill (No GST)</option>
                    </select>
                  </div>
                </div>

                {/* Tax Breakdown Grid (CGST, SGST & TDS) */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                  {billType === 'gst_bill' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.75rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>CGST %</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control form-control-sm"
                          value={cgstRate}
                          onChange={(e) => setCgstRate(e.target.value)}
                        />
                        <small style={{ fontSize: '0.72rem', color: '#64748b' }}>₹{calcCgst.toLocaleString()}</small>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>SGST %</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control form-control-sm"
                          value={sgstRate}
                          onChange={(e) => setSgstRate(e.target.value)}
                        />
                        <small style={{ fontSize: '0.72rem', color: '#64748b' }}>₹{calcSgst.toLocaleString()}</small>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>TCS % (u/s 206C)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm num-input"
                          placeholder="0.00"
                          value={tcsRate}
                          onChange={e => setTcsRate(e.target.value)}
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>TDS % (u/s 194Q)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm num-input"
                          placeholder="0.00"
                          value={tdsRate}
                          onChange={e => setTdsRate(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '360px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>TCS % (u/s 206C)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm num-input"
                          placeholder="0.00"
                          value={tcsRate}
                          onChange={e => setTcsRate(e.target.value)}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>TDS % (u/s 194Q)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control form-control-sm num-input"
                          placeholder="0.00"
                          value={tdsRate}
                          onChange={e => setTdsRate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bill Amounts Dark Summary */}
                <div style={{
                  marginTop: '0.85rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.6rem 1rem',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0f172a',
                  color: '#fff',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Taxable Amount:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>₹{calcTaxable.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>GST: </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: '#38bdf8' }}>+₹{calcGstTotal.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>TCS (+): </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#fbbf24' }}>+₹{calcTcsAmount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>TDS (-): </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#f87171' }}>-₹{calcTdsAmount.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Net Sales Receivable:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', color: '#4ade80' }}>₹{calcNetAmount.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Remarks / Notes</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Sales invoice #, transport LR, quality grade note"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {!isEditMode && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', color: '#64748b' }}>
                  <input
                    type="checkbox"
                    checked={saveAndAddAnother}
                    onChange={e => setSaveAndAddAnother(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#16a34a' }}
                  />
                  <span>⚡ <strong>Save & Add Next</strong> (Keep party & product)</span>
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                Cancel (Esc)
              </button>
              <button type="submit" className="btn btn-success" disabled={isSubmitting} title="Ctrl+Enter or Cmd+Enter to submit">
                {isEditMode ? <Edit2 size={16} /> : <Check size={16} />}
                {isSubmitting ? 'Saving...' : isEditMode ? ' Update Dispatch' : ' Save Dispatch (Ctrl+Enter)'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
