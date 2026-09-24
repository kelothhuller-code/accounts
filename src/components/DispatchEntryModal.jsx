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
  dataVersion = 0
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
  const [endProductWeight, setEndProductWeight] = useState('');
  
  const [rateType, setRateType] = useState('fixed'); // 'fixed', 'commitment', 'storage_out'
  const [commitmentId, setCommitmentId] = useState('');
  const [rate, setRate] = useState('');
  
  const [billType, setBillType] = useState('gst_bill'); // 'gst_bill' or 'cash_bill'
  const [cgstRate, setCgstRate] = useState(2.5);
  const [sgstRate, setSgstRate] = useState(2.5);
  const [igstRate, setIgstRate] = useState(0);
  const [tdsRate, setTdsRate] = useState(0);
  const [tcsRate, setTcsRate] = useState(0.1);

  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
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
      
      const stdProds = ['RC EP', 'AC EP', 'RC Raw', 'AC Raw', 'prod_husk', 'Husk'];
      if (stdProds.includes(dispatchToEdit.product)) {
        setProduct(dispatchToEdit.product);
        setIsCustomProduct(false);
      } else {
        setIsCustomProduct(true);
        setCustomProduct(dispatchToEdit.product || '');
      }

      setWeight(dispatchToEdit.weight ? String(dispatchToEdit.weight) : '');
      setBags(dispatchToEdit.bags ? String(dispatchToEdit.bags) : '');
      setEndProductWeight(dispatchToEdit.endProductWeight ? String(dispatchToEdit.endProductWeight) : '');
      setRateType(dispatchToEdit.rateType || 'fixed');
      setCommitmentId(dispatchToEdit.commitmentId || '');
      setRate(dispatchToEdit.rate !== undefined ? String(dispatchToEdit.rate) : '');
      setBillType(dispatchToEdit.billType || 'gst_bill');
      const isHusk = dispatchToEdit.dispatchType === 'husk' || (dispatchToEdit.product || '').toLowerCase().includes('husk');
      setCgstRate(dispatchToEdit.cgstRate !== undefined ? dispatchToEdit.cgstRate : (isHusk ? 2.5 : 0));
      setSgstRate(dispatchToEdit.sgstRate !== undefined ? dispatchToEdit.sgstRate : (isHusk ? 2.5 : 0));
      setIgstRate(dispatchToEdit.igstRate !== undefined ? dispatchToEdit.igstRate : 0);
      setTdsRate(dispatchToEdit.tdsRate !== undefined ? dispatchToEdit.tdsRate : 0);
      setTcsRate(dispatchToEdit.tcsRate !== undefined ? dispatchToEdit.tcsRate : 0.1);
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
    if (supplierId) {
      dbAction('commitments:get', { supplierId }).then(comms => {
        const activeSale = (comms || []).filter(c => c.category === 'sale' && c.status === 'active' && c.remainingQty > 0);
        setCommitments(activeSale);
        if (activeSale.length > 0 && rateType === 'commitment') {
          setCommitmentId(activeSale[0].id);
          setRate(String(activeSale[0].rate));
        }
      }).catch(e => setCommitments([]));
    } else {
      setCommitments([]);
    }
  }, [supplierId]);

  // When dispatch type changes (Coffee vs Husk)
  const handleDispatchTypeChange = (type) => {
    setDispatchType(type);
    if (type === 'husk') {
      setProduct('prod_husk');
      setIsCustomProduct(false);
      setCgstRate(2.5);
      setSgstRate(2.5);
      setIgstRate(0);
    } else {
      setProduct('RC EP');
      setIsCustomProduct(false);
      setCgstRate(0);
      setSgstRate(0);
      setIgstRate(0);
    }
  };

  // Weight / Bags auto-calculation
  const handleWeightChange = (val) => {
    setWeight(val);
    const numW = parseFloat(val);
    if (!isNaN(numW) && numW > 0) {
      if (!bags || parseFloat(bags) === 0) {
        setBags(String(Math.round((numW / 50) * 100) / 100));
      }
      if (!endProductWeight) {
        setEndProductWeight(String(numW));
      }
    }
  };

  const handleBagsChange = (val) => {
    setBags(val);
    const numB = parseFloat(val);
    if (!isNaN(numB) && numB > 0) {
      if (!weight || parseFloat(weight) === 0) {
        setWeight(String(numB * 50));
        setEndProductWeight(String(numB * 50));
      }
    }
  };

  const handleCommitmentChange = (comId) => {
    setCommitmentId(comId);
    const selected = commitments.find(c => c.id === comId);
    if (selected) {
      setRate(String(selected.rate));
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
    setEndProductWeight('');
    setRateType('fixed');
    setCommitmentId('');
    setRate('');
    setBillType('gst_bill');
    setCgstRate(0);
    setSgstRate(0);
    setIgstRate(0);
    setTdsRate(0);
    setTcsRate(0.1);
    setRemarks('');
    setError('');
  };

  // Live Calculations
  const numWeight = parseFloat(weight) || 0;
  const numBags = parseFloat(bags) || 0;
  const numEP = parseFloat(endProductWeight) || numWeight;
  const numRate = parseFloat(rate) || 0;
  const numCgst = billType === 'gst_bill' ? (parseFloat(cgstRate) || 0) : 0;
  const numSgst = billType === 'gst_bill' ? (parseFloat(sgstRate) || 0) : 0;
  const numIgst = billType === 'gst_bill' ? (parseFloat(igstRate) || 0) : 0;
  const numTds = parseFloat(tdsRate) || 0;
  const numTcs = parseFloat(tcsRate) || 0;

  const calcTaxable = rateType === 'storage_out' ? 0 : Math.round((numWeight * numRate) * 100) / 100;
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
        weight: numWeight,
        bags: numBags,
        endProductWeight: numEP,
        rateType,
        rate: rateType === 'storage_out' ? 0 : numRate,
        billType,
        cgstRate: numCgst,
        sgstRate: numSgst,
        igstRate: numIgst,
        tdsRate: numTds,
        tcsRate: numTcs,
        commitmentId: rateType === 'commitment' ? commitmentId : null,
        remarks
      };

      if (dispatchToEdit) {
        await dbAction('dispatches:update', { id: dispatchToEdit.id, data: payload });
      } else {
        await dbAction('dispatches:add', payload);
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save dispatch entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const coffeeProducts = ['RC EP', 'AC EP', 'RC Raw', 'AC Raw'];

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
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Commodity Category Selector Segment */}
          <div>
            <label className="form-label" style={{ fontWeight: 600 }}>Select Dispatch Commodity Category:</label>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
              <button
                type="button"
                className={`btn ${dispatchType === 'coffee' ? 'btn-coffee' : 'btn-secondary'}`}
                style={{ 
                  flex: 1, 
                  padding: '0.65rem 1rem', 
                  fontSize: '0.88rem',
                  boxShadow: dispatchType === 'coffee' ? '0 2px 8px rgba(146, 64, 14, 0.25)' : 'none'
                }}
                onClick={() => handleDispatchTypeChange('coffee')}
              >
                ☕ Coffee Sales & EP Dispatch
              </button>
              <button
                type="button"
                className={`btn ${dispatchType === 'husk' ? 'btn-warning' : 'btn-secondary'}`}
                style={{ 
                  flex: 1, 
                  padding: '0.65rem 1rem', 
                  fontSize: '0.88rem',
                  background: dispatchType === 'husk' ? '#d97706' : '#ffffff',
                  color: dispatchType === 'husk' ? '#ffffff' : '#1e293b',
                  borderColor: '#d97706',
                  fontWeight: 700,
                  boxShadow: dispatchType === 'husk' ? '0 2px 8px rgba(217, 119, 6, 0.25)' : 'none'
                }}
                onClick={() => handleDispatchTypeChange('husk')}
              >
                🌾 Husk Dispatch (2.5% CGST + 2.5% SGST)
              </button>
            </div>
          </div>

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

          {/* Commodity Product Selection & Quick Select Chips */}
          <div className="form-group">
            <label className="form-label">Commodity Product *</label>

            {/* Quick Product Chips */}
            <div className="product-chips" style={{ marginBottom: '0.4rem' }}>
              {dispatchType === 'coffee' ? (
                ['RC EP', 'AC EP', 'RC Raw', 'AC Raw', 'RC A', 'RC C', 'Parchment'].map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`product-chip ${product === p ? 'selected' : ['RC EP', 'AC EP'].includes(p) ? 'main-highlight' : ''}`}
                    onClick={() => {
                      setProduct(p);
                      setIsCustomProduct(false);
                    }}
                  >
                    {p}
                  </button>
                ))
              ) : (
                ['prod_husk', 'Husk'].map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`product-chip selected`}
                    onClick={() => {
                      setProduct('prod_husk');
                      setIsCustomProduct(false);
                    }}
                  >
                    🌾 Husk (5% GST)
                  </button>
                ))
              )}
            </div>

            <SearchableProductSelect
              value={product}
              onChange={(pCode, pObj) => {
                setProduct(pCode);
                if (pObj && pObj.cgstRate !== undefined) setCgstRate(pObj.cgstRate);
                if (pObj && pObj.sgstRate !== undefined) setSgstRate(pObj.sgstRate);
              }}
              category={dispatchType}
              placeholder="Search or select commodity product..."
            />
          </div>

          {/* Weight & Bags Input Grid */}
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Dispatch Weight (kg) *</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="Total weight in kg"
                value={weight}
                onChange={e => handleWeightChange(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Bags Count</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="Bags count"
                value={bags}
                onChange={e => handleBagsChange(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Clean EP Weight (kg)</label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                placeholder="EP weight"
                value={endProductWeight}
                onChange={e => setEndProductWeight(e.target.value)}
              />
            </div>
          </div>

          {/* Calculation Banner Callout */}
          <div className="calc-callout">
            <div className="calc-item">
              <span className="calc-item-label">Dispatch Gross Wt</span>
              <span className="calc-item-val">{numWeight.toLocaleString()} kg</span>
            </div>
            <div className="calc-item">
              <span className="calc-item-label">Total Bags</span>
              <span className="calc-item-val">{numBags} Bags</span>
            </div>
            <div className="calc-item" style={{ borderLeft: '2px solid #2563eb', paddingLeft: '0.75rem' }}>
              <span className="calc-item-label">Net Clean EP Quantity</span>
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

                <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="form-group">
                    <label className="form-label">Sale Rate (₹/kg) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control num-input"
                      placeholder="Rate per kg"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      required={rateType !== 'storage_out'}
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
                      <option value="cash_bill">Cash Sale / Regular Bill (No GST)</option>
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

                {/* Tax Breakdown Grid */}
                {billType === 'gst_bill' && (
                  <div className="form-grid-3" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>CGST %</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control form-control-sm"
                        value={cgstRate}
                        onChange={(e) => setCgstRate(e.target.value)}
                      />
                      <small style={{ fontSize: '0.75rem', color: '#64748b' }}>₹{calcCgst.toLocaleString()}</small>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>SGST %</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control form-control-sm"
                        value={sgstRate}
                        onChange={(e) => setSgstRate(e.target.value)}
                      />
                      <small style={{ fontSize: '0.75rem', color: '#64748b' }}>₹{calcSgst.toLocaleString()}</small>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>TDS % (u/s 194Q)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm"
                        value={tdsRate}
                        onChange={(e) => setTdsRate(e.target.value)}
                      />
                      <small style={{ fontSize: '0.75rem', color: '#64748b' }}>- ₹{calcTdsAmount.toLocaleString()}</small>
                    </div>
                  </div>
                )}

                {/* Bill Amounts Dark Summary */}
                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', color: '#fff', padding: '0.85rem 1.1rem', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Taxable Amount:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>₹{calcTaxable.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>GST Added:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', color: '#38bdf8' }}>+₹{calcGstTotal.toLocaleString()}</strong>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Net Sales Receivable:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', color: '#4ade80' }}>₹{calcNetAmount.toLocaleString()}</strong>
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

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel (Esc)
            </button>
            <button type="submit" className="btn btn-success" disabled={isSubmitting}>
              {isEditMode ? <Edit2 size={16} /> : <Check size={16} />}
              {isSubmitting ? 'Saving...' : isEditMode ? ' Update Dispatch' : ' Save Dispatch Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
