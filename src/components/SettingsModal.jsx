import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Database, 
  Download, 
  Upload, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Calendar, 
  Lock, 
  Unlock, 
  FileText, 
  ShieldCheck, 
  ArrowRight,
  Archive
} from 'lucide-react';
import { dbAction } from '../utils/api';

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('fiscal_year');
  const [status, setStatus] = useState(null);
  const [mongoUri, setMongoUri] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  // Financial Year State
  const [fySummary, setFySummary] = useState(null);
  const [loadingFy, setLoadingFy] = useState(false);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [selectedFyToClose, setSelectedFyToClose] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [lockTransactions, setLockTransactions] = useState(true);
  const [carryForwardStock, setCarryForwardStock] = useState(true);
  const [carryForwardBalances, setCarryForwardBalances] = useState(true);
  const [executingClosing, setExecutingClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      loadFySummary();
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

  const loadFySummary = async () => {
    setLoadingFy(true);
    try {
      const res = await dbAction('fy:summary');
      if (res) {
        setFySummary(res);
      }
    } catch (e) {
      console.error('Error loading FY summary:', e);
    } finally {
      setLoadingFy(false);
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
          defaultName: `CommodityERP_Backup_${new Date().toISOString().split('T')[0]}.json`,
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
      a.download = `CommodityERP_Backup_${new Date().toISOString().split('T')[0]}.json`;
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

  const handleClearEverything = async () => {
    const confirmMsg = "⚠️ WARNING: ARE YOU SURE YOU WANT TO CLEAR ALL DATABASE DATA COMPLETELY?\n\nThis will permanently delete all:\n• Inward Arrivals & Purchases\n• Outward Dispatches & Sales\n• Purchase & Sales Commitments\n• Storage Settlements & EP Transfers\n• Payment & Voucher Records\n• Supplier & Customer Accounts\n• Milling & Processing Logs\n• Opening Stock Entries & Processing Profiles\n\nYour local JSON database file and MongoDB records will be reset to a clean state.";
    if (!window.confirm(confirmMsg)) return;

    setConnecting(true);
    try {
      const res = await dbAction('db:clear-local', { wipeMongo: true });
      setStatus(res);
      setMessage('✅ Database cleared completely! All JSON records have been reset.');
      setIsError(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setIsError(true);
      setMessage('Failed to clear database: ' + e.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleSyncMongo = async () => {
    if (!window.confirm('Re-synchronize local cache with MongoDB server?')) return;
    setConnecting(true);
    try {
      const res = await dbAction('db:clear-local', { syncMongo: true });
      setStatus(res);
      setMessage('Local cache re-synchronized with MongoDB!');
      setIsError(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setIsError(true);
      setMessage('Failed to sync Mongo: ' + e.message);
    } finally {
      setConnecting(false);
    }
  };

  // Year-End Closing Handlers
  const openClosingWizard = (fy) => {
    setSelectedFyToClose(fy);
    setClosingNotes(`Audited and closed on ${new Date().toLocaleDateString('en-IN')}`);
    setLockTransactions(true);
    setCarryForwardStock(true);
    setCarryForwardBalances(true);
    setClosingModalOpen(true);
  };

  const handleExecuteYearClosing = async () => {
    if (!selectedFyToClose) return;
    setExecutingClosing(true);
    try {
      const res = await dbAction('fy:close', {
        fyToClose: selectedFyToClose,
        notes: closingNotes,
        lockTransactions,
        carryForwardStock,
        carryForwardBalances
      });

      if (res && res.success) {
        alert(
          `🎉 Financial Year ${selectedFyToClose} closed successfully!\n\n` +
          `• ${res.lockedTransactionsCount || 0} transactions locked against modifications\n` +
          `• ${res.openingStockCreated || 0} opening stock entries rolled forward into April 1 of next FY\n` +
          `• Standalone yearly archive generated in data/archives/\n` +
          `• Supplier closing balances updated`
        );
        setClosingModalOpen(false);
        await loadFySummary();
      } else {
        alert('Year closing failed: ' + (res?.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error during Year-End Closing: ' + e.message);
    } finally {
      setExecutingClosing(false);
    }
  };

  const handleReopenFy = async (fy) => {
    const confirmPrompt = window.prompt(
      `⚠️ AUTHORIZED AUDIT OVERRIDE:\n\nAre you sure you want to reopen Financial Year ${fy}?\n` +
      `This will unlock transactions for editing.\n\nType 'REOPEN' to confirm:`
    );
    if (confirmPrompt !== 'REOPEN') return;

    try {
      const res = await dbAction('fy:reopen', { fy });
      if (res && res.success) {
        alert(`Financial Year ${fy} has been reopened. Records can now be adjusted.`);
        await loadFySummary();
      } else {
        alert('Failed to reopen FY: ' + (res?.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error reopening FY: ' + e.message);
    }
  };

  const handleDownloadArchive = async (fy) => {
    try {
      const res = await dbAction('fy:export-archive', { fy });
      if (!res || !res.content) {
        alert('Could not generate archive for FY ' + fy);
        return;
      }

      if (window.api && window.api.invoke) {
        const saveRes = await dbAction('dialog:save-file', {
          defaultName: `commodity_store_FY_${fy}.json`,
          content: res.content,
          ext: 'json'
        });
        if (saveRes && saveRes.success) {
          alert(`Archive for FY ${fy} saved successfully to: ${saveRes.path}`);
          return;
        }
      }

      const blob = new Blob([res.content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commodity_store_FY_${fy}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export archive: ' + e.message);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !closingModalOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closingModalOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: '680px', width: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Settings size={20} color="#2563eb" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b' }}>System Architecture & Settings</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Storage Engine, Year-End Closing & Archiving</div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 1.25rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('fiscal_year')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: activeTab === 'fiscal_year' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'fiscal_year' ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <Calendar size={15} />
            <span>FY Closing & Archiving</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: activeTab === 'database' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'database' ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <Database size={15} />
            <span>Storage & Database</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
              color: activeTab === 'backup' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'backup' ? '2px solid #2563eb' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem'
            }}
          >
            <Archive size={15} />
            <span>Backup & Disaster Recovery</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', gap: '1rem' }}>
          
          {/* TAB 1: FINANCIAL YEAR CLOSING & ARCHIVING */}
          {activeTab === 'fiscal_year' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Info Banner */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <ShieldCheck size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.45 }}>
                  <strong>Indian Fiscal Year Engine (Apr 1 – Mar 31)</strong>
                  <div>
                    Year-End Closing locks historical audited transactions against inadvertent edits, automatically calculates closing stocks across all godowns to create April 1 Opening Stock entries, rolls forward party balances, and creates an isolated archive snapshot.
                  </div>
                </div>
              </div>

              {/* Current Active FY Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Current Active Financial Year</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
                    <span>FY {fySummary?.currentFy || '2026-2027'}</span>
                    <span className="badge badge-green" style={{ fontSize: '0.72rem' }}>🟢 Open for Data Entry</span>
                  </div>
                </div>
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={loadFySummary}
                  disabled={loadingFy}
                  title="Refresh Fiscal Year Status"
                >
                  <RefreshCw size={13} className={loadingFy ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {/* Fiscal Years List Table */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '0.65rem 1rem', background: '#f1f5f9', fontWeight: 700, fontSize: '0.82rem', color: '#334155', borderBottom: '1px solid #e2e8f0' }}>
                  Fiscal Years Ledger & Audit Status
                </div>
                <table className="table" style={{ margin: 0, fontSize: '0.8rem' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      <th>Financial Year</th>
                      <th>Audit Status</th>
                      <th className="num">Transactions</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fySummary?.years && fySummary.years.length > 0 ? (
                      fySummary.years.map((y) => (
                        <tr key={y.fy} style={{ background: y.isClosed ? '#fcfcfc' : '#fff' }}>
                          <td style={{ fontWeight: 700, color: '#1e293b' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Calendar size={14} color="#64748b" />
                              <span>FY {y.fy}</span>
                              {y.fy === fySummary.currentFy && (
                                <span style={{ fontSize: '0.65rem', background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>Current</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                              Apr 1, {y.fy.split('-')[0]} – Mar 31, {y.fy.split('-')[1]}
                            </div>
                          </td>
                          <td>
                            {y.isClosed ? (
                              <div>
                                <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <Lock size={11} /> Closed & Locked
                                </span>
                                {y.closedAt && (
                                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>
                                    {new Date(y.closedAt).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Unlock size={11} /> Open (Editable)
                              </span>
                            )}
                          </td>
                          <td className="num">
                            <span style={{ fontWeight: 600, color: '#334155' }}>{y.totalRecords}</span>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                              {y.arrivalsCount} arr / {y.dispatchesCount} disp
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {!y.isClosed ? (
                                <button
                                  className="btn btn-sm"
                                  style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600, fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                  onClick={() => openClosingWizard(y.fy)}
                                >
                                  <Lock size={12} /> Close FY (Rollover)
                                </button>
                              ) : (
                                <>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleReopenFy(y.fy)}
                                    title="Authorized unlock for audit adjustments"
                                  >
                                    <Unlock size={12} /> Reopen
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                                    onClick={() => handleDownloadArchive(y.fy)}
                                    title="Export standalone archive file for this year"
                                  >
                                    <Download size={12} /> Archive
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                          No fiscal years detected.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: DATABASE & STORAGE ENGINE */}
          {activeTab === 'database' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Storage Architecture Overview */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#1e293b' }}>
                    <Database size={18} color={status?.isMongoConnected ? '#10b981' : '#f59e0b'} />
                    <span>Database Architecture & Performance</span>
                  </div>
                  <span className={`badge ${status?.isMongoConnected ? 'badge-green' : 'badge-amber'}`}>
                    {status?.isMongoConnected ? 'MongoDB Server Active' : 'Standalone Local Active'}
                  </span>
                </div>

                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                  The software features an <strong>Asynchronous Coalesced Write Queue</strong> and <strong>Atomic Temp-Renaming</strong>. Disk writes run in the background without UI freezing even at 50,000+ entries.
                </p>

                <form onSubmit={handleSaveMongo} style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>MongoDB Server / Atlas URI</label>
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

                <div style={{ marginTop: '0.9rem', paddingTop: '0.75rem', borderTop: '1px dashed #cbd5e1', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Wipe all transactions & reset JSON database?</span>
                    <button 
                      type="button" 
                      className="btn btn-sm"
                      style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 600 }}
                      onClick={handleClearEverything}
                      disabled={connecting}
                    >
                      🗑️ Clear All JSON & Local Data
                    </button>
                  </div>

                  {status?.isMongoConnected && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Re-sync local cache from MongoDB?</span>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem' }}
                        onClick={handleSyncMongo}
                        disabled={connecting}
                      >
                        <RefreshCw size={12} /> Sync Mongo Cache
                      </button>
                    </div>
                  )}
                </div>

                {message && (
                  <div style={{ marginTop: '0.65rem', padding: '0.5rem', borderRadius: '6px', fontSize: '0.78rem', background: isError ? '#fef2f2' : '#ecfdf5', color: isError ? '#b91c1c' : '#047857', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {isError ? <AlertCircle size={14} /> : <Check size={14} />}
                    <span>{message}</span>
                  </div>
                )}
              </div>

              {/* Local File Path */}
              {status?.localDbFile && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <strong>Local Primary Store:</strong> <code style={{ wordBreak: 'break-all', color: '#0f172a' }}>{status.localDbFile}</code>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BACKUP & RECOVERY */}
          {activeTab === 'backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.4rem', color: '#1e293b' }}>
                  Enterprise Snapshot & Disaster Recovery
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.45 }}>
                  Export an offline, portable snapshot containing all suppliers, inward arrivals, outward dispatches, commitments, settlements, vouchers, and opening stocks.
                </p>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" onClick={handleExportBackup} style={{ flex: 1, padding: '0.6rem' }}>
                    <Download size={15} /> Export Complete JSON Backup
                  </button>

                  <label className="btn btn-secondary" style={{ flex: 1, cursor: 'pointer', padding: '0.6rem', textAlign: 'center', justifyContent: 'center' }}>
                    <Upload size={15} /> Restore from File
                    <input type="file" accept=".json" onChange={handleImportBackup} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '0.85rem 1.4rem' }}>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>

      {/* YEAR-END CLOSING CONFIRMATION MODAL */}
      {closingModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10050 }} onClick={() => !executingClosing && setClosingModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309' }}>
                <Lock size={18} />
                <span>Financial Year-End Closing Wizard</span>
              </div>
              <button 
                className="btn btn-secondary btn-sm" 
                disabled={executingClosing}
                onClick={() => setClosingModalOpen(false)}
              >✕</button>
            </div>

            <div className="modal-body" style={{ gap: '1rem' }}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.75rem', fontSize: '0.8rem', color: '#92400e' }}>
                You are performing fiscal year-end rollover for <strong>FY {selectedFyToClose}</strong>.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={lockTransactions}
                    onChange={e => setLockTransactions(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <strong>Lock all transactions for FY {selectedFyToClose}</strong>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Prevents inadvertent edits or deletion of audited historical transactions.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={carryForwardStock}
                    onChange={e => setCarryForwardStock(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <strong>Roll forward Godown Closing Stock as April 1 Opening Stock</strong>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Calculates remaining raw & EP stocks on March 31 and posts them to next FY.</div>
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={carryForwardBalances}
                    onChange={e => setCarryForwardBalances(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <div>
                    <strong>Roll forward Supplier & Customer Ledger Balances</strong>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Updates party opening balances with closing ledger balances as of March 31.</div>
                  </div>
                </label>
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 600 }}>Auditor / Closing Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="e.g., Audited by CA, tax audit complete, books closed."
                />
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                disabled={executingClosing}
                onClick={() => setClosingModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#b45309', borderColor: '#b45309' }}
                disabled={executingClosing}
                onClick={handleExecuteYearClosing}
              >
                {executingClosing ? 'Executing Closing...' : 'Execute Year-End Closing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
