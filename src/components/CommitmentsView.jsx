import React, { useState, useEffect } from 'react';
import { 
  Handshake, 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Trash2, 
  Edit2, 
  Scale, 
  Filter, 
  Search, 
  Lock, 
  Check, 
  X,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { dbAction } from '../utils/api';
import SearchableSupplierSelect from './SearchableSupplierSelect';
import SearchableProductSelect from './SearchableProductSelect';
import CommitmentWashModal from './CommitmentWashModal';

export default function CommitmentsView({ onSelectSupplier, dataVersion = 0, onDataChanged, triggerNew = 0, triggerExport = 0, onOpenNewSupplier }) {
  const [commitments, setCommitments] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // Filters
  const [activeTabFilter, setActiveTabFilter] = useState('all'); // 'all', 'active', 'purchase', 'sale', 'washed', 'closed'
  const [productFilter, setProductFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProductsExpanded, setIsProductsExpanded] = useState(false);

  const [showWashModal, setShowWashModal] = useState(false);

  // Commitment Modal (New / Edit)
  const [showModal, setShowModal] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState(null);
  const [supplierId, setSupplierId] = useState('');
  const [category, setCategory] = useState('purchase'); // 'purchase' or 'sale'
  const [product, setProduct] = useState('');
  const [type, setType] = useState('bags'); // 'bags' or 'end_product'
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Manual Short-Close Modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingCommitment, setClosingCommitment] = useState(null);
  const [closeMode, setCloseMode] = useState('fulfilled'); // 'fulfilled' or 'custom'
  const [closeQtyInput, setCloseQtyInput] = useState('');
  const [closeNotesInput, setCloseNotesInput] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [dataVersion]);

  useEffect(() => { 
    if (triggerNew > 0) {
      openNewCommitment();
    }
  }, [triggerNew]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [comms, sups] = await Promise.all([
        dbAction('commitments:get'),
        dbAction('suppliers:get')
      ]);
      setCommitments(comms || []);
      setSuppliers(sups || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openNewCommitment = (cat = 'purchase') => {
    setEditingCommitment(null);
    setSupplierId('');
    setCategory(cat);
    setProduct('');
    setType('bags');
    setQuantity('');
    setRate('');
    setDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setShowModal(true);
  };

  const openEditCommitment = (c) => {
    setEditingCommitment(c);
    setSupplierId(c.supplierId);
    setCategory(c.category || 'purchase');
    setProduct(c.product);
    setType(c.type || 'bags');
    setQuantity(String(c.quantity));
    setRate(String(c.rate));
    setDate(c.date || new Date().toISOString().split('T')[0]);
    setNotes(c.notes || '');
    setShowModal(true);
  };

  const openCloseModal = (c) => {
    setClosingCommitment(c);
    setCloseMode('fulfilled');
    setCloseQtyInput(String(c.fulfilledQty || c.quantity));
    setCloseNotesInput('');
    setShowCloseModal(true);
  };

  const handleSaveCommitment = async (e) => {
    if (e) e.preventDefault();
    if (!supplierId || !quantity || !rate) return;

    const sup = suppliers.find(s => s.id === supplierId);

    setSubmitting(true);
    try {
      const payload = {
        supplierId,
        supplierName: sup ? sup.name : 'Unknown',
        category,
        product,
        type,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        date,
        notes
      };

      if (editingCommitment) {
        await dbAction('commitments:update', { id: editingCommitment.id, data: payload });
      } else {
        await dbAction('commitments:add', payload);
      }

      setShowModal(false);
      setEditingCommitment(null);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error saving commitment: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteClose = async (e) => {
    if (e) e.preventDefault();
    if (!closingCommitment) return;

    const finalQty = closeMode === 'custom' ? parseFloat(closeQtyInput) : closingCommitment.fulfilledQty;
    if (isNaN(finalQty) || finalQty < 0) {
      alert('Please enter a valid closed quantity');
      return;
    }

    setCloseSubmitting(true);
    try {
      await dbAction('commitments:close', {
        id: closingCommitment.id,
        closedQty: finalQty,
        notes: closeNotesInput || 'Manually short-closed'
      });

      setShowCloseModal(false);
      setClosingCommitment(null);
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Failed to close commitment: ' + err.message);
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleDeleteCommitment = async (c) => {
    if (c.fulfilledQty > 0) {
      alert(`Cannot delete ${c.commitmentNo} — it has ${c.fulfilledQty} ${c.type} already fulfilled.`);
      return;
    }
    if (!window.confirm(`Delete commitment ${c.commitmentNo} for ${c.supplierName}?`)) return;
    setDeletingId(c.id);
    try {
      await dbAction('commitments:delete', { id: c.id });
      await loadData();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Product-wise Active Summaries
  const activeProductSummaries = {};
  commitments.forEach(c => {
    const isClosedOrWashed = c.status === 'washed' || c.status === 'closed' || c.status === 'completed' || c.status === 'fulfilled' || (c.remainingQty !== undefined && Number(c.remainingQty) <= 0);
    if (isClosedOrWashed) return;

    const p = c.product || 'Uncategorized';
    if (!activeProductSummaries[p]) {
      activeProductSummaries[p] = {
        product: p,
        purchaseBags: 0,
        purchaseEP: 0,
        purchaseValue: 0,
        purchaseCount: 0,
        saleBags: 0,
        saleEP: 0,
        saleValue: 0,
        saleCount: 0
      };
    }

    const isSale = c.category === 'sale';
    const remQty = Number(c.remainingQty) || 0;
    const rate = Number(c.rate) || 0;
    const val = remQty * rate;

    if (isSale) {
      activeProductSummaries[p].saleCount++;
      if (c.type === 'bags') activeProductSummaries[p].saleBags += remQty;
      else activeProductSummaries[p].saleEP += remQty;
      activeProductSummaries[p].saleValue += val;
    } else {
      activeProductSummaries[p].purchaseCount++;
      if (c.type === 'bags') activeProductSummaries[p].purchaseBags += remQty;
      else activeProductSummaries[p].purchaseEP += remQty;
      activeProductSummaries[p].purchaseValue += val;
    }
  });

  const activeProductList = Object.values(activeProductSummaries);
  const uniqueProducts = Array.from(new Set(commitments.map(c => c.product).filter(Boolean)));

  // Filter Commitments List
  const filteredCommitments = commitments.filter(c => {
    const isClosed = c.status === 'closed' || c.status === 'completed' || c.status === 'fulfilled' || Number(c.remainingQty) <= 0;
    const isWashed = c.status === 'washed';

    // 1. Tab / Category / Status Filter
    if (activeTabFilter === 'purchase') {
      if (c.category === 'sale' || isWashed) return false;
    } else if (activeTabFilter === 'sale') {
      if (c.category !== 'sale' || isWashed) return false;
    } else if (activeTabFilter === 'washed') {
      if (!isWashed) return false;
    } else if (activeTabFilter === 'active') {
      if (isWashed || isClosed) return false;
    } else if (activeTabFilter === 'closed') {
      if (!isClosed) return false;
    }

    // 2. Product Filter
    if (productFilter !== 'all' && c.product !== productFilter) {
      return false;
    }

    // 3. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNo = (c.commitmentNo || '').toLowerCase().includes(q);
      const matchName = (c.supplierName || '').toLowerCase().includes(q);
      const matchProd = (c.product || '').toLowerCase().includes(q);
      const matchNotes = (c.notes || '').toLowerCase().includes(q);
      return matchNo || matchName || matchProd || matchNotes;
    }

    return true;
  });

  const activePurchaseCount = commitments.filter(c => (c.category === 'purchase' || !c.category) && c.status === 'active' && Number(c.remainingQty) > 0).length;
  const activeSaleCount = commitments.filter(c => c.category === 'sale' && c.status === 'active' && Number(c.remainingQty) > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="card-title">
              <Handshake size={20} color="#2563eb" />
              <span>Purchase & Sale Commitments (Contracts)</span>
              <span className="badge badge-blue">{commitments.length} Total</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Book purchase & sales contracts. Auto-deduct via storage settlement or wash opposite commitments.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn btn-purple" 
              style={{ background: '#7c3aed', color: '#fff' }}
              onClick={() => setShowWashModal(true)}
            >
              <Scale size={16} /> Wash / Settle Commitments
            </button>
            <button className="btn btn-primary" onClick={() => openNewCommitment('purchase')}>
              <Plus size={16} /> + Purchase Contract
            </button>
            <button className="btn btn-coffee" onClick={() => openNewCommitment('sale')}>
              <Plus size={16} /> + Sale Contract
            </button>
          </div>
        </div>
      </div>

      {/* Product-Wise Active Commitments Summary Bar */}
      {activeProductList.length > 0 && (
        <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (activeProductList.length > 4 && !isProductsExpanded) ? '0.4rem' : '0.65rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Package size={16} color="#2563eb" /> Active Outstanding Commitments Sum (Product-Wise)
              <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{activeProductList.length} {activeProductList.length === 1 ? 'Product' : 'Products'}</span>
            </div>
            {activeProductList.length > 4 && (
              <button
                type="button"
                onClick={() => setIsProductsExpanded(!isProductsExpanded)}
                style={{
                  background: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                {isProductsExpanded ? (
                  <>
                    <span>Minimize to 1 Line</span>
                    <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    <span>Expand All ({activeProductList.length})</span>
                    <ChevronDown size={14} />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Minimised 1-line Horizontal View (when > 4 products and !isProductsExpanded) */}
          {activeProductList.length > 4 && !isProductsExpanded ? (
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
              {activeProductList.map(item => (
                <div
                  key={item.product}
                  onClick={() => setProductFilter(item.product)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: '220px',
                    background: '#ffffff',
                    border: productFilter === item.product ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '0.4rem 0.65rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                  }}
                  title={`Click to filter by ${item.product}`}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap' }}>{item.product}</span>
                  <div style={{ display: 'flex', gap: '0.35rem', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                    <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                      P: {item.purchaseBags > 0 ? `${item.purchaseBags.toLocaleString()} bgs` : item.purchaseEP > 0 ? `${item.purchaseEP.toLocaleString()} kg` : '0'}
                    </span>
                    <span style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fef08a', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                      S: {item.saleBags > 0 ? `${item.saleBags.toLocaleString()} bgs` : item.saleEP > 0 ? `${item.saleEP.toLocaleString()} kg` : '0'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Full Multi-Card Grid View (when <= 4 products OR expanded) */
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(activeProductList.length, 4)}, 1fr)`, gap: '0.75rem' }}>
              {activeProductList.map(item => (
                <div 
                  key={item.product} 
                  style={{
                    background: '#ffffff',
                    border: productFilter === item.product ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '0.85rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                  }}
                  onClick={() => setProductFilter(item.product)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0f172a' }}>{item.product}</span>
                    <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
                      Active
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.78rem' }}>
                    <div style={{ background: '#f0fdf4', padding: '0.4rem', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                      <div style={{ color: '#166534', fontWeight: 700, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <ArrowDownLeft size={12} /> Purchase ({item.purchaseCount})
                      </div>
                      {item.purchaseBags > 0 && (
                        <div style={{ fontWeight: 800, color: '#15803d' }}>
                          {item.purchaseBags.toLocaleString()} bags
                        </div>
                      )}
                      {item.purchaseEP > 0 && (
                        <div style={{ fontWeight: 800, color: '#15803d' }}>
                          {item.purchaseEP.toLocaleString()} kg EP
                        </div>
                      )}
                      {item.purchaseBags === 0 && item.purchaseEP === 0 && (
                        <div style={{ color: '#94a3b8' }}>0 active</div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: '#15803d', marginTop: '0.1rem' }}>
                        ₹{Math.round(item.purchaseValue).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div style={{ background: '#fffbeb', padding: '0.4rem', borderRadius: '4px', border: '1px solid #fef08a' }}>
                      <div style={{ color: '#92400e', fontWeight: 700, fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <ArrowUpRight size={12} /> Sales ({item.saleCount})
                      </div>
                      {item.saleBags > 0 && (
                        <div style={{ fontWeight: 800, color: '#b45309' }}>
                          {item.saleBags.toLocaleString()} bags
                        </div>
                      )}
                      {item.saleEP > 0 && (
                        <div style={{ fontWeight: 800, color: '#b45309' }}>
                          {item.saleEP.toLocaleString()} kg EP
                        </div>
                      )}
                      {item.saleBags === 0 && item.saleEP === 0 && (
                        <div style={{ color: '#94a3b8' }}>0 active</div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: '#b45309', marginTop: '0.1rem' }}>
                        ₹{Math.round(item.saleValue).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter Toolbar: Tab Buttons + Product Selector + Search Box */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${activeTabFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('all')}
          >
            All ({commitments.length})
          </button>
          <button
            className={`btn btn-sm ${activeTabFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('active')}
          >
            ⏳ Active Outstanding ({activePurchaseCount + activeSaleCount})
          </button>
          <button
            className={`btn btn-sm ${activeTabFilter === 'purchase' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('purchase')}
          >
            🛒 Purchase ({activePurchaseCount} Active)
          </button>
          <button
            className={`btn btn-sm ${activeTabFilter === 'sale' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('sale')}
          >
            📤 Sales ({activeSaleCount} Active)
          </button>
          <button
            className={`btn btn-sm ${activeTabFilter === 'closed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('closed')}
          >
            ✅ Closed / Fulfilled ({commitments.filter(c => c.status === 'closed' || c.status === 'completed' || c.status === 'fulfilled' || Number(c.remainingQty) <= 0).length})
          </button>
          <button
            className={`btn btn-sm ${activeTabFilter === 'washed' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTabFilter('washed')}
          >
            🧼 Washed ({commitments.filter(c => c.status === 'washed').length})
          </button>
        </div>

        {/* Product Dropdown & Search Input */}
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#fff', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <Filter size={14} color="#64748b" />
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
            >
              <option value="all">📦 All Commodity Products ({uniqueProducts.length})</option>
              {uniqueProducts.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search contract, party..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '2rem', fontSize: '0.82rem', height: '34px' }}
            />
          </div>
        </div>
      </div>

      {/* Commitments Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contract No</th>
                <th>Category</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>Product</th>
                <th>Type</th>
                <th>Total Qty</th>
                <th>Fulfilled</th>
                <th>Remaining</th>
                <th>Agreed Rate</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '2rem' }}>Loading commitments...</td></tr>
              ) : filteredCommitments.length === 0 ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No commitments matching active filter criteria.</td></tr>
              ) : (
                filteredCommitments.map(c => {
                  const isSale = c.category === 'sale';
                  const isClosed = c.status === 'closed' || c.status === 'completed' || c.status === 'fulfilled' || Number(c.remainingQty) <= 0;
                  const isWashed = c.status === 'washed';

                  return (
                    <tr key={c.id} style={{ background: isClosed ? '#f8fafc' : 'transparent' }}>
                      <td><strong className="code-badge">{c.commitmentNo}</strong></td>
                      <td>
                        {isSale ? (
                          <span className="badge badge-warning" style={{ background: '#fef3c7', color: '#92400e' }}>📤 Sale</span>
                        ) : (
                          <span className="badge badge-info">🛒 Purchase</span>
                        )}
                      </td>
                      <td>{c.date || '-'}</td>
                      <td>
                        <a
                          href="#ledger"
                          style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}
                          onClick={(e) => { e.preventDefault(); onSelectSupplier(c.supplierId); }}
                        >
                          {c.supplierName}
                        </a>
                      </td>
                      <td><strong>{c.product}</strong></td>
                      <td>{c.type === 'bags' ? '50kg Bags' : 'Kg Clean EP'}</td>
                      <td><strong>{c.quantity}</strong></td>
                      <td style={{ color: '#059669', fontWeight: 600 }}>{c.fulfilledQty || 0}</td>
                      <td style={{ color: c.remainingQty > 0 ? '#dc2626' : '#64748b', fontWeight: 700 }}>
                        {c.remainingQty}
                      </td>
                      <td><strong>₹{c.rate} / {c.type === 'bags' ? 'Bag' : 'Kg'}</strong></td>
                      <td>
                        {isWashed ? (
                          <span className="badge badge-purple" style={{ background: '#f3e8ff', color: '#6b21a8' }}>🧼 Washed</span>
                        ) : isClosed ? (
                          <span className="badge badge-success" style={{ background: '#dcfce7', color: '#15803d' }}>
                            <CheckCircle size={12} /> {c.fulfilledQty < c.quantity ? 'Short-Closed' : 'Closed'}
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ background: '#fff7ed', color: '#c2410c' }}>
                            <Clock size={12} /> Active
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!isClosed && !isWashed && (
                          <button 
                            className="btn btn-secondary btn-xs" 
                            style={{ marginRight: '0.4rem', fontSize: '0.72rem', padding: '0.2rem 0.45rem' }} 
                            title="Manually Lock / Short-Close Contract"
                            onClick={() => openCloseModal(c)}
                          >
                            <Lock size={12} /> Lock / Close
                          </button>
                        )}
                        <button className="btn-icon" title="Edit" onClick={() => openEditCommitment(c)}>
                          <Edit2 size={15} color="#2563eb" />
                        </button>
                        <button className="btn-icon" title="Delete" onClick={() => handleDeleteCommitment(c)} disabled={deletingId === c.id}>
                          <Trash2 size={15} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New/Edit Commitment Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <div className="modal-title-group">
                <h3>{editingCommitment ? '✏️ Edit Commitment' : '🤝 Book New Commitment'}</h3>
                <p className="modal-subtitle">Contractual agreement for coffee purchase or sale</p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveCommitment} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>
                    Party Name *
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
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={(id) => setSupplierId(id)}
                  onAddNewSupplier={onOpenNewSupplier}
                  placeholder="Search party by name, place, phone..."
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Contract Category</label>
                  <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="purchase">🛒 Purchase Commitment</option>
                    <option value="sale">📤 Sales Commitment</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Product / Commodity *</label>
                  <SearchableProductSelect
                    value={product}
                    onChange={(pCode, pObj) => setProduct(pCode || (pObj ? pObj.name : ''))}
                    category="all"
                    showChips={false}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Unit Type</label>
                  <select className="form-control" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="bags">50kg Bags</option>
                    <option value="end_product">Kg EP</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Quantity *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Total qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Contract Rate (₹) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    placeholder="Rate"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Contract Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Notes / Delivery Terms</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Contract terms / delivery window"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ marginTop: '0.75rem', padding: '1rem 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || !supplierId}>
                  {submitting ? 'Saving...' : 'Save Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Short-Close / Lock Commitment Modal */}
      {showCloseModal && closingCommitment && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ background: '#0f172a', color: '#fff' }}>
              <div className="modal-title-group">
                <h3 style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Lock size={18} color="#f87171" /> Close / Short-Close Contract
                </h3>
                <p className="modal-subtitle" style={{ color: '#94a3b8' }}>
                  {closingCommitment.commitmentNo} - {closingCommitment.supplierName}
                </p>
              </div>
              <button className="modal-close-btn" style={{ color: '#94a3b8' }} onClick={() => setShowCloseModal(false)}>✕</button>
            </div>

            <form onSubmit={handleExecuteClose} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Booked Total Quantity:</span>
                  <strong>{closingCommitment.quantity} {closingCommitment.type}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ color: '#64748b' }}>Fulfilled / Delivered Qty:</span>
                  <strong style={{ color: '#059669' }}>{closingCommitment.fulfilledQty || 0} {closingCommitment.type}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Current Remaining Balance:</span>
                  <strong style={{ color: '#dc2626' }}>{closingCommitment.remainingQty} {closingCommitment.type}</strong>
                </div>
              </div>

              {/* Close Mode Options */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, color: '#0f172a' }}>
                  Closing Method *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: closeMode === 'fulfilled' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: closeMode === 'fulfilled' ? '#eff6ff' : '#fff',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="closeMode"
                      checked={closeMode === 'fulfilled'}
                      onChange={() => {
                        setCloseMode('fulfilled');
                        setCloseQtyInput(String(closingCommitment.fulfilledQty || 0));
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Short-close at current fulfilled quantity ({closingCommitment.fulfilledQty || 0} {closingCommitment.type})
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Cancels remaining {closingCommitment.remainingQty} {closingCommitment.type} balance.
                      </div>
                    </div>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: closeMode === 'custom' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: closeMode === 'custom' ? '#eff6ff' : '#fff',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      name="closeMode"
                      checked={closeMode === 'custom'}
                      onChange={() => setCloseMode('custom')}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        Set Custom Final Closed Quantity
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        Specify exact final delivered quantity for contract closure.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {closeMode === 'custom' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Enter Final Closed Quantity ({closingCommitment.type}) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control"
                    value={closeQtyInput}
                    onChange={e => setCloseQtyInput(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Short-Close Reason / Remarks</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Mutual agreement to cancel remaining balance"
                  value={closeNotesInput}
                  onChange={e => setCloseNotesInput(e.target.value)}
                />
              </div>

              <div className="modal-footer" style={{ marginTop: '0.75rem', padding: '1rem 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCloseModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={closeSubmitting}>
                  <Check size={16} /> {closeSubmitting ? 'Closing...' : 'Confirm & Close Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Commitment Wash Modal */}
      <CommitmentWashModal
        isOpen={showWashModal}
        onClose={() => setShowWashModal(false)}
        onSaved={loadData}
        onOpenNewSupplier={onOpenNewSupplier}
      />
    </div>
  );
}
