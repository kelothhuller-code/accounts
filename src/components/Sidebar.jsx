import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard, 
  Truck, 
  PackageCheck,
  Users, 
  Layers, 
  CreditCard, 
  Handshake, 
  BarChart3, 
  Settings, 
  PlusCircle,
  Database,
  Lock
} from 'lucide-react';
import { dbAction } from '../utils/api';

export default function Sidebar({ activeTab, setActiveTab, onOpenNewArrival, onOpenNewDispatch, onOpenCommodity, onOpenSettings, onLock }) {
  const [dbStatus, setDbStatus] = useState({ isMongoConnected: false });

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const status = await dbAction('db:status');
      if (status) setDbStatus(status);
    } catch (e) {}
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'F1 / Alt+D' },
    { id: 'arrivals', label: 'Coffee Arrivals', icon: Truck, shortcut: 'F2 / Alt+A' },
    { id: 'dispatches', label: 'Dispatches & Sales', icon: PackageCheck, shortcut: 'F10 / Alt+K' },
    { id: 'suppliers', label: 'Suppliers & Ledger', icon: Users, shortcut: 'F3 / Alt+S' },
    { id: 'settlement', label: 'Settle Storage', icon: Layers, shortcut: 'F4 / Alt+W' },
    { id: 'payments', label: 'Payments & TCS', icon: CreditCard, shortcut: 'F5 / Alt+P' },
    { id: 'commitments', label: 'Commitments', icon: Handshake, shortcut: 'F6 / Alt+C' },
    { id: 'reports', label: 'Reports & Filter', icon: BarChart3, shortcut: 'F7 / Alt+R' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-badge">☕</div>
        <div>
          <div className="sidebar-title">CoffeeTracker</div>
          <div className="sidebar-sub">Arrival & Accounts ERP</div>
        </div>
      </div>

      <div style={{ padding: '0.75rem 0.6rem 0.35rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <button 
          className="btn btn-coffee" 
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem', padding: '0.55rem', fontWeight: 600, letterSpacing: '0.01em' }}
          onClick={onOpenNewArrival}
          title="Record New Inward Arrival (Alt+A / F2)"
        >
          <Truck size={15} /> + New Arrival (Alt+A)
        </button>
        <button 
          className="btn btn-primary" 
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem', padding: '0.55rem', fontWeight: 600, background: 'linear-gradient(135deg, #0284c7, #0369a1)', borderColor: '#0284c7' }}
          onClick={onOpenNewDispatch}
          title="Record New Outward Dispatch / Sale (Alt+K / F10)"
        >
          <PackageCheck size={15} /> + New Dispatch (Alt+K)
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <div className="nav-item-left">
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              <span className="shortcut-badge">{item.shortcut.split('/')[0].trim()}</span>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div 
          className="db-status-pill" 
          onClick={onOpenSettings} 
          style={{ cursor: 'pointer', marginBottom: '0.5rem', justifyContent: 'space-between' }}
          title="Click to configure MongoDB or Backup"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={14} color={dbStatus.isMongoConnected ? '#10b981' : '#f59e0b'} />
            <span>{dbStatus.isMongoConnected ? 'MongoDB Connected' : 'Local Storage Active'}</span>
          </div>
          <div className={`status-dot ${dbStatus.isMongoConnected ? 'online' : 'offline'}`} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            style={{ flex: 1, padding: '0.25rem 0.4rem', fontSize: '0.72rem', background: '#1e293b', color: '#cbd5e1', border: 'none' }}
            onClick={onOpenCommodity}
          >
            + Commodity (F8)
          </button>
          <button 
            className="btn btn-secondary btn-sm" 
            style={{ padding: '0.25rem 0.5rem', background: '#1e293b', color: '#cbd5e1', border: 'none' }}
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings size={13} />
          </button>
          {onLock && (
            <button 
              className="btn btn-secondary btn-sm" 
              style={{ padding: '0.25rem 0.5rem', background: '#1e293b', color: '#f87171', border: 'none' }}
              onClick={onLock}
              title="Lock System (Logout)"
            >
              <Lock size={13} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
