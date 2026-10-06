import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Scale, 
  Truck, 
  PackageCheck, 
  Handshake, 
  Layers, 
  CreditCard, 
  Sparkles, 
  RefreshCw, 
  PlusCircle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Building, 
  Activity, 
  Download, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Box,
  Sliders,
  FileText
} from 'lucide-react';
import { dbAction } from '../utils/api';
import { exportToCsv } from '../utils/exportCsv';

export default function Dashboard({ 
  onOpenNewArrival, 
  onOpenNewDispatch, 
  onEditArrival, 
  onSelectSupplier, 
  onOpenSettlement, 
  onOpenCommitment, 
  onOpenPayment, 
  onOpenCommodity,
  onOpenOpeningStock, 
  dataVersion = 0, 
  triggerExport = 0 
}) {
  const [dateFilter, setDateFilter] = useState('all_time');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'item_report', 'stock', 'operations', 'commitments', 'financials'
  const [stockSummary, setStockSummary] = useState({ primaryProducts: [], secondaryProducts: [], partyAccounts: [], totals: {} });
  
  const [metrics, setMetrics] = useState({
    daily: { 
      totalWeight: 0, totalBags: 0, totalEndProduct: 0, totalBill: 0, avgRate: 0, arrivalsCount: 0,
      dispatchWeight: 0, dispatchBags: 0, dispatchValue: 0, dispatchesCount: 0,
      settledBags: 0, settledEP: 0, settledValue: 0, settlementsCount: 0
    },
    global: { 
      totalSuppliers: 0, totalPurchasesValue: 0, totalSalesValue: 0, totalStorageBags: 0, totalStorageEP: 0, 
      netStorageBags: 0, netStorageEP: 0, totalTcsAllTime: 0, totalTdsAllTime: 0, totalGstAllTime: 0, 
      totalPaidAllTime: 0, totalReceivedAllTime: 0, netPayableGlobal: 0,
      activePurchaseCommitmentsCount: 0, activeSaleCommitmentsCount: 0
    },
    storageByProduct: [],
    recentArrivals: [],
    recentDispatches: [],
    recentSettlements: []
  });

  const [insight, setInsight] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [commitments, setCommitments] = useState([]);
  const [arrivals, setArrivals] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [openingEntries, setOpeningEntries] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [startDate, endDate, dataVersion]);

  useEffect(() => {
    if (triggerExport > 0) handleExportDashboardSummary();
  }, [triggerExport]);

  const setPresetDate = (type) => {
    setDateFilter(type);
    const today = new Date();
    const toYMD = (d) => d.toISOString().split('T')[0];

    if (type === 'today') {
      setStartDate(toYMD(today));
      setEndDate(toYMD(today));
    } else if (type === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setStartDate(toYMD(y));
      setEndDate(toYMD(y));
    } else if (type === 'this_week') {
      const first = new Date(today.setDate(today.getDate() - today.getDay() + 1));
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (type === 'this_month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(first));
      setEndDate(toYMD(new Date()));
    } else if (type === 'all_time') {
      setStartDate('');
      setEndDate('');
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        dbAction('dashboard:metrics', { startDate, endDate }),
        dbAction('stock:requirement-insight'),
        dbAction('products:get'),
        dbAction('suppliers:get'),
        dbAction('payments:get'),
        dbAction('commitments:get'),
        dbAction('stock:get-summary'),
        dbAction('arrivals:get'),
        dbAction('dispatches:get'),
        dbAction('stock:get-entries'),
        dbAction('settings:get')
      ]);

      const [mets, ins, prods, sups, pays, comms, stockSum, arrs, disps, entries, sets] = 
        results.map(r => r.status === 'fulfilled' ? r.value : null);

      if (mets) setMetrics(mets);
      if (ins) setInsight(ins);
      if (prods) setProducts(prods || []);
      if (sups) setSuppliers(sups || []);
      if (pays) setPayments(pays || []);
      if (comms) setCommitments(comms || []);
      if (stockSum) setStockSummary(stockSum);
      if (arrs) setArrivals(arrs || []);
      if (disps) setDispatches(disps || []);
      if (entries) setOpeningEntries(entries || []);
      if (sets) setSettings(sets || null);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const isSecItem = (item) => {
    if (!item) return false;
    if (item.isSecondary !== undefined) return item.isSecondary === true;
    if (item.isMain !== undefined) return item.isMain === false;
    const prodName = (item.product || item.productName || item.name || '').toLowerCase().trim();
    const pObj = (products || []).find(p => 
      (p.name && p.name.toLowerCase().trim() === prodName) || 
      (p.code && p.code.toLowerCase().trim() === prodName)
    );
    if (pObj) {
      if (pObj.isSecondary === true) return true;
      if (pObj.isMain === true) return false;
    }
    return prodName.includes('husk');
  };

  // Client-side fallback calculation to guarantee instant, 100% reliable rendering
  const calculatedInsight = useMemo(() => {
    const openStock = settings?.openingStock || { coffeeBags: 0, coffeeWeight: 0, coffeeEP: 0, huskBags: 0, huskWeight: 0 };

    let godownOpenStockEP = 0;
    let godownOpenStockBags = 0;
    let godownOpenStockEPSec = 0;
    let godownOpenStockBagsSec = 0;

    let stockAdjustmentsEP = 0;
    let stockAdjustmentsBags = 0;
    let stockAdjustmentsEPSec = 0;
    let stockAdjustmentsBagsSec = 0;

    (openingEntries || []).forEach(entry => {
      const isSec = isSecItem(entry);
      const isAdj = entry.isAdjustment || 
        (entry.supplierName && entry.supplierName.toLowerCase().includes('stock adjustment')) || 
        (entry.notes && entry.notes.toLowerCase().includes('adjustment'));
      const ep = Number(entry.endProductWeight !== undefined ? entry.endProductWeight : entry.weight) || 0;
      const bags = Number(entry.bags) || 0;

      if (isAdj) {
        if (isSec) {
          stockAdjustmentsEPSec += ep;
          stockAdjustmentsBagsSec += bags;
        } else {
          stockAdjustmentsEP += ep;
          stockAdjustmentsBags += bags;
        }
      } else {
        if (isSec) {
          godownOpenStockEPSec += ep;
          godownOpenStockBagsSec += bags;
        } else {
          godownOpenStockEP += ep;
          godownOpenStockBags += bags;
        }
      }
    });

    if (godownOpenStockEP === 0 && ((Number(openStock.coffeeEP) || 0) > 0 || (Number(openStock.coffeeBags) || 0) > 0)) {
      godownOpenStockBags = Number(openStock.coffeeBags) || 0;
      godownOpenStockEP = (Number(openStock.coffeeEP) || 0) > 0 ? Number(openStock.coffeeEP) : (godownOpenStockBags * 26);
    }
    if (godownOpenStockEPSec === 0 && ((Number(openStock.huskWeight) || 0) > 0 || (Number(openStock.huskBags) || 0) > 0)) {
      godownOpenStockBagsSec = Number(openStock.huskBags) || 0;
      godownOpenStockEPSec = (Number(openStock.huskWeight) || 0) > 0 ? Number(openStock.huskWeight) : (godownOpenStockBagsSec * 50);
    }

    // Include party opening stored lots from suppliers master
    (suppliers || []).forEach(s => {
      const b = Number(s.openingStorageBags) || 0;
      const ep = Number(s.openingStorageEP) || (b * 26);
      godownOpenStockBags += b;
      godownOpenStockEP += ep;
    });

    let totalArrivalEP = 0;
    let totalArrivalBags = 0;
    let totalArrivalRawWeight = 0;
    let totalArrivalEPSecondary = 0;
    let totalArrivalBagsSecondary = 0;
    let totalArrivalRawWeightSecondary = 0;

    let totalStoreInEP = 0;
    let totalStoreInBags = 0;
    let totalStoreInEPSecondary = 0;
    let totalStoreInBagsSecondary = 0;

    (arrivals || []).forEach(a => {
      const ep = Number(a.endProductWeight) || 0;
      const bags = Number(a.bags) || 0;
      const weight = Number(a.weight) || 0;
      const isSec = isSecItem(a);

      if (isSec) {
        totalArrivalEPSecondary += ep;
        totalArrivalBagsSecondary += bags;
        totalArrivalRawWeightSecondary += weight;
      } else {
        totalArrivalEP += ep;
        totalArrivalBags += bags;
        totalArrivalRawWeight += weight;
      }

      if (a.status === 'storage' || a.status === 'partial_settled' || a.rateType === 'storage' || a.rateType === 'storage_in') {
        const remEP = a.remainingEndProduct !== undefined ? Number(a.remainingEndProduct) : ep;
        const remBags = a.remainingBags !== undefined ? Number(a.remainingBags) : bags;
        if (isSec) {
          totalStoreInEPSecondary += remEP;
          totalStoreInBagsSecondary += remBags;
        } else {
          totalStoreInEP += remEP;
          totalStoreInBags += remBags;
        }
      }
    });

    let totalDispatchEP = 0;
    let totalDispatchBags = 0;
    let totalDispatchWeight = 0;
    let totalDispatchEPSecondary = 0;
    let totalDispatchBagsSecondary = 0;
    let totalDispatchWeightSecondary = 0;

    let totalStoreOutEP = 0;
    let totalStoreOutBags = 0;
    let totalStoreOutEPSecondary = 0;
    let totalStoreOutBagsSecondary = 0;

    (dispatches || []).forEach(d => {
      const ep = Number(d.endProductWeight) || Number(d.weight) || 0;
      const bags = Number(d.bags) || 0;
      const weight = Number(d.weight) || 0;
      const isSec = isSecItem(d);

      if (isSec) {
        totalDispatchEPSecondary += ep;
        totalDispatchBagsSecondary += bags;
        totalDispatchWeightSecondary += weight;
      } else {
        totalDispatchEP += ep;
        totalDispatchBags += bags;
        totalDispatchWeight += weight;
      }

      if (d.status === 'storage_out' || d.rateType === 'storage_out') {
        const remEP = d.remainingEndProduct !== undefined ? Number(d.remainingEndProduct) : ep;
        const remBags = d.remainingBags !== undefined ? Number(d.remainingBags) : bags;
        if (isSec) {
          totalStoreOutEPSecondary += remEP;
          totalStoreOutBagsSecondary += remBags;
        } else {
          totalStoreOutEP += remEP;
          totalStoreOutBags += remBags;
        }
      }
    });

    let purchaseCommitmentsPendingEP = 0;
    let purchaseCommitmentsPendingBags = 0;
    let purchaseCommitmentsPendingEPSec = 0;
    let purchaseCommitmentsPendingBagsSec = 0;

    (commitments || [])
      .filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active')
      .forEach(c => {
        const isSec = isSecItem(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (products || []).find(p => p.name?.toLowerCase().trim() === c.product?.toLowerCase().trim());
        let epQty = rem;
        if (c.type === 'bags') {
          const outturn = prodObj?.defaultOutturn || 26;
          epQty = rem * outturn;
        }
        if (isSec) {
          purchaseCommitmentsPendingEPSec += epQty;
          purchaseCommitmentsPendingBagsSec += (c.type === 'bags' ? rem : Math.round(rem / 50));
        } else {
          purchaseCommitmentsPendingEP += epQty;
          purchaseCommitmentsPendingBags += (c.type === 'bags' ? rem : Math.round(rem / 50));
        }
      });

    let saleCommitmentsPendingEP = 0;
    let saleCommitmentsPendingBags = 0;
    let saleCommitmentsPendingEPSec = 0;
    let saleCommitmentsPendingBagsSec = 0;

    (commitments || [])
      .filter(c => c.category === 'sale' && c.status === 'active')
      .forEach(c => {
        const isSec = isSecItem(c);
        const rem = Number(c.remainingQty) !== undefined ? Number(c.remainingQty) : (Number(c.quantity) || 0);
        const prodObj = (products || []).find(p => p.name?.toLowerCase().trim() === c.product?.toLowerCase().trim());
        let epQty = rem;
        if (c.type === 'bags') {
          const outturn = prodObj?.defaultOutturn || 26;
          epQty = rem * outturn;
        }
        if (isSec) {
          saleCommitmentsPendingEPSec += epQty;
          saleCommitmentsPendingBagsSec += (c.type === 'bags' ? rem : Math.round(rem / 50));
        } else {
          saleCommitmentsPendingEP += epQty;
          saleCommitmentsPendingBags += (c.type === 'bags' ? rem : Math.round(rem / 50));
        }
      });

    const netPositionEP = godownOpenStockEP
      + stockAdjustmentsEP
      + totalArrivalEP
      - totalDispatchEP
      - totalStoreInEP
      + totalStoreOutEP
      + purchaseCommitmentsPendingEP
      - saleCommitmentsPendingEP;

    const netWarehouseStockMainEP = godownOpenStockEP + stockAdjustmentsEP + totalStoreInEP - totalStoreOutEP;
    const netWarehouseStockSecEP = godownOpenStockEPSec + stockAdjustmentsEPSec + totalStoreInEPSecondary - totalStoreOutEPSecondary;

    return {
      main: {
        godownOpenStockEP: Math.round(godownOpenStockEP * 100) / 100,
        godownOpenStockBags: Math.round(godownOpenStockBags * 100) / 100,
        stockAdjustmentsEP: Math.round(stockAdjustmentsEP * 100) / 100,
        stockAdjustmentsBags: Math.round(stockAdjustmentsBags * 100) / 100,
        totalArrivalEP: Math.round(totalArrivalEP * 100) / 100,
        totalArrivalBags: Math.round(totalArrivalBags * 100) / 100,
        totalArrivalRawWeight: Math.round(totalArrivalRawWeight * 100) / 100,
        totalDispatchEP: Math.round(totalDispatchEP * 100) / 100,
        totalDispatchBags: Math.round(totalDispatchBags * 100) / 100,
        totalStoreInEP: Math.round(totalStoreInEP * 100) / 100,
        totalStoreInBags: Math.round(totalStoreInBags * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEP * 100) / 100,
        totalStoreOutBags: Math.round(totalStoreOutBags * 100) / 100,
        purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEP * 100) / 100,
        purchaseCommitmentsPendingBags: Math.round(purchaseCommitmentsPendingBags * 100) / 100,
        saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEP * 100) / 100,
        saleCommitmentsPendingBags: Math.round(saleCommitmentsPendingBags * 100) / 100,
        netWarehouseStockEP: Math.round(netWarehouseStockMainEP * 100) / 100,
        netPositionEP: Math.round(netPositionEP * 100) / 100,
        quantityToSell: Math.round(netPositionEP * 100) / 100,
        quantityToPurchase: netPositionEP < 0 ? Math.round(Math.abs(netPositionEP) * 100) / 100 : 0,
        actionNeeded: netPositionEP > 0 ? 'SELL_COFFEE' : netPositionEP < 0 ? 'BUY_COFFEE' : 'BALANCED'
      },
      secondary: {
        godownOpenStockEP: Math.round(godownOpenStockEPSec * 100) / 100,
        godownOpenStockBags: Math.round(godownOpenStockBagsSec * 100) / 100,
        stockAdjustmentsEP: Math.round(stockAdjustmentsEPSec * 100) / 100,
        stockAdjustmentsBags: Math.round(stockAdjustmentsBagsSec * 100) / 100,
        totalArrivalEP: Math.round(totalArrivalEPSecondary * 100) / 100,
        totalArrivalBags: Math.round(totalArrivalBagsSecondary * 100) / 100,
        totalArrivalRawWeight: Math.round(totalArrivalRawWeightSecondary * 100) / 100,
        totalDispatchEP: Math.round(totalDispatchEPSecondary * 100) / 100,
        totalDispatchBags: Math.round(totalDispatchBagsSecondary * 100) / 100,
        totalStoreInEP: Math.round(totalStoreInEPSecondary * 100) / 100,
        totalStoreInBags: Math.round(totalStoreInBagsSecondary * 100) / 100,
        totalStoreOutEP: Math.round(totalStoreOutEPSecondary * 100) / 100,
        totalStoreOutBags: Math.round(totalStoreOutBagsSecondary * 100) / 100,
        purchaseCommitmentsPendingEP: Math.round(purchaseCommitmentsPendingEPSec * 100) / 100,
        purchaseCommitmentsPendingBags: Math.round(purchaseCommitmentsPendingBagsSec * 100) / 100,
        saleCommitmentsPendingEP: Math.round(saleCommitmentsPendingEPSec * 100) / 100,
        saleCommitmentsPendingBags: Math.round(saleCommitmentsPendingBagsSec * 100) / 100,
        netWarehouseStockEP: Math.round(netWarehouseStockSecEP * 100) / 100
      }
    };
  }, [arrivals, dispatches, commitments, openingEntries, products, settings, suppliers]);

  const effectiveInsight = useMemo(() => {
    if (insight && insight.main && (insight.main.godownOpenStockEP !== undefined || insight.main.quantityToSell !== undefined)) {
      return insight;
    }
    return calculatedInsight;
  }, [insight, calculatedInsight]);

  const handleExportDashboardSummary = () => {
    const m = effectiveInsight?.main || effectiveInsight || {};
    const s = effectiveInsight?.secondary || {};
    const netPosition = m.quantityToSell !== undefined ? m.quantityToSell : (m.netPositionEP || 0);
    const isShort = netPosition < 0;
    const targetQty = Math.abs(netPosition);

    const summaryData = [
      { 
        Metric: isShort ? '🛒 Quantity We Need to Purchase (Main EP)' : '🎯 Quantity We Need to Sell (Main EP)', 
        Amount: isShort ? `${targetQty.toLocaleString()} kg EP` : `+${targetQty.toLocaleString()} kg EP`, 
        Notes: isShort 
          ? 'Deficit / Short position: Commitments exceed physical stock -> Need to PURCHASE' 
          : 'Surplus / Long position: Available stock exceeds commitments -> Need to SELL (Formula: Open Stock + Adjustments + Arrivals - Dispatch - Store In + Store Out + Pur. Contracts - Sale Contracts)' 
      },
      { Metric: '🌿 Primary - Godown Open Stock', Amount: `${(m.godownOpenStockEP || m.openingCoffeeEP || 0).toLocaleString()} kg EP`, Notes: `${(m.godownOpenStockBags || 0).toLocaleString()} Bags` },
      { Metric: '🌿 Primary - Stock Adjustments', Amount: `${(m.stockAdjustmentsEP || 0).toLocaleString()} kg EP`, Notes: `${(m.stockAdjustmentsBags || 0).toLocaleString()} Bags` },
      { Metric: '🌿 Primary - Inward Arrivals', Amount: `${(m.totalArrivalEP || 0).toLocaleString()} kg EP`, Notes: `${(m.totalArrivalBags || 0).toLocaleString()} Bags (Raw: ${(m.totalArrivalRawWeight || 0).toLocaleString()} kg)` },
      { Metric: '🌿 Primary - Outward Dispatches', Amount: `${(m.totalDispatchEP || 0).toLocaleString()} kg EP`, Notes: `${(m.totalDispatchBags || 0).toLocaleString()} Bags` },
      { Metric: '🌿 Primary - Store In (Storage Inward)', Amount: `${(m.totalStoreInEP || 0).toLocaleString()} kg EP`, Notes: `${(m.totalStoreInBags || 0).toLocaleString()} Bags in storage` },
      { Metric: '🌿 Primary - Store Out (Storage Dispatches)', Amount: `${(m.totalStoreOutEP || 0).toLocaleString()} kg EP`, Notes: `${(m.totalStoreOutBags || 0).toLocaleString()} Bags unbilled` },
      { Metric: '🌿 Primary - Pending Purchase Contracts', Amount: `${(m.purchaseCommitmentsPendingEP || 0).toLocaleString()} kg EP`, Notes: `${(m.purchaseCommitmentsPendingBags || 0).toLocaleString()} Bags to receive` },
      { Metric: '🌿 Primary - Pending Sale Contracts', Amount: `${(m.saleCommitmentsPendingEP || 0).toLocaleString()} kg EP`, Notes: `${(m.saleCommitmentsPendingBags || 0).toLocaleString()} Bags committed` },
      { Metric: '🌿 Primary - Net Warehouse Physical Stock', Amount: `${(m.netWarehouseStockEP || 0).toLocaleString()} kg EP`, Notes: 'On hand' },
      { Metric: '📦 Secondary - Godown Open Stock', Amount: `${(s.godownOpenStockEP || 0).toLocaleString()} kg`, Notes: 'Secondary products' },
      { Metric: '📦 Secondary - Stock Adjustments', Amount: `${(s.stockAdjustmentsEP || 0).toLocaleString()} kg`, Notes: 'Secondary products' },
      { Metric: '📦 Secondary - Inward Arrivals', Amount: `${(s.totalArrivalRawWeight || s.totalArrivalEP || 0).toLocaleString()} kg`, Notes: `${(s.totalArrivalBags || 0).toLocaleString()} Bags` },
      { Metric: '📦 Secondary - Outward Dispatches', Amount: `${(s.totalDispatchEP || 0).toLocaleString()} kg`, Notes: `${(s.totalDispatchBags || 0).toLocaleString()} Bags` },
      { Metric: '📦 Secondary - Net Physical Stock', Amount: `${(s.netWarehouseStockEP || 0).toLocaleString()} kg`, Notes: 'On hand (Excluded from target)' },
      { Metric: 'Billed Purchases Value', Amount: `₹${(metrics.global.totalPurchasesValue || 0).toLocaleString()}`, Notes: 'All Parties' },
      { Metric: 'Billed Sales Value', Amount: `₹${(metrics.global.totalSalesValue || 0).toLocaleString()}`, Notes: 'All Parties' },
      { Metric: 'Opening Balances We Owe (Payable)', Amount: `₹${(metrics.global.totalOpeningPayable || 0).toLocaleString()}`, Notes: 'Party Master Credit Opening' },
      { Metric: 'Opening Balances Owes Us (Receivable)', Amount: `₹${(metrics.global.totalOpeningReceivable || 0).toLocaleString()}`, Notes: 'Party Master Debit Opening' },
      { Metric: 'Total Paid to Suppliers', Amount: `₹${(metrics.global.totalPaidAllTime || 0).toLocaleString()}`, Notes: 'Bank / Cash' },
      { Metric: 'Total Received from Customers', Amount: `₹${(metrics.global.totalReceivedAllTime || 0).toLocaleString()}`, Notes: 'Bank / Cash' },
      { Metric: 'Net Accounts Balance Payable', Amount: `₹${(metrics.global.netPayableGlobal || 0).toLocaleString()}`, Notes: 'Global Ledger (Incl. Opening Balance)' }
    ];
    exportToCsv(`ERP_Executive_Dashboard_Summary_${new Date().toISOString().split('T')[0]}`, [
      { key: 'Metric', label: 'Metric / Component' },
      { key: 'Amount', label: 'Value / Volume' },
      { key: 'Notes', label: 'Category & Notes' }
    ], summaryData);
  };

  const { daily, global, storageByProduct = [], recentArrivals = [], recentDispatches = [], recentSettlements = [] } = metrics;

  // Compute maximum value for financial chart scaling
  const maxFinValue = Math.max(
    global.totalPurchasesValue || 1,
    global.totalSalesValue || 1,
    global.totalPaidAllTime || 1,
    global.totalReceivedAllTime || 1
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* Executive Quick Actions Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        color: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
        border: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.6rem' }}>📊</span>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                Global Executive ERP Dashboard
              </h2>
              <span className="badge badge-coffee" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}>
                Live Sync
              </span>
            </div>
            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.83rem', color: '#94a3b8' }}>
              Real-time monitoring across Arrivals, Dispatches, Commitments, Settlements, Commodities & Payment Accounts
            </p>
          </div>

          {/* Quick Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-coffee" onClick={onOpenNewArrival} title="Alt+A / F2">
              <Truck size={14} /> + Arrival (F2)
            </button>
            <button className="btn btn-sm btn-primary" onClick={onOpenNewDispatch} title="Alt+K / F10">
              <PackageCheck size={14} /> + Dispatch (F10)
            </button>
            <button className="btn btn-sm btn-purple" style={{ background: '#7c3aed', color: '#fff' }} onClick={onOpenCommitment} title="Alt+C / F6">
              <Handshake size={14} /> + Contract
            </button>
            <button className="btn btn-sm btn-success" onClick={onOpenPayment} title="Alt+P / F5">
              <CreditCard size={14} /> + Payment
            </button>
            <button className="btn btn-sm btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }} onClick={onOpenCommodity} title="F8">
              <Sparkles size={14} color="#f59e0b" /> + Commodity (F8)
            </button>
            <button className="btn btn-sm btn-warning" style={{ background: '#0284c7', borderColor: '#0284c7', color: '#fff' }} onClick={onOpenSettlement} title="F4">
              <Layers size={14} /> Settle (F4)
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'overview' ? '#2563eb' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('overview')}
          >
            <BarChart3 size={14} /> Executive Analytics & Visual Charts
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'item_report' ? '#0284c7' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('item_report')}
          >
            <Sparkles size={14} color="#38bdf8" /> 🌿 Primary & Secondary Item Report
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'stock' ? '#2563eb' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('stock')}
          >
            <Box size={14} /> Stock & Commodities Inventory ({storageByProduct.length})
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'operations' ? '#2563eb' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('operations')}
          >
            <Activity size={14} /> Inward & Outward Operations Feed
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'commitments' ? '#2563eb' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('commitments')}
          >
            <Handshake size={14} /> Commitments & Storage Settlements
          </button>
          <button
            className="btn btn-sm"
            style={{
              background: activeSubTab === 'financials' ? '#2563eb' : 'rgba(255,255,255,0.08)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
              padding: '0.45rem 0.85rem'
            }}
            onClick={() => setActiveSubTab('financials')}
          >
            <CreditCard size={14} /> Financials, Payments & Tax Ledger
          </button>

          {/* Date Selector */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('today')}>Today</button>
            <button className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('this_month')}>This Month</button>
            <button className={`btn btn-sm ${dateFilter === 'all_time' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setPresetDate('all_time')}>All Time</button>
            <button className="btn btn-secondary btn-sm" style={{ padding: '0.2rem 0.4rem' }} onClick={loadDashboardData} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Stock Position & Hedging Insight Widget */}
      {effectiveInsight && (() => {
        const m = effectiveInsight.main || effectiveInsight || {};
        const netPosition = m.quantityToSell !== undefined ? m.quantityToSell : (m.netPositionEP || 0);
        const isLong = netPosition > 0;
        const isShort = netPosition < 0;
        const isBalanced = netPosition === 0;
        const targetQty = Math.abs(netPosition);

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.25)',
            border: isShort ? '1px solid rgba(239, 68, 68, 0.45)' : isLong ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid #334155'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.35rem' }}>{isShort ? '🛒' : isLong ? '🎯' : '⚖️'}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: isShort ? '#fca5a5' : isLong ? '#86efac' : '#f8fafc', fontWeight: 800 }}>
                      {isShort ? 'Quantity We Need to Purchase (Main Items)' : isLong ? 'Quantity We Need to Sell (Main Items)' : 'Stock Position Balanced (Main Items)'}
                    </h3>
                    <span className="badge" style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', background: isShort ? '#dc2626' : isLong ? '#16a34a' : '#0284c7', color: '#fff', fontWeight: 700 }}>
                      {isShort ? '⚠️ Deficit (Purchase Required)' : isLong ? '🌿 Main Products Only' : '⚖️ Balanced'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                    {isShort 
                      ? 'Commitments exceed physical stock: Calculated strictly for primary commodities (Secondary products excluded). We need to PURCHASE commodity stock.'
                      : 'Calculated strictly for primary commodities (secondary by-products excluded from sell/purchase target)'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    padding: '0.45rem 0.9rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    borderRadius: '8px',
                    background: isLong ? 'rgba(34, 197, 94, 0.18)' : isShort ? 'rgba(239, 68, 68, 0.18)' : 'rgba(148, 163, 184, 0.15)',
                    color: isLong ? '#4ade80' : isShort ? '#f87171' : '#cbd5e1',
                    border: `1px solid ${isLong ? '#22c55e' : isShort ? '#ef4444' : '#64748b'}`
                  }}
                >
                  {isShort ? `🛒 Need to PURCHASE: ${targetQty.toLocaleString()} kg EP` : isLong ? `🚀 Need to SELL: +${targetQty.toLocaleString()} kg EP` : '✅ Balanced Stock Position (0 kg)'}
                </span>

                <button
                  className="btn btn-sm btn-secondary"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '0.75rem', padding: '0.4rem 0.65rem' }}
                  onClick={() => setActiveSubTab('item_report')}
                >
                  🌿 View Full Report
                </button>
              </div>
            </div>

            {/* 8-Component Formula Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.65rem', textAlign: 'center', fontSize: '0.78rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600 }}>1. Godown Open</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f8fafc', marginTop: '0.2rem' }}>
                  {(m.godownOpenStockEP || m.openingCoffeeEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{(m.godownOpenStockBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div style={{ color: '#38bdf8', fontSize: '0.72rem', fontWeight: 700 }}>2. + Adjustments</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#38bdf8', marginTop: '0.2rem' }}>
                  {((m.stockAdjustmentsEP || 0) >= 0 ? '+' : '') + (m.stockAdjustmentsEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#7dd3fc' }}>{(m.stockAdjustmentsBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(74, 222, 128, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
                <div style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 700 }}>3. + Arrivals</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#4ade80', marginTop: '0.2rem' }}>
                  +{(m.totalArrivalEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#86efac' }}>{(m.totalArrivalBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(248, 113, 113, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.25)' }}>
                <div style={{ color: '#f87171', fontSize: '0.72rem', fontWeight: 700 }}>4. - Dispatch</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f87171', marginTop: '0.2rem' }}>
                  -{(m.totalDispatchEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#fca5a5' }}>{(m.totalDispatchBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(251, 191, 36, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.25)' }}>
                <div style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700 }}>5. - Store In</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fbbf24', marginTop: '0.2rem' }}>
                  -{(m.totalStoreInEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#fde68a' }}>{(m.totalStoreInBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(96, 165, 250, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(96, 165, 250, 0.25)' }}>
                <div style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700 }}>6. + Store Out</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#60a5fa', marginTop: '0.2rem' }}>
                  +{(m.totalStoreOutEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#93c5fd' }}>{(m.totalStoreOutBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(192, 132, 252, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(192, 132, 252, 0.25)' }}>
                <div style={{ color: '#c084fc', fontSize: '0.72rem', fontWeight: 700 }}>7. + Pur. Commit</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#c084fc', marginTop: '0.2rem' }}>
                  +{(m.purchaseCommitmentsPendingEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#d8b4fe' }}>{(m.purchaseCommitmentsPendingBags || 0).toLocaleString()} b</div>
              </div>

              <div style={{ background: 'rgba(244, 114, 182, 0.08)', padding: '0.55rem 0.4rem', borderRadius: '8px', border: '1px solid rgba(244, 114, 182, 0.25)' }}>
                <div style={{ color: '#f472b6', fontSize: '0.72rem', fontWeight: 700 }}>8. - Sale Commit</div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#f472b6', marginTop: '0.2rem' }}>
                  -{(m.saleCommitmentsPendingEP || 0).toLocaleString()} kg
                </div>
                <div style={{ fontSize: '0.68rem', color: '#fbcfe8' }}>{(m.saleCommitmentsPendingBags || 0).toLocaleString()} b</div>
              </div>
            </div>

            <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.76rem', color: '#cbd5e1' }}>
                <strong style={{ color: '#93c5fd' }}>Formula:</strong> <em>Godown Open Stock + Stock Adjustments + Arrivals - Dispatches - Store In + Store Out + Pur. Contracts - Sale Contracts</em>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isLong ? '#4ade80' : isShort ? '#f87171' : '#f8fafc' }}>
                {isShort ? (
                  <span>🛒 Quantity We Need to Purchase: <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>{targetQty.toLocaleString()} kg EP</span></span>
                ) : isLong ? (
                  <span>🎯 Quantity We Need to Sell: <span style={{ textDecoration: 'underline', textUnderlineOffset: '4px' }}>+{targetQty.toLocaleString()} kg EP</span></span>
                ) : (
                  <span>✅ Stock Position Balanced: 0 kg EP</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6 ERP PILLARS TOP METRICS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.85rem' }}>
        {/* Pillar 1: Inward Purchases */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>1. Arrivals (Purchases)</span>
            <Truck size={15} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
            ₹{(daily.totalBill || global.totalPurchasesValue || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.25rem' }}>
            {(daily.totalWeight || 0).toLocaleString()} kg | {(daily.totalBags || 0).toLocaleString()} b
          </div>
        </div>

        {/* Pillar 2: Outward Sales / Dispatches */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>2. Dispatches (Sales)</span>
            <PackageCheck size={15} color="#059669" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>
            ₹{(daily.dispatchValue || global.totalSalesValue || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.25rem' }}>
            {(daily.dispatchWeight || 0).toLocaleString()} kg | {(daily.dispatchBags || 0).toLocaleString()} b
          </div>
        </div>

        {/* Pillar 3: Stock Inventory */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>3. Net Warehouse Stock</span>
            <Box size={15} color="#7c3aed" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7c3aed' }}>
            {(global.netStorageBags || 0).toLocaleString()} Bags
          </div>
          <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.25rem', fontWeight: 600 }}>
            {(global.totalOpeningStockBags || 0) > 0 && <span style={{ color: '#0284c7' }}>Open: {(global.totalOpeningStockBags || 0).toLocaleString()}b | </span>}
            In: {(global.totalStorageBags || 0).toLocaleString()}b | Out: {(global.totalStoreOutBags || 0).toLocaleString()}b
          </div>
        </div>

        {/* Pillar 4: Commitments */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>4. Active Contracts</span>
            <Handshake size={15} color="#d97706" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#d97706' }}>
            {global.activePurchaseCommitmentsCount || 0} Pur / {global.activeSaleCommitmentsCount || 0} Sale
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.25rem' }}>
            Pending Contracts
          </div>
        </div>

        {/* Pillar 5: Settlements */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>5. Storage Settlements</span>
            <Layers size={15} color="#0284c7" />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0284c7' }}>
            ₹{(daily.settledValue || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '0.25rem' }}>
            {(daily.settledBags || 0).toLocaleString()} b settled
          </div>
        </div>

        {/* Pillar 6: Net Accounts Payable / Receivable */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>6. Net Balance Payable</span>
            <CreditCard size={15} color={global.netPayableGlobal >= 0 ? '#dc2626' : '#059669'} />
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: global.netPayableGlobal >= 0 ? '#dc2626' : '#059669' }}>
            ₹{(global.netPayableGlobal || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '0.25rem' }}>
            {(global.netOpeningFinancialBalance || 0) !== 0 && (
              <span style={{ color: '#b45309', fontWeight: 600 }}>
                Open: ₹{(global.netOpeningFinancialBalance || 0).toLocaleString()} |{' '}
              </span>
            )}
            Paid ₹{(global.totalPaidAllTime || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* TAB 1: EXECUTIVE ANALYTICS & VISUAL GRAPHS */}
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* PRIMARY VS SECONDARY COMMODITY OVERVIEW BANNER */}
          {effectiveInsight && (() => {
            const m = effectiveInsight.main || effectiveInsight || {};
            const s = effectiveInsight.secondary || {};
            const netPosition = m.quantityToSell !== undefined ? m.quantityToSell : (m.netPositionEP || 0);
            const isLong = netPosition > 0;
            const isShort = netPosition < 0;
            const targetQty = Math.abs(netPosition);

            return (
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '1rem 1.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.15rem' }}>⚖️</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                        Primary vs Secondary Commodity Position Summary
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
                        Position calculated strictly for Main Products | Secondary items tracked separately
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => setActiveSubTab('item_report')}
                  >
                    🌿 Full Primary & Secondary Report <ChevronRight size={13} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {/* Primary Summary Box */}
                  <div style={{ background: isShort ? '#fff1f2' : '#f0fdf4', border: isShort ? '1px solid #fecdd3' : '1px solid #bbf7d0', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isShort ? '#9f1239' : '#166534' }}>🌿 Primary Products (Main Items)</span>
                      <span className="badge" style={{ fontSize: '0.7rem', background: isShort ? '#e11d48' : '#16a34a', color: '#fff' }}>
                        {isShort ? 'Short Position' : 'Long Position'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.72rem' }}>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ color: '#64748b' }}>Open + Adj</div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{((m.godownOpenStockEP || m.openingCoffeeEP || 0) + (m.stockAdjustmentsEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ color: '#64748b' }}>Arrivals - Disp</div>
                        <div style={{ fontWeight: 800, color: '#15803d' }}>{((m.totalArrivalEP || 0) - (m.totalDispatchEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ color: '#64748b' }}>Net Storage</div>
                        <div style={{ fontWeight: 800, color: '#0284c7' }}>{((m.totalStoreInEP || 0) - (m.totalStoreOutEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <div style={{ color: '#64748b' }}>Contracts Net</div>
                        <div style={{ fontWeight: 800, color: '#7c3aed' }}>{((m.purchaseCommitmentsPendingEP || 0) - (m.saleCommitmentsPendingEP || 0)).toLocaleString()} kg</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.55rem', paddingTop: '0.5rem', borderTop: isShort ? '1px solid #fecdd3' : '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isShort ? '#9f1239' : '#166534' }}>
                        {isShort ? '🛒 Need to Purchase:' : '🎯 Need to Sell:'}
                      </span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: isShort ? '#dc2626' : '#16a34a' }}>
                        {isShort ? `${targetQty.toLocaleString()} kg EP` : isLong ? `+${targetQty.toLocaleString()} kg EP` : '0 kg EP'}
                      </span>
                    </div>
                  </div>

                  {/* Secondary Summary Box */}
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: '#9a3412' }}>📦 Secondary Products (Husk / By-Products)</span>
                      <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Excluded from Target</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center', fontSize: '0.72rem' }}>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
                        <div style={{ color: '#64748b' }}>Open + Adj</div>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{((s.godownOpenStockEP || 0) + (s.stockAdjustmentsEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
                        <div style={{ color: '#64748b' }}>Arrivals - Disp</div>
                        <div style={{ fontWeight: 800, color: '#c2410c' }}>{((s.totalArrivalRawWeight || s.totalArrivalEP || 0) - (s.totalDispatchEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
                        <div style={{ color: '#64748b' }}>Net Storage</div>
                        <div style={{ fontWeight: 800, color: '#d97706' }}>{((s.totalStoreInEP || 0) - (s.totalStoreOutEP || 0)).toLocaleString()} kg</div>
                      </div>
                      <div style={{ background: '#ffffff', padding: '0.4rem', borderRadius: '6px', border: '1px solid #ffedd5' }}>
                        <div style={{ color: '#64748b' }}>Contracts Net</div>
                        <div style={{ fontWeight: 800, color: '#7c3aed' }}>{((s.purchaseCommitmentsPendingEP || 0) - (s.saleCommitmentsPendingEP || 0)).toLocaleString()} kg</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.55rem', paddingTop: '0.5rem', borderTop: '1px solid #ffedd5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9a3412' }}>🏬 Net Physical Stock:</span>
                      <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ea580c' }}>
                        {(s.netWarehouseStockEP || 0).toLocaleString()} kg
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* VISUAL CHARTS ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '1.25rem' }}>
            
            {/* FINANCIAL FLOW & REVENUE COMPARISON BAR CHART */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <div className="card-title" style={{ fontSize: '1.05rem' }}>
                    <BarChart3 size={18} color="#2563eb" />
                    <span>Financial Cash Flow & Revenue Analytics</span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Comparing Purchases Billed vs Sales Billed vs Payments Paid vs Payments Received
                  </span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={handleExportDashboardSummary}>
                  <Download size={13} /> Export Report
                </button>
              </div>

              {/* Custom SVG / Canvas Styled Visual Bar Chart */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                
                {/* Bar 1: Purchases */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: '#1e3a8a' }}>🛒 Billed Inward Purchases</span>
                    <span style={{ fontWeight: 700 }}>₹{(global.totalPurchasesValue || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '22px', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(4, ((global.totalPurchasesValue || 0) / maxFinValue) * 100))}%`,
                      background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                      borderRadius: '6px',
                      transition: 'width 0.5s ease-in-out'
                    }} />
                  </div>
                </div>

                {/* Bar 2: Sales */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: '#065f46' }}>📤 Billed Outward Sales</span>
                    <span style={{ fontWeight: 700 }}>₹{(global.totalSalesValue || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '22px', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(4, ((global.totalSalesValue || 0) / maxFinValue) * 100))}%`,
                      background: 'linear-gradient(90deg, #059669, #10b981)',
                      borderRadius: '6px',
                      transition: 'width 0.5s ease-in-out'
                    }} />
                  </div>
                </div>

                {/* Bar 3: Payments Paid */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: '#7c3aed' }}>💳 Payments Paid to Suppliers</span>
                    <span style={{ fontWeight: 700 }}>₹{(global.totalPaidAllTime || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '22px', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(4, ((global.totalPaidAllTime || 0) / maxFinValue) * 100))}%`,
                      background: 'linear-gradient(90deg, #7c3aed, #8b5cf6)',
                      borderRadius: '6px',
                      transition: 'width 0.5s ease-in-out'
                    }} />
                  </div>
                </div>

                {/* Bar 4: Payments Received */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: '#d97706' }}>📥 Payments Received from Buyers</span>
                    <span style={{ fontWeight: 700 }}>₹{(global.totalReceivedAllTime || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ background: '#f1f5f9', height: '22px', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(4, ((global.totalReceivedAllTime || 0) / maxFinValue) * 100))}%`,
                      background: 'linear-gradient(90deg, #d97706, #f59e0b)',
                      borderRadius: '6px',
                      transition: 'width 0.5s ease-in-out'
                    }} />
                  </div>
                </div>

              </div>

              {/* Bottom Taxes & Net Balance Ledger Bar */}
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
                <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Opening Balance (Net)</span>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: (global.netOpeningFinancialBalance || 0) >= 0 ? '#dc2626' : '#059669' }}>
                    ₹{(global.netOpeningFinancialBalance || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: '2px' }}>
                    We Owe ₹{(global.totalOpeningPayable || 0).toLocaleString()} | Owes Us ₹{(global.totalOpeningReceivable || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Total TCS Deducted</span>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>₹{(global.totalTcsAllTime || 0).toLocaleString()}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Total GST / Tax Sum</span>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>₹{(global.totalGstAllTime || 0).toLocaleString()}</div>
                </div>
                <div style={{ background: (global.netPayableGlobal || 0) >= 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${(global.netPayableGlobal || 0) >= 0 ? '#fecaca' : '#bbf7d0'}`, padding: '0.5rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.72rem', color: (global.netPayableGlobal || 0) >= 0 ? '#991b1b' : '#166534', fontWeight: 600 }}>Net Outstanding Balance</span>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: (global.netPayableGlobal || 0) >= 0 ? '#dc2626' : '#059669' }}>
                    ₹{(global.netPayableGlobal || 0).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: (global.netPayableGlobal || 0) >= 0 ? '#dc2626' : '#059669', marginTop: '2px' }}>
                    {(global.netPayableGlobal || 0) >= 0 ? 'Net Payable (We Owe)' : 'Net Receivable (Owes Us)'}
                  </div>
                </div>
              </div>
            </div>

            {/* COMMODITY STOCK DISTRIBUTION CHART */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <div className="card-title" style={{ fontSize: '1rem' }}>
                  <PieChartIcon size={18} color="#7c3aed" />
                  <span>Commodity Stock Breakdown</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onOpenCommodity}>
                  + Commodity
                </button>
              </div>

              {storageByProduct.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b', fontSize: '0.85rem' }}>
                  📦 No storage coffee lots recorded yet. Click <strong>+ New Arrival</strong> with Storage status to add stock.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {storageByProduct.map((item, idx) => {
                    const totalEPAll = storageByProduct.reduce((acc, x) => acc + (x.netEP || 0), 0) || 1;
                    const pct = Math.round(((item.netEP || 0) / totalEPAll) * 100);
                    const colors = ['#2563eb', '#059669', '#7c3aed', '#d97706', '#0284c7', '#dc2626'];
                    const color = colors[idx % colors.length];

                    return (
                      <div key={item.product || idx} style={{ background: '#f8fafc', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem', fontSize: '0.82rem' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.product}</span>
                          <span style={{ fontWeight: 700, color: color }}>
                            {(item.netBags || 0).toLocaleString()} Bags ({(item.netEP || 0).toLocaleString()} kg EP)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ flex: 1, background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, background: color, height: '100%' }} />
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, minWidth: '35px' }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Avg Outturn: {item.avgOutturn > 0 ? `${item.avgOutturn} kg/50k` : 'Direct Weight'}</span>
                          <span>In: {item.storeInBags}b | Out: {item.storeOutBags}b</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* RECENT TRANSACTIONS OVERVIEW GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            
            {/* Recent Inward Arrivals */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                  <Truck size={16} color="#2563eb" /> Recent Inward Arrivals
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onOpenNewArrival}>+ Add Arrival</button>
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Arrival #</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Party</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Product</th>
                      <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Bags</th>
                      <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>EP Wt</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentArrivals.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No recent arrivals recorded</td></tr>
                    ) : (
                      recentArrivals.map(arr => (
                        <tr key={arr.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600 }}>{arr.arrivalNo}</td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#2563eb', cursor: 'pointer' }} onClick={() => onSelectSupplier(arr.supplierId)}>
                            {arr.supplierName}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>{arr.product}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{arr.bags}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>{(arr.endProductWeight || 0).toLocaleString()}</td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>
                            <span className={`badge ${arr.status === 'billed' ? 'badge-green' : arr.status === 'storage' ? 'badge-coffee' : 'badge-blue'}`}>
                              {arr.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Outward Sales Dispatches */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                  <PackageCheck size={16} color="#059669" /> Recent Outward Dispatches
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onOpenNewDispatch}>+ Add Dispatch</button>
              </div>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Dispatch #</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Customer / Party</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Product</th>
                      <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Bags</th>
                      <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Net Value</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDispatches.length === 0 ? (
                      <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No recent dispatches recorded</td></tr>
                    ) : (
                      recentDispatches.map(disp => (
                        <tr key={disp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.45rem 0.6rem', fontWeight: 600 }}>{disp.dispatchNo}</td>
                          <td style={{ padding: '0.45rem 0.6rem', color: '#2563eb', cursor: 'pointer' }} onClick={() => onSelectSupplier(disp.supplierId || disp.partyId)}>
                            {disp.supplierName || disp.partyName}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>{disp.product}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>{disp.bags}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                            ₹{(disp.netAmount || disp.billAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>
                            <span className={`badge ${disp.status === 'billed' ? 'badge-green' : 'badge-blue'}`}>
                              {disp.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* TAB: PRIMARY & SECONDARY ITEM REPORT */}
      {activeSubTab === 'item_report' && (() => {
        const m = effectiveInsight?.main || effectiveInsight || {};
        const s = effectiveInsight?.secondary || {};
        const primaryItems = stockSummary?.primaryProducts || [];
        const secondaryItems = stockSummary?.secondaryProducts || [];
        const netPosition = m.quantityToSell !== undefined ? m.quantityToSell : (m.netPositionEP || 0);
        const isLong = netPosition > 0;
        const isShort = netPosition < 0;
        const isBalanced = netPosition === 0;
        const targetQty = Math.abs(netPosition);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Header Card */}
            <div className="card" style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>🌿</span>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                      Primary & Secondary Item Comprehensive Report
                    </h2>
                    <span className="badge" style={{ background: '#0284c7', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                      Live Inventory & Position
                    </span>
                  </div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                    Segregated audit of Primary (Main) items and Secondary (By-Products/Husk) across Godown Open Stock, Adjustments, Inward Arrivals, Outward Dispatches, Store In, Store Out, and Contract Commitments.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleExportDashboardSummary}>
                    <Download size={13} /> Export Report (CSV)
                  </button>
                  <button className="btn btn-warning btn-sm" style={{ background: '#0284c7', borderColor: '#0284c7', color: '#fff' }} onClick={onOpenOpeningStock}>
                    📦 Edit Opening Stock
                  </button>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparative Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              
              {/* PRIMARY PRODUCTS CARD */}
              <div className="card" style={{ padding: 0, border: '2px solid #bbf7d0', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.08)' }}>
                <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderBottom: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🌿</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#166534' }}>Primary Products (Main Items)</div>
                      <div style={{ fontSize: '0.72rem', color: '#15803d' }}>Subject to Sales Hedging & Delivery Commitments</div>
                    </div>
                  </div>
                  <span className="badge" style={{ background: isShort ? '#dc2626' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.72rem' }}>
                    {isShort ? 'Short Position' : 'Long Position'}
                  </span>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Grid of Key Primary Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>1. Godown Opening Stock</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                        {(m.godownOpenStockEP || m.openingCoffeeEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{(m.godownOpenStockBags || 0).toLocaleString()} Bags</div>
                    </div>

                    <div style={{ background: '#f0f9ff', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                      <div style={{ fontSize: '0.72rem', color: '#0369a1', fontWeight: 600 }}>2. + Stock Adjustments</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0284c7', marginTop: '0.15rem' }}>
                        {((m.stockAdjustmentsEP || 0) >= 0 ? '+' : '') + (m.stockAdjustmentsEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>{(m.stockAdjustmentsBags || 0).toLocaleString()} Bags</div>
                    </div>

                    <div style={{ background: '#f0fdf4', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>3. + Inward Arrivals</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a', marginTop: '0.15rem' }}>
                        +{(m.totalArrivalEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#22c55e' }}>{(m.totalArrivalBags || 0).toLocaleString()} Bags (Raw: {(m.totalArrivalRawWeight || 0).toLocaleString()} kg)</div>
                    </div>

                    <div style={{ background: '#fef2f2', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 }}>4. - Outward Dispatches</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626', marginTop: '0.15rem' }}>
                        -{(m.totalDispatchEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>{(m.totalDispatchBags || 0).toLocaleString()} Bags</div>
                    </div>

                    <div style={{ background: '#fffbeb', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>5. - Store In (Storage Inward)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706', marginTop: '0.15rem' }}>
                        -{(m.totalStoreInEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>{(m.totalStoreInBags || 0).toLocaleString()} Bags stored</div>
                    </div>

                    <div style={{ background: '#eff6ff', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>6. + Store Out (Unbilled Dispatches)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                        +{(m.totalStoreOutEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>{(m.totalStoreOutBags || 0).toLocaleString()} Bags delivered</div>
                    </div>

                    <div style={{ background: '#faf5ff', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: '0.72rem', color: '#6b21a8', fontWeight: 600 }}>7. + Pur. Contracts Pending</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.15rem' }}>
                        +{(m.purchaseCommitmentsPendingEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#9333ea' }}>{(m.purchaseCommitmentsPendingBags || 0).toLocaleString()} Bags to receive</div>
                    </div>

                    <div style={{ background: '#fdf2f8', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fbcfe8' }}>
                      <div style={{ fontSize: '0.72rem', color: '#be185d', fontWeight: 600 }}>8. - Sale Contracts Pending</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#db2777', marginTop: '0.15rem' }}>
                        -{(m.saleCommitmentsPendingEP || 0).toLocaleString()} kg EP
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#ec4899' }}>{(m.saleCommitmentsPendingBags || 0).toLocaleString()} Bags committed</div>
                    </div>
                  </div>

                  {/* Quantity Result Box */}
                  <div style={{
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    borderRadius: '10px',
                    padding: '1rem 1.25rem',
                    color: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.35rem',
                    border: `1px solid ${isShort ? 'rgba(239, 68, 68, 0.45)' : isLong ? 'rgba(34, 197, 94, 0.45)' : 'rgba(148, 163, 184, 0.3)'}`
                  }}>
                    <div>
                      <div style={{ fontSize: '0.78rem', color: isShort ? '#fca5a5' : isLong ? '#86efac' : '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em' }}>
                        {isShort ? '🛒 Net Quantity We Need to Purchase' : isLong ? '🎯 Net Quantity We Need to Sell' : '⚖️ Stock Position Fully Balanced'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#cbd5e1', marginTop: '0.15rem' }}>
                        Godown Open + Adjustments + Arrivals - Dispatch - StoreIn + StoreOut + PurCommit - SaleCommit
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: isShort ? '#f87171' : isLong ? '#4ade80' : '#f8fafc' }}>
                        {isShort ? `${targetQty.toLocaleString()} kg` : isLong ? `+${targetQty.toLocaleString()} kg` : '0 kg'}
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isShort ? '#fca5a5' : isLong ? '#86efac' : '#94a3b8' }}>
                        {isShort ? `⚠️ Short Position (Need to Purchase ${targetQty.toLocaleString()} kg)` : isLong ? `🚀 Long Position (Need to Sell +${targetQty.toLocaleString()} kg)` : '✅ Fully Balanced'}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* SECONDARY PRODUCTS CARD */}
              <div className="card" style={{ padding: 0, border: '2px solid #fed7aa', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.08)' }}>
                <div style={{ padding: '1rem 1.25rem', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', borderBottom: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>📦</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: '#9a3412' }}>Secondary Products (Husk & By-Products)</div>
                      <div style={{ fontSize: '0.72rem', color: '#c2410c' }}>By-products tracked separately from primary sales commitments</div>
                    </div>
                  </div>
                  <span className="badge" style={{ background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: '0.72rem' }}>
                    Excluded from Sell Target
                  </span>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  
                  {/* Grid of Key Secondary Metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                    <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>1. Godown Opening Stock</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.15rem' }}>
                        {(s.godownOpenStockEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{(s.godownOpenStockBags || 0).toLocaleString()} Bags</div>
                    </div>

                    <div style={{ background: '#fff7ed', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #ffedd5' }}>
                      <div style={{ fontSize: '0.72rem', color: '#c2410c', fontWeight: 600 }}>2. Stock Adjustments</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ea580c', marginTop: '0.15rem' }}>
                        {((s.stockAdjustmentsEP || 0) >= 0 ? '+' : '') + (s.stockAdjustmentsEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#fb923c' }}>{(s.stockAdjustmentsBags || 0).toLocaleString()} Bags</div>
                    </div>

                    <div style={{ background: '#f0fdf4', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <div style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>3. Inward Arrivals</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#16a34a', marginTop: '0.15rem' }}>
                        {(s.totalArrivalRawWeight || s.totalArrivalEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#22c55e' }}>{(s.totalArrivalBags || 0).toLocaleString()} Bags inward</div>
                    </div>

                    <div style={{ background: '#fef2f2', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontWeight: 600 }}>4. Outward Dispatches</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626', marginTop: '0.15rem' }}>
                        {(s.totalDispatchEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#ef4444' }}>{(s.totalDispatchBags || 0).toLocaleString()} Bags dispatched</div>
                    </div>

                    <div style={{ background: '#fffbeb', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                      <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>5. Store In (Storage Inward)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706', marginTop: '0.15rem' }}>
                        {(s.totalStoreInEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>{(s.totalStoreInBags || 0).toLocaleString()} Bags in storage</div>
                    </div>

                    <div style={{ background: '#eff6ff', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600 }}>6. Store Out (Storage Dispatches)</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb', marginTop: '0.15rem' }}>
                        {(s.totalStoreOutEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>{(s.totalStoreOutBags || 0).toLocaleString()} Bags unbilled</div>
                    </div>

                    <div style={{ background: '#faf5ff', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                      <div style={{ fontSize: '0.72rem', color: '#6b21a8', fontWeight: 600 }}>7. Purchase Contracts</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.15rem' }}>
                        {(s.purchaseCommitmentsPendingEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#9333ea' }}>{(s.purchaseCommitmentsPendingBags || 0).toLocaleString()} Bags pending</div>
                    </div>

                    <div style={{ background: '#fdf2f8', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #fbcfe8' }}>
                      <div style={{ fontSize: '0.72rem', color: '#be185d', fontWeight: 600 }}>8. Sale Contracts</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#db2777', marginTop: '0.15rem' }}>
                        {(s.saleCommitmentsPendingEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#ec4899' }}>{(s.saleCommitmentsPendingBags || 0).toLocaleString()} Bags committed</div>
                    </div>
                  </div>

                  {/* Physical Warehouse Stock Banner for Secondary */}
                  <div style={{
                    background: 'linear-gradient(135deg, #451a03 0%, #292524 100%)',
                    borderRadius: '10px',
                    padding: '1rem 1.25rem',
                    color: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.35rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#fed7aa', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                        🏬 Net Physical Secondary Stock
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#d6d3d1', marginTop: '0.15rem' }}>
                        Opening + Adjustments + StoreIn - StoreOut
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fb923c' }}>
                        {(s.netWarehouseStockEP || 0).toLocaleString()} kg
                      </div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#fed7aa' }}>
                        Physical Balance on Hand
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            {/* Itemized Table 1: Primary Commodities Inventory */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: '#166534' }}>
                  <span>🌿</span> Primary Commodities Inventory Master ({primaryItems.length})
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>
                  Included in Sell Requirement Target
                </span>
              </div>
              <div className="table-responsive">
                <table className="data-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Code</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Opening Stock EP</th>
                      <th style={{ textAlign: 'right' }}>Store In EP</th>
                      <th style={{ textAlign: 'right' }}>Store Out EP</th>
                      <th style={{ textAlign: 'right' }}>Milling Yield EP</th>
                      <th style={{ textAlign: 'right' }}>Current Available EP</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primaryItems.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                          No primary products recorded yet. Click <strong>+ Commodity (F8)</strong> to create primary coffee items.
                        </td>
                      </tr>
                    ) : (
                      primaryItems.map(p => (
                        <tr key={p.product}>
                          <td><strong>{p.product}</strong></td>
                          <td><span className="code-badge">{p.code || '-'}</span></td>
                          <td><span className="badge badge-green">Primary</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{(p.openingEP || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#16a34a' }}>+{(p.storeInEP || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#dc2626' }}>-{(p.storeOutEP || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#7c3aed' }}>+{(p.millingYieldEP || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                            {(p.currentEP || 0).toLocaleString()} kg
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {(p.currentEP || 0) > 0 ? (
                              <span className="badge badge-success">Available</span>
                            ) : (
                              <span className="badge badge-secondary">Zero Stock</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Itemized Table 2: Secondary Commodities & By-Products Inventory */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '0.95rem', color: '#9a3412' }}>
                  <span>📦</span> Secondary Commodities & By-Products Master ({secondaryItems.length})
                </div>
                <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                  By-Product Stock (Excluded from Sell Target)
                </span>
              </div>
              <div className="table-responsive">
                <table className="data-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Code</th>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Opening Weight</th>
                      <th style={{ textAlign: 'right' }}>Store In Weight</th>
                      <th style={{ textAlign: 'right' }}>Store Out Weight</th>
                      <th style={{ textAlign: 'right' }}>Milling Yield</th>
                      <th style={{ textAlign: 'right' }}>Current Physical Weight</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secondaryItems.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                          No secondary products or by-products recorded yet.
                        </td>
                      </tr>
                    ) : (
                      secondaryItems.map(p => (
                        <tr key={p.product}>
                          <td><strong>{p.product}</strong></td>
                          <td><span className="code-badge">{p.code || '-'}</span></td>
                          <td><span className="badge badge-warning">Secondary</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{(p.openingWeight || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#16a34a' }}>+{(p.storeInWeight || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#dc2626' }}>-{(p.storeOutWeight || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#7c3aed' }}>+{(p.millingYieldWeight || 0).toLocaleString()} kg</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#9a3412', fontFamily: 'var(--font-mono)' }}>
                            {(p.currentWeight || 0).toLocaleString()} kg
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {(p.currentWeight || 0) > 0 ? (
                              <span className="badge badge-success">Available</span>
                            ) : (
                              <span className="badge badge-secondary">Zero Stock</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        );
      })()}

      {/* TAB 2: STOCK & COMMODITIES INVENTORY HUB */}
      {activeSubTab === 'stock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div className="card-title">
                  <Box size={20} color="#7c3aed" />
                  <span>Commodity & Stock Warehouse Inventory Master</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Live warehouse physical balances, storage in/out logs, milling yield outturns & custom product configuration
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-warning btn-sm" style={{ background: '#0284c7', borderColor: '#0284c7', color: '#fff' }} onClick={onOpenOpeningStock}>
                  📦 Edit Opening Stock
                </button>
                <button className="btn btn-purple btn-sm" style={{ background: '#7c3aed', color: '#fff' }} onClick={onOpenCommodity}>
                  <Sparkles size={14} /> + Add / Manage Commodities (F8)
                </button>
              </div>
            </div>

            {/* Store In vs Store Out Summary Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem', marginBottom: '1rem' }}>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  📥 Total Store In (Arrivals Received)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8' }}>
                  {(global.totalStorageBags || 0).toLocaleString()} Bags
                </div>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600, marginTop: '0.15rem' }}>
                  {(global.totalStorageEP || 0).toLocaleString()} kg EP (Inward Storage)
                </div>
              </div>

              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  📤 Total Store Out (Unbilled Dispatches)
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#b91c1c' }}>
                  {(global.totalStoreOutBags || 0).toLocaleString()} Bags
                </div>
                <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600, marginTop: '0.15rem' }}>
                  {(global.totalStoreOutEP || 0).toLocaleString()} kg EP (Quantity Not Billed)
                </div>
              </div>

              <div style={{ background: '#f3e8ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  🏬 Net Physical Warehouse Stock
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
                  {(global.netStorageBags || 0).toLocaleString()} Bags
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 600, marginTop: '0.15rem' }}>
                  {(global.netStorageEP || 0).toLocaleString()} kg EP (Store In - Store Out)
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Commodity / Product</th>
                    <th>Code</th>
                    <th>Valuation Basis</th>
                    <th style={{ textAlign: 'right' }}>Store In Bags (Recv)</th>
                    <th style={{ textAlign: 'right' }}>Store Out Bags (Unbilled)</th>
                    <th style={{ textAlign: 'right' }}>Net Storage Bags</th>
                    <th style={{ textAlign: 'right' }}>Net EP Weight (kg)</th>
                    <th style={{ textAlign: 'right' }}>Average Milling Outturn</th>
                    <th style={{ textAlign: 'center' }}>Stock Status</th>
                  </tr>
                </thead>
                <tbody>
                  {storageByProduct.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                        No warehouse commodity stock recorded yet. Click <strong>+ Add Commodity (F8)</strong> or record inward arrivals.
                      </td>
                    </tr>
                  ) : (
                    storageByProduct.map(p => (
                      <tr key={p.product}>
                        <td><strong>{p.product}</strong></td>
                        <td><span className="code-badge">{p.code || '-'}</span></td>
                        <td>
                          <span className={`badge ${p.calculationBasis === 'end_product' ? 'badge-blue' : 'badge-green'}`}>
                            {p.calculationBasis === 'end_product' ? '☕ EP Outturn Yield' : '🏷️ Direct Weight'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>{p.storeInBags.toLocaleString()} b</td>
                        <td style={{ textAlign: 'right', color: '#dc2626' }}>{p.storeOutBags.toLocaleString()} b</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>
                          {p.netBags.toLocaleString()} Bags
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>
                          {p.netEP.toLocaleString()} kg
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.avgOutturn > 0 ? `${p.avgOutturn} kg/50k` : 'Direct'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {p.netBags > 0 ? (
                            <span className="badge badge-success">Available</span>
                          ) : (
                            <span className="badge badge-secondary">Zero Stock</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OPERATIONS FEED (ARRIVALS & DISPATCHES) */}
      {activeSubTab === 'operations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="card-title">
                  <Activity size={20} color="#2563eb" />
                  <span>Inward Purchases & Outward Sales Operations Activity Feed</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Monitor recent inward coffee truck arrivals and outward sales dispatches side by side
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-coffee btn-sm" onClick={onOpenNewArrival}>+ New Arrival (Alt+A)</button>
                <button className="btn btn-primary btn-sm" onClick={onOpenNewDispatch}>+ New Dispatch (Alt+K)</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* Arrivals Panel */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}>
                🚛 Recent Inward Commodity Arrivals
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.5rem' }}>Arrival #</th>
                      <th style={{ padding: '0.5rem' }}>Date</th>
                      <th style={{ padding: '0.5rem' }}>Supplier</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Bags</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Rate</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentArrivals.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{a.arrivalNo}</td>
                        <td style={{ padding: '0.5rem' }}>{a.date}</td>
                        <td style={{ padding: '0.5rem', color: '#2563eb', cursor: 'pointer' }} onClick={() => onSelectSupplier(a.supplierId)}>
                          {a.supplierName}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>{a.bags}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{a.rate > 0 ? `₹${a.rate}` : 'Storage'}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span className={`badge ${a.status === 'billed' ? 'badge-green' : 'badge-blue'}`}>{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dispatches Panel */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}>
                📤 Recent Outward Dispatches
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.5rem' }}>Dispatch #</th>
                      <th style={{ padding: '0.5rem' }}>Date</th>
                      <th style={{ padding: '0.5rem' }}>Customer</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Bags</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Net Bill</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDispatches.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{d.dispatchNo}</td>
                        <td style={{ padding: '0.5rem' }}>{d.date}</td>
                        <td style={{ padding: '0.5rem', color: '#2563eb', cursor: 'pointer' }} onClick={() => onSelectSupplier(d.supplierId || d.partyId)}>
                          {d.supplierName || d.partyName}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>{d.bags}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                          ₹{(d.netAmount || d.billAmount || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span className={`badge ${d.status === 'billed' ? 'badge-green' : 'badge-blue'}`}>{d.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMMITMENTS & SETTLEMENTS */}
      {activeSubTab === 'commitments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="card-title">
                  <Handshake size={20} color="#d97706" />
                  <span>Commitments (Contracts) & Storage Settlements Overview</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Track booked purchase & sale agreements and process storage outturn price settlements
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-purple btn-sm" style={{ background: '#7c3aed', color: '#fff' }} onClick={onOpenCommitment}>
                  + Book Contract
                </button>
                <button className="btn btn-warning btn-sm" style={{ background: '#0284c7', borderColor: '#0284c7', color: '#fff' }} onClick={onOpenSettlement}>
                  ⚖️ Settle Storage Batches (F4)
                </button>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }} className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contract #</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Party Name</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Total Qty</th>
                    <th style={{ textAlign: 'right' }}>Fulfilled</th>
                    <th style={{ textAlign: 'right' }}>Remaining</th>
                    <th style={{ textAlign: 'right' }}>Contract Rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.length === 0 ? (
                    <tr><td colSpan="10" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commitments booked yet.</td></tr>
                  ) : (
                    commitments.slice(0, 10).map(c => (
                      <tr key={c.id}>
                        <td><strong className="code-badge">{c.commitmentNo}</strong></td>
                        <td>
                          <span className={`badge ${c.category === 'sale' ? 'badge-warning' : 'badge-blue'}`}>
                            {c.category === 'sale' ? '📤 Sale' : '🛒 Purchase'}
                          </span>
                        </td>
                        <td>{c.date || '-'}</td>
                        <td>
                          <span style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }} onClick={() => onSelectSupplier(c.supplierId)}>
                            {c.supplierName}
                          </span>
                        </td>
                        <td><strong>{c.product}</strong></td>
                        <td style={{ textAlign: 'right' }}>{c.quantity}</td>
                        <td style={{ textAlign: 'right', color: '#059669' }}>{c.fulfilledQty || 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: c.remainingQty > 0 ? '#dc2626' : '#64748b' }}>{c.remainingQty}</td>
                        <td style={{ textAlign: 'right' }}>₹{c.rate}</td>
                        <td>
                          <span className={`badge ${c.status === 'fulfilled' ? 'badge-success' : c.status === 'washed' ? 'badge-purple' : 'badge-amber'}`}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FINANCIALS & PAYMENT TRACKING */}
      {activeSubTab === 'financials' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div className="card-title">
                  <CreditCard size={20} color="#059669" />
                  <span>Financial Balances & Payments Tracking</span>
                </div>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Manage payments paid to suppliers, receipts from buyers, TCS tax collections & net balances
                </span>
              </div>
              <button className="btn btn-success btn-sm" onClick={onOpenPayment}>
                + Record Payment (F5)
              </button>
            </div>

            <div style={{ marginTop: '1rem' }} className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Voucher #</th>
                    <th>Date</th>
                    <th>Party Name</th>
                    <th>Type</th>
                    <th>Payment Mode</th>
                    <th>Reference / UTR</th>
                    <th style={{ textAlign: 'right' }}>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No payments recorded yet.</td></tr>
                  ) : (
                    payments.slice(0, 10).map(p => (
                      <tr key={p.id}>
                        <td><strong>{p.paymentNo}</strong></td>
                        <td>{p.date}</td>
                        <td>
                          <span style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }} onClick={() => onSelectSupplier(p.supplierId)}>
                            {p.supplierName}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${p.type === 'payment_received' ? 'badge-blue' : 'badge-green'}`}>
                            {p.type === 'payment_received' ? '📥 Received' : '📤 Paid Out'}
                          </span>
                        </td>
                        <td><span className="badge badge-gray">{p.mode}</span></td>
                        <td style={{ fontFamily: 'monospace' }}>{p.reference || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: p.type === 'payment_received' ? '#2563eb' : '#059669' }}>
                          ₹{p.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
