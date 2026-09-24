import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ShortcutsBar from './components/ShortcutsBar';
import Dashboard from './components/Dashboard';
import SuppliersView from './components/SuppliersView';
import SupplierLedgerModal from './components/SupplierLedgerModal';
import ArrivalEntryModal from './components/ArrivalEntryModal';
import DispatchEntryModal from './components/DispatchEntryModal';
import DispatchesView from './components/DispatchesView';
import EPTransferModal from './components/EPTransferModal';
import OpeningStockModal from './components/OpeningStockModal';
import SettlementWizard from './components/SettlementWizard';
import CommitmentsView from './components/CommitmentsView';
import PaymentsView from './components/PaymentsView';
import ReportsView from './components/ReportsView';
import CommodityModal from './components/CommodityModal';
import SettingsModal from './components/SettingsModal';
import SupplierCreateModal from './components/SupplierCreateModal';
import LoginScreen from './components/LoginScreen';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('coffee_auth') === 'true';
  });
  const [lastAddedSupplier, setLastAddedSupplier] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dataVersion, setDataVersion] = useState(0);

  const triggerRefresh = () => {
    setDataVersion(v => v + 1);
  };

  // Modals state
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalPrefillSupplierId, setArrivalPrefillSupplierId] = useState(null);
  const [arrivalToEdit, setArrivalToEdit] = useState(null);

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchToEdit, setDispatchToEdit] = useState(null);

  const [showEpTransferModal, setShowEpTransferModal] = useState(false);
  const [showOpeningStockModal, setShowOpeningStockModal] = useState(false);

  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  const [settlementPrefillSupplierId, setSettlementPrefillSupplierId] = useState(null);
  const [showCommodityModal, setShowCommodityModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  const [triggerNewInTab, setTriggerNewInTab] = useState(0);
  const [triggerExportInTab, setTriggerExportInTab] = useState(0);

  const openNewArrival = (supId = null) => {
    setArrivalToEdit(null);
    setArrivalPrefillSupplierId(supId);
    setShowArrivalModal(true);
  };

  const openEditArrival = (arrival) => {
    setArrivalToEdit(arrival);
    setArrivalPrefillSupplierId(null);
    setShowArrivalModal(true);
  };

  const openNewDispatch = () => {
    setDispatchToEdit(null);
    setShowDispatchModal(true);
  };

  const openEditDispatch = (disp) => {
    setDispatchToEdit(disp);
    setShowDispatchModal(true);
  };

  const closeAllModals = () => {
    setShowArrivalModal(false);
    setShowDispatchModal(false);
    setShowEpTransferModal(false);
    setShowOpeningStockModal(false);
    setShowLedgerModal(false);
    setShowCommodityModal(false);
    setShowSettingsModal(false);
    setShowSupplierModal(false);
    setArrivalToEdit(null);
    setDispatchToEdit(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }

      const key = e.key.toUpperCase();
      const isAltOrCtrl = e.altKey || e.ctrlKey;

      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'F9') {
        e.preventDefault();
        setShowSupplierModal(true);
      }
      else if ((isAltOrCtrl && key === 'A') || e.key === 'F2') {
        e.preventDefault();
        closeAllModals();
        openNewArrival(null);
      }
      else if ((isAltOrCtrl && key === 'K') || e.key === 'F10') {
        e.preventDefault();
        closeAllModals();
        openNewDispatch();
      }
      else if ((isAltOrCtrl && key === 'S') || e.key === 'F3') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('suppliers');
      }
      else if ((isAltOrCtrl && key === 'W') || e.key === 'F4') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('settlement');
      }
      else if ((isAltOrCtrl && key === 'P') || e.key === 'F5') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('payments');
        setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
      }
      else if ((isAltOrCtrl && key === 'C') || e.key === 'F6') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('commitments');
        setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
      }
      else if ((isAltOrCtrl && key === 'R') || e.key === 'F7') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('reports');
      }
      else if ((isAltOrCtrl && key === 'D') || e.key === 'F1') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('dashboard');
      }
      else if (isAltOrCtrl && key === 'E') {
        e.preventDefault();
        setTriggerExportInTab(v => v + 1);
      }
      else if (e.key === 'F8') {
        e.preventDefault();
        setShowCommodityModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleOpenLedger = (supId) => {
    setSelectedSupplierId(supId);
    setShowLedgerModal(true);
  };

  const handleOpenSettlementFromLedger = (supId) => {
    setSettlementPrefillSupplierId(supId);
    setActiveTab('settlement');
  };

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLoginSuccess={() => {
          sessionStorage.setItem('coffee_auth', 'true');
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => { closeAllModals(); setActiveTab(tab); }}
        onOpenNewArrival={() => { closeAllModals(); setArrivalPrefillSupplierId(null); setShowArrivalModal(true); }}
        onOpenCommodity={() => setShowCommodityModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLock={() => {
          sessionStorage.removeItem('coffee_auth');
          setIsAuthenticated(false);
        }}
      />

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top Navigation Bar */}
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {activeTab === 'dashboard' && '🏢 Executive Dashboard'}
              {activeTab === 'arrivals' && '🚛 Coffee Arrival Management (Purchases)'}
              {activeTab === 'dispatches' && '📤 Dispatches & Sales Management'}
              {activeTab === 'suppliers' && '👥 Supplier & Customer Master Accounts'}
              {activeTab === 'settlement' && '⚖️ Storage Coffee Settlement Wizard'}
              {activeTab === 'payments' && '💳 Payment & TCS Management'}
              {activeTab === 'commitments' && '🤝 Purchase & Sales Commitments'}
              {activeTab === 'reports' && '📊 Financial & Stock Reports'}
            </h1>
          </div>

          <div className="topbar-right">
            <button 
              className="btn btn-warning btn-sm"
              style={{ background: '#0284c7', borderColor: '#0284c7', color: '#fff' }}
              onClick={() => setShowOpeningStockModal(true)}
            >
              📦 Opening Stock
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              style={{ color: '#2563eb', borderColor: '#bfdbfe' }}
              onClick={() => setShowEpTransferModal(true)}
            >
              ⇄ EP Transfer
            </button>
            <button 
              className="btn btn-coffee btn-sm"
              onClick={() => openNewDispatch()}
            >
              + New Dispatch (F10)
            </button>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => { closeAllModals(); setArrivalPrefillSupplierId(null); setShowArrivalModal(true); }}
            >
              + New Arrival (F2)
            </button>
          </div>
        </header>

        <main className="content-scroll">
          {activeTab === 'dashboard' && (
            <Dashboard
              dataVersion={dataVersion}
              onOpenNewArrival={() => openNewArrival(null)}
              onEditArrival={openEditArrival}
              onSelectSupplier={handleOpenLedger}
              onOpenSettlement={() => setActiveTab('settlement')}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'arrivals' && (
            <Dashboard
              dataVersion={dataVersion}
              onOpenNewArrival={() => openNewArrival(null)}
              onEditArrival={openEditArrival}
              onSelectSupplier={handleOpenLedger}
              onOpenSettlement={() => setActiveTab('settlement')}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'dispatches' && (
            <DispatchesView
              dataVersion={dataVersion}
              onOpenNewDispatch={openNewDispatch}
              onEditDispatch={openEditDispatch}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'suppliers' && (
            <SuppliersView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
              onAddArrivalForSupplier={(supId) => openNewArrival(supId)}
              onOpenNewSupplier={() => setShowSupplierModal(true)}
            />
          )}

          {activeTab === 'settlement' && (
            <SettlementWizard
              dataVersion={dataVersion}
              prefilledSupplierId={settlementPrefillSupplierId}
              onSettled={triggerRefresh}
              onOpenNewSupplier={() => setShowSupplierModal(true)}
            />
          )}

          {activeTab === 'commitments' && (
            <CommitmentsView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
              onOpenNewSupplier={() => setShowSupplierModal(true)}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
              onOpenNewSupplier={() => setShowSupplierModal(true)}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView dataVersion={dataVersion} triggerExport={triggerExportInTab} />
          )}
        </main>

        <ShortcutsBar />
      </div>

      {/* MODALS */}
      <ArrivalEntryModal
        isOpen={showArrivalModal}
        onClose={() => { setShowArrivalModal(false); setArrivalToEdit(null); }}
        prefilledSupplierId={arrivalPrefillSupplierId}
        arrivalToEdit={arrivalToEdit}
        onSaved={triggerRefresh}
        onOpenNewSupplier={() => setShowSupplierModal(true)}
        dataVersion={dataVersion}
        lastAddedSupplier={lastAddedSupplier}
      />

      <DispatchEntryModal
        isOpen={showDispatchModal}
        onClose={() => { setShowDispatchModal(false); setDispatchToEdit(null); }}
        dispatchToEdit={dispatchToEdit}
        onSaved={triggerRefresh}
        onOpenNewSupplier={() => setShowSupplierModal(true)}
        dataVersion={dataVersion}
      />

      <EPTransferModal
        isOpen={showEpTransferModal}
        onClose={() => setShowEpTransferModal(false)}
        onSaved={triggerRefresh}
        onOpenNewSupplier={() => setShowSupplierModal(true)}
      />

      <OpeningStockModal
        isOpen={showOpeningStockModal}
        onClose={() => setShowOpeningStockModal(false)}
        onSaved={triggerRefresh}
      />

      <SupplierLedgerModal
        isOpen={showLedgerModal}
        onClose={() => setShowLedgerModal(false)}
        supplierId={selectedSupplierId}
        onDataChanged={triggerRefresh}
        onOpenArrivalWithSupplier={(supId) => openNewArrival(supId)}
        onOpenEditArrival={openEditArrival}
        onOpenSettlementWithSupplier={handleOpenSettlementFromLedger}
      />

      <CommodityModal
        isOpen={showCommodityModal}
        onClose={() => setShowCommodityModal(false)}
        onAdded={triggerRefresh}
      />

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <SupplierCreateModal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        onAdded={(newSup) => {
          setLastAddedSupplier(newSup);
          triggerRefresh();
        }}
      />
    </div>
  );
}
