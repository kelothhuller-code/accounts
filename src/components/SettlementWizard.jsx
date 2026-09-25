import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  CheckSquare, 
  Square, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  Handshake, 
  PackageCheck, 
  Truck, 
  Calculator, 
  Scale, 
  Info,
  DollarSign,
  ArrowRight
} from 'lucide-react';
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
  
  // Settlement Mode: 'bags', 'weight', 'end_product'
  const [settleMode, setSettleMode] = useState('bags');
  const [settleBagsInput, setSettleBagsInput] = useState('');
  const [settleWeightInput, setSettleWeightInput] = useState('');
  const [settleEpInput, setSettleEpInput] = useState('');

  // Rate & Commitment mode
  const [rateMode, setRateMode] = useState('manual'); // 'manual' or 'commitment'
  const [selectedCommitmentId, setSelectedCommitmentId] = useState('');
  const [settleRate, setSettleRate] = useState('');
  const [rateUnit, setRateUnit] = useState('per_kg_ep'); // 'per_kg_ep', 'per_bag', 'per_kg_raw'

  // Taxes & Adjustments
  const [tcsRate, setTcsRate] = useState('0.1');
  const [tdsRate, setTdsRate] = useState('0');
  const [cgstRate, setCgstRate] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');

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
        syncInputValues(allIds, pendingDispatches);
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
        syncInputValues(allIds, pendingArrivals);
      }
    } catch (e) {
      setErrorMsg('Failed to load storage items: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const syncInputValues = (ids, itemList) => {
    const active = (itemList || storageItems).filter(item => ids.includes(item.id));
    let tB = 0;
    let tW = 0;
    let tEP = 0;
    active.forEach(item => {
      const b = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
      const ep = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
      const w = item.bags > 0 ? (b / item.bags) * (Number(item.weight) || (b * 50)) : Number(item.weight || (b * 50));
      tB += b;
      tW += w;
      tEP += ep;
    });
    setSettleBagsInput(String(Math.round(tB * 100) / 100));
    setSettleWeightInput(String(Math.round(tW * 100) / 100));
    setSettleEpInput(String(Math.round(tEP * 100) / 100));
  };

  const handleToggleItem = (id) => {
    let newSelected;
    if (selectedItemIds.includes(id)) {
      newSelected = selectedItemIds.filter(x => x !== id);
    } else {
      newSelected = [...selectedItemIds, id];
    }
    setSelectedItemIds(newSelected);
    syncInputValues(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === storageItems.length) {
      setSelectedItemIds([]);
      setSettleBagsInput('0');
      setSettleWeightInput('0');
      setSettleEpInput('0');
    } else {
      const allIds = storageItems.map(item => item.id);
      setSelectedItemIds(allIds);
      syncInputValues(allIds);
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
    const w = item.bags > 0 ? (b / item.bags) * Number(item.weight || (b * 50)) : Number(item.weight || (b * 50));

    totalAvailBags += b;
    totalAvailWeight += w;
    totalAvailEndProduct += ep;
  });

  // Calculate Weighted Average Outturn of the combined batch
  const weightedAvgOutturn = totalAvailWeight > 0 ? (totalAvailEndProduct / (totalAvailWeight / 50)) : 0;
  const weightedAvgYieldPercent = totalAvailWeight > 0 ? (totalAvailEndProduct / totalAvailWeight) * 100 : 0;

  // Compute actual settlement quantities based on active settleMode
  let settledBags = 0;
  let settledWeight = 0;
  let settledEndProduct = 0;

  if (settleMode === 'weight') {
    const inW = parseFloat(settleWeightInput) || 0;
    settledWeight = Math.min(inW, totalAvailWeight);
    const ratio = totalAvailWeight > 0 ? settledWeight / totalAvailWeight : 0;
    settledBags = Math.round((totalAvailBags * ratio) * 100) / 100;
    settledEndProduct = Math.round((totalAvailEndProduct * ratio) * 100) / 100;
  } else if (settleMode === 'end_product') {
    const inEP = parseFloat(settleEpInput) || 0;
    settledEndProduct = Math.min(inEP, totalAvailEndProduct);
    const ratio = totalAvailEndProduct > 0 ? settledEndProduct / totalAvailEndProduct : 0;
    settledBags = Math.round((totalAvailBags * ratio) * 100) / 100;
    settledWeight = Math.round((totalAvailWeight * ratio) * 100) / 100;
  } else {
    // Default 'bags' mode (supports whole & decimal bags like 2, 3.5 bags)
    const inB = parseFloat(settleBagsInput) || 0;
    settledBags = Math.min(inB, totalAvailBags);
    const ratio = totalAvailBags > 0 ? settledBags / totalAvailBags : 0;
    settledWeight = Math.round((totalAvailWeight * ratio) * 100) / 100;
    settledEndProduct = Math.round((totalAvailEndProduct * ratio) * 100) / 100;
  }

  const numRate = parseFloat(settleRate) || 0;
  const numTcsRate = parseFloat(tcsRate) || 0;
  const numTdsRate = parseFloat(tdsRate) || 0;
  const numCgstRate = parseFloat(cgstRate) || 0;
  const numSgstRate = parseFloat(sgstRate) || 0;

  let grossSettlementAmount = 0;
  if (rateUnit === 'per_bag') {
    grossSettlementAmount = settledBags * numRate;
  } else if (rateUnit === 'per_kg_raw') {
    grossSettlementAmount = settledWeight * numRate;
  } else {
    // Standard per_kg_ep
    grossSettlementAmount = settledEndProduct * numRate;
  }
  grossSettlementAmount = Math.round(grossSettlementAmount * 100) / 100;

  const cgstAmount = Math.round((grossSettlementAmount * (numCgstRate / 100)) * 100) / 100;
  const sgstAmount = Math.round((grossSettlementAmount * (numSgstRate / 100)) * 100) / 100;
  const tcsAmount = Math.round((grossSettlementAmount * (numTcsRate / 100)) * 100) / 100;
  const tdsAmount = Math.round((grossSettlementAmount * (numTdsRate / 100)) * 100) / 100;
  const netSettlementAmount = Math.round((grossSettlementAmount + cgstAmount + sgstAmount - tdsAmount + tcsAmount) * 100) / 100;

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
    if (settledBags <= 0 && settledEndProduct <= 0) {
      setErrorMsg('Please enter a valid quantity to settle');
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
        settleMode,
        settleBags: settledBags,
        settleWeight: settledWeight,
        settleEndProduct: settledEndProduct,
        settlementRate: numRate,
        rateUnit,
        cgstRate: numCgstRate,
        sgstRate: numSgstRate,
        tcsRate: numTcsRate,
        tdsRate: numTdsRate,
        date,
        notes
      };

      const res = await dbAction('settlements:settle', payload);

      setSuccessMsg(`Settlement ${res.settlementNo} executed successfully for ₹${res.settlementNetAmount.toLocaleString('en-IN')}!`);
      await loadStorageItems(selectedSupplierId, settlementCategory);
      await loadSupplierCommitments(selectedSupplierId, settlementCategory);
      if (onSettled) onSettled();
    } catch (err) {
      setErrorMsg(err.message || 'Settlement failed');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title">
            <Layers size={20} color="#92400e" />
            <span>Storage Coffee Settlement Wizard</span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Multi-Lot Outturn & Quantity-Wise Price Settlement (Arrivals & Dispatches)
          </span>
        </div>

        {/* Settlement Category Pills: Purchase Storage vs Sales Storage */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn ${settlementCategory === 'purchase_storage' ? 'btn-coffee' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.65rem', fontSize: '0.88rem', fontWeight: 600 }}
            onClick={() => {
              setSettlementCategory('purchase_storage');
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            <Truck size={16} /> 📦 Purchase Storage Settlement (Store In Arrivals)
          </button>
          <button
            type="button"
            className={`btn ${settlementCategory === 'sales_storage' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, padding: '0.65rem', fontSize: '0.88rem', fontWeight: 600 }}
            onClick={() => {
              setSettlementCategory('sales_storage');
              setErrorMsg('');
              setSuccessMsg('');
            }}
          >
            <PackageCheck size={16} /> 📤 Sales Storage Settlement (Store Out Dispatches)
          </button>
        </div>

        {/* Step 1: Select Party */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                Select Party with {settlementCategory === 'sales_storage' ? 'Store Out Dispatches' : 'Store In Arrivals'}
              </label>
              {onOpenNewSupplier && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  onClick={onOpenNewSupplier}
                >
                  + Create New Party
                </button>
              )}
            </div>
            <SearchableSupplierSelect
              value={selectedSupplierId}
              onChange={(id) => {
                setSelectedSupplierId(id);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              placeholder="Search party by name, place, phone..."
            />
          </div>

          {selectedSupplier && (
            <div style={{ display: 'flex', gap: '0.75rem', background: '#fff', padding: '0.65rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Store In Balance</div>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>
                  {selectedSupplier.storageBags || 0} bags ({selectedSupplier.storageEndProduct?.toLocaleString() || 0} kg EP)
                </div>
              </div>
              <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: '0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Ledger Balance</div>
                <div style={{ fontWeight: 700, color: (selectedSupplier.netPayable || 0) >= 0 ? '#b45309' : '#059669', fontSize: '0.95rem' }}>
                  ₹{Math.abs(selectedSupplier.netPayable || 0).toLocaleString('en-IN')} {(selectedSupplier.netPayable || 0) >= 0 ? 'Payable' : 'Receivable'}
                </div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ padding: '0.75rem 1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', color: '#047857', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Check size={16} /> {successMsg}
          </div>
        )}

        {/* Step 2: Storage Lots Table */}
        {selectedSupplierId && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>Unsettled Storage Lots ({storageItems.length})</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>- Select multiple arrivals to settle as group</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleSelectAll}
                style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
              >
                {selectedItemIds.length === storageItems.length ? 'Deselect All' : 'Select All Lots'}
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading storage records...</div>
            ) : storageItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '0.88rem' }}>
                No unsettled {settlementCategory === 'sales_storage' ? 'Store Out dispatches' : 'Store In arrivals'} found for this party.
              </div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ width: '38px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedItemIds.length === storageItems.length && storageItems.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th style={{ textAlign: 'left' }}>Lot / Voucher #</th>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Commodity</th>
                      <th style={{ textAlign: 'right' }}>Remaining Bags</th>
                      <th style={{ textAlign: 'right' }}>Remaining Weight</th>
                      <th style={{ textAlign: 'center' }}>Outturn Test</th>
                      <th style={{ textAlign: 'right' }}>Remaining EP (kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageItems.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const remB = item.remainingBags !== undefined ? Number(item.remainingBags) : Number(item.bags);
                      const remEP = item.remainingEndProduct !== undefined ? Number(item.remainingEndProduct) : Number(item.endProductWeight || item.weight || 0);
                      const remW = item.bags > 0 ? (remB / item.bags) * (Number(item.weight) || (remB * 50)) : Number(item.weight || (remB * 50));
                      const lotOutturn = item.outturn || (remW > 0 ? Math.round((remEP / (remW / 50)) * 100) / 100 : 26);
                      const yieldPct = remW > 0 ? ((remEP / remW) * 100).toFixed(1) : 52;

                      return (
                        <tr
                          key={item.id}
                          style={{
                            background: isSelected ? '#eff6ff' : 'transparent',
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleToggleItem(item.id)}
                        >
                          <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleItem(item.id)}
                            />
                          </td>
                          <td style={{ fontWeight: 600, color: '#1e3a8a' }}>
                            {item.arrivalNo || item.dispatchNo}
                          </td>
                          <td>{item.date}</td>
                          <td style={{ fontWeight: 500 }}>{item.product}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{remB} bags</td>
                          <td style={{ textAlign: 'right' }}>{Math.round(remW)} kg</td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                              {lotOutturn} kg/50kg ({yieldPct}%)
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                            {remEP.toLocaleString()} kg
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Step 3: Multi-Lot Batch Outturn Analysis Card (USER'S EXPLICIT COFFEE REQUIREMENT) */}
            {selectedItems.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.25rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#1e3a8a', fontSize: '0.92rem' }}>
                    <Scale size={18} color="#2563eb" /> Multi-Lot Batch Outturn Analysis ({selectedItems.length} Lots Selected)
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#047857', background: '#dcfce7', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                    Weighted Coffee Yield
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div style={{ background: '#fff', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Selected Bags</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      {Math.round(totalAvailBags * 100) / 100} bags
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Total Raw Weight</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      {Math.round(totalAvailWeight).toLocaleString()} kg
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Clean End Product (EP)</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
                      {Math.round(totalAvailEndProduct).toLocaleString()} kg
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '0.65rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Weighted Batch Outturn</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b45309' }}>
                      {weightedAvgOutturn.toFixed(2)} kg/50kg
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      {weightedAvgYieldPercent.toFixed(1)}% clean yield
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Settlement Configuration Form */}
            {selectedItems.length > 0 && (
              <form onSubmit={handleExecuteSettlement} style={{ background: '#fff', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calculator size={18} color="#059669" /> Settlement Parameters & Pricing
                </div>

                {/* Settle Mode Selector (By Bags vs By Raw Weight vs By EP kg) */}
                <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontWeight: 700, color: '#1e3a8a', marginBottom: '0.4rem' }}>
                    How would you like to specify the settlement quantity? *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: settleMode === 'bags' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: settleMode === 'bags' ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="settleMode"
                        checked={settleMode === 'bags'}
                        onChange={() => setSettleMode('bags')}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>By Bag Count</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Supports 2, 3.5, 50 bags...</div>
                      </div>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: settleMode === 'weight' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: settleMode === 'weight' ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="settleMode"
                        checked={settleMode === 'weight'}
                        onChange={() => setSettleMode('weight')}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>By Total Raw Weight (kg)</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>e.g. 150 kg, 1,000 kg...</div>
                      </div>
                    </label>

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: settleMode === 'end_product' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: settleMode === 'end_product' ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="radio"
                        name="settleMode"
                        checked={settleMode === 'end_product'}
                        onChange={() => setSettleMode('end_product')}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>By Clean End Product (EP)</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>e.g. 500 kg EP, 2,000 kg EP...</div>
                      </div>
                    </label>
                  </div>

                  {/* Quantity Input based on mode */}
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {settleMode === 'bags' && (
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          Enter Bag Count to Settle (Max: {totalAvailBags} bags) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          max={totalAvailBags}
                          min="0.01"
                          className="form-control"
                          placeholder="e.g. 2 or 3.5"
                          value={settleBagsInput}
                          onChange={e => setSettleBagsInput(e.target.value)}
                          required
                        />
                      </div>
                    )}

                    {settleMode === 'weight' && (
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          Enter Raw Weight to Settle in Kg (Max: {Math.round(totalAvailWeight)} kg) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          max={totalAvailWeight}
                          min="0.1"
                          className="form-control"
                          placeholder="e.g. 175"
                          value={settleWeightInput}
                          onChange={e => setSettleWeightInput(e.target.value)}
                          required
                        />
                      </div>
                    )}

                    {settleMode === 'end_product' && (
                      <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          Enter Clean EP Weight to Settle in Kg (Max: {Math.round(totalAvailEndProduct)} kg) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          max={totalAvailEndProduct}
                          min="0.1"
                          className="form-control"
                          placeholder="e.g. 500"
                          value={settleEpInput}
                          onChange={e => setSettleEpInput(e.target.value)}
                          required
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '1.25rem', fontSize: '0.78rem' }}
                      onClick={() => {
                        setSettleBagsInput(String(totalAvailBags));
                        setSettleWeightInput(String(Math.round(totalAvailWeight)));
                        setSettleEpInput(String(Math.round(totalAvailEndProduct)));
                      }}
                    >
                      Fill 100% Full Balance
                    </button>
                  </div>
                </div>

                {/* Settle Rate & Pricing Unit */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ fontWeight: 600 }}>Settlement Rate *</label>
                      <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="rateMode"
                            checked={rateMode === 'manual'}
                            onChange={() => setRateMode('manual')}
                          />
                          <span>Manual</span>
                        </label>
                        {commitments.length > 0 && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#2563eb' }}>
                            <input
                              type="radio"
                              name="rateMode"
                              checked={rateMode === 'commitment'}
                              onChange={() => {
                                setRateMode('commitment');
                                if (commitments[0]) applyCommitment(commitments[0]);
                              }}
                            />
                            <span>Against Contract</span>
                          </label>
                        )}
                      </div>
                    </div>

                    {rateMode === 'commitment' && commitments.length > 0 ? (
                      <select
                        className="form-control"
                        value={selectedCommitmentId}
                        onChange={e => handleCommitmentChange(e.target.value)}
                      >
                        {commitments.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.commitmentNo} - Rate ₹{c.rate} ({c.type}) - Rem: {c.remainingQty}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        placeholder="e.g. 420.00"
                        value={settleRate}
                        onChange={e => setSettleRate(e.target.value)}
                        required
                      />
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Rate Applied Per *</label>
                    <select
                      className="form-control"
                      value={rateUnit}
                      onChange={e => setRateUnit(e.target.value)}
                    >
                      <option value="per_kg_ep">₹ per Kg of Clean End Product (EP) [Standard Coffee]</option>
                      <option value="per_bag">₹ per 50kg Bag</option>
                      <option value="per_kg_raw">₹ per Kg of Raw / Net Weight (Direct)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>Settlement Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Taxes & Deductions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>TCS Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={tcsRate}
                      onChange={e => setTcsRate(e.target.value)}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Default 0.1%</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>TDS Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={tdsRate}
                      onChange={e => setTdsRate(e.target.value)}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Default 0%</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>CGST Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={cgstRate}
                      onChange={e => setCgstRate(e.target.value)}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>0% for Raw Coffee</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>SGST Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={sgstRate}
                      onChange={e => setSgstRate(e.target.value)}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>0% for Raw Coffee</span>
                  </div>
                </div>

                {/* Notes */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Settlement Notes / Remarks</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Settle 3.5 bags based on agreed market price of Rs 420/kg EP"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                {/* Live Voucher Preview & Breakdown */}
                <div style={{
                  background: '#0f172a',
                  color: '#fff',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Settlement Voucher Breakdown
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#e2e8f0', marginTop: '0.25rem' }}>
                      Settling: <strong>{settledBags} bags</strong> ({Math.round(settledWeight)} kg raw) → <strong>{Math.round(settledEndProduct).toLocaleString()} kg EP</strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                      Agreed Rate: ₹{numRate} / {rateUnit.replace('per_', '')} | Avg Batch Outturn: {weightedAvgOutturn.toFixed(2)} kg/50kg
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Gross: ₹{grossSettlementAmount.toLocaleString('en-IN')} | TCS: +₹{tcsAmount}
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#38bdf8' }}>
                      ₹{netSettlementAmount.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                      Net Settlement Value ({settlementCategory === 'sales_storage' ? 'Receivable' : 'Payable'})
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || settledBags <= 0 || numRate <= 0}
                    style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem', fontWeight: 700 }}
                  >
                    <Check size={18} /> {submitting ? 'Executing Settlement...' : 'Execute Storage Settlement'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
