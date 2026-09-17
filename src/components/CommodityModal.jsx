import React, { useState } from 'react';
import { Sparkles, X, Check } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function CommodityModal({ isOpen, onClose, onAdded }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isMain, setIsMain] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      await dbAction('products:add', {
        name: name.trim(),
        code: code.trim() || name.toUpperCase().replace(/\s+/g, '_'),
        description,
        isMain
      });
      setName('');
      setCode('');
      setDescription('');
      if (onAdded) onAdded();
      onClose();
    } catch (err) {
      alert('Error adding commodity: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} color="#d97706" />
            <span>Add Custom Coffee Commodity</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label className="form-label">Commodity / Grade Name *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Arabica Plantation A, Robusta Parchment..."
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Product Code (Optional)</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. AR_PLANT_A"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description / Grade Notes</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Grade 1 specialty parchment"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={isMain}
                onChange={e => setIsMain(e.target.checked)}
              />
              <span>Highlight as a Main Product on Arrival Screen</span>
            </label>
          </div>

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Check size={15} /> {submitting ? 'Adding...' : 'Add Commodity (F8)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
