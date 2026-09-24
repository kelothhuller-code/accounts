import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Plus, X, Check, Tag } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SearchableProductSelect({
  value = '',
  onChange,
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
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newCgst, setNewCgst] = useState('0');
  const [newSgst, setNewSgst] = useState('0');
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

  const selectedProduct = products.find(p => p.code === value || p.name === value || p.id === value);
  const displayLabel = selectedProduct ? `${selectedProduct.name} (${selectedProduct.code})` : value || placeholder;

  const filteredProducts = products.filter(p => {
    if (category === 'husk' && p.code !== 'HUSK' && !p.name.toLowerCase().includes('husk')) {
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
    onChange(p.code || p.name, p);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleAddProduct = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    setIsAdding(true);
    const isHusk = newCode.trim().toUpperCase() === 'HUSK' || newName.trim().toLowerCase().includes('husk');
    try {
      const added = await dbAction('products:add', {
        code: newCode.trim().toUpperCase(),
        name: newName.trim(),
        isMain: true,
        cgstRate: parseFloat(newCgst) || (isHusk ? 2.5 : 0),
        sgstRate: parseFloat(newSgst) || (isHusk ? 2.5 : 0)
      });
      await loadProducts();
      onChange(added.code, added);
      setShowAddInline(false);
      setIsOpen(false);
      setNewCode('');
      setNewName('');
      setNewCgst('0');
      setNewSgst('0');
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
      {showChips && (
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
            maxHeight: '320px',
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
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '0.5rem', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                        {p.code}
                      </span>
                    </div>
                    {isSelected && <Check size={16} color="#2563eb" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Commodity Inline Form */}
          {showAddInline ? (
            <div style={{ padding: '0.65rem', borderTop: '1px solid #e2e8f0', background: '#f0f9ff', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0369a1' }}>+ Create New Commodity / Product</div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input
                  type="text"
                  placeholder="Code (e.g. RC_A)"
                  className="form-control form-control-sm"
                  style={{ flex: 1 }}
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                />
                <input
                  type="text"
                  placeholder="Name (e.g. Robusta A)"
                  className="form-control form-control-sm"
                  style={{ flex: 1.5 }}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>Default Tax:</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="CGST %"
                  className="form-control form-control-sm"
                  style={{ width: '85px' }}
                  value={newCgst}
                  onChange={e => setNewCgst(e.target.value)}
                  title="CGST %"
                />
                <input
                  type="number"
                  step="0.1"
                  placeholder="SGST %"
                  className="form-control form-control-sm"
                  style={{ width: '85px' }}
                  value={newSgst}
                  onChange={e => setNewSgst(e.target.value)}
                  title="SGST %"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddInline(false)}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleAddProduct} disabled={isAdding}>
                  {isAdding ? 'Saving...' : 'Add Product'}
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
                gap: '0.4rem'
              }}
            >
              <Plus size={15} />
              <span>+ Add New Commodity / Product to DB</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
