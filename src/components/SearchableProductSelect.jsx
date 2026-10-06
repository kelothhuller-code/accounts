import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Plus, X, Check, Tag } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SearchableProductSelect({
  value = '',
  onChange,
  onSelect,
  onProductAdded,
  placeholder = 'Select or search commodity product...',
  disabled = false,
  showChips = true,
  category = 'coffee' // 'coffee', 'husk', 'all'
}) {
  const [products, setProducts] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddInline, setShowAddInline] = useState(false);

  // Rich Product Form State
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCalculationBasis, setNewCalculationBasis] = useState('end_product'); // 'end_product' or 'direct'
  const [newDefaultOutturn, setNewDefaultOutturn] = useState('26');
  const [newDefaultOutturnType, setNewDefaultOutturnType] = useState('per_50kg');
  const [newCgst, setNewCgst] = useState('0');
  const [newSgst, setNewSgst] = useState('0');
  const [newHsnCode, setNewHsnCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsMain, setNewIsMain] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const list = await dbAction('products:get');
      setProducts(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowAddInline(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedProduct = products.find(p => p.name === value || p.code === value || p.id === value);
  const displayLabel = selectedProduct ? selectedProduct.name : value || placeholder;

  const filteredProducts = products.filter(p => {
    if ((category === 'husk' || category === 'secondary') && (p.isMain === true && !p.isSecondary)) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (p.name || '').toLowerCase().includes(term) || (p.code || '').toLowerCase().includes(term);
  });

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchTerm('');
    setTimeout(() => {
      if (searchInputRef.current) searchInputRef.current.focus();
    }, 50);
  };

  const handleSelect = (p) => {
    const pName = p.name || p.code;
    if (onChange) onChange(pName, p);
    if (onSelect) onSelect(pName, p);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleNewNameChange = (val) => {
    setNewName(val);
    if (!newCode) {
      const suggested = val.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 12);
      setNewCode(suggested);
    }
  };

  const resetNewProductForm = () => {
    setNewName('');
    setNewCode('');
    setNewCalculationBasis('end_product');
    setNewDefaultOutturn('26');
    setNewDefaultOutturnType('per_50kg');
    setNewCgst('0');
    setNewSgst('0');
    setNewHsnCode('');
    setNewDescription('');
    setNewIsMain(true);
  };

  const handleAddProduct = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    setIsAdding(true);
    const numCgst = parseFloat(newCgst) || 0;
    const numSgst = parseFloat(newSgst) || 0;
    const numOutturn = parseFloat(newDefaultOutturn) || (newCalculationBasis === 'end_product' ? 26 : 50);

    try {
      const added = await dbAction('products:add', {
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        isMain: newIsMain,
        calculationBasis: newCalculationBasis,
        defaultOutturn: numOutturn,
        defaultOutturnType: newDefaultOutturnType,
        cgstRate: numCgst,
        sgstRate: numSgst,
        igstRate: numCgst + numSgst,
        hsnCode: newHsnCode.trim(),
        description: newDescription.trim()
      });
      await loadProducts();
      onChange(added.code, added);
      setShowAddInline(false);
      setIsOpen(false);
      resetNewProductForm();
      if (onProductAdded) onProductAdded(added);
    } catch (err) {
      alert('Error adding product: ' + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  // Quick Chips logic
  const mainChips = category === 'husk'
    ? products.filter(p => p.code === 'HUSK' || p.name.toLowerCase().includes('husk'))
    : products.filter(p => p.isMain && p.code !== 'HUSK');

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      {/* Quick Select Chips at Top */}
      {showChips && mainChips.length > 0 && (
        <div className="product-chips" style={{ marginBottom: '0.5rem' }}>
          {mainChips.map(p => {
            const isSelected = value === p.code || value === p.name;
            return (
              <div
                key={p.id}
                className={`product-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => onChange(p.code, p)}
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid #2563eb' : '1px solid #cbd5e1',
                  background: isSelected ? '#2563eb' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#1e293b'
                }}
              >
                {p.code === 'HUSK' ? '🌾' : '☕'} {p.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Select Trigger */}
      <div
        onClick={handleOpen}
        tabIndex={disabled ? -1 : 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.55rem 0.75rem',
          background: disabled ? '#f1f5f9' : '#ffffff',
          border: isOpen ? '1px solid #2563eb' : '1px solid #cbd5e1',
          borderRadius: '6px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : 'none',
          transition: 'all 0.15s ease',
          minHeight: '38px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, overflow: 'hidden' }}>
          <Tag size={15} color="#64748b" style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: selectedProduct ? 600 : 400, color: selectedProduct ? '#0f172a' : '#94a3b8', fontSize: '0.88rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {displayLabel}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', flexShrink: 0 }}>
          {value && !disabled && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChange('', null);
              }}
              title="Clear product"
              style={{ padding: '2px', cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
            >
              <X size={14} color="#94a3b8" />
            </div>
          )}
          <ChevronDown size={16} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            zIndex: 1200,
            overflow: 'hidden',
            maxHeight: '420px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Filter Bar */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search product by code or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.88rem',
                color: '#0f172a'
              }}
            />
          </div>

          {/* Product Items */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {filteredProducts.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No product matching "{searchTerm}"
              </div>
            ) : (
              filteredProducts.map(p => {
                const isSelected = value === p.code || value === p.name;
                const isEnd = p.calculationBasis === 'end_product';
                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                          {p.name}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px', fontFamily: 'monospace' }}>
                          {p.code}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
                        {isEnd ? `☕ Outturn ${p.defaultOutturn || 26}kg/50kg` : '🏷️ Direct Weight'} • GST: {(Number(p.cgstRate) || 0) + (Number(p.sgstRate) || 0)}%
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="#2563eb" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Commodity Inline Form with Full Rich Specification */}
          {showAddInline ? (
            <div style={{ padding: '0.85rem', borderTop: '1px solid #cbd5e1', background: '#f0f9ff', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '360px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Plus size={15} /> Add New Commodity / Product
                </div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }} onClick={() => setShowAddInline(false)}>✕</button>
              </div>

              {/* Row 1: Name & Code */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <div style={{ flex: 1.5 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Commodity Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Robusta Parchment, RC EP, Husk"
                    className="form-control form-control-sm"
                    value={newName}
                    onChange={e => handleNewNameChange(e.target.value)}
                    autoFocus
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. RC_PARCH"
                    className="form-control form-control-sm"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {/* Row 2: Valuation & Calculation Basis */}
              <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', marginBottom: '0.3rem', display: 'block' }}>
                  ⚖️ Valuation Basis *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.5rem', borderRadius: '4px',
                    border: newCalculationBasis === 'end_product' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: newCalculationBasis === 'end_product' ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '0.76rem'
                  }}>
                    <input
                      type="radio"
                      name="newCalcBasis"
                      checked={newCalculationBasis === 'end_product'}
                      onChange={() => {
                        setNewCalculationBasis('end_product');
                        if (newDefaultOutturn === '50') setNewDefaultOutturn('26');
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#1e40af' }}>☕ EP Outturn (Raw)</span>
                  </label>

                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.5rem', borderRadius: '4px',
                    border: newCalculationBasis === 'direct' ? '2px solid #059669' : '1px solid #cbd5e1',
                    background: newCalculationBasis === 'direct' ? '#ecfdf5' : '#fff', cursor: 'pointer', fontSize: '0.76rem'
                  }}>
                    <input
                      type="radio"
                      name="newCalcBasis"
                      checked={newCalculationBasis === 'direct'}
                      onChange={() => {
                        setNewCalculationBasis('direct');
                        setNewDefaultOutturn('50');
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#065f46' }}>🏷️ Direct Weight</span>
                  </label>
                </div>

                {newCalculationBasis === 'end_product' && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.72rem', color: '#475569', whiteSpace: 'nowrap' }}>Default Outturn:</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control form-control-sm"
                      style={{ width: '75px' }}
                      value={newDefaultOutturn}
                      onChange={e => setNewDefaultOutturn(e.target.value)}
                      placeholder="26"
                    />
                    <select
                      className="form-control form-control-sm"
                      style={{ fontSize: '0.75rem' }}
                      value={newDefaultOutturnType}
                      onChange={e => setNewDefaultOutturnType(e.target.value)}
                    >
                      <option value="per_50kg">kg / 50kg Bag</option>
                      <option value="percentage">% Yield</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Row 3: Tax Rates & HSN */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.72rem', color: '#475569' }}>CGST %</label>
                  <input
                    type="number" step="0.1" placeholder="0" className="form-control form-control-sm"
                    value={newCgst} onChange={e => setNewCgst(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.72rem', color: '#475569' }}>SGST %</label>
                  <input
                    type="number" step="0.1" placeholder="0" className="form-control form-control-sm"
                    value={newSgst} onChange={e => setNewSgst(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1.2 }}>
                  <label style={{ fontSize: '0.72rem', color: '#475569' }}>HSN Code</label>
                  <input
                    type="text" placeholder="e.g. 0901" className="form-control form-control-sm"
                    value={newHsnCode} onChange={e => setNewHsnCode(e.target.value)}
                  />
                </div>
              </div>

              {/* Row 4: Stock Classification */}
              <div style={{ background: '#ffffff', padding: '0.45rem', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', marginBottom: '0.25rem', display: 'block' }}>
                  📦 Stock Tracking Classification *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.4rem', borderRadius: '4px',
                    border: newIsMain ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                    background: newIsMain ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '0.72rem'
                  }}>
                    <input type="radio" name="inlineProdClass" checked={newIsMain === true} onChange={() => setNewIsMain(true)} />
                    <span style={{ fontWeight: 600, color: '#1e40af' }}>🌟 Primary Commodity (Main Stock)</span>
                  </label>

                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.4rem', borderRadius: '4px',
                    border: !newIsMain ? '1.5px solid #d97706' : '1px solid #cbd5e1',
                    background: !newIsMain ? '#fffbeb' : '#fff', cursor: 'pointer', fontSize: '0.72rem'
                  }}>
                    <input type="radio" name="inlineProdClass" checked={newIsMain === false} onChange={() => setNewIsMain(false)} />
                    <span style={{ fontWeight: 600, color: '#b45309' }}>📦 Secondary Byproduct</span>
                  </label>
                </div>
              </div>

              {/* Row 5: Description Notes */}
              <div>
                <input
                  type="text" placeholder="Notes / Grade specs (optional)" className="form-control form-control-sm"
                  style={{ width: '100%' }} value={newDescription} onChange={e => setNewDescription(e.target.value)}
                />
              </div>

              {/* Row 5: Actions */}
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddInline(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddProduct} disabled={isAdding || !newName.trim() || !newCode.trim()}>
                  {isAdding ? 'Saving...' : 'Save & Select Commodity'}
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowAddInline(true)}
              style={{
                padding: '0.6rem 0.75rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#2563eb',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Plus size={15} />
                <span>+ Add New Commodity / Product to DB</span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b', background: '#e2e8f0', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Full Spec</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

