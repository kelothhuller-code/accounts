import React, { useState, useEffect } from 'react';
import { Sparkles, X, Check, Edit2, Trash2, Tag, Percent, Scale, List, PlusCircle } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function CommodityModal({ isOpen, onClose, onAdded }) {
  const [activeTab, setActiveTab] = useState('add'); // 'add' or 'manage'
  const [productsList, setProductsList] = useState([]);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [calculationBasis, setCalculationBasis] = useState('end_product'); // 'end_product' or 'direct'
  const [defaultOutturn, setDefaultOutturn] = useState('26');
  const [defaultOutturnType, setDefaultOutturnType] = useState('per_50kg');
  const [cgstRate, setCgstRate] = useState('0');
  const [sgstRate, setSgstRate] = useState('0');
  const [hsnCode, setHsnCode] = useState('');
  const [isMain, setIsMain] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadProducts();
      resetForm();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    try {
      const list = await dbAction('products:get');
      setProductsList(list || []);
    } catch (e) {
      console.error(e);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setDescription('');
    setCalculationBasis('end_product');
    setDefaultOutturn('26');
    setDefaultOutturnType('per_50kg');
    setCgstRate('0');
    setSgstRate('0');
    setHsnCode('');
    setIsMain(true);
    setErrorMsg('');
  };

  const startEditProduct = (prod) => {
    setEditingId(prod.id);
    setName(prod.name || '');
    setCode(prod.code || '');
    setDescription(prod.description || '');
    setCalculationBasis(prod.calculationBasis || (prod.name.toLowerCase().includes('raw') ? 'end_product' : 'direct'));
    setDefaultOutturn(String(prod.defaultOutturn !== undefined ? prod.defaultOutturn : '26'));
    setDefaultOutturnType(prod.defaultOutturnType || 'per_50kg');
    setCgstRate(String(prod.cgstRate !== undefined ? prod.cgstRate : '0'));
    setSgstRate(String(prod.sgstRate !== undefined ? prod.sgstRate : '0'));
    setHsnCode(prod.hsnCode || '');
    setIsMain(prod.isMain !== undefined ? !!prod.isMain : true);
    setActiveTab('add');
  };

  const handleDeleteProduct = async (id, prodName) => {
    if (!window.confirm(`Are you sure you want to delete commodity "${prodName}"?`)) return;
    try {
      await dbAction('products:delete', { id });
      await loadProducts();
      if (onAdded) onAdded();
    } catch (err) {
      alert('Error deleting commodity: ' + err.message);
    }
  };

  const handleNameChange = (val) => {
    setName(val);
    if (!editingId && !code) {
      // Auto suggest code
      const suggested = val.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 12);
      setCode(suggested);
    }
    // Infer calculation basis if husk
    if (val.toLowerCase().includes('husk')) {
      setCalculationBasis('direct');
      setCgstRate('2.5');
      setSgstRate('2.5');
      setDefaultOutturn('50');
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Commodity name is required');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const numCgst = parseFloat(cgstRate) || 0;
    const numSgst = parseFloat(sgstRate) || 0;
    const numOutturn = parseFloat(defaultOutturn) || (calculationBasis === 'end_product' ? 26 : 50);

    const payload = {
      name: name.trim(),
      code: (code.trim() || name.toUpperCase().replace(/\s+/g, '_')).toUpperCase(),
      description: description.trim(),
      calculationBasis, // 'direct' or 'end_product'
      defaultOutturn: numOutturn,
      defaultOutturnType,
      cgstRate: numCgst,
      sgstRate: numSgst,
      igstRate: numCgst + numSgst,
      hsnCode: hsnCode.trim(),
      isMain
    };

    try {
      if (editingId) {
        await dbAction('products:update', { id: editingId, data: payload });
      } else {
        await dbAction('products:add', payload);
      }
      resetForm();
      await loadProducts();
      if (onAdded) onAdded();
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Error saving commodity');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalGst = (parseFloat(cgstRate) || 0) + (parseFloat(sgstRate) || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px', width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: '#fef3c7', padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
              <Sparkles size={18} color="#d97706" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a' }}>
                Commodity & Product Master
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Configure GST rates & valuation basis (Direct Weight vs End Product Outturn)
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0.25rem 1rem 0 1rem', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: activeTab === 'add' ? '2px solid #2563eb' : '2px solid transparent',
              background: activeTab === 'add' ? '#fff' : 'transparent',
              color: activeTab === 'add' ? '#2563eb' : '#64748b',
              fontWeight: 600,
              padding: '0.5rem 0.85rem'
            }}
            onClick={() => setActiveTab('add')}
          >
            <PlusCircle size={14} /> {editingId ? 'Edit Commodity' : 'Add New Commodity'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              borderRadius: '6px 6px 0 0',
              borderBottom: activeTab === 'manage' ? '2px solid #2563eb' : '2px solid transparent',
              background: activeTab === 'manage' ? '#fff' : 'transparent',
              color: activeTab === 'manage' ? '#2563eb' : '#64748b',
              fontWeight: 600,
              padding: '0.5rem 0.85rem'
            }}
            onClick={() => setActiveTab('manage')}
          >
            <List size={14} /> Manage Commodities ({productsList.length})
          </button>
        </div>

        {errorMsg && (
          <div style={{ margin: '0.75rem 1.25rem 0 1.25rem', padding: '0.6rem 0.8rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.82rem' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {activeTab === 'add' ? (
          <form onSubmit={handleSubmit} className="modal-body" style={{ padding: '1rem 1.25rem' }}>
            {/* Row 1: Name and Code */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Commodity / Grade Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Robusta Parchment, Arabica Cherry, RC EP, Black Pepper..."
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Product Code</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. RC_PARCH"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            {/* Row 2: Valuation & Calculation Basis (CRITICAL USER REQUIREMENT) */}
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.85rem' }}>
              <label className="form-label" style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Scale size={15} color="#2563eb" /> Valuation & Price Calculation Basis *
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.4rem' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '6px',
                  border: calculationBasis === 'end_product' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: calculationBasis === 'end_product' ? '#eff6ff' : '#fff',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="calcBasis"
                    checked={calculationBasis === 'end_product'}
                    onChange={() => {
                      setCalculationBasis('end_product');
                      if (defaultOutturn === '50' || !defaultOutturn) setDefaultOutturn('26');
                    }}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e3a8a' }}>
                      ☕ Calculated on End Product (EP Outturn)
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Raw coffee (Parchment/Cherry) where rate is paid per Kg of clean End Product (EP) yield after milling test.
                    </div>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '6px',
                  border: calculationBasis === 'direct' ? '2px solid #059669' : '1px solid #cbd5e1',
                  background: calculationBasis === 'direct' ? '#ecfdf5' : '#fff',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="calcBasis"
                    checked={calculationBasis === 'direct'}
                    onChange={() => {
                      setCalculationBasis('direct');
                      setDefaultOutturn('50');
                    }}
                    style={{ marginTop: '0.2rem' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#065f46' }}>
                      🏷️ Main Product (Direct Standard Weight)
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.15rem' }}>
                      Valued directly on gross/net weight or bags. Ideal for Clean/EP Coffee, Husk, Pepper, Cardamom, or non-coffee commodities.
                    </div>
                  </div>
                </label>
              </div>

              {/* Outturn parameters if End Product */}
              {calculationBasis === 'end_product' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr', gap: '0.75rem', marginTop: '0.75rem', padding: '0.6rem', background: '#fff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', color: '#1e40af' }}>Default Standard Outturn Test *</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={defaultOutturn}
                      onChange={e => setDefaultOutturn(e.target.value)}
                      placeholder="e.g. 26"
                      required
                    />
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {defaultOutturnType === 'per_50kg' ? `${defaultOutturn} kg EP per 50kg bag (= ${((parseFloat(defaultOutturn) || 0) / 50 * 100).toFixed(1)}% yield)` : `${defaultOutturn}% clean yield`}
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.78rem', color: '#1e40af' }}>Outturn Unit / Format</label>
                    <select
                      className="form-control"
                      value={defaultOutturnType}
                      onChange={e => setDefaultOutturnType(e.target.value)}
                    >
                      <option value="per_50kg">kg per 50kg Bag (Standard Coffee Market)</option>
                      <option value="percentage">Percentage Yield (%)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Taxes (CGST & SGST - USER REQUIREMENT) */}
            <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="form-label" style={{ fontWeight: 700, color: '#0f172a', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Percent size={15} color="#d97706" /> Default GST Rates *
                </label>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: totalGst > 0 ? '#b45309' : '#059669', background: totalGst > 0 ? '#fef3c7' : '#ecfdf5', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                  Total GST / IGST: {totalGst.toFixed(1)}% {totalGst === 0 ? '(Nil / Exempt)' : ''}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '0.4rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Default CGST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="28"
                    className="form-control"
                    placeholder="0"
                    value={cgstRate}
                    onChange={e => setCgstRate(e.target.value)}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>e.g. 0% for Coffee, 2.5% for Husk</span>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>Default SGST (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="28"
                    className="form-control"
                    placeholder="0"
                    value={sgstRate}
                    onChange={e => setSgstRate(e.target.value)}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>e.g. 0% for Coffee, 2.5% for Husk</span>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem' }}>HSN / SAC Code</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 0901 or 2308"
                    value={hsnCode}
                    onChange={e => setHsnCode(e.target.value)}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#64748b' }}>HSN 0901 = Coffee</span>
                </div>
              </div>
            </div>

            {/* Row 4: Description & Main Product Toggle */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '0.75rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Grade / Spec Notes (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. FAQ grade, screen 18, moisture < 12%"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div style={{ paddingTop: '1.2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={isMain}
                    onChange={e => setIsMain(e.target.checked)}
                  />
                  <span>Show as Quick Chip on Entry</span>
                </label>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '0.85rem 0 0 0', background: 'transparent', display: 'flex', justifyContent: 'space-between' }}>
              {editingId ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={resetForm}>
                  Cancel Edit
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ fontWeight: 600 }}>
                  <Check size={15} /> {submitting ? 'Saving...' : (editingId ? 'Update Commodity' : 'Add Commodity (F8)')}
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* Manage Tab: List of All Commodities */
          <div style={{ padding: '1rem 1.25rem', maxHeight: '520px', overflowY: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Commodity Name</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Code</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Calculation Basis</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Default Outturn</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>CGST / SGST</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {productsList.map(prod => {
                  const isEnd = prod.calculationBasis === 'end_product';
                  const cgst = prod.cgstRate || 0;
                  const sgst = prod.sgstRate || 0;
                  return (
                    <tr key={prod.id || prod.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{prod.name}</span>
                          {prod.isMain && (
                            <span style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>Main</span>
                          )}
                        </div>
                        {prod.description && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{prod.description}</div>}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', color: '#475569' }}>
                        {prod.code}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: isEnd ? '#eff6ff' : '#ecfdf5',
                          color: isEnd ? '#1d4ed8' : '#047857'
                        }}>
                          {isEnd ? '☕ Outturn / EP' : '🏷️ Direct Weight'}
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center', color: isEnd ? '#1e40af' : '#64748b' }}>
                        {isEnd ? `${prod.defaultOutturn || 26} kg/50kg` : '100% (Direct)'}
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: (cgst + sgst) > 0 ? '#fef3c7' : '#f1f5f9',
                          color: (cgst + sgst) > 0 ? '#b45309' : '#64748b'
                        }}>
                          {cgst}% + {sgst}%
                        </span>
                      </td>
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                            onClick={() => startEditProduct(prod)}
                            title="Edit Commodity"
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem', color: '#dc2626' }}
                            onClick={() => handleDeleteProduct(prod.id, prod.name)}
                            title="Delete Commodity"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
