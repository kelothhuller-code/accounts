import React, { useState, useEffect } from 'react';
import { dbAction } from '../utils/api';
import { X, Box, Save, AlertCircle, RefreshCw, Check, User } from 'lucide-react';
import SearchableSupplierSelect from './SearchableSupplierSelect';

export default function OpeningStockModal({
  isOpen,
  onClose,
  onSaved
}) {
  const [coffeeBags, setCoffeeBags] = useState('');
  const [coffeeWeight, setCoffeeWeight] = useState('');
  const [coffeeEP, setCoffeeEP] = useState('');
  const [huskBags, setHuskBags] = useState('');
  const [huskWeight, setHuskWeight] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierOpeningBal, setSupplierOpeningBal] = useState('');
  const [supplierBalType, setSupplierBalType] = useState('credit');
  const [supplierOpeningBags, setSupplierOpeningBags] = useState('');
  const [supplierOpeningEP, setSupplierOpeningEP] = useState('');

  const [activeTab, setActiveTab] = useState('global');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const sups = await dbAction('suppliers:get');
      setSuppliers(sups || []);

      // Load opening stock from db
      const insight = await dbAction('stock:requirement-insight');
      if (insight) {
        setCoffeeEP(insight.openingCoffeeEP ? String(insight.openingCoffeeEP) : '');
      }
    } catch (e) {}
  };

  const handleGlobalStockSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      await dbAction('stock:update-opening', {
        coffeeBags: parseFloat(coffeeBags) || 0,
        coffeeWeight: parseFloat(coffeeWeight) || 0,
        coffeeEP: parseFloat(coffeeEP) || 0,
        huskBags: parseFloat(huskBags) || 0,
        huskWeight: parseFloat(huskWeight) || 0
      });

      setSuccessMsg('Global Opening Stock updated successfully!');
      if (onSaved) onSaved();
      setTimeout(() => { setSuccessMsg(''); onClose(); }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to update opening stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSupplierSelect = (id, supObj) => {
    setSelectedSupplierId(id);
    const sup = supObj || suppliers.find(s => s.id === id);
    if (sup) {
      setSupplierOpeningBal(sup.openingBalance !== undefined ? String(sup.openingBalance) : '0');
      setSupplierBalType(sup.openingBalanceType || 'credit');
      setSupplierOpeningBags(sup.openingStorageBags !== undefined ? String(sup.openingStorageBags) : '0');
      setSupplierOpeningEP(sup.openingStorageEP !== undefined ? String(sup.openingStorageEP) : '0');
    }
  };

  const handlePartyBalanceSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!selectedSupplierId) {
      setError('Please select a party.');
      return;
    }

    setIsSubmitting(true);
    try {
      await dbAction('suppliers:update', {
        id: selectedSupplierId,
        data: {
          openingBalance: parseFloat(supplierOpeningBal) || 0,
          openingBalanceType: supplierBalType,
          openingStorageBags: parseFloat(supplierOpeningBags) || 0,
          openingStorageEP: parseFloat(supplierOpeningEP) || 0
        }
      });

      setSuccessMsg('Party opening account balance updated!');
      if (onSaved) onSaved();
      const updatedSups = await dbAction('suppliers:get');
      setSuppliers(updatedSups || []);
      setTimeout(() => setSuccessMsg(''), 1500);
    } catch (err) {
      setError(err.message || 'Failed to update party opening balance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ fontSize: '1.3rem' }}>📦</span>
            <span>Set Opening Stock & Party Account Balances</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '0.75rem',
              fontWeight: 600,
              fontSize: '0.88rem',
              border: 'none',
              borderBottom: activeTab === 'global' ? '3px solid #0284c7' : 'none',
              background: activeTab === 'global' ? '#fff' : 'transparent',
              color: activeTab === 'global' ? '#0284c7' : '#64748b',
              cursor: 'pointer'
            }}
            onClick={() => setActiveTab('global')}
          >
            🏢 Global Warehouse Opening Stock
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '0.75rem',
              fontWeight: 600,
              fontSize: '0.88rem',
              border: 'none',
              borderBottom: activeTab === 'party' ? '3px solid #0284c7' : 'none',
              background: activeTab === 'party' ? '#fff' : 'transparent',
              color: activeTab === 'party' ? '#0284c7' : '#64748b',
              cursor: 'pointer'
            }}
            onClick={() => setActiveTab('party')}
          >
            👥 Party Opening Financial & Storage Balances
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', padding: '0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
              <Check size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'global' ? (
            <form onSubmit={handleGlobalStockSubmit}>
              <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#334155', marginBottom: '0.75rem' }}>
                ☕ Global Coffee Physical Opening Inventory:
              </h4>

              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Opening Coffee Bags</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="e.g. 500 bags"
                    value={coffeeBags}
                    onChange={(e) => setCoffeeBags(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opening Raw Weight (kg)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="e.g. 25000 kg"
                    value={coffeeWeight}
                    onChange={(e) => setCoffeeWeight(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opening Clean EP (kg) *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="Total EP weight in kg"
                    value={coffeeEP}
                    onChange={(e) => setCoffeeEP(e.target.value)}
                    required
                  />
                </div>
              </div>

              <h4 style={{ fontSize: '0.92rem', fontWeight: 600, color: '#334155', margin: '1.25rem 0 0.75rem 0' }}>
                🌾 Global Husk Opening Inventory:
              </h4>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Opening Husk Bags</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="No. of husk bags"
                    value={huskBags}
                    onChange={(e) => setHuskBags(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Opening Husk Weight (kg)</label>
                  <input
                    type="number"
                    step="any"
                    className="form-control num-input"
                    placeholder="Weight of husk in kg"
                    value={huskWeight}
                    onChange={(e) => setHuskWeight(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ padding: '1rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel (Esc)</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  <Save size={16} /> Save Global Opening Stock
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePartyBalanceSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="form-label">Select Party / Customer / Supplier *</label>
                <SearchableSupplierSelect
                  suppliers={suppliers}
                  value={selectedSupplierId}
                  onChange={handleSupplierSelect}
                  placeholder="Search party account..."
                />
              </div>

              {selectedSupplierId && (
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem' }}>
                    💵 Financial Opening Balance:
                  </h4>
                  
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Opening Amount (₹)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder="Opening balance amount"
                        value={supplierOpeningBal}
                        onChange={(e) => setSupplierOpeningBal(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Balance Type</label>
                      <select
                        className="form-control"
                        value={supplierBalType}
                        onChange={(e) => setSupplierBalType(e.target.value)}
                      >
                        <option value="credit">Credit (We Owe Party ₹)</option>
                        <option value="debit">Debit (Party Owes Us ₹)</option>
                      </select>
                    </div>
                  </div>

                  <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', margin: '1.25rem 0 0.75rem 0' }}>
                    📦 Opening Stored Coffee Stock With Us:
                  </h4>

                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Opening Stored Bags</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder="Stored bags"
                        value={supplierOpeningBags}
                        onChange={(e) => setSupplierOpeningBags(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Opening Stored EP (kg)</label>
                      <input
                        type="number"
                        step="any"
                        className="form-control num-input"
                        placeholder="Stored EP in kg"
                        value={supplierOpeningEP}
                        onChange={(e) => setSupplierOpeningEP(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="modal-footer" style={{ padding: '1rem 0 0 0', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel (Esc)</button>
                <button type="submit" className="btn btn-success" disabled={isSubmitting || !selectedSupplierId}>
                  <Save size={16} /> Save Party Opening Balance
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
