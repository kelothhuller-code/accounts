import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart3, 
  Download, 
  Filter, 
  RefreshCw, 
  Truck, 
  PackageCheck, 
  Wheat, 
  FileSpreadsheet, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Eye, 
  Printer, 
  Calendar, 
  User, 
  Tag, 
  X, 
  Layers, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Sparkles, 
  CheckCircle2, 
  Trash2,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function ReportsView({ dataVersion = 0, triggerExport = 0, onOpenSettlement }) {
  // Main Navigation / Mode
  const [activeType, setActiveType] = useState('purchase'); // 'purchase', 'sales', 'all'
  const [itemClassification, setItemClassification] = useState('all'); // 'all', 'primary', 'secondary'
  const [viewMode, setViewMode] = useState('unified'); // 'unified', 'split'

  // Data State
  const [settlements, setSettlements] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filter State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [datePreset, setDatePreset] = useState('all_time');
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown Popover Search States
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [partySearchTerm, setPartySearchTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Modal State for Settlement Voucher View
  const [selectedSettlement, setSelectedSettlement] = useState(null);

  const partyDropdownRef = useRef(null);
  const productDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(e.target)) {
        setShowPartyDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial Data Fetch
  useEffect(() => {
    loadAllData();
  }, [dataVersion]);

  // Handle Export Trigger from Global Topbar
  useEffect(() => {
    if (triggerExport > 0) handleExportCsv();
  }, [triggerExport]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeType, itemClassification, selectedPartyId, selectedProduct, startDate, endDate, searchQuery, pageSize]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [settleList, prodList, supList] = await Promise.all([
        dbAction('settlements:get'),
        dbAction('products:get'),
        dbAction('suppliers:get')
      ]);
      setSettlements(settleList || []);
      setProducts(prodList || []);
      setSuppliers(supList || []);
    } catch (err) {
      console.error('Failed to load settlements data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to determine if a settlement is Sales vs Purchase
  const isSalesSettlement = (s) => {
    if (!s) return false;
    if (s.settlementCategory === 'sales' || s.settlementCategory === 'sale') return true;
    if (s.settlementCategory === 'purchase') return false;
    if (s.dispatchIds && s.dispatchIds.length > 0) return true;
    if (s.arrivalIds && s.arrivalIds.length > 0) return false;
    if (String(s.settlementNo || '').toUpperCase().startsWith('SET-SAL')) return true;
    if (String(s.settlementNo || '').toUpperCase().startsWith('SET-PUR')) return false;
    const sup = suppliers.find(sp => sp.id === s.supplierId || sp.name === s.supplierName);
    if (sup && sup.category === 'customer') return true;
    return false;
  };

  // Helper to determine if product is Secondary vs Primary
  const isSecondaryItem = (s) => {
    if (!s) return false;
    if (s.isSecondary !== undefined) return s.isSecondary === true;
    if (s.isMain !== undefined) return s.isMain === false;
    const prodName = (s.product || '').toLowerCase().trim();
    const pObj = products.find(p => 
      (p.name && p.name.toLowerCase().trim() === prodName) || 
      (p.code && p.code.toLowerCase().trim() === prodName)
    );
    if (pObj) {
      if (pObj.isSecondary === true) return true;
      if (pObj.isMain === true) return false;
    }
    return prodName.includes('husk');
  };

  // Quick Date Preset Handler
  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const today = new Date();
    const toYMD = (d) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(toYMD(today));
      setEndDate(toYMD(today));
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setStartDate(toYMD(y));
      setEndDate(toYMD(y));
    } else if (preset === 'this_week') {
      const first = new Date(today.setDate(today.getDate() - today.getDay() + 1));
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (preset === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (preset === 'this_fy') {
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); // 0-indexed: April is 3
      const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      setStartDate(`${startYear}-04-01`);
      setEndDate(`${startYear + 1}-03-31`);
    } else if (preset === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setDatePreset('all_time');
    setSelectedPartyId('');
    setSelectedProduct('');
    setSearchQuery('');
    setItemClassification('all');
  };

  // Filter Pipeline
  const filteredSettlements = useMemo(() => {
    return settlements.filter(s => {
      // 1. Settlement Type Filter (Purchase vs Sales vs All)
      const isSales = isSalesSettlement(s);
      if (activeType === 'purchase' && isSales) return false;
      if (activeType === 'sales' && !isSales) return false;

      // 2. Date Filter
      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;

      // 3. Party Filter
      if (selectedPartyId) {
        if (s.supplierId !== selectedPartyId && s.supplierName !== selectedPartyId) return false;
      }

      // 4. Product Filter
      if (selectedProduct) {
        const prodName = (s.product || '').toLowerCase().trim();
        const target = selectedProduct.toLowerCase().trim();
        if (prodName !== target && !prodName.includes(target)) return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match = 
          (s.settlementNo || '').toLowerCase().includes(q) ||
          (s.supplierName || '').toLowerCase().includes(q) ||
          (s.product || '').toLowerCase().includes(q) ||
          (s.notes || '').toLowerCase().includes(q) ||
          String(s.settlementRate || '').includes(q) ||
          String(s.settlementNetAmount || '').includes(q);
        if (!match) return false;
      }

      // 6. Classification Filter (Primary vs Secondary)
      const isSec = isSecondaryItem(s);
      if (itemClassification === 'primary' && isSec) return false;
      if (itemClassification === 'secondary' && !isSec) return false;

      return true;
    });
  }, [settlements, activeType, startDate, endDate, selectedPartyId, selectedProduct, searchQuery, itemClassification, suppliers, products]);

  // Segregated Collections for Calculations
  const primarySettlements = useMemo(() => {
    return filteredSettlements.filter(s => !isSecondaryItem(s));
  }, [filteredSettlements]);

  const secondarySettlements = useMemo(() => {
    return filteredSettlements.filter(s => isSecondaryItem(s));
  }, [filteredSettlements]);

  // Aggregate Metrics Computation
  const calculateAggregate = (records) => {
    const totalBags = records.reduce((sum, r) => sum + (Number(r.settledBags) || 0), 0);
    const totalWeight = records.reduce((sum, r) => sum + (Number(r.settledWeight) || 0), 0);
    const totalEP = records.reduce((sum, r) => sum + (Number(r.settledEndProduct) || 0), 0);
    const totalGross = records.reduce((sum, r) => sum + (Number(r.settlementGrossAmount) || (Number(r.settledEndProduct) * Number(r.settlementRate)) || 0), 0);
    const totalNet = records.reduce((sum, r) => sum + (Number(r.settlementNetAmount) || Number(r.settlementGrossAmount) || 0), 0);
    const totalGst = records.reduce((sum, r) => sum + (Number(r.cgstAmount || 0) + Number(r.sgstAmount || 0) + Number(r.igstAmount || 0)), 0);
    const totalTcs = records.reduce((sum, r) => sum + (Number(r.tcsAmount) || 0), 0);
    const totalTds = records.reduce((sum, r) => sum + (Number(r.tdsAmount) || 0), 0);
    
    // Weighted average rate per kg EP (or weight if EP is zero)
    const divisor = totalEP > 0 ? totalEP : (totalWeight > 0 ? totalWeight : 0);
    const avgRate = divisor > 0 ? (totalGross / divisor) : 0;

    return {
      count: records.length,
      totalBags: Math.round(totalBags * 100) / 100,
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalEP: Math.round(totalEP * 100) / 100,
      totalGross: Math.round(totalGross * 100) / 100,
      totalNet: Math.round(totalNet * 100) / 100,
      totalGst: Math.round(totalGst * 100) / 100,
      totalTcs: Math.round(totalTcs * 100) / 100,
      totalTds: Math.round(totalTds * 100) / 100,
      avgRate: Math.round(avgRate * 100) / 100
    };
  };

  const primaryStats = useMemo(() => calculateAggregate(primarySettlements), [primarySettlements]);
  const secondaryStats = useMemo(() => calculateAggregate(secondarySettlements), [secondarySettlements]);
  const overallStats = useMemo(() => calculateAggregate(filteredSettlements), [filteredSettlements]);

  // Overall counts for badges
  const totalPurchaseCount = useMemo(() => settlements.filter(s => !isSalesSettlement(s)).length, [settlements]);
  const totalSalesCount = useMemo(() => settlements.filter(s => isSalesSettlement(s)).length, [settlements]);

  // Pagination for Unified View
  const totalPages = Math.max(1, Math.ceil(filteredSettlements.length / pageSize));
  const paginatedSettlements = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredSettlements.slice(startIndex, startIndex + pageSize);
  }, [filteredSettlements, currentPage, pageSize]);

  // CSV Export Handler
  const handleExportCsv = async () => {
    const typeLabel = activeType === 'purchase' ? 'Purchase' : activeType === 'sales' ? 'Sales' : 'All';
    const filename = `${typeLabel}_Settlement_Report_${new Date().toISOString().split('T')[0]}`;

    const headers = [
      { key: 'settlementNo', label: 'Settlement #' },
      { key: 'date', label: 'Date' },
      { key: 'category', label: 'Type' },
      { key: 'supplierName', label: 'Party Name' },
      { key: 'product', label: 'Product' },
      { key: 'classification', label: 'Classification' },
      { key: 'settledBags', label: 'Settled Bags' },
      { key: 'settledWeight', label: 'Raw Weight (kg)' },
      { key: 'averageOutturn', label: 'Outturn' },
      { key: 'settledEndProduct', label: 'End Product EP (kg)' },
      { key: 'settlementRate', label: 'Rate (₹)' },
      { key: 'rateUnit', label: 'Rate Unit' },
      { key: 'settlementGrossAmount', label: 'Gross Amount (₹)' },
      { key: 'cgstAmount', label: 'CGST (₹)' },
      { key: 'sgstAmount', label: 'SGST (₹)' },
      { key: 'igstAmount', label: 'IGST (₹)' },
      { key: 'tdsAmount', label: 'TDS (₹)' },
      { key: 'tcsAmount', label: 'TCS (₹)' },
      { key: 'settlementNetAmount', label: 'Net Settlement (₹)' },
      { key: 'notes', label: 'Notes' }
    ];

    const rows = filteredSettlements.map(s => ({
      settlementNo: s.settlementNo,
      date: s.date,
      category: isSalesSettlement(s) ? 'Sales Settlement' : 'Purchase Settlement',
      supplierName: s.supplierName,
      product: s.product || 'Standard Commodity',
      classification: isSecondaryItem(s) ? 'Secondary (Husk/By-product)' : 'Primary (Main EP)',
      settledBags: s.settledBags || 0,
      settledWeight: s.settledWeight || 0,
      averageOutturn: s.agreedOutturn || s.averageOutturn || '-',
      settledEndProduct: s.settledEndProduct || 0,
      settlementRate: s.settlementRate || 0,
      rateUnit: s.rateUnit || 'per_kg_ep',
      settlementGrossAmount: s.settlementGrossAmount || 0,
      cgstAmount: s.cgstAmount || 0,
      sgstAmount: s.sgstAmount || 0,
      igstAmount: s.igstAmount || 0,
      tdsAmount: s.tdsAmount || 0,
      tcsAmount: s.tcsAmount || 0,
      settlementNetAmount: s.settlementNetAmount || s.settlementGrossAmount || 0,
      notes: s.notes || ''
    }));

    // Add Separated Summary Rows at the bottom of the CSV
    rows.push({
      settlementNo: '---',
      date: '---',
      category: '---',
      supplierName: 'PRIMARY ITEMS SUMMARY TOTALS',
      product: 'PRIMARY (MAIN)',
      classification: 'PRIMARY',
      settledBags: primaryStats.totalBags,
      settledWeight: primaryStats.totalWeight,
      averageOutturn: '-',
      settledEndProduct: primaryStats.totalEP,
      settlementRate: primaryStats.avgRate,
      rateUnit: 'Avg ₹/kg EP',
      settlementGrossAmount: primaryStats.totalGross,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      tdsAmount: primaryStats.totalTds,
      tcsAmount: primaryStats.totalTcs,
      settlementNetAmount: primaryStats.totalNet,
      notes: 'Weighted Average Rate calculated over Total EP'
    });

    rows.push({
      settlementNo: '---',
      date: '---',
      category: '---',
      supplierName: 'SECONDARY ITEMS SUMMARY TOTALS',
      product: 'SECONDARY (HUSK)',
      classification: 'SECONDARY',
      settledBags: secondaryStats.totalBags,
      settledWeight: secondaryStats.totalWeight,
      averageOutturn: '-',
      settledEndProduct: secondaryStats.totalEP,
      settlementRate: secondaryStats.avgRate,
      rateUnit: 'Avg ₹/kg',
      settlementGrossAmount: secondaryStats.totalGross,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      tdsAmount: secondaryStats.totalTds,
      tcsAmount: secondaryStats.totalTcs,
      settlementNetAmount: secondaryStats.totalNet,
      notes: 'Weighted Average Rate calculated over Total Secondary EP/Weight'
    });

    rows.push({
      settlementNo: 'GRAND TOTAL',
      date: 'ALL DATES',
      category: typeLabel,
      supplierName: 'COMBINED GRAND TOTAL',
      product: 'ALL PRODUCTS',
      classification: 'COMBINED',
      settledBags: overallStats.totalBags,
      settledWeight: overallStats.totalWeight,
      averageOutturn: '-',
      settledEndProduct: overallStats.totalEP,
      settlementRate: overallStats.avgRate,
      rateUnit: 'Overall Avg ₹/kg',
      settlementGrossAmount: overallStats.totalGross,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      tdsAmount: overallStats.totalTds,
      tcsAmount: overallStats.totalTcs,
      settlementNetAmount: overallStats.totalNet,
      notes: 'Filtered Grand Total'
    });

    await exportToCsv(filename, headers, rows);
  };

  // Delete Settlement
  const handleDeleteSettlement = async (id, settlementNo) => {
    if (window.confirm(`Are you sure you want to delete Settlement "${settlementNo}"? This will restore remaining bags and EP weights back to storage arrivals/dispatches.`)) {
      try {
        await dbAction('settlements:delete', { id });
        await loadAllData();
      } catch (err) {
        alert('Failed to delete settlement: ' + err.message);
      }
    }
  };

  const selectedPartyObj = suppliers.find(s => s.id === selectedPartyId || s.name === selectedPartyId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* EXECUTIVE HEADER & MODE SWITCHER */}
      <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📑</span>
              <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
                Sales & Purchase Settlement Reports
              </h1>
              <span className="badge" style={{ background: '#2563eb', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                Live Settlement Ledger
              </span>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Segregated analysis of Purchase & Sales storage settlements with Primary vs Secondary breakdown, weighted average rates, and party-wise ledger audit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadAllData} title="Refresh Data (Alt+R)">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleExportCsv} title="Export to CSV (Alt+E)">
              <Download size={13} /> Export CSV
            </button>
            {onOpenSettlement && (
              <button className="btn btn-primary btn-sm" onClick={onOpenSettlement}>
                <Layers size={13} /> + New Settlement
              </button>
            )}
          </div>
        </div>

        {/* SETTLEMENT CATEGORY TABS (Purchase vs Sales vs All) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.15rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-sm"
              style={{
                background: activeType === 'purchase' ? '#166534' : '#f1f5f9',
                color: activeType === 'purchase' ? '#ffffff' : '#334155',
                border: activeType === 'purchase' ? '1px solid #15803d' : '1px solid #cbd5e1',
                fontWeight: 700,
                fontSize: '0.82rem',
                padding: '0.45rem 0.95rem'
              }}
              onClick={() => setActiveType('purchase')}
            >
              🛒 Purchase Settlements ({totalPurchaseCount})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: activeType === 'sales' ? '#1e40af' : '#f1f5f9',
                color: activeType === 'sales' ? '#ffffff' : '#334155',
                border: activeType === 'sales' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                fontWeight: 700,
                fontSize: '0.82rem',
                padding: '0.45rem 0.95rem'
              }}
              onClick={() => setActiveType('sales')}
            >
              📤 Sales Settlements ({totalSalesCount})
            </button>

            <button
              className="btn btn-sm"
              style={{
                background: activeType === 'all' ? '#475569' : '#f1f5f9',
                color: activeType === 'all' ? '#ffffff' : '#334155',
                border: activeType === 'all' ? '1px solid #334155' : '1px solid #cbd5e1',
                fontWeight: 700,
                fontSize: '0.82rem',
                padding: '0.45rem 0.95rem'
              }}
              onClick={() => setActiveType('all')}
            >
              📑 All Settlements ({settlements.length})
            </button>
          </div>

          {/* VIEW LAYOUT & CLASSIFICATION TOGGLES */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Item Filter:</span>
            <div style={{ display: 'flex', background: '#e2e8f0', padding: '0.2rem', borderRadius: '6px' }}>
              <button
                className="btn btn-xs"
                style={{
                  background: itemClassification === 'all' ? '#ffffff' : 'transparent',
                  color: itemClassification === 'all' ? '#0f172a' : '#64748b',
                  boxShadow: itemClassification === 'all' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  fontWeight: itemClassification === 'all' ? 700 : 500,
                  fontSize: '0.74rem',
                  padding: '0.25rem 0.6rem',
                  border: 'none'
                }}
                onClick={() => setItemClassification('all')}
              >
                All Items
              </button>
              <button
                className="btn btn-xs"
                style={{
                  background: itemClassification === 'primary' ? '#166534' : 'transparent',
                  color: itemClassification === 'primary' ? '#ffffff' : '#64748b',
                  boxShadow: itemClassification === 'primary' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  fontWeight: itemClassification === 'primary' ? 700 : 500,
                  fontSize: '0.74rem',
                  padding: '0.25rem 0.6rem',
                  border: 'none'
                }}
                onClick={() => setItemClassification('primary')}
              >
                🌿 Primary Only
              </button>
              <button
                className="btn btn-xs"
                style={{
                  background: itemClassification === 'secondary' ? '#ea580c' : 'transparent',
                  color: itemClassification === 'secondary' ? '#ffffff' : '#64748b',
                  boxShadow: itemClassification === 'secondary' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  fontWeight: itemClassification === 'secondary' ? 700 : 500,
                  fontSize: '0.74rem',
                  padding: '0.25rem 0.6rem',
                  border: 'none'
                }}
                onClick={() => setItemClassification('secondary')}
              >
                📦 Secondary Only
              </button>
            </div>

            <button
              className="btn btn-xs btn-secondary"
              style={{
                background: viewMode === 'split' ? '#e0f2fe' : '#ffffff',
                borderColor: viewMode === 'split' ? '#0284c7' : '#cbd5e1',
                color: viewMode === 'split' ? '#0369a1' : '#334155',
                fontSize: '0.74rem',
                padding: '0.3rem 0.55rem',
                fontWeight: 600,
                marginLeft: '0.5rem'
              }}
              onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}
              title="Toggle between Unified Table or Split Primary/Secondary Tables"
            >
              {viewMode === 'split' ? '📋 Unified Table' : '⚖️ Dual Split Tables'}
            </button>
          </div>
        </div>
      </div>

      {/* FILTER BAR: PARTY (SEARCHABLE), PRODUCT (SEARCHABLE), DATES, AND QUERY */}
      <div className="card" style={{ padding: '1rem 1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
          
          {/* SEARCHABLE PARTY SELECTION */}
          <div className="form-group" style={{ position: 'relative', margin: 0 }} ref={partyDropdownRef}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>👤 Party / Supplier / Buyer</span>
              {selectedPartyId && (
                <span 
                  style={{ color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setSelectedPartyId('')}
                >
                  Clear (✕)
                </span>
              )}
            </label>

            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem'
              }}
              onClick={() => setShowPartyDropdown(!showPartyDropdown)}
            >
              <span style={{ color: selectedPartyObj ? '#0f172a' : '#94a3b8', fontWeight: selectedPartyObj ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedPartyObj ? `${selectedPartyObj.name} (${selectedPartyObj.category === 'customer' ? 'Buyer' : 'Supplier'})` : 'All Parties (Searchable)...'}
              </span>
              <ChevronDown size={14} color="#64748b" />
            </div>

            {/* Dropdown Menu */}
            {showPartyDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                zIndex: 50,
                marginTop: '0.35rem',
                padding: '0.5rem',
                maxHeight: '260px',
                overflowY: 'auto'
              }}>
                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search party by name or city..."
                    style={{ paddingLeft: '1.8rem', fontSize: '0.78rem', height: '30px' }}
                    value={partySearchTerm}
                    onChange={e => setPartySearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>

                <div 
                  style={{
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontWeight: !selectedPartyId ? 700 : 400,
                    background: !selectedPartyId ? '#f1f5f9' : 'transparent',
                    color: !selectedPartyId ? '#2563eb' : '#334155'
                  }}
                  onClick={() => {
                    setSelectedPartyId('');
                    setShowPartyDropdown(false);
                  }}
                >
                  🌐 All Parties
                </div>

                {suppliers
                  .filter(s => {
                    if (!partySearchTerm) return true;
                    const term = partySearchTerm.toLowerCase();
                    return (s.name || '').toLowerCase().includes(term) || (s.place || '').toLowerCase().includes(term) || (s.phone || '').includes(term);
                  })
                  .map(sup => (
                    <div
                      key={sup.id}
                      style={{
                        padding: '0.35rem 0.5rem',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        fontWeight: selectedPartyId === sup.id ? 700 : 400,
                        background: selectedPartyId === sup.id ? '#eff6ff' : 'transparent',
                        color: selectedPartyId === sup.id ? '#1d4ed8' : '#1e293b',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onClick={() => {
                        setSelectedPartyId(sup.id);
                        setShowPartyDropdown(false);
                      }}
                    >
                      <div>
                        <div>{sup.name}</div>
                        {sup.place && <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>📍 {sup.place}</div>}
                      </div>
                      <span className="badge" style={{ fontSize: '0.65rem', background: sup.category === 'customer' ? '#dbeafe' : '#f0fdf4', color: sup.category === 'customer' ? '#1e40af' : '#166534' }}>
                        {sup.category === 'customer' ? 'Buyer' : 'Supplier'}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* SEARCHABLE PRODUCT SELECTION */}
          <div className="form-group" style={{ position: 'relative', margin: 0 }} ref={productDropdownRef}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between' }}>
              <span>🌿 Product / Commodity</span>
              {selectedProduct && (
                <span 
                  style={{ color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setSelectedProduct('')}
                >
                  Clear (✕)
                </span>
              )}
            </label>

            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.82rem'
              }}
              onClick={() => setShowProductDropdown(!showProductDropdown)}
            >
              <span style={{ color: selectedProduct ? '#0f172a' : '#94a3b8', fontWeight: selectedProduct ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedProduct ? selectedProduct : 'All Products (Searchable)...'}
              </span>
              <ChevronDown size={14} color="#64748b" />
            </div>

            {/* Dropdown Menu */}
            {showProductDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                zIndex: 50,
                marginTop: '0.35rem',
                padding: '0.5rem',
                maxHeight: '260px',
                overflowY: 'auto'
              }}>
                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search product name or code..."
                    style={{ paddingLeft: '1.8rem', fontSize: '0.78rem', height: '30px' }}
                    value={productSearchTerm}
                    onChange={e => setProductSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>

                <div 
                  style={{
                    padding: '0.35rem 0.5rem',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    fontWeight: !selectedProduct ? 700 : 400,
                    background: !selectedProduct ? '#f1f5f9' : 'transparent',
                    color: !selectedProduct ? '#2563eb' : '#334155'
                  }}
                  onClick={() => {
                    setSelectedProduct('');
                    setShowProductDropdown(false);
                  }}
                >
                  📦 All Commodities
                </div>

                {products
                  .filter(p => {
                    if (!productSearchTerm) return true;
                    const term = productSearchTerm.toLowerCase();
                    return (p.name || '').toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term);
                  })
                  .map(p => {
                    const isSec = p.isSecondary === true || (p.name || '').toLowerCase().includes('husk');
                    return (
                      <div
                        key={p.id || p.code}
                        style={{
                          padding: '0.35rem 0.5rem',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          fontWeight: selectedProduct === p.name ? 700 : 400,
                          background: selectedProduct === p.name ? '#eff6ff' : 'transparent',
                          color: selectedProduct === p.name ? '#1d4ed8' : '#1e293b',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onClick={() => {
                          setSelectedProduct(p.name);
                          setShowProductDropdown(false);
                        }}
                      >
                        <div>
                          <span>{p.name}</span>
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: '0.35rem' }}>({p.code})</span>
                        </div>
                        <span className="badge" style={{ fontSize: '0.65rem', background: isSec ? '#fff7ed' : '#f0fdf4', color: isSec ? '#ea580c' : '#166534', border: `1px solid ${isSec ? '#fed7aa' : '#bbf7d0'}` }}>
                          {isSec ? '📦 Secondary' : '🌿 Primary'}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* FROM DATE */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
              📅 From Date
            </label>
            <input
              type="date"
              className="form-control"
              style={{ fontSize: '0.82rem', height: '34px' }}
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
            />
          </div>

          {/* TO DATE */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
              📅 To Date
            </label>
            <input
              type="date"
              className="form-control"
              style={{ fontSize: '0.82rem', height: '34px' }}
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setDatePreset('custom');
              }}
            />
          </div>

          {/* SEARCH BOX */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
              🔍 Search Query
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Settlement #, notes..."
                style={{ paddingLeft: '1.8rem', fontSize: '0.82rem', height: '34px' }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <X 
                  size={13} 
                  style={{ position: 'absolute', right: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', cursor: 'pointer' }}
                  onClick={() => setSearchQuery('')}
                />
              )}
            </div>
          </div>

        </div>

        {/* DATE PRESET BUTTONS & RESET */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#64748b' }}>Date Presets:</span>
            {['today', 'yesterday', 'this_week', 'this_month', 'this_fy', 'all_time'].map(preset => (
              <button
                key={preset}
                type="button"
                className={`btn btn-xs ${datePreset === preset ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}
                onClick={() => applyDatePreset(preset)}
              >
                {preset === 'today' ? 'Today' : preset === 'yesterday' ? 'Yesterday' : preset === 'this_week' ? 'This Week' : preset === 'this_month' ? 'This Month' : preset === 'this_fy' ? 'This FY' : 'All Time'}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-xs btn-secondary"
            style={{ fontSize: '0.72rem', color: '#dc2626' }}
            onClick={handleResetFilters}
          >
            Reset All Filters
          </button>
        </div>
      </div>

      {/* SEPARATED PRIMARY AND SECONDARY SUMMARY KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        
        {/* 1. PRIMARY ITEMS SUMMARY CARD */}
        <div className="card" style={{ padding: '1rem 1.25rem', background: '#f0fdf4', border: '1.5px solid #bbf7d0', boxShadow: '0 2px 6px rgba(34, 197, 94, 0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.2rem' }}>🌿</span>
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#166534' }}>Primary Products</span>
                <div style={{ fontSize: '0.7rem', color: '#15803d' }}>Main Commodities (EP Clean Weight)</div>
              </div>
            </div>
            <span className="badge" style={{ background: '#16a34a', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              {primaryStats.count} Settlements
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'center', margin: '0.5rem 0' }}>
            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Settled Bags & Wt</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                {primaryStats.totalBags.toLocaleString()} b
              </div>
              <div style={{ fontSize: '0.68rem', color: '#15803d' }}>{primaryStats.totalWeight.toLocaleString()} kg raw</div>
            </div>

            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #dcfce7' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Total Clean EP</div>
              <div style={{ fontWeight: 900, fontSize: '1rem', color: '#15803d' }}>
                {primaryStats.totalEP.toLocaleString()} kg
              </div>
              <div style={{ fontSize: '0.68rem', color: '#166534' }}>End Product</div>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Weighted Avg Rate</div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0284c7' }}>
                ₹{primaryStats.avgRate.toLocaleString()}<span style={{ fontSize: '0.72rem', fontWeight: 500 }}>/kg EP</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Sum Total Net Amount</div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#166534' }}>
                ₹{primaryStats.totalNet.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* 2. SECONDARY ITEMS SUMMARY CARD */}
        <div className="card" style={{ padding: '1rem 1.25rem', background: '#fff7ed', border: '1.5px solid #fed7aa', boxShadow: '0 2px 6px rgba(249, 115, 22, 0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.2rem' }}>📦</span>
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#9a3412' }}>Secondary Products</span>
                <div style={{ fontSize: '0.7rem', color: '#c2410c' }}>Husk & Processing By-Products</div>
              </div>
            </div>
            <span className="badge" style={{ background: '#ea580c', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              {secondaryStats.count} Settlements
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'center', margin: '0.5rem 0' }}>
            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Settled Bags & Wt</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                {secondaryStats.totalBags.toLocaleString()} b
              </div>
              <div style={{ fontSize: '0.68rem', color: '#c2410c' }}>{secondaryStats.totalWeight.toLocaleString()} kg</div>
            </div>

            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Total Yield / Weight</div>
              <div style={{ fontWeight: 900, fontSize: '1rem', color: '#ea580c' }}>
                {(secondaryStats.totalEP || secondaryStats.totalWeight).toLocaleString()} kg
              </div>
              <div style={{ fontSize: '0.68rem', color: '#9a3412' }}>Dispatched Yield</div>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #ffedd5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Weighted Avg Rate</div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ea580c' }}>
                ₹{secondaryStats.avgRate.toLocaleString()}<span style={{ fontSize: '0.72rem', fontWeight: 500 }}>/kg</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Sum Total Net Amount</div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#9a3412' }}>
                ₹{secondaryStats.totalNet.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* 3. COMBINED GRAND TOTAL CARD */}
        <div className="card" style={{ padding: '1rem 1.25rem', background: '#f8fafc', border: '1.5px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.2rem' }}>⚖️</span>
              <div>
                <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>Combined Grand Total</span>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Primary + Secondary Combined</div>
              </div>
            </div>
            <span className="badge" style={{ background: '#334155', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
              {overallStats.count} Total Settlements
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', textAlign: 'center', margin: '0.5rem 0' }}>
            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Grand Total Bags</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                {overallStats.totalBags.toLocaleString()} b
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Total Packages</div>
            </div>

            <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Total Settled EP</div>
              <div style={{ fontWeight: 900, fontSize: '1rem', color: '#2563eb' }}>
                {overallStats.totalEP.toLocaleString()} kg
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>All Products</div>
            </div>
          </div>

          <div style={{ background: '#ffffff', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Blended Avg Rate</div>
              <div style={{ fontWeight: 800, fontSize: '1rem', color: '#7c3aed' }}>
                ₹{overallStats.avgRate.toLocaleString()}<span style={{ fontSize: '0.72rem', fontWeight: 500 }}>/kg</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>Grand Total Net Value</div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: '#0f172a' }}>
                ₹{overallStats.totalNet.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* RENDER TABLE VIEW: EITHER UNIFIED WITH PAGINATION OR DUAL SPLIT TABLES */}
      {viewMode === 'unified' ? (
        /* UNIFIED TABLE WITH PAGINATION */
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>
                {activeType === 'purchase' ? '🛒 Purchase Settlements' : activeType === 'sales' ? '📤 Sales Settlements' : '📑 All Settlements'} Table
              </span>
              <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
                {filteredSettlements.length} Records Matching
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#64748b' }}>
              <span>Show</span>
              <select
                className="form-control"
                style={{ width: '70px', padding: '0.2rem 0.4rem', height: '28px', fontSize: '0.78rem' }}
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>rows per page</span>
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '550px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Settlement #</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Party Name</th>
                  <th>Product & Classification</th>
                  <th className="num">Bags</th>
                  <th className="num">Raw Wt (kg)</th>
                  <th className="num">Outturn</th>
                  <th className="num">EP Weight (kg)</th>
                  <th className="num">Rate (₹)</th>
                  <th className="num">Gross (₹)</th>
                  <th className="num">Net Settlement (₹)</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="13" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
                      <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                      <div>Loading settlement records...</div>
                    </td>
                  </tr>
                ) : paginatedSettlements.length === 0 ? (
                  <tr>
                    <td colSpan="13" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
                      <FileSpreadsheet size={32} style={{ margin: '0 auto 0.5rem auto', color: '#94a3b8' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#334155' }}>No settlement records found</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Try clearing filters or changing date range.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedSettlements.map(s => {
                    const isSales = isSalesSettlement(s);
                    const isSec = isSecondaryItem(s);
                    const gross = Number(s.settlementGrossAmount) || (Number(s.settledEndProduct) * Number(s.settlementRate)) || 0;
                    const net = Number(s.settlementNetAmount) || gross;

                    return (
                      <tr key={s.id} style={{ background: isSec ? 'rgba(255, 247, 237, 0.35)' : 'inherit' }}>
                        <td style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          <span 
                            style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}
                            onClick={() => setSelectedSettlement(s)}
                            title="Click to view full voucher"
                          >
                            {s.settlementNo}
                          </span>
                        </td>

                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{s.date}</td>

                        <td>
                          <span className={`badge ${isSales ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem' }}>
                            {isSales ? '📤 Sale' : '🛒 Purchase'}
                          </span>
                        </td>

                        <td style={{ fontWeight: 600, color: '#1e293b' }}>
                          <div>{s.supplierName}</div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontWeight: 600 }}>{s.product || 'Standard'}</span>
                            <span className="badge" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', background: isSec ? '#ffedd5' : '#dcfce7', color: isSec ? '#c2410c' : '#15803d' }}>
                              {isSec ? '📦 Sec' : '🌿 Prim'}
                            </span>
                          </div>
                        </td>

                        <td className="num" style={{ fontWeight: 600 }}>
                          {(Number(s.settledBags) || 0).toLocaleString()}
                        </td>

                        <td className="num">
                          {(Number(s.settledWeight) || 0).toLocaleString()}
                        </td>

                        <td className="num" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {s.agreedOutturn ? `${s.agreedOutturn}` : s.averageOutturn ? `${s.averageOutturn}` : '-'}
                        </td>

                        <td className="num" style={{ fontWeight: 800, color: isSec ? '#ea580c' : '#166534' }}>
                          {(Number(s.settledEndProduct) || 0).toLocaleString()} kg
                        </td>

                        <td className="num" style={{ fontWeight: 700, color: '#0284c7' }}>
                          ₹{(Number(s.settlementRate) || 0).toLocaleString()}
                          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>
                            {s.rateUnit === 'per_bag' ? 'per bag' : s.rateUnit === 'per_kg_raw' ? 'per kg raw' : 'per kg EP'}
                          </div>
                        </td>

                        <td className="num" style={{ fontSize: '0.82rem', color: '#475569' }}>
                          ₹{gross.toLocaleString('en-IN')}
                        </td>

                        <td className="num" style={{ fontWeight: 800, fontSize: '0.92rem', color: isSales ? '#1e40af' : '#166534' }}>
                          ₹{net.toLocaleString('en-IN')}
                        </td>

                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-xs btn-secondary"
                            style={{ padding: '0.2rem 0.4rem', marginRight: '0.3rem' }}
                            onClick={() => setSelectedSettlement(s)}
                            title="View Voucher Breakdown"
                          >
                            <Eye size={12} />
                          </button>
                          <button
                            className="btn btn-xs btn-secondary"
                            style={{ padding: '0.2rem 0.4rem', color: '#dc2626' }}
                            onClick={() => handleDeleteSettlement(s.id, s.settlementNo)}
                            title="Delete Settlement & Restore Quantities"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* TABLE FOOTER FOR CURRENT FILTERED SET */}
              {filteredSettlements.length > 0 && (
                <tfoot style={{ background: '#f1f5f9', fontWeight: 800 }}>
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'right', padding: '0.65rem 0.85rem' }}>
                      <strong>Filtered Set Totals ({filteredSettlements.length} settlements):</strong>
                    </td>
                    <td className="num" style={{ color: '#0f172a' }}>
                      {overallStats.totalBags.toLocaleString()} b
                    </td>
                    <td className="num" style={{ color: '#0f172a' }}>
                      {overallStats.totalWeight.toLocaleString()} kg
                    </td>
                    <td className="num">-</td>
                    <td className="num" style={{ color: '#166534' }}>
                      {overallStats.totalEP.toLocaleString()} kg
                    </td>
                    <td className="num" style={{ color: '#0284c7' }}>
                      Avg ₹{overallStats.avgRate.toLocaleString()}
                    </td>
                    <td className="num">
                      ₹{overallStats.totalGross.toLocaleString('en-IN')}
                    </td>
                    <td className="num" style={{ color: '#166534', fontSize: '0.95rem' }}>
                      ₹{overallStats.totalNet.toLocaleString('en-IN')}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* PAGINATION TOOLBAR */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Showing {filteredSettlements.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredSettlements.length)} of {filteredSettlements.length} settlements
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                title="First Page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>

              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      className={`btn btn-sm ${currentPage === pageNum ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minWidth: '30px' }}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="btn btn-sm btn-secondary"
                style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem' }}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Last Page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* DUAL SPLIT VIEW: PRIMARY TABLE & SECONDARY TABLE SEPARATED */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SECTION 1: PRIMARY PRODUCTS SETTLEMENT TABLE */}
          <div className="card" style={{ padding: 0, border: '2px solid #bbf7d0' }}>
            <div style={{ padding: '0.85rem 1.25rem', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderBottom: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.15rem' }}>🌿</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#166534' }}>
                  Primary Commodity Settlements ({primarySettlements.length})
                </span>
                <span className="badge" style={{ background: '#16a34a', color: '#fff', fontSize: '0.7rem' }}>
                  EP Outturn Basis
                </span>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#166534', fontWeight: 700 }}>
                <span>Total EP: {primaryStats.totalEP.toLocaleString()} kg</span>
                <span>Avg Rate: ₹{primaryStats.avgRate.toLocaleString()}/kg</span>
                <span>Net Total: ₹{primaryStats.totalNet.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Settlement #</th>
                    <th>Date</th>
                    <th>Party Name</th>
                    <th>Product</th>
                    <th className="num">Bags</th>
                    <th className="num">Raw Wt (kg)</th>
                    <th className="num">Outturn</th>
                    <th className="num">EP Weight (kg)</th>
                    <th className="num">Rate (₹/kg EP)</th>
                    <th className="num">Net Settlement (₹)</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {primarySettlements.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No primary commodity settlements match criteria.
                      </td>
                    </tr>
                  ) : (
                    primarySettlements.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, color: '#166534' }}>
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => setSelectedSettlement(s)}
                          >
                            {s.settlementNo}
                          </span>
                        </td>
                        <td>{s.date}</td>
                        <td style={{ fontWeight: 600 }}>{s.supplierName}</td>
                        <td>{s.product}</td>
                        <td className="num font-mono">{s.settledBags}</td>
                        <td className="num font-mono">{s.settledWeight}</td>
                        <td className="num font-mono">{s.agreedOutturn || s.averageOutturn || '-'}</td>
                        <td className="num font-mono" style={{ fontWeight: 800, color: '#15803d' }}>
                          {(Number(s.settledEndProduct) || 0).toLocaleString()} kg
                        </td>
                        <td className="num font-mono" style={{ fontWeight: 700, color: '#0284c7' }}>
                          ₹{(Number(s.settlementRate) || 0).toLocaleString()}
                        </td>
                        <td className="num font-mono" style={{ fontWeight: 900, color: '#166534' }}>
                          ₹{(Number(s.settlementNetAmount) || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-xs btn-secondary"
                            onClick={() => setSelectedSettlement(s)}
                            title="View Voucher"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {primarySettlements.length > 0 && (
                  <tfoot style={{ background: '#f0fdf4', fontWeight: 800 }}>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right' }}>Primary Sum Totals:</td>
                      <td className="num">{primaryStats.totalBags.toLocaleString()} b</td>
                      <td className="num">{primaryStats.totalWeight.toLocaleString()} kg</td>
                      <td className="num">-</td>
                      <td className="num" style={{ color: '#15803d' }}>{primaryStats.totalEP.toLocaleString()} kg</td>
                      <td className="num" style={{ color: '#0284c7' }}>Avg ₹{primaryStats.avgRate.toLocaleString()}</td>
                      <td className="num" style={{ color: '#166534' }}>₹{primaryStats.totalNet.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* SECTION 2: SECONDARY PRODUCTS SETTLEMENT TABLE */}
          <div className="card" style={{ padding: 0, border: '2px solid #fed7aa' }}>
            <div style={{ padding: '0.85rem 1.25rem', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', borderBottom: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.15rem' }}>📦</span>
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#9a3412' }}>
                  Secondary By-Product Settlements ({secondarySettlements.length})
                </span>
                <span className="badge" style={{ background: '#ea580c', color: '#fff', fontSize: '0.7rem' }}>
                  Husk / By-Product
                </span>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#9a3412', fontWeight: 700 }}>
                <span>Total Yield: {(secondaryStats.totalEP || secondaryStats.totalWeight).toLocaleString()} kg</span>
                <span>Avg Rate: ₹{secondaryStats.avgRate.toLocaleString()}/kg</span>
                <span>Net Total: ₹{secondaryStats.totalNet.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Settlement #</th>
                    <th>Date</th>
                    <th>Party Name</th>
                    <th>Product</th>
                    <th className="num">Bags</th>
                    <th className="num">Dispatched Wt (kg)</th>
                    <th className="num">Rate (₹)</th>
                    <th className="num">Rate Basis</th>
                    <th className="num">Gross (₹)</th>
                    <th className="num">Net Settlement (₹)</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {secondarySettlements.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No secondary commodity settlements match criteria.
                      </td>
                    </tr>
                  ) : (
                    secondarySettlements.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, color: '#9a3412' }}>
                          <span 
                            style={{ cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => setSelectedSettlement(s)}
                          >
                            {s.settlementNo}
                          </span>
                        </td>
                        <td>{s.date}</td>
                        <td style={{ fontWeight: 600 }}>{s.supplierName}</td>
                        <td>{s.product}</td>
                        <td className="num font-mono">{s.settledBags}</td>
                        <td className="num font-mono" style={{ fontWeight: 800, color: '#ea580c' }}>
                          {(Number(s.settledEndProduct) || Number(s.settledWeight) || 0).toLocaleString()} kg
                        </td>
                        <td className="num font-mono" style={{ fontWeight: 700, color: '#ea580c' }}>
                          ₹{(Number(s.settlementRate) || 0).toLocaleString()}
                        </td>
                        <td className="num" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {s.rateUnit || 'per_kg'}
                        </td>
                        <td className="num font-mono">
                          ₹{(Number(s.settlementGrossAmount) || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="num font-mono" style={{ fontWeight: 900, color: '#9a3412' }}>
                          ₹{(Number(s.settlementNetAmount) || 0).toLocaleString('en-IN')}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn btn-xs btn-secondary"
                            onClick={() => setSelectedSettlement(s)}
                            title="View Voucher"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {secondarySettlements.length > 0 && (
                  <tfoot style={{ background: '#fff7ed', fontWeight: 800 }}>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right' }}>Secondary Sum Totals:</td>
                      <td className="num">{secondaryStats.totalBags.toLocaleString()} b</td>
                      <td className="num" style={{ color: '#ea580c' }}>{(secondaryStats.totalEP || secondaryStats.totalWeight).toLocaleString()} kg</td>
                      <td className="num" style={{ color: '#ea580c' }}>Avg ₹{secondaryStats.avgRate.toLocaleString()}</td>
                      <td className="num">-</td>
                      <td className="num">₹{secondaryStats.totalGross.toLocaleString('en-IN')}</td>
                      <td className="num" style={{ color: '#9a3412' }}>₹{secondaryStats.totalNet.toLocaleString('en-IN')}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

        </div>
      )}

      {/* DETAILED SETTLEMENT VOUCHER MODAL */}
      {selectedSettlement && (() => {
        const s = selectedSettlement;
        const isSales = isSalesSettlement(s);
        const isSec = isSecondaryItem(s);
        const gross = Number(s.settlementGrossAmount) || (Number(s.settledEndProduct) * Number(s.settlementRate)) || 0;
        const totalTax = (Number(s.tdsAmount) || 0) + (Number(s.tcsAmount) || 0);
        const gst = (Number(s.cgstAmount) || 0) + (Number(s.sgstAmount) || 0) + (Number(s.igstAmount) || 0);
        let net = Number(s.settlementNetAmount);
        if (totalTax > 0) {
          if (!net || isNaN(net) || net >= (gross + gst)) {
            net = Math.max(0, Math.round(((gross + gst) - totalTax) * 100) / 100);
          }
        } else {
          net = net || (gross + gst);
        }
        const sup = suppliers.find(sp => sp.id === s.supplierId || sp.name === s.supplierName) || {};

        return (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '650px', padding: 0, borderRadius: '12px', overflow: 'hidden' }}>
              
              {/* Header */}
              <div style={{ background: isSales ? '#1e3a8a' : '#14532d', color: '#fff', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{isSales ? '📤' : '🛒'}</span>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                      {isSales ? 'Sales Storage Settlement Voucher' : 'Purchase Storage Settlement Voucher'}
                    </h3>
                  </div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '0.15rem' }}>
                    Settlement #{s.settlementNo} | Date: {s.date}
                  </div>
                </div>

                <button 
                  className="btn btn-sm"
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '0.3rem 0.5rem' }}
                  onClick={() => setSelectedSettlement(null)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#ffffff' }}>
                
                {/* Party & Product Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>PARTY DETAILS</div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginTop: '0.15rem' }}>{s.supplierName}</div>
                    {sup.place && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📍 {sup.place}</div>}
                    {sup.phone && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📞 {sup.phone}</div>}
                    <span className="badge" style={{ fontSize: '0.68rem', marginTop: '0.35rem', background: isSales ? '#dbeafe' : '#dcfce7', color: isSales ? '#1e40af' : '#166534' }}>
                      {isSales ? 'Buyer / Customer' : 'Seller / Supplier'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>COMMODITY DETAILS</div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', marginTop: '0.15rem' }}>{s.product || 'Standard Commodity'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Classification: <strong style={{ color: isSec ? '#ea580c' : '#166534' }}>{isSec ? '📦 Secondary By-Product' : '🌿 Primary Main Product'}</strong>
                    </div>
                    {s.agreedOutturn && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                        Agreed Outturn: <strong>{s.agreedOutturn} kg / 50kg bag</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quantitative Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                  <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Settled Bags</div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a', marginTop: '0.15rem' }}>
                      {(Number(s.settledBags) || 0).toLocaleString()}
                    </div>
                  </div>

                  <div style={{ background: '#f1f5f9', padding: '0.75rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Raw Weight</div>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a', marginTop: '0.15rem' }}>
                      {(Number(s.settledWeight) || 0).toLocaleString()} kg
                    </div>
                  </div>

                  <div style={{ background: isSec ? '#fff7ed' : '#f0fdf4', padding: '0.75rem', borderRadius: '8px', border: `1px solid ${isSec ? '#fed7aa' : '#bbf7d0'}` }}>
                    <div style={{ fontSize: '0.7rem', color: isSec ? '#9a3412' : '#166534' }}>Settled Clean EP</div>
                    <div style={{ fontWeight: 900, fontSize: '1.25rem', color: isSec ? '#ea580c' : '#15803d', marginTop: '0.15rem' }}>
                      {(Number(s.settledEndProduct) || 0).toLocaleString()} kg
                    </div>
                  </div>
                </div>

                {/* Financial Calculation Table */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '0.5rem 0.85rem', background: '#f8fafc', fontWeight: 700, fontSize: '0.78rem', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                    FINANCIAL LEDGER COMPUTATION
                  </div>
                  
                  <div style={{ padding: '0.75rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Settlement Rate ({s.rateUnit || 'per_kg_ep'}):</span>
                      <span style={{ fontWeight: 700 }}>₹{(Number(s.settlementRate) || 0).toLocaleString()}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Gross Base Amount:</span>
                      <span style={{ fontWeight: 700 }}>₹{gross.toLocaleString('en-IN')}</span>
                    </div>

                    {(Number(s.cgstAmount) > 0 || Number(s.sgstAmount) > 0 || Number(s.igstAmount) > 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0284c7' }}>
                        <span>(+) GST Tax (CGST+SGST/IGST):</span>
                        <span style={{ fontWeight: 700 }}>
                          +₹{((Number(s.cgstAmount) || 0) + (Number(s.sgstAmount) || 0) + (Number(s.igstAmount) || 0)).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}

                    {Number(s.tdsAmount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                        <span>(-) TDS Deducted:</span>
                        <span style={{ fontWeight: 700 }}>-₹{(Number(s.tdsAmount) || 0).toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {Number(s.tcsAmount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                        <span>(-) TCS Deducted:</span>
                        <span style={{ fontWeight: 700 }}>-₹{(Number(s.tcsAmount) || 0).toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', marginTop: '0.35rem', borderTop: '2px solid #e2e8f0', fontSize: '1.05rem', fontWeight: 900, color: isSales ? '#1e40af' : '#166534' }}>
                      <span>FINAL NET SETTLEMENT AMOUNT:</span>
                      <span>₹{net.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                {s.notes && (
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', fontSize: '0.78rem', color: '#475569', border: '1px solid #e2e8f0' }}>
                    <strong>Notes / Terms:</strong> {s.notes}
                  </div>
                )}

              </div>

              {/* Footer */}
              <div style={{ padding: '0.85rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print Voucher
                </button>

                <button 
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedSettlement(null)}
                >
                  Close Window
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
