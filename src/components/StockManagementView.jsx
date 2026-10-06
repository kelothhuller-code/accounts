import React, { useState, useEffect } from 'react';
import { 
  Warehouse, 
  Package, 
  Plus, 
  Trash2, 
  Scale, 
  Users, 
  Calendar, 
  Filter, 
  Search, 
  Check, 
  AlertCircle, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Layers, 
  Settings, 
  X,
  FileText,
  Clock,
  Sparkles,
  Sliders,
  AlertTriangle,
  Save,
  SlidersHorizontal
} from 'lucide-react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import SearchableProductSelect from './SearchableProductSelect';

export default function StockManagementView({ onOpenLedger, dataVersion = 0, onDataChanged, onOpenNewSupplier }) {
  const [stockData, setStockData] = useState({
    primaryProducts: [],
    secondaryProducts: [],
    partyAccounts: [],
    totals: {}
  });
  const [millingLogs, setMillingLogs] = useState([]);
  const [openingEntries, setOpeningEntries] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [processingProfiles, setProcessingProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState('godown'); // 'godown', 'processing', 'profiles', 'opening_parties'
  const [stockSubTab, setStockSubTab] = useState('all'); // 'all', 'primary', 'secondary'
  const [onlyAvailableFilter, setOnlyAvailableFilter] = useState(true); // true = show only commodities with active stock or activity
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showMillingModal, setShowMillingModal] = useState(false);
  const [showOpeningEntryModal, setShowOpeningEntryModal] = useState(false);
  const [showStockAdjustModal, setShowStockAdjustModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Processing Form State
  const [millingDate, setMillingDate] = useState(new Date().toISOString().split('T')[0]);
  const [godownName, setGodownName] = useState('Main Godown');
  const [sourceProduct, setSourceProduct] = useState('');
  const [sourceBags, setSourceBags] = useState('');
  const [bagWeightUnit, setBagWeightUnit] = useState('50'); // '50', '60', '75', or 'custom'
  const [sourceWeight, setSourceWeight] = useState('');
  const [millingNotes, setMillingNotes] = useState('');
  
  // Dynamic Output Commodity Yield Rows for Processing
  const [millingOutputs, setMillingOutputs] = useState([
    { id: 'out_1', product: '', percentage: 100 }
  ]);

  // Profile Settings Screen State
  const [selectedProfileProduct, setSelectedProfileProduct] = useState('');
  const [profileOutputs, setProfileOutputs] = useState([
    { id: 'prof_1', product: '', percentage: 100 }
  ]);

  // Manual Stock Adjustment Modal State
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjGodown, setAdjGodown] = useState('Main Godown');
  const [adjProduct, setAdjProduct] = useState('');
  const [adjType, setAdjType] = useState('add'); // 'add' or 'deduct'
  const [adjBags, setAdjBags] = useState('');
  const [adjWeight, setAdjWeight] = useState('');
  const [adjNotes, setAdjNotes] = useState('Manual Stock Adjustment');

  // Opening Stock Entry Form State
  const [opDate, setOpDate] = useState(new Date().toISOString().split('T')[0]);
  const [opGodown, setOpGodown] = useState('Main Godown');
  const [opSupplierId, setOpSupplierId] = useState('');
  const [opSupplierName, setOpSupplierName] = useState('');
  const [opProduct, setOpProduct] = useState('');
  const [opBags, setOpBags] = useState('');
  const [opWeight, setOpWeight] = useState('');
  const [opNotes, setOpNotes] = useState('');

  useEffect(() => {
    loadAllStockData();
  }, [dataVersion]);

  // Set default selected product when products load
  useEffect(() => {
    if (productsList.length > 0) {
      const firstProd = productsList[0].name || productsList[0].code || '';
      if (!sourceProduct) setSourceProduct(firstProd);
      if (!selectedProfileProduct) setSelectedProfileProduct(firstProd);
      if (!adjProduct) setAdjProduct(firstProd);
      if (!opProduct) setOpProduct(firstProd);

      // Set initial outputs to first product if unselected
      setMillingOutputs(prev => prev.map(r => !r.product ? { ...r, product: firstProd } : r));
      setProfileOutputs(prev => prev.map(r => !r.product ? { ...r, product: firstProd } : r));
    }
  }, [productsList]);

  // Auto calculate total processed weight based on Bags & Bag Weight Unit Selection (50kg, 60kg, 75kg)
  useEffect(() => {
    const bags = parseFloat(sourceBags) || 0;
    const unitKg = parseFloat(bagWeightUnit);
    if (bags > 0 && !isNaN(unitKg) && unitKg > 0) {
      setSourceWeight(String(Math.round(bags * unitKg * 100) / 100));
    }
  }, [sourceBags, bagWeightUnit]);

  // Load saved profile when source product changes in processing modal
  useEffect(() => {
    if (sourceProduct && processingProfiles[sourceProduct] && processingProfiles[sourceProduct].length > 0) {
      const savedOutputs = processingProfiles[sourceProduct].map((out, idx) => ({
        id: 'out_' + idx + '_' + Date.now(),
        product: out.product,
        percentage: Number(out.percentage) || 0
      }));
      setMillingOutputs(savedOutputs);
    }
  }, [sourceProduct, processingProfiles]);

  const loadAllStockData = async () => {
    setLoading(true);
    try {
      const [summary, mills, ops, sups, prods, profs] = await Promise.all([
        dbAction('stock:get-summary'),
        dbAction('milling:get'),
        dbAction('stock:get-entries'),
        dbAction('suppliers:get'),
        dbAction('products:get'),
        dbAction('processing-profiles:get')
      ]);

      setStockData(summary || { primaryProducts: [], secondaryProducts: [], partyAccounts: [], totals: {} });
      setMillingLogs(mills || []);
      setOpeningEntries(ops || []);
      setSuppliers(sups || []);
      setProductsList(prods || []);
      setProcessingProfiles(profs || {});
    } catch (err) {
      console.error('Error loading stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Profile Editor Output Rows
  const addProfileOutputRow = () => {
    const defaultProd = productsList[0]?.name || '';
    setProfileOutputs([
      ...profileOutputs,
      { id: 'prof_' + Date.now(), product: defaultProd, percentage: 0 }
    ]);
  };

  const updateProfileOutput = (id, field, value) => {
    setProfileOutputs(profileOutputs.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const removeProfileOutputRow = (id) => {
    if (profileOutputs.length <= 1) return;
    setProfileOutputs(profileOutputs.filter(row => row.id !== id));
  };

  // Processing Modal Output Rows
  const addMillingOutputRow = () => {
    const defaultProd = productsList[0]?.name || '';
    setMillingOutputs([
      ...millingOutputs,
      { id: 'out_' + Date.now(), product: defaultProd, percentage: 0 }
    ]);
  };

  const updateMillingOutput = (id, field, value) => {
    setMillingOutputs(millingOutputs.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const removeMillingOutputRow = (id) => {
    if (millingOutputs.length <= 1) return;
    setMillingOutputs(millingOutputs.filter(row => row.id !== id));
  };

  const totalProcessingPercentage = millingOutputs.reduce((acc, r) => acc + (parseFloat(r.percentage) || 0), 0);
  const totalProfilePercentage = profileOutputs.reduce((acc, r) => acc + (parseFloat(r.percentage) || 0), 0);

  const totalProcessedWeight = parseFloat(sourceWeight) || 0;
  const totalProcessedBags = parseFloat(sourceBags) || 0;

  // Save Processing Profile for selected commodity
  const handleSaveProfileForCommodity = async (targetProduct, outputsToSave) => {
    if (!targetProduct) {
      alert('Please select a commodity first.');
      return;
    }
    const sumPct = outputsToSave.reduce((acc, o) => acc + (parseFloat(o.percentage) || 0), 0);
    if (Math.abs(sumPct - 100) > 0.01) {
      alert(`Yield percentages must sum to 100%. Current sum: ${sumPct}%`);
      return;
    }

    try {
      await dbAction('processing-profiles:save', {
        sourceProduct: targetProduct,
        outputs: outputsToSave.map(o => ({ product: o.product, percentage: Number(o.percentage) || 0 }))
      });
      const updatedProfs = await dbAction('processing-profiles:get');
      setProcessingProfiles(updatedProfs || {});
      alert(`✅ Saved processing yield profile for "${targetProduct}"!`);
    } catch (err) {
      alert('Error saving profile: ' + err.message);
    }
  };

  // Execute Processing Batch
  const handleSaveMilling = async (e) => {
    e.preventDefault();
    if (!sourceProduct) {
      alert('Please select a source commodity to process.');
      return;
    }
    if (!sourceBags && !sourceWeight) {
      alert('Please enter processed quantity (Weight or Bags).');
      return;
    }
    if (Math.abs(totalProcessingPercentage - 100) > 0.01) {
      alert(`Output yield percentages must sum to 100%. Current total: ${totalProcessingPercentage}%`);
      return;
    }

    setSubmitting(true);
    try {
      const calculatedOutputs = millingOutputs.map(row => {
        const pct = parseFloat(row.percentage) || 0;
        const yieldWeight = Math.round((totalProcessedWeight * (pct / 100)) * 100) / 100;
        const yieldBags = totalProcessedBags > 0 ? Math.round(totalProcessedBags * (pct / 100)) : 0;
        return {
          product: row.product,
          percentage: pct,
          yieldWeight,
          yieldBags
        };
      });

      await dbAction('milling:add', {
        date: millingDate,
        godown: godownName,
        sourceProduct,
        sourceBags: totalProcessedBags,
        sourceWeight: totalProcessedWeight,
        inputEPWeight: totalProcessedWeight,
        outputs: calculatedOutputs,
        notes: millingNotes
      });

      setShowMillingModal(false);
      setSourceBags('');
      setSourceWeight('');
      setMillingNotes('');
      await loadAllStockData();
      if (onDataChanged) onDataChanged();
      alert(`✅ Processing executed! Deducted ${sourceProduct} stock and distributed yield across target commodities.`);
    } catch (err) {
      alert('Error saving processing batch: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMilling = async (id) => {
    if (!window.confirm('Delete this processing log? This will reverse the stock deduction and yield additions.')) return;
    try {
      await dbAction('milling:delete', { id });
      await loadAllStockData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error deleting processing log: ' + err.message);
    }
  };

  // Open Manual Stock Adjustment Modal
  const handleOpenAdjustModalForProduct = (item) => {
    setAdjDate(new Date().toISOString().split('T')[0]);
    setAdjGodown('Main Godown');
    setAdjProduct(item ? item.product : (productsList[0]?.name || ''));
    setAdjType('add');
    setAdjBags('');
    setAdjWeight('');
    setAdjNotes(`Manual stock adjustment for ${item ? item.product : 'Commodity'}`);
    setShowStockAdjustModal(true);
  };

  // Submit Manual Stock Adjustment
  const handleSaveStockAdjustment = async (e) => {
    e.preventDefault();
    const rawBags = parseFloat(adjBags) || 0;
    const rawWeight = parseFloat(adjWeight) || 0;

    if (rawBags === 0 && rawWeight === 0) {
      alert('Please enter bags or weight for stock adjustment.');
      return;
    }

    const multiplier = adjType === 'deduct' ? -1 : 1;
    const finalBags = rawBags * multiplier;
    const finalWeight = rawWeight * multiplier;

    setSubmitting(true);
    try {
      await dbAction('stock:add-entry', {
        date: adjDate,
        godown: adjGodown,
        supplierId: null,
        supplierName: `Stock Adjustment (${adjType.toUpperCase()})`,
        product: adjProduct,
        bags: finalBags,
        weight: finalWeight,
        endProductWeight: finalWeight,
        notes: adjNotes
      });

      setShowStockAdjustModal(false);
      await loadAllStockData();
      if (onDataChanged) onDataChanged();
      alert(`✅ Stock adjustment (${adjType === 'add' ? '+ Addition' : '- Deduction'}) recorded!`);
    } catch (err) {
      alert('Error saving stock adjustment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Save Opening Stock Entry
  const handleSaveOpeningEntry = async (e) => {
    e.preventDefault();
    if (!opBags && !opWeight) {
      alert('Please enter bags or weight for opening stock.');
      return;
    }

    const sup = suppliers.find(s => s.id === opSupplierId);

    setSubmitting(true);
    try {
      await dbAction('stock:add-entry', {
        date: opDate,
        godown: opGodown,
        supplierId: opSupplierId || null,
        supplierName: sup ? sup.name : (opSupplierName || 'Global / Unallocated'),
        product: opProduct,
        bags: parseFloat(opBags) || 0,
        weight: parseFloat(opWeight) || 0,
        endProductWeight: parseFloat(opWeight) || 0,
        notes: opNotes
      });

      setShowOpeningEntryModal(false);
      setOpBags('');
      setOpWeight('');
      setOpNotes('');
      await loadAllStockData();
      if (onDataChanged) onDataChanged();
      alert('✅ Opening stock entry saved successfully!');
    } catch (err) {
      alert('Error saving opening stock: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOpeningEntry = async (id) => {
    if (!window.confirm('Delete this opening stock entry?')) return;
    try {
      await dbAction('stock:delete-entry', { id });
      await loadAllStockData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error deleting entry: ' + err.message);
    }
  };

  // Helper to check if a commodity has active stock or historical transactions
  const hasActiveStock = (item) => {
    if (!onlyAvailableFilter) return true;
    return (item.currentWeight !== 0 || item.currentEP !== 0 || item.currentBags !== 0 ||
            item.openingWeight !== 0 || item.storeInWeight !== 0 || item.storeOutWeight !== 0 ||
            item.millingDeductedWeight !== 0 || item.millingYieldWeight !== 0);
  };

  // Filtered Stock Items
  const filteredPrimary = (stockData.primaryProducts || []).filter(item => {
    if (!hasActiveStock(item)) return false;
    if (!searchQuery.trim()) return true;
    return item.product.toLowerCase().includes(searchQuery.toLowerCase()) || (item.category || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredSecondary = (stockData.secondaryProducts || []).filter(item => {
    if (!hasActiveStock(item)) return false;
    if (!searchQuery.trim()) return true;
    return item.product.toLowerCase().includes(searchQuery.toLowerCase()) || (item.category || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredParties = (stockData.partyAccounts || []).filter(item => {
    if (!searchQuery.trim()) return true;
    return item.supplierName.toLowerCase().includes(searchQuery.toLowerCase()) || (item.place || '').toLowerCase().includes(searchQuery.toLowerCase());
  });

  const { totals = {} } = stockData;

  const renderStockTableRow = (item) => {
    const isNegativeEP = item.currentEP < 0;
    const isNegativeNet = item.currentWeight < 0 || item.currentBags < 0;
    return (
      <tr key={item.product} style={{ background: (isNegativeEP || isNegativeNet) ? '#fff5f5' : 'transparent' }}>
        <td>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>{item.product}</span>
            {item.isSecondary && (
              <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', background: '#f3e8ff', color: '#7e22ce' }}>
                🌾 Secondary / Byproduct
              </span>
            )}
            {(isNegativeEP || isNegativeNet) && (
              <span style={{ fontSize: '0.7rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                <AlertTriangle size={12} /> Negative Stock (-ve)
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            {item.category || (item.isSecondary ? 'Secondary Commodity' : 'Primary Commodity')}
          </div>
        </td>
        <td style={{ textAlign: 'right' }}>
          <div>{item.openingBags > 0 ? `${item.openingBags.toLocaleString()} bags` : (item.openingBags < 0 ? `${item.openingBags.toLocaleString()} bags` : '-')}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{item.openingWeight.toLocaleString()} kg Net</div>
        </td>
        <td style={{ textAlign: 'right', color: '#15803d' }}>
          <div>{item.storeInBags > 0 ? `+${item.storeInBags.toLocaleString()} bags` : '-'}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>+{(item.storeInWeight || 0).toLocaleString()} kg Net</div>
        </td>
        <td style={{ textAlign: 'right', color: '#b45309' }}>
          <div>{item.storeOutBags > 0 ? `-${item.storeOutBags.toLocaleString()} bags` : '-'}</div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>-{(item.storeOutWeight || 0).toLocaleString()} kg Net</div>
        </td>
        <td style={{ textAlign: 'right' }}>
          {item.millingDeductedWeight > 0 && (
            <div style={{ color: '#dc2626', fontSize: '0.78rem', fontWeight: 700 }}>
              -{item.millingDeductedWeight.toLocaleString()} kg Processed ({item.millingDeductedBags.toLocaleString()} bags)
            </div>
          )}
          {item.millingYieldWeight > 0 && (
            <div style={{ color: '#7c3aed', fontSize: '0.78rem', fontWeight: 700 }}>
              +{(item.millingYieldWeight || 0).toLocaleString()} kg Yield
            </div>
          )}
          {item.millingDeductedWeight === 0 && item.millingYieldWeight === 0 && (
            <span style={{ color: '#cbd5e1' }}>-</span>
          )}
        </td>
        <td style={{ textAlign: 'right', background: isNegativeNet ? '#fee2e2' : '#f8fafc', fontWeight: 700 }}>
          <div style={{ fontSize: '0.92rem', color: isNegativeNet ? '#dc2626' : '#0f172a' }}>
            {item.currentWeight.toLocaleString()} <span style={{ fontSize: '0.72rem' }}>kg</span>
          </div>
          {item.currentBags !== 0 && (
            <div style={{ fontSize: '0.72rem', color: isNegativeNet ? '#991b1b' : '#64748b' }}>
              {item.currentBags.toLocaleString()} bags
            </div>
          )}
        </td>
        <td style={{ textAlign: 'right', background: isNegativeEP ? '#fee2e2' : '#f0f9ff', fontWeight: 800 }}>
          <div style={{ fontSize: '1rem', color: isNegativeEP ? '#dc2626' : '#2563eb' }}>
            {item.currentEP.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>kg</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: isNegativeEP ? '#991b1b' : '#1e40af' }}>
            Available EP
          </div>
        </td>
        <td style={{ textAlign: 'right' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
            onClick={() => handleOpenAdjustModalForProduct(item)}
            title="Manually adjust stock for this commodity"
          >
            <Sliders size={13} color="#d97706" /> Adjust Stock
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', boxSizing: 'border-box' }}>
      {/* Header Overview Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="card-title">
              <Warehouse size={22} color="#0284c7" />
              <span>Godown Stock & Commodity Processing Center</span>
              <span className="badge badge-blue">Universal Inventory</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Dynamic stock tracking & percentage-based yield processing for any commodity globally.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-purple" 
              style={{ background: '#7c3aed', color: '#fff' }}
              onClick={() => setShowMillingModal(true)}
            >
              <Sparkles size={16} /> + Process Commodity
            </button>
            <button 
              className="btn btn-warning" 
              style={{ background: '#f59e0b', color: '#fff', borderColor: '#d97706' }}
              onClick={() => handleOpenAdjustModalForProduct(null)}
            >
              <Sliders size={16} /> ⚡ Manual Stock Adjustment
            </button>
            <button 
              className="btn btn-primary" 
              style={{ background: '#0284c7', borderColor: '#0284c7' }}
              onClick={() => setShowOpeningEntryModal(true)}
            >
              <Plus size={16} /> + Opening Stock Entry
            </button>
          </div>
        </div>

        {/* Global Summary KPI Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
          <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>📦 Total Opening Stock</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
              {(totals.totalOpeningEP || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>kg</span>
            </div>
          </div>

          <div style={{ background: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <ArrowDownLeft size={14} /> Total Inward Store-In
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
              {(totals.totalStoreInEP || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.75rem', color: '#166534' }}>kg</span>
            </div>
          </div>

          <div style={{ background: '#fffbeb', padding: '0.75rem', borderRadius: '8px', border: '1px solid #fef08a' }}>
            <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <ArrowUpRight size={14} /> Total Outward Store-Out
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#b45309', marginTop: '0.2rem' }}>
              {(totals.totalStoreOutEP || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.75rem', color: '#92400e' }}>kg</span>
            </div>
          </div>

          <div style={{ background: '#f5f3ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 600 }}>⚙️ Primary EP Yield</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.2rem' }}>
              {(totals.totalMillingYieldEP || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.75rem', color: '#6b21a8' }}>kg</span>
            </div>
          </div>

          <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: 700 }}>⚖️ Primary Available EP Stock</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: totals.totalCurrentAvailableEP < 0 ? '#dc2626' : '#2563eb', marginTop: '0.2rem' }}>
              {(totals.totalCurrentAvailableEP || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.78rem', color: totals.totalCurrentAvailableEP < 0 ? '#dc2626' : '#1d4ed8' }}>kg</span>
            </div>
          </div>

          <div style={{ background: '#faf5ff', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: '0.75rem', color: '#7e22ce', fontWeight: 700 }}>🌾 Secondary Byproduct Stock</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#9333ea', marginTop: '0.2rem' }}>
              {(totals.totalSecondaryWeight || 0).toLocaleString('en-IN')} <span style={{ fontSize: '0.78rem', color: '#7e22ce' }}>kg</span>
            </div>
            {(totals.totalSecondaryBags || 0) !== 0 && (
              <div style={{ fontSize: '0.72rem', color: '#6b21a8', fontWeight: 600 }}>
                {totals.totalSecondaryBags.toLocaleString()} bags
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className={`btn btn-sm ${activeTab === 'godown' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('godown')}
          >
            📦 Commodity Godown Stock Balances ({filteredPrimary.length + filteredSecondary.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'processing' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('processing')}
          >
            ⚙️ Processing Logs ({millingLogs.length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'profiles' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('profiles')}
          >
            🛠️ Commodity Processing Yield Settings ({Object.keys(processingProfiles).length})
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'opening_parties' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('opening_parties')}
          >
            👥 Party Storage Balances ({openingEntries.length})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#fff', padding: '0.35rem 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
          <Search size={14} color="#64748b" />
          <input
            type="text"
            placeholder="Search commodity or party..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', width: '180px' }}
          />
          {searchQuery && (
            <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} onClick={() => setSearchQuery('')}>
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: GODOWN COMMODITY BALANCES TABLE */}
      {activeTab === 'godown' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Stock Sub-Filter Buttons */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className={`btn btn-sm ${stockSubTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStockSubTab('all')}
            >
              📦 All Commodities ({filteredPrimary.length + filteredSecondary.length})
            </button>
            <button
              className={`btn btn-sm ${stockSubTab === 'primary' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStockSubTab('primary')}
            >
              🌟 Primary Cleaned EP Commodities ({filteredPrimary.length})
            </button>
            <button
              className={`btn btn-sm ${stockSubTab === 'secondary' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStockSubTab('secondary')}
            >
              🌾 Secondary Commodities & Byproducts ({filteredSecondary.length})
            </button>
          </div>

          {/* TABLE 1: PRIMARY COMMODITY STOCKS (EP WEIGHT) */}
          {(stockSubTab === 'all' || stockSubTab === 'primary') && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', fontWeight: 800, fontSize: '0.88rem', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🌟 Primary Cleaned Commodities Stock Balances</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                  Available EP Weight: <strong>{(totals.totalCurrentAvailableEP || 0).toLocaleString('en-IN')} kg</strong>
                </span>
              </div>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th>Primary Commodity Name</th>
                    <th style={{ textAlign: 'right' }}>Opening Stock</th>
                    <th style={{ textAlign: 'right' }}>Store-In Received</th>
                    <th style={{ textAlign: 'right' }}>Store-Out Dispatched</th>
                    <th style={{ textAlign: 'right' }}>Processing Deduction / Yield</th>
                    <th style={{ textAlign: 'right', background: '#f8fafc', color: '#0f172a' }}>Current Net Weight</th>
                    <th style={{ textAlign: 'right', background: '#eff6ff', color: '#1d4ed8' }}>Current Available EP Weight</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrimary.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        No primary commodity stock entries found.
                      </td>
                    </tr>
                  ) : (
                    filteredPrimary.map(item => renderStockTableRow(item))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TABLE 2: SECONDARY COMMODITIES & BYPRODUCTS STOCKS */}
          {(stockSubTab === 'all' || stockSubTab === 'secondary') && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: '#faf5ff', padding: '0.75rem 1rem', borderBottom: '1px solid #f3e8ff', fontWeight: 800, fontSize: '0.88rem', color: '#7e22ce', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🌾 Secondary Commodities & Byproducts Stock (Husk, Bits, Shells, Blacks, etc.)</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9333ea' }}>
                  Available Secondary Stock: <strong>{(totals.totalSecondaryWeight || 0).toLocaleString('en-IN')} kg</strong>
                </span>
              </div>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ background: '#faf5ff', borderBottom: '1px solid #f3e8ff' }}>
                    <th>Secondary Item / Byproduct</th>
                    <th style={{ textAlign: 'right' }}>Opening Stock</th>
                    <th style={{ textAlign: 'right' }}>Store-In Received</th>
                    <th style={{ textAlign: 'right' }}>Store-Out Dispatched</th>
                    <th style={{ textAlign: 'right' }}>Processing Yield Output</th>
                    <th style={{ textAlign: 'right', background: '#faf5ff', color: '#0f172a' }}>Current Net Weight</th>
                    <th style={{ textAlign: 'right', background: '#f3e8ff', color: '#7e22ce' }}>Current Available Stock</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSecondary.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        No secondary byproduct stock entries found.
                      </td>
                    </tr>
                  ) : (
                    filteredSecondary.map(item => renderStockTableRow(item))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROCESSING LOGS */}
      {activeTab === 'processing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={18} color="#7c3aed" /> Commodity Processing Logs
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Enter processed weight or bags. The system applies the yield percentages and updates stock for all target commodities.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('profiles')}
                >
                  <SlidersHorizontal size={14} /> Yield Settings
                </button>
                <button 
                  className="btn btn-purple"
                  style={{ background: '#7c3aed', color: '#fff' }}
                  onClick={() => setShowMillingModal(true)}
                >
                  <Plus size={16} /> + Process Commodity Batch
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th>Batch # & Date</th>
                  <th>Source Commodity</th>
                  <th style={{ textAlign: 'right' }}>Processed Quantity</th>
                  <th>Target Commodity Yield Breakdown (%)</th>
                  <th>Remarks / Godown</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {millingLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                      No processing batches recorded yet. Click <strong>"+ Process Commodity Batch"</strong> to run a processing batch.
                    </td>
                  </tr>
                ) : (
                  millingLogs.map(mill => (
                    <tr key={mill.id}>
                      <td>
                        <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>{mill.millingNo}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <Calendar size={12} /> {mill.date}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue">{mill.sourceProduct}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#dc2626' }}>
                          -{mill.sourceWeight ? mill.sourceWeight.toLocaleString() : mill.inputEPWeight.toLocaleString()} kg
                        </div>
                        {mill.sourceBags > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            -{mill.sourceBags} bags
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {(mill.outputs || []).map((out, idx) => (
                            <span 
                              key={idx}
                              style={{
                                fontSize: '0.72rem',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                fontWeight: 700
                              }}
                            >
                              {out.product}: {out.percentage}% ({out.yieldWeight.toLocaleString()} kg)
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem' }}>{mill.godown || 'Main Godown'}</div>
                        {mill.notes && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{mill.notes}</div>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-danger btn-sm"
                          style={{ padding: '0.25rem 0.5rem' }}
                          onClick={() => handleDeleteMilling(mill.id)}
                          title="Delete Processing Batch Log"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: COMMODITY PROCESSING YIELD SETTINGS */}
      {activeTab === 'profiles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <SlidersHorizontal size={18} color="#7c3aed" /> Set Processing Yield Settings per Commodity
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Select any commodity from your system and set up target output commodities with their percentage breakdown (100% total).
                </p>
              </div>

              <button 
                className="btn btn-purple" 
                style={{ background: '#7c3aed', color: '#fff' }}
                onClick={() => handleSaveProfileForCommodity(selectedProfileProduct, profileOutputs)}
              >
                <Save size={16} /> Save Yield Settings for {selectedProfileProduct || 'Commodity'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.25rem' }}>
              {/* Select Source Commodity */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxSizing: 'border-box' }}>
                <label className="form-label" style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>1. Select Source Commodity *</label>
                <SearchableProductSelect
                  products={productsList}
                  value={selectedProfileProduct}
                  selectedProduct={selectedProfileProduct}
                  onChange={(prodName) => setSelectedProfileProduct(prodName)}
                  onSelect={(prodName) => {
                    setSelectedProfileProduct(prodName);
                    if (processingProfiles[prodName] && processingProfiles[prodName].length > 0) {
                      const outputs = processingProfiles[prodName].map((o, idx) => ({
                        id: 'prof_' + idx + '_' + Date.now(),
                        product: o.product,
                        percentage: o.percentage
                      }));
                      setProfileOutputs(outputs);
                    } else {
                      setProfileOutputs([{ id: 'prof_1', product: productsList[0]?.name || '', percentage: 100 }]);
                    }
                  }}
                />

                <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: '#64748b', background: '#eff6ff', padding: '0.65rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  💡 <strong>How it works:</strong> When you run a processing batch for <strong>{selectedProfileProduct || 'this commodity'}</strong>, these target output commodities and percentages load automatically!
                </div>
              </div>

              {/* Configure Percentage Breakdown */}
              <div style={{ background: '#fff', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                    2. Map Target Output Commodities & Yield Percentages (%)
                  </span>
                  <button 
                    type="button" 
                    className="btn btn-secondary btn-sm"
                    onClick={addProfileOutputRow}
                  >
                    + Add Target Commodity
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {profileOutputs.map((row) => (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 110px 36px', gap: '0.6rem', alignItems: 'center' }}>
                      <SearchableProductSelect
                        products={productsList}
                        value={row.product}
                        selectedProduct={row.product}
                        onChange={(pName) => updateProfileOutput(row.id, 'product', pName)}
                        onSelect={(pName) => updateProfileOutput(row.id, 'product', pName)}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <input
                          type="number"
                          step="any"
                          className="form-control"
                          placeholder="%"
                          value={row.percentage}
                          onChange={e => updateProfileOutput(row.id, 'percentage', e.target.value)}
                        />
                        <span style={{ fontWeight: 700 }}>%</span>
                      </div>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm" 
                        style={{ color: '#ef4444', padding: '0.4rem' }}
                        onClick={() => removeProfileOutputRow(row.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.6rem', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: Math.abs(totalProfilePercentage - 100) < 0.01 ? '#15803d' : '#dc2626' }}>
                    Total Yield Allocation: {totalProfilePercentage}% {Math.abs(totalProfilePercentage - 100) < 0.01 ? '✓ (Valid 100%)' : '⚠️ Must sum to 100%'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PARTY STORAGE BALANCES */}
      {activeTab === 'opening_parties' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Party Storage Accounts */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Users size={18} color="#2563eb" /> Individual Party Storage Accounts & Opening Stock Balances
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Store-In arrivals and dispatches for a supplier update their godown storage balance.
                </p>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th>Supplier / Party Name</th>
                    <th style={{ textAlign: 'right' }}>Opening Storage Stock</th>
                    <th style={{ textAlign: 'right' }}>Store-In Received</th>
                    <th style={{ textAlign: 'right' }}>Store-Out Dispatched</th>
                    <th style={{ textAlign: 'right', background: '#eff6ff', color: '#1d4ed8' }}>Current Storage Balance</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParties.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                        No party storage account balances recorded.
                      </td>
                    </tr>
                  ) : (
                    filteredParties.map(sup => (
                      <tr key={sup.supplierId}>
                        <td>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>{sup.supplierName}</div>
                          {sup.place && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>📍 {sup.place}</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div>{sup.openingBags > 0 ? `${sup.openingBags} bags` : '-'}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{sup.openingEP.toLocaleString()} kg</div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#15803d' }}>
                          <div>{sup.storeInBags > 0 ? `+${sup.storeInBags} bags` : '-'}</div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>+{(sup.storeInEP || 0).toLocaleString()} kg</div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#b45309' }}>
                          <div>{sup.storeOutBags > 0 ? `-${sup.storeOutBags} bags` : '-'}</div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>-{(sup.storeOutEP || 0).toLocaleString()} kg</div>
                        </td>
                        <td style={{ textAlign: 'right', background: '#eff6ff', fontWeight: 800 }}>
                          <div style={{ fontSize: '1rem', color: '#2563eb' }}>
                            {sup.currentEP.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>kg</span>
                          </div>
                          {sup.currentBags !== 0 && (
                            <div style={{ fontSize: '0.72rem', color: '#1d4ed8' }}>
                              {sup.currentBags.toLocaleString()} bags balance
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onOpenLedger && onOpenLedger(sup.supplierId)}
                          >
                            <FileText size={14} /> Open Party Ledger
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dated Opening Stock Log */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                  📅 Recorded Dated Opening & Manual Adjustment Entries
                </h3>
              </div>
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => setShowOpeningEntryModal(true)}
              >
                <Plus size={14} /> + New Opening Stock Entry
              </button>
            </div>

            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th>Date & Godown</th>
                  <th>Mapped Party / Reason</th>
                  <th>Commodity Product</th>
                  <th style={{ textAlign: 'right' }}>Adjusted Bags & Weight</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {openingEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                      No dated opening or manual stock adjustment entries recorded.
                    </td>
                  </tr>
                ) : (
                  openingEntries.map(entry => (
                    <tr key={entry.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{entry.date}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{entry.godown}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{entry.supplierName}</div>
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          {entry.product}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: entry.bags < 0 ? '#dc2626' : '#0f172a' }}>{entry.bags} bags</div>
                        <div style={{ fontSize: '0.72rem', color: entry.endProductWeight < 0 ? '#dc2626' : '#0284c7', fontWeight: 700 }}>
                          {entry.endProductWeight.toLocaleString()} kg
                        </div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{entry.notes || '-'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-danger btn-sm" 
                          style={{ padding: '0.2rem 0.4rem' }}
                          onClick={() => handleDeleteOpeningEntry(entry.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PROCESSING WIZARD MODAL */}
      {showMillingModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '850px', width: '92%', boxSizing: 'border-box' }}>
            <div className="modal-header" style={{ background: '#7c3aed', color: '#fff' }}>
              <div className="modal-title-group">
                <h3 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={20} /> Process Commodity Batch
                </h3>
                <p className="modal-subtitle" style={{ color: '#ddd6fe' }}>
                  Select source commodity, enter processed quantity (Bags & 50kg/60kg/75kg unit), and distribute yield by percentage
                </p>
              </div>
              <button className="modal-close-btn" style={{ color: '#ddd6fe' }} onClick={() => setShowMillingModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveMilling} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', boxSizing: 'border-box' }}>
              {/* Step 1: Select Source Commodity & Processed Quantity */}
              <div style={{ background: '#fff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.6rem' }}>
                  1. Select Source Commodity & Processed Quantity
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Processing Date *</label>
                    <input
                      type="date"
                      className="form-control"
                      value={millingDate}
                      onChange={e => setMillingDate(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Source Commodity *</label>
                    <SearchableProductSelect
                      products={productsList}
                      value={sourceProduct}
                      selectedProduct={sourceProduct}
                      onChange={(p) => setSourceProduct(p)}
                      onSelect={(p) => setSourceProduct(p)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bags Quantity & Bag Unit Weight *</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        type="number"
                        step="any"
                        className="form-control"
                        placeholder="e.g. 100"
                        value={sourceBags}
                        onChange={e => setSourceBags(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <select
                        className="form-control"
                        style={{ width: '135px', fontWeight: 600, fontSize: '0.82rem' }}
                        value={bagWeightUnit}
                        onChange={e => setBagWeightUnit(e.target.value)}
                      >
                        <option value="50">50 Kg / Bag</option>
                        <option value="60">60 Kg / Bag</option>
                        <option value="75">75 Kg / Bag</option>
                        <option value="custom">Custom Kg</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Total Processed Weight (Kg) *</label>
                    <input
                      type="number"
                      step="any"
                      className="form-control"
                      style={{ fontWeight: 700, background: '#f8fafc' }}
                      placeholder="e.g. 5000"
                      value={sourceWeight}
                      onChange={e => setSourceWeight(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Yield Percentage Breakdown */}
              <div style={{ background: '#fff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
                    2. Target Output Commodities & Yield Percentages (%)
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSaveProfileForCommodity(sourceProduct, millingOutputs)}
                    >
                      <Save size={14} /> Save as Default Profile
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addMillingOutputRow}>
                      + Add Target Item
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {millingOutputs.map((row) => {
                    const rowYieldW = Math.round((totalProcessedWeight * ((parseFloat(row.percentage) || 0) / 100)) * 100) / 100;
                    const rowYieldB = totalProcessedBags > 0 ? Math.round(totalProcessedBags * ((parseFloat(row.percentage) || 0) / 100)) : 0;
                    return (
                      <div key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.8fr) 100px minmax(130px, 1.2fr) 36px', gap: '0.6rem', alignItems: 'center' }}>
                        <SearchableProductSelect
                          products={productsList}
                          value={row.product}
                          selectedProduct={row.product}
                          onChange={(pName) => updateMillingOutput(row.id, 'product', pName)}
                          onSelect={(pName) => updateMillingOutput(row.id, 'product', pName)}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                          <input
                            type="number"
                            step="any"
                            className="form-control"
                            placeholder="%"
                            value={row.percentage}
                            onChange={e => updateMillingOutput(row.id, 'percentage', e.target.value)}
                          />
                          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>%</span>
                        </div>

                        <div style={{ background: '#f8fafc', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>
                          = {rowYieldW.toLocaleString()} kg {rowYieldB > 0 ? `(${rowYieldB} bags)` : ''}
                        </div>

                        <button 
                          type="button" 
                          className="btn btn-secondary btn-sm" 
                          style={{ color: '#ef4444', padding: '0.4rem' }}
                          onClick={() => removeMillingOutputRow(row.id)}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: Math.abs(totalProcessingPercentage - 100) < 0.01 ? '#15803d' : '#dc2626' }}>
                  Total Percentage Allocated: {totalProcessingPercentage}% {Math.abs(totalProcessingPercentage - 100) < 0.01 ? '✓ (Valid 100%)' : '⚠️ Must sum to 100%'}
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#7c3aed' }}>
                  Total Output Yield: {totalProcessedWeight.toLocaleString()} kg
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Batch Remarks / Godown Notes</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Processing batch #104"
                  value={millingNotes}
                  onChange={e => setMillingNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '0.5rem', padding: '1rem 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowMillingModal(false)}>Cancel</button>
                <button 
                  type="submit" 
                  className="btn btn-purple" 
                  style={{ background: '#7c3aed', color: '#fff' }}
                  disabled={submitting || Math.abs(totalProcessingPercentage - 100) > 0.01}
                >
                  <Sparkles size={16} /> {submitting ? 'Executing...' : 'Confirm & Execute Processing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANUAL STOCK ADJUSTMENT MODAL */}
      {showStockAdjustModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%', boxSizing: 'border-box' }}>
            <div className="modal-header" style={{ background: '#d97706', color: '#fff' }}>
              <div className="modal-title-group">
                <h3 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sliders size={20} /> ⚡ Manual Stock Adjustment
                </h3>
                <p className="modal-subtitle" style={{ color: '#fef3c7' }}>
                  Add or deduct stock for physical reconciliation, weight loss, or godown audits
                </p>
              </div>
              <button className="modal-close-btn" style={{ color: '#fef3c7' }} onClick={() => setShowStockAdjustModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveStockAdjustment} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Adjustment Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={adjDate}
                    onChange={e => setAdjDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Adjustment Type *</label>
                  <select
                    className="form-control"
                    style={{ fontWeight: 700, color: adjType === 'add' ? '#15803d' : '#dc2626' }}
                    value={adjType}
                    onChange={e => setAdjType(e.target.value)}
                  >
                    <option value="add">➕ Addition (+ Found / Surplus)</option>
                    <option value="deduct">➖ Deduction (- Loss / Wastage / Reconciliation)</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Commodity Product Name *</label>
                <SearchableProductSelect
                  products={productsList}
                  value={adjProduct}
                  selectedProduct={adjProduct}
                  onChange={(pName) => setAdjProduct(pName)}
                  onSelect={(pName) => setAdjProduct(pName)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Weight Quantity (Kg) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="e.g. 500"
                    value={adjWeight}
                    onChange={e => setAdjWeight(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Bags Quantity</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="e.g. 10"
                    value={adjBags}
                    onChange={e => setAdjBags(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Adjustment Reason / Audit Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Physical godown audit reconciliation"
                  value={adjNotes}
                  onChange={e => setAdjNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '0.5rem', padding: '1rem 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowStockAdjustModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-warning" style={{ background: '#d97706', borderColor: '#d97706', color: '#fff' }} disabled={submitting}>
                  <Check size={16} /> {submitting ? 'Saving...' : 'Apply Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DATED OPENING STOCK ENTRY MODAL */}
      {showOpeningEntryModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '650px', width: '90%', boxSizing: 'border-box' }}>
            <div className="modal-header" style={{ background: '#0284c7', color: '#fff' }}>
              <div className="modal-title-group">
                <h3 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Package size={20} /> Add Opening Stock Entry
                </h3>
                <p className="modal-subtitle" style={{ color: '#bae6fd' }}>
                  Record initial godown stock by date for any commodity in your system
                </p>
              </div>
              <button className="modal-close-btn" style={{ color: '#bae6fd' }} onClick={() => setShowOpeningEntryModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveOpeningEntry} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Stock As On Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={opDate}
                    onChange={e => setOpDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Godown / Warehouse *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Main Godown"
                    value={opGodown}
                    onChange={e => setOpGodown(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  selectedSupplierId={opSupplierId}
                  onSelect={(id, name) => { setOpSupplierId(id); setOpSupplierName(name); }}
                  onOpenNewSupplier={onOpenNewSupplier}
                  label="Map to Supplier / Party Storage Account (Optional)"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Commodity Product Name *</label>
                <SearchableProductSelect
                  products={productsList}
                  value={opProduct}
                  selectedProduct={opProduct}
                  onChange={(pName) => setOpProduct(pName)}
                  onSelect={(pName) => setOpProduct(pName)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Weight Quantity (Kg) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="e.g. 25000"
                    value={opWeight}
                    onChange={e => setOpWeight(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Bags Count</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="e.g. 500"
                    value={opBags}
                    onChange={e => setOpBags(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Opening Remarks / Lot #</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Verified physical stock count"
                  value={opNotes}
                  onChange={e => setOpNotes(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '0.5rem', padding: '1rem 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowOpeningEntryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: '#0284c7', borderColor: '#0284c7' }} disabled={submitting}>
                  <Check size={16} /> {submitting ? 'Saving...' : 'Save Opening Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
