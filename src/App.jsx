import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ShortcutsBar from './components/ShortcutsBar';
import Dashboard from './components/Dashboard';
import ArrivalsView from './components/ArrivalsView';
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
import StockManagementView from './components/StockManagementView';
import LoginScreen from './components/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import CalculatorSidebar from './components/CalculatorSidebar';

function getFieldLabel(element) {
  if (!element) return 'Active Field';
  if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');
  if (element.title) return element.title;
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label && label.innerText) return label.innerText.replace(/\*|:/g, '').trim();
  }
  const formGroup = element.closest('.form-group') || element.closest('td') || element.parentElement;
  if (formGroup) {
    const label = formGroup.querySelector('label') || formGroup.querySelector('.form-label');
    if (label && label.innerText) return label.innerText.replace(/\*|:/g, '').trim();
  }
  if (element.placeholder) return element.placeholder;
  if (element.name) return element.name;
  return 'Active Field';
}


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

  // Calculator State
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcTargetElement, setCalcTargetElement] = useState(null);
  const [calcTargetLabel, setCalcTargetLabel] = useState('');

  const toggleCalculator = () => {
    setShowCalculator(prev => {
      if (!prev) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !active.disabled && !active.readOnly) {
          setCalcTargetElement(active);
          setCalcTargetLabel(getFieldLabel(active));
        } else {
          setCalcTargetElement(null);
          setCalcTargetLabel('');
        }
        return true;
      } else {
        return false;
      }
    });
  };

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
      // Calculator shortcuts: F11 anywhere, or Alt+C when focused inside an input field
      const isInputFocused = document.activeElement && 
        (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') &&
        !document.activeElement.disabled && !document.activeElement.readOnly;

      if (e.key === 'F11' || (e.altKey && (e.key === 'c' || e.key === 'C') && isInputFocused)) {
        e.preventDefault();
        e.stopPropagation();
        toggleCalculator();
        return;
      }

      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }

      const key = e.key.toUpperCase();
      const isAltOrCtrl = e.altKey || e.ctrlKey;

      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11'].includes(e.key)) {
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
      else if ((isAltOrCtrl && key === 'G') || e.key === 'F8') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('stock');
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
        onOpenNewDispatch={() => { closeAllModals(); openNewDispatch(); }}
        onOpenCommodity={() => setShowCommodityModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onDataChanged={triggerRefresh}
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
              {activeTab === 'dashboard' && '🏢 Executive ERP Dashboard'}
              {activeTab === 'arrivals' && '🚛 Inward Commodity Arrivals (Purchases)'}
              {activeTab === 'dispatches' && '📤 Outward Dispatches & Sales Management'}
              {activeTab === 'suppliers' && '👥 Party Accounts Master & Ledgers (Buyers & Sellers)'}
              {activeTab === 'stock' && '🏢 Godown Stock & Commodity Processing Hub'}
              {activeTab === 'settlement' && '⚖️ Storage Commodity Settlement Wizard'}
              {activeTab === 'payments' && '💳 Payment & TCS Management'}
              {activeTab === 'commitments' && '🤝 Purchase & Sales Commitments'}
              {activeTab === 'reports' && '📑 Sales & Purchase Settlement Reports'}
            </h1>
          </div>

          <div className="topbar-right">
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
              onOpenNewDispatch={openNewDispatch}
              onEditArrival={openEditArrival}
              onSelectSupplier={handleOpenLedger}
              onOpenSettlement={() => setActiveTab('settlement')}
              onOpenCommitment={() => { setActiveTab('commitments'); setTimeout(() => setTriggerNewInTab(v => v + 1), 50); }}
              onOpenPayment={() => { setActiveTab('payments'); setTimeout(() => setTriggerNewInTab(v => v + 1), 50); }}
              onOpenCommodity={() => setShowCommodityModal(true)}
              onOpenOpeningStock={() => setShowOpeningStockModal(true)}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'arrivals' && (
            <ArrivalsView
              dataVersion={dataVersion}
              onOpenNewArrival={() => openNewArrival(null)}
              onEditArrival={openEditArrival}
              onSelectSupplier={handleOpenLedger}
              onOpenSettlement={() => setActiveTab('settlement')}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'dispatches' && (
            <ErrorBoundary name="Dispatches & Sales" onRetry={triggerRefresh}>
              <DispatchesView
                dataVersion={dataVersion}
                onOpenNewDispatch={openNewDispatch}
                onEditDispatch={openEditDispatch}
                onSelectSupplier={handleOpenLedger}
                triggerNew={triggerNewInTab}
                triggerExport={triggerExportInTab}
              />
            </ErrorBoundary>
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

          {activeTab === 'stock' && (
            <StockManagementView
              onOpenLedger={handleOpenLedger}
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
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
            <ReportsView
              dataVersion={dataVersion}
              triggerExport={triggerExportInTab}
              onOpenSettlement={() => setActiveTab('settlement')}
            />
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
        lastAddedSupplier={lastAddedSupplier}
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

      <ErrorBoundary name="Party Ledger Modal" onRetry={() => setShowLedgerModal(false)}>
        <SupplierLedgerModal
          isOpen={showLedgerModal}
          onClose={() => setShowLedgerModal(false)}
          supplierId={selectedSupplierId}
          onDataChanged={triggerRefresh}
          onOpenArrivalWithSupplier={(supId) => openNewArrival(supId)}
          onOpenEditArrival={openEditArrival}
          onOpenEditDispatch={openEditDispatch}
          onOpenSettlementWithSupplier={handleOpenSettlementFromLedger}
        />
      </ErrorBoundary>

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

      {/* Persistent Right-Edge Calculator Floating Tab */}
      {!showCalculator && (
        <button
          type="button"
          onClick={toggleCalculator}
          className="calculator-floating-tab"
          title="Open Quick Calculator (F11 / Alt+C in input)"
          style={{
            position: 'fixed',
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 9998,
            background: 'linear-gradient(180deg, #1e293b, #0f172a)',
            color: '#38bdf8',
            border: '1px solid #334155',
            borderRight: 'none',
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
            padding: '10px 7px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            boxShadow: '-3px 2px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s ease',
            fontSize: '0.72rem',
            fontWeight: 700
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#2563eb';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.transform = 'translateY(-50%) translateX(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'linear-gradient(180deg, #1e293b, #0f172a)';
            e.currentTarget.style.color = '#38bdf8';
            e.currentTarget.style.transform = 'translateY(-50%)';
          }}
        >
          <span style={{ fontSize: '1.2rem' }}>🧮</span>
          <span style={{ writingMode: 'vertical-rl', letterSpacing: '1px', textOrientation: 'mixed' }}>CALC</span>
          <span style={{ fontSize: '0.62rem', background: '#334155', color: '#e2e8f0', padding: '2px 4px', borderRadius: '3px' }}>F11</span>
        </button>
      )}

      {/* Quick Calculator Sidebar */}
      <CalculatorSidebar
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        targetElement={calcTargetElement}
        targetLabel={calcTargetLabel}
        onPasted={() => {
          // target received paste
        }}
      />
    </div>
  );
}
