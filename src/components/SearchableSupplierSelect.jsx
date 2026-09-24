import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, UserPlus, X, Check, MapPin, Phone } from 'lucide-react';

export default function SearchableSupplierSelect({
  suppliers = [],
  value = '',
  onChange,
  onAddNewSupplier,
  placeholder = 'Search supplier name, place, phone...',
  autoFocus = false,
  disabled = false,
  className = '',
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedSupplier = suppliers.find(s => s.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter suppliers
  const filteredSuppliers = suppliers.filter(s => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const nameMatch = (s.name || '').toLowerCase().includes(term);
    const placeMatch = (s.place || '').toLowerCase().includes(term);
    const phoneMatch = (s.phone || '').toLowerCase().includes(term);
    return nameMatch || placeMatch || phoneMatch;
  });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearchTerm('');
    setTimeout(() => {
      if (searchInputRef.current) searchInputRef.current.focus();
    }, 50);
  };

  const handleSelect = (supplier) => {
    onChange(supplier.id, supplier);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < filteredSuppliers.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSuppliers.length > 0 && highlightedIndex < filteredSuppliers.length) {
        handleSelect(filteredSuppliers[highlightedIndex]);
      } else if (onAddNewSupplier) {
        onAddNewSupplier();
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }} className={className}>
      {/* Trigger Box */}
      <div
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
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
          userSelect: 'none',
          minHeight: '38px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', flex: 1 }}>
          {selectedSupplier ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.9rem' }}>
                {selectedSupplier.name}
              </span>
              {selectedSupplier.place && (
                <span style={{ fontSize: '0.8rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                  {selectedSupplier.place}
                </span>
              )}
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
              {placeholder}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', flexShrink: 0 }}>
          {value && !disabled && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChange('', null);
              }}
              title="Clear selection"
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
          {/* Search Header */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={15} color="#64748b" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type to filter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '0.88rem',
                color: '#0f172a'
              }}
            />
            {searchTerm && (
              <X
                size={14}
                color="#94a3b8"
                style={{ cursor: 'pointer', flexShrink: 0 }}
                onClick={() => setSearchTerm('')}
              />
            )}
          </div>

          {/* Supplier List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
            {filteredSuppliers.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No supplier matching "{searchTerm}"
              </div>
            ) : (
              filteredSuppliers.map((s, idx) => {
                const isSelected = s.id === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    style={{
                      padding: '0.55rem 0.75rem',
                      cursor: 'pointer',
                      background: isSelected ? '#eff6ff' : isHighlighted ? '#f8fafc' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                      transition: 'background 0.1s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: isSelected ? 700 : 600, color: '#0f172a', fontSize: '0.88rem' }}>
                        {s.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.15rem', fontSize: '0.78rem', color: '#64748b' }}>
                        {s.place && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <MapPin size={11} /> {s.place}
                          </span>
                        )}
                        {s.phone && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <Phone size={11} /> {s.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="#2563eb" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Add New Supplier Footer Button */}
          {onAddNewSupplier && (
            <div
              onClick={() => {
                onAddNewSupplier();
                setIsOpen(false);
              }}
              style={{
                padding: '0.6rem 0.75rem',
                borderTop: '1px solid #e2e8f0',
                background: '#f0f9ff',
                color: '#0284c7',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#e0f2fe'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#f0f9ff'}
            >
              <UserPlus size={15} />
              <span>+ Create New Supplier Account (F9)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
