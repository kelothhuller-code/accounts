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
  const [chosenBasis, setChosenBasis] = useState(null); // 'end_product' | 'direct' | null
  
  const [weight, setWeight] = useState('');
  const [bags, setBags] = useState('');
  const [outturn, setOutturn] = useState('26');
  const [outturnType, setOutturnType] = useState('per_50kg'); // 'per_50kg' or 'percentage'
  const [endProductWeight, setEndProductWeight] = useState('');
  
  // Returns & Rejections Tracking
  const [returns, setReturns] = useState([]);
  const [originalWeight, setOriginalWeight] = useState('');
  const [originalBags, setOriginalBags] = useState('');
  const [originalEndProductWeight, setOriginalEndProductWeight] = useState('');
  const [showAddReturn, setShowAddReturn] = useState(false);
  const [newReturnDate, setNewReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newReturnVehicle, setNewReturnVehicle] = useState('');
  const [newReturnWeight, setNewReturnWeight] = useState('');
  const [newReturnBags, setNewReturnBags] = useState('');
  const [newReturnReason, setNewReturnReason] = useState('');

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
      setChosenBasis(dispatchToEdit.calculationBasis || null);

      setWeight(dispatchToEdit.weight ? String(dispatchToEdit.weight) : '');
      setBags(dispatchToEdit.bags ? String(dispatchToEdit.bags) : '');
      setOutturn(dispatchToEdit.outturn ? String(dispatchToEdit.outturn) : '26');
      setOutturnType(dispatchToEdit.outturnType || 'per_50kg');
      setEndProductWeight(dispatchToEdit.endProductWeight ? String(dispatchToEdit.endProductWeight) : '');

      const editReturns = Array.isArray(dispatchToEdit.returns) ? dispatchToEdit.returns : [];
      setReturns(editReturns);
      const totRetW = editReturns.reduce((s, r) => s + (Number(r.weight) || 0), 0);
      const totRetB = editReturns.reduce((s, r) => s + (Number(r.bags) || 0), 0);
      const totRetEP = editReturns.reduce((s, r) => s + (Number(r.endProductWeight) || Number(r.weight) || 0), 0);

      const origW = dispatchToEdit.originalWeight !== undefined && dispatchToEdit.originalWeight !== null
        ? dispatchToEdit.originalWeight
        : (totRetW > 0 ? (Number(dispatchToEdit.weight) || 0) + totRetW : (dispatchToEdit.weight || ''));
      setOriginalWeight(origW !== '' ? String(origW) : '');

      const origB = dispatchToEdit.originalBags !== undefined && dispatchToEdit.originalBags !== null
        ? dispatchToEdit.originalBags
        : (totRetB > 0 ? (Number(dispatchToEdit.bags) || 0) + totRetB : (dispatchToEdit.bags || ''));
      setOriginalBags(origB !== '' ? String(origB) : '');

      const origEP = dispatchToEdit.originalEndProductWeight !== undefined && dispatchToEdit.originalEndProductWeight !== null
        ? dispatchToEdit.originalEndProductWeight
        : (totRetEP > 0 ? (Number(dispatchToEdit.endProductWeight) || 0) + totRetEP : (dispatchToEdit.endProductWeight || ''));
      setOriginalEndProductWeight(origEP !== '' ? String(origEP) : '');
      setShowAddReturn(false);

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

  // Weight / Bags / EP auto-calculation
  const handleWeightChange = (e) => {
    const val = e.target.value;
    setWeight(val);
    const numW = parseFloat(val);
    if (!isNaN(numW) && numW > 0) {
      const autoBags = Math.round((numW / 50) * 100) / 100;
      setBags(String(autoBags));
      if (isDirectBasis) {
        setEndProductWeight(val);
      } else {
        const numOT = parseFloat(outturn) || 26;
        const ep = outturnType === 'percentage' ? (numW * (numOT / 100)) : ((numW / 50) * numOT);
        setEndProductWeight(String(Math.round(ep * 100) / 100));
      }
    } else {
      setBags('');
      setEndProductWeight('');
    }
  };

  const handleOutturnChange = (val) => {
    setOutturn(val);
    const numOT = parseFloat(val);
    if (!isNaN(numOT) && numOT > 0 && numWeight > 0 && !isDirectBasis) {
      const ep = outturnType === 'percentage' ? (numWeight * (numOT / 100)) : ((numWeight / 50) * numOT);
      setEndProductWeight(String(Math.round(ep * 100) / 100));
    }
  };

  const handleEpChange = (val) => {
    setEndProductWeight(val);
    const numE = parseFloat(val);
    if (!isNaN(numE) && numE > 0 && numWeight > 0 && !isDirectBasis) {
      const calcOT = outturnType === 'percentage' ? ((numE / numWeight) * 100).toFixed(2) : ((numE / (numWeight / 50))).toFixed(2);
      setOutturn(String(calcOT));
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
    setReturns([]);
    setOriginalWeight('');
    setOriginalBags('');
    setOriginalEndProductWeight('');
    setShowAddReturn(false);
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

  const totalReturnedWeight = returns.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const totalReturnedBags = returns.reduce((s, r) => s + (Number(r.bags) || 0), 0);
  const totalReturnedEP = returns.reduce((s, r) => s + (Number(r.endProductWeight) || Number(r.weight) || 0), 0);

  const handleAddReturn = () => {
    const rWeight = parseFloat(newReturnWeight);
    if (!rWeight || rWeight <= 0) {
      alert('Please enter a valid returned weight in kg');
      return;
    }
    const rBags = parseFloat(newReturnBags) || (Math.round((rWeight / 50) * 100) / 100);
    let rEP = rWeight;
    if (!isDirectBasis && numWeight > 0 && numEP > 0) {
      rEP = Math.round((rWeight * (numEP / (numWeight || 1))) * 100) / 100;
    }

    const currentBaseOrigW = originalWeight !== '' ? parseFloat(originalWeight) : (numWeight + totalReturnedWeight);
    const currentBaseOrigB = originalBags !== '' ? parseFloat(originalBags) : (numBags + totalReturnedBags);
    const currentBaseOrigEP = originalEndProductWeight !== '' ? parseFloat(originalEndProductWeight) : (numEP + totalReturnedEP);

    const newRetItem = {
      id: 'ret_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: newReturnDate || new Date().toISOString().split('T')[0],
      vehicleNo: (newReturnVehicle || '').trim().toUpperCase(),
      weight: rWeight,
      bags: rBags,
      endProductWeight: rEP,
      reason: (newReturnReason || '').trim() || 'Store Out Return / Rejection',
      createdAt: new Date().toISOString()
    };

    const nextReturns = [...returns, newRetItem];
    const nextTotalRetW = nextReturns.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    const nextTotalRetB = nextReturns.reduce((s, r) => s + (Number(r.bags) || 0), 0);
    const nextTotalRetEP = nextReturns.reduce((s, r) => s + (Number(r.endProductWeight) || Number(r.weight) || 0), 0);

    const newNetW = Math.max(0, Math.round((currentBaseOrigW - nextTotalRetW) * 100) / 100);
    const newNetB = Math.max(0, Math.round((currentBaseOrigB - nextTotalRetB) * 100) / 100);
    const newNetEP = Math.max(0, Math.round((currentBaseOrigEP - nextTotalRetEP) * 100) / 100);

    setReturns(nextReturns);
    setOriginalWeight(String(currentBaseOrigW));
    setOriginalBags(String(currentBaseOrigB));
    setOriginalEndProductWeight(String(currentBaseOrigEP));
    setWeight(String(newNetW));
    setBags(String(newNetB));
    setEndProductWeight(String(newNetEP));

    setNewReturnWeight('');
    setNewReturnBags('');
    setNewReturnVehicle('');
    setNewReturnReason('');
    setShowAddReturn(false);
  };

  const handleRemoveReturn = (returnId) => {
    const nextReturns = returns.filter(r => r.id !== returnId);
    const currentBaseOrigW = originalWeight !== '' ? parseFloat(originalWeight) : (numWeight + totalReturnedWeight);
    const currentBaseOrigB = originalBags !== '' ? parseFloat(originalBags) : (numBags + totalReturnedBags);
    const currentBaseOrigEP = originalEndProductWeight !== '' ? parseFloat(originalEndProductWeight) : (numEP + totalReturnedEP);

    const nextTotalRetW = nextReturns.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    const nextTotalRetB = nextReturns.reduce((s, r) => s + (Number(r.bags) || 0), 0);
    const nextTotalRetEP = nextReturns.reduce((s, r) => s + (Number(r.endProductWeight) || Number(r.weight) || 0), 0);

    const newNetW = Math.max(0, Math.round((currentBaseOrigW - nextTotalRetW) * 100) / 100);
    const newNetB = Math.max(0, Math.round((currentBaseOrigB - nextTotalRetB) * 100) / 100);
    const newNetEP = Math.max(0, Math.round((currentBaseOrigEP - nextTotalRetEP) * 100) / 100);

    setReturns(nextReturns);
    setWeight(String(newNetW));
    setBags(String(newNetB));
    setEndProductWeight(String(newNetEP));
  };

  // Live Calculations
  const currentProdName = isCustomProduct ? customProduct : product;
  const selectedProductObj = products.find(p => p.name === currentProdName || p.code === currentProdName);
  const activeBasis = chosenBasis !== null
    ? chosenBasis
    : (selectedProductObj && selectedProductObj.calculationBasis !== undefined && selectedProductObj.calculationBasis !== null
        ? selectedProductObj.calculationBasis
        : null);
  const isDirectBasis = activeBasis === 'direct';

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

  const numEP = (endProductWeight !== '' && !isNaN(parseFloat(endProductWeight))) ? parseFloat(endProductWeight) : calculatedEP;
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
  const calcNetAmount = Math.round((calcBillGross - calcTdsAmount - calcTcsAmount) * 100) / 100;

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
    if (selectedProductObj && activeBasis === null) {
      setError(`Please choose valuation basis (End Product Outturn or Direct Weight) for "${selectedProductObj.name}".`);
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
        originalWeight: originalWeight !== '' ? parseFloat(originalWeight) : (totalReturnedWeight > 0 ? numWeight + totalReturnedWeight : numWeight),
        originalBags: originalBags !== '' ? parseFloat(originalBags) : (totalReturnedBags > 0 ? numBags + totalReturnedBags : numBags),
        originalEndProductWeight: originalEndProductWeight !== '' ? parseFloat(originalEndProductWeight) : (totalReturnedWeight > 0 ? numEP + totalReturnedEP : numEP),
        totalReturnedWeight,
        totalReturnedBags,
        returns,
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
      <div className="modal-content" style={{ maxWidth: '860px' }} onClick={e => e.stopPropagation()}>
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
                background: activeBasis === 'direct' ? '#ecfdf5' : activeBasis === 'end_product' ? '#eff6ff' : '#fffbeb',
                color: activeBasis === 'direct' ? '#047857' : activeBasis === 'end_product' ? '#1d4ed8' : '#b45309',
                border: activeBasis ? 'none' : '1px dashed #f59e0b'
              }}>
                {activeBasis === 'direct' ? '🏷️ Main Product (Direct Weight)' : activeBasis === 'end_product' ? '☕ Raw Commodity (EP via Outturn)' : '⚠️ Basis Not Set (Select below)'}
              </span>
            </div>

            <SearchableProductSelect
              value={product}
              onChange={(pCode, pObj) => {
                setProduct(pCode);
                if (pObj) {
                  if (pObj.calculationBasis) {
                    setChosenBasis(pObj.calculationBasis);
                  } else {
                    setChosenBasis(null);
                  }
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
            {selectedProductObj && (selectedProductObj.calculationBasis === null || selectedProductObj.calculationBasis === undefined) && (
              <div style={{
                background: '#fffbeb',
                border: '1.5px dashed #f59e0b',
                borderRadius: '8px',
                padding: '0.65rem 0.85rem',
                marginTop: '0.5rem'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#b45309', marginBottom: '0.35rem' }}>
                  ⚠️ Calculation Basis is not set for "{selectedProductObj.name}". How should this lot be calculated?
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: activeBasis === 'end_product' ? '#2563eb' : '#fff',
                      color: activeBasis === 'end_product' ? '#fff' : '#1e40af',
                      border: '1px solid #2563eb',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      padding: '0.3rem 0.65rem'
                    }}
                    onClick={() => {
                      setChosenBasis('end_product');
                      if (!outturn || outturn === '50') setOutturn('26');
                    }}
                  >
                    ☕ End Product (EP Outturn)
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: activeBasis === 'direct' ? '#059669' : '#fff',
                      color: activeBasis === 'direct' ? '#fff' : '#065f46',
                      border: '1px solid #059669',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      padding: '0.3rem 0.65rem'
                    }}
                    onClick={() => {
                      setChosenBasis('direct');
                      setOutturn('50');
                    }}
                  >
                    🏷️ Direct Standard Weight
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Weight, Bags, Outturn & Clean EP Calculations */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div className="form-group">
              <label className="form-label">
                Gross Weight (kg) *
                {returns.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: '#e11d48', marginLeft: '6px', fontWeight: 600 }}>
                    (Net Active: {numWeight.toLocaleString()} kg)
                  </span>
                )}
              </label>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                onChange={e => handleOutturnChange(e.target.value)}
                disabled={isDirectBasis}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700, color: '#2563eb' }}>
                Clean EP Weight (kg) *
              </label>
              <input
                type="number"
                step="any"
                className="form-control num-input"
                style={{ fontWeight: 700, color: '#2563eb', border: '1.5px solid #93c5fd' }}
                placeholder="e.g. 5000"
                value={endProductWeight}
                onChange={e => handleEpChange(e.target.value)}
                required
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

          {/* Returns & Rejections Audit Section */}
          <div style={{
            background: returns.length > 0 ? '#fff1f2' : '#f8fafc',
            border: returns.length > 0 ? '1.5px solid #fecdd3' : '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            marginBottom: '0.85rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: returns.length > 0 || showAddReturn ? '0.75rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>↩️</span>
                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: returns.length > 0 ? '#9f1239' : '#334155' }}>
                  Returns & Rejections Audit Tracker {returns.length > 0 && `(${returns.length} Logged)`}
                </span>
                {returns.length > 0 && (
                  <span style={{
                    background: '#e11d48',
                    color: '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}>
                    -{totalReturnedWeight.toLocaleString()} kg Total Returned
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-sm"
                style={{
                  background: showAddReturn ? '#e2e8f0' : '#fee2e2',
                  color: showAddReturn ? '#334155' : '#b91c1c',
                  border: '1px solid #fca5a5',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.6rem'
                }}
                onClick={() => setShowAddReturn(!showAddReturn)}
              >
                {showAddReturn ? 'Cancel Return Entry' : '+ Log Return / Reject'}
              </button>
            </div>

            {/* Active vs Original Balance Summary Bar if returns exist */}
            {returns.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '0.5rem',
                background: '#fff',
                padding: '0.6rem',
                borderRadius: '6px',
                border: '1px solid #ffe4e6',
                marginBottom: '0.75rem',
                textAlign: 'center',
                boxSizing: 'border-box'
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Original Delivered</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    {(Number(originalWeight) || (numWeight + totalReturnedWeight)).toLocaleString()} kg
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid #f1f5f9', borderRight: '1px solid #f1f5f9', minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: '#e11d48', fontWeight: 600, textTransform: 'uppercase' }}>Total Returned</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e11d48' }}>
                    - {totalReturnedWeight.toLocaleString()} kg ({totalReturnedBags} b)
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Net Active Balance</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#059669' }}>
                    = {numWeight.toLocaleString()} kg ({numBags} b)
                  </div>
                </div>
              </div>
            )}

            {/* Existing Returns Table */}
            {returns.length > 0 && (
              <div style={{ overflowX: 'auto', width: '100%', boxSizing: 'border-box', marginBottom: showAddReturn ? '0.75rem' : 0 }}>
                <table style={{ width: '100%', minWidth: '100%', tableLayout: 'fixed', fontSize: '0.78rem', background: '#fff', borderRadius: '4px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#fff1f2', borderBottom: '1px solid #fecdd3', color: '#881337', textAlign: 'left' }}>
                      <th style={{ width: '18%', padding: '6px 8px' }}>Date</th>
                      <th style={{ width: '20%', padding: '6px 8px' }}>Vehicle No</th>
                      <th style={{ width: '18%', padding: '6px 8px', textAlign: 'right' }}>Returned (kg)</th>
                      <th style={{ width: '14%', padding: '6px 8px', textAlign: 'right' }}>Bags</th>
                      <th style={{ width: '22%', padding: '6px 8px' }}>Reason / Remarks</th>
                      <th style={{ width: '8%', padding: '6px 8px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((ret, idx) => (
                      <tr key={ret.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ret.date}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ret.vehicleNo || '-'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#e11d48' }}>
                          {Number(ret.weight).toLocaleString()} kg
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{ret.bags || 0}</td>
                        <td style={{ padding: '6px 8px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ret.reason || '-'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem' }}
                            onClick={() => handleRemoveReturn(ret.id)}
                            title="Remove this return entry"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* New Return Form Input */}
            {showAddReturn && (
              <div style={{
                background: '#fff',
                border: '1.5px dashed #f43f5e',
                borderRadius: '6px',
                padding: '0.85rem',
                marginTop: '0.65rem',
                boxSizing: 'border-box',
                width: '100%'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#9f1239', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>↩️</span>
                  <span>Record New Return / Rejected Quantity</span>
                </div>

                {/* 2x2 Clean Grid for Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', width: '100%', boxSizing: 'border-box' }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Return Date</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      value={newReturnDate}
                      onChange={e => setNewReturnDate(e.target.value)}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Return Vehicle Number</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="e.g. KA-12-AB-3456"
                      value={newReturnVehicle}
                      onChange={e => setNewReturnVehicle(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 700, display: 'block', marginBottom: '2px' }}>Return Weight (kg) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control form-control-sm num-input"
                      style={{ width: '100%', boxSizing: 'border-box', color: '#b91c1c', fontWeight: 700 }}
                      placeholder="e.g. 2000"
                      value={newReturnWeight}
                      onChange={e => {
                        setNewReturnWeight(e.target.value);
                        const nw = parseFloat(e.target.value);
                        if (!isNaN(nw) && nw > 0) {
                          setNewReturnBags(String(Math.round((nw / 50) * 100) / 100));
                        }
                      }}
                    />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Return Bags (Weight ÷ 50)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control form-control-sm num-input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="Auto"
                      value={newReturnBags}
                      onChange={e => setNewReturnBags(e.target.value)}
                    />
                  </div>
                </div>

                {/* Reason / Notes */}
                <div style={{ marginTop: '0.65rem', width: '100%', boxSizing: 'border-box' }}>
                  <label style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Reason / Quality Remarks</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="e.g. Excess dispatch returned / quality rejected"
                    value={newReturnReason}
                    onChange={e => setNewReturnReason(e.target.value)}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                    onClick={() => setShowAddReturn(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{ padding: '0.35rem 0.95rem', fontWeight: 700, fontSize: '0.75rem' }}
                    onClick={handleAddReturn}
                  >
                    ✓ Apply Return
                  </button>
                </div>
              </div>
            )}
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
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>TCS (-): </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#f87171' }}>-₹{calcTcsAmount.toLocaleString()}</strong>
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
