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
  Lock,
  Boxes,
  Calendar
} from 'lucide-react';
import { dbAction } from '../utils/api';

export default function Sidebar({ activeTab, setActiveTab, onOpenNewArrival, onOpenNewDispatch, onOpenCommodity, onOpenSettings, onLock }) {
  const [dbStatus, setDbStatus] = useState({ isMongoConnected: false });
  const [currentFy, setCurrentFy] = useState('2026-2027');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const [status, fy] = await Promise.all([
        dbAction('db:status'),
        dbAction('fy:summary')
      ]);
      if (status) setDbStatus(status);
      if (fy && fy.currentFy) setCurrentFy(fy.currentFy);
    } catch (e) {}
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'F1 / Alt+D' },
    { id: 'arrivals', label: 'Inward Arrivals', icon: Truck, shortcut: 'F2 / Alt+A' },
    { id: 'dispatches', label: 'Dispatches & Sales', icon: PackageCheck, shortcut: 'F10 / Alt+K' },
    { id: 'suppliers', label: 'Parties & Ledgers', icon: Users, shortcut: 'F3 / Alt+S' },
    { id: 'stock', label: 'Stock & Processing', icon: Boxes, shortcut: 'F8 / Alt+G' },
    { id: 'settlement', label: 'Settle Storage', icon: Layers, shortcut: 'F4 / Alt+W' },
    { id: 'payments', label: 'Payments & TCS', icon: CreditCard, shortcut: 'F5 / Alt+P' },
    { id: 'commitments', label: 'Commitments', icon: Handshake, shortcut: 'F6 / Alt+C' },
    { id: 'reports', label: 'Settlement Reports', icon: BarChart3, shortcut: 'F7 / Alt+R' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-badge">📦</div>
        <div>
          <div className="sidebar-title">CommodityERP</div>
          <div className="sidebar-sub">Trading & Inventory ERP</div>
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
          onClick={onOpenSettings}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.05)', 
            padding: '0.35rem 0.6rem', 
            borderRadius: '6px', 
            marginBottom: '0.4rem',
            cursor: 'pointer',
            fontSize: '0.72rem',
            color: '#cbd5e1'
          }}
          title="Click to view Financial Year Closing & Archiving"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calendar size={13} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>FY {currentFy}</span>
          </div>
          <span style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>Active</span>
        </div>

        <div 
          className="db-status-pill" 
          onClick={onOpenSettings} 
          style={{ cursor: 'pointer', marginBottom: '0.5rem', justifyContent: 'space-between' }}
          title="Click to configure MongoDB or Storage"
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
