import React, { useState, useEffect, useRef } from 'react';
import { Users, X, Check, AlertCircle } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SupplierCreateModal({ isOpen, onClose, onAdded, initialName = '' }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const [gst, setGst] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setPhone('');
      setPlace('');
      setGst('');
      setNotes('');
      setErrorMsg('');
      setTimeout(() => {
        if (nameInputRef.current) nameInputRef.current.focus();
      }, 100);
    }
  }, [isOpen, initialName]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Please enter a supplier name');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const added = await dbAction('suppliers:add', {
        name: trimmedName,
        phone,
        place,
        gst,
        notes
      });
      if (onAdded) onAdded(added);
      onClose();
    } catch (err) {
      setErrorMsg(err.message.replace(/^Error:\s*/, ''));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Users size={18} color="#2563eb" />
            <span>Create New Supplier Account (F9)</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMsg && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Supplier / Estate Name *</label>
            <input
              ref={nameInputRef}
              type="text"
              className="form-control"
              placeholder="e.g. Kaveri Estate Growers"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="form-group">
              <label className="form-label">Phone / Mobile</label>
              <input
                type="text"
                className="form-control"
                placeholder="9845012345"
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Place / Location</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Chikmagalur / Coorg"
                value={place}
                onChange={e => setPlace(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">GST / PAN Number</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. 29AAAAA0000A1Z5"
              value={gst}
              onChange={e => setGst(e.target.value.toUpperCase())}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              type="text"
              className="form-control"
              placeholder="Bank details, broker notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="modal-footer" style={{ padding: '0.75rem 0 0 0', background: 'transparent' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel (Esc)
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Check size={16} /> {submitting ? 'Creating...' : 'Create Supplier Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
