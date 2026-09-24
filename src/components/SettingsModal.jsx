import React, { useState, useEffect } from 'react';
import { Settings, Database, Download, Upload, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SettingsModal({ isOpen, onClose }) {
  const [status, setStatus] = useState(null);
  const [mongoUri, setMongoUri] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const loadStatus = async () => {
    try {
      const res = await dbAction('db:status');
      if (res) {
        setStatus(res);
        setMongoUri(res.mongoUri || 'mongodb://127.0.0.1:27017/coffeetracker');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveMongo = async (e) => {
    if (e) e.preventDefault();
    setConnecting(true);
    setMessage('');
    setIsError(false);
    try {
      const res = await dbAction('db:set-mongo-uri', { uri: mongoUri });
      setStatus(res);
      if (res.isMongoConnected) {
        setMessage('Successfully connected to MongoDB!');
      } else {
        setIsError(true);
        setMessage('Could not connect to MongoDB server. Standalone local database is active and keeping data safe.');
      }
    } catch (err) {
      setIsError(true);
      setMessage(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const backup = await dbAction('backup:export');
      const jsonStr = JSON.stringify(backup, null, 2);
      
      if (window.api && window.api.invoke) {
        const res = await dbAction('dialog:save-file', {
          defaultName: `CoffeeTracker_Backup_${new Date().toISOString().split('T')[0]}.json`,
          content: jsonStr,
          ext: 'json'
        });
        if (res && res.success) {
          alert('Backup saved successfully to: ' + res.path);
          return;
        }
      }

      // Browser download fallback
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CoffeeTracker_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Backup failed: ' + e.message);
    }
  };

  const handleImportBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        await dbAction('backup:import', parsed);
        alert('Data restored successfully! The application will refresh.');
        window.location.reload();
      } catch (err) {
        alert('Invalid backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleClearLocal = async () => {
    if (!window.confirm('Clear local database cache and re-fetch clean data from MongoDB?')) return;
    setConnecting(true);
    try {
      const res = await dbAction('db:clear-local');
      setStatus(res);
      setMessage('Local database cache cleared! Re-synchronized clean state from MongoDB.');
      setIsError(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      setIsError(true);
      setMessage('Failed to clear cache: ' + e.message);
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Settings size={18} />
            <span>Database & System Settings</span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ gap: '1.25rem' }}>
          {/* MongoDB Status Box */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                <Database size={18} color={status?.isMongoConnected ? '#10b981' : '#f59e0b'} />
                <span>Database Engine</span>
              </div>
              <span className={`badge ${status?.isMongoConnected ? 'badge-green' : 'badge-amber'}`}>
                {status?.isMongoConnected ? 'MongoDB Connected' : 'Local Standalone Active'}
              </span>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#64748b' }}>
              The software automatically manages local persistent storage in your user profile and synchronizes with MongoDB (local or MongoDB Atlas cloud).
            </p>

            <form onSubmit={handleSaveMongo} style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="form-label">MongoDB Connection String / URI</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="mongodb://127.0.0.1:27017/coffeetracker"
                  value={mongoUri}
                  onChange={e => setMongoUri(e.target.value)}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={connecting}>
                  {connecting ? 'Testing...' : 'Connect'}
                </button>
              </div>
            </form>

            <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Stale Local Cache Conflict?</span>
              <button 
                type="button" 
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', color: '#dc2626', borderColor: '#fca5a5' }}
                onClick={handleClearLocal}
                disabled={connecting}
              >
                <RefreshCw size={12} /> Clear Local Cache & Sync MongoDB
              </button>
            </div>

            {message && (
              <div style={{ marginTop: '0.65rem', padding: '0.5rem', borderRadius: '6px', fontSize: '0.78rem', background: isError ? '#fef2f2' : '#ecfdf5', color: isError ? '#b91c1c' : '#047857', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isError ? <AlertCircle size={14} /> : <Check size={14} />}
                <span>{message}</span>
              </div>
            )}
          </div>

          {/* Backup & Restore Box */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              Full Data Backup & Disaster Recovery
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
              Export a complete snapshot of all suppliers, arrivals, commitments, settlements, and payments.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={handleExportBackup} style={{ flex: 1 }}>
                <Download size={15} /> Export JSON Backup
              </button>

              <label className="btn btn-secondary" style={{ flex: 1, cursor: 'pointer' }}>
                <Upload size={15} /> Restore from File
                <input type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
              </label>
            </div>
          </div>

          {/* Database File Paths */}
          {status?.localDbFile && (
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              <strong>Local Store File:</strong> <code style={{ wordBreak: 'break-all' }}>{status.localDbFile}</code>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ padding: '0.85rem 1.4rem' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
