import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ShortcutsBar from './components/ShortcutsBar';
import Dashboard from './components/Dashboard';
import SuppliersView from './components/SuppliersView';
import SupplierLedgerModal from './components/SupplierLedgerModal';
import ArrivalEntryModal from './components/ArrivalEntryModal';
import SettlementWizard from './components/SettlementWizard';
import CommitmentsView from './components/CommitmentsView';
import PaymentsView from './components/PaymentsView';
import ReportsView from './components/ReportsView';
import CommodityModal from './components/CommodityModal';
import SettingsModal from './components/SettingsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dataVersion, setDataVersion] = useState(0);

  // Trigger automatic global screen refresh whenever data changes
  const triggerRefresh = () => {
    setDataVersion(v => v + 1);
  };

  // Modals
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [arrivalPrefillSupplierId, setArrivalPrefillSupplierId] = useState(null);
  const [arrivalToEdit, setArrivalToEdit] = useState(null); // null = new, object = edit mode

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

  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  const [settlementPrefillSupplierId, setSettlementPrefillSupplierId] = useState(null);

  const [showCommodityModal, setShowCommodityModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // For contextual Alt+N (suppliers tab -> new supplier, payments -> new payment, etc.)
  const [triggerNewInTab, setTriggerNewInTab] = useState(0);
  const [triggerExportInTab, setTriggerExportInTab] = useState(0);

  const closeAllModals = () => {
    setShowArrivalModal(false);
    setShowLedgerModal(false);
    setShowCommodityModal(false);
    setShowSettingsModal(false);
    setArrivalToEdit(null);
  };

  // Keyboard shortcut listener (In-app keydown + Electron IPC)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Esc closes all modals
      if (e.key === 'Escape') {
        closeAllModals();
        return;
      }

      const key = e.key.toUpperCase();
      const isAltOrCtrl = e.altKey || e.ctrlKey;

      // Prevent browser default on navigation function keys
      if (['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(e.key)) {
        e.preventDefault();
      }

      // Alt+A, Ctrl+A or F2: New Arrival
      if ((isAltOrCtrl && key === 'A') || e.key === 'F2') {
        e.preventDefault();
        closeAllModals();
        openNewArrival(null);
      }
      // Alt+S, Ctrl+S or F3: Suppliers
      else if ((isAltOrCtrl && key === 'S') || e.key === 'F3') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('suppliers');
      }
      // Alt+W, Ctrl+W or F4: Settlement Wizard
      else if ((isAltOrCtrl && key === 'W') || e.key === 'F4') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('settlement');
      }
      // Alt+P, Ctrl+P or F5: Payments
      else if ((isAltOrCtrl && key === 'P') || e.key === 'F5') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('payments');
        setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
      }
      // Alt+C, Ctrl+C or F6: Commitments
      else if ((isAltOrCtrl && key === 'C') || e.key === 'F6') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('commitments');
        setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
      }
      // Alt+R, Ctrl+R or F7: Reports
      else if ((isAltOrCtrl && key === 'R') || e.key === 'F7') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('reports');
      }
      // Alt+D, Ctrl+D or F1: Dashboard
      else if ((isAltOrCtrl && key === 'D') || e.key === 'F1') {
        e.preventDefault();
        closeAllModals();
        setActiveTab('dashboard');
      }
      // Alt+N: Contextual New (arrival if on dashboard/arrivals, else trigger tab's new)
      else if (isAltOrCtrl && key === 'N') {
        e.preventDefault();
        if (activeTab === 'dashboard' || activeTab === 'arrivals') {
          closeAllModals();
          openNewArrival(null);
        } else {
          setTriggerNewInTab(v => v + 1);
        }
      }
      // Alt+E: Export CSV for current view
      else if (isAltOrCtrl && key === 'E') {
        e.preventDefault();
        setTriggerExportInTab(v => v + 1);
      }
      // F8: Quick Add Commodity
      else if (e.key === 'F8') {
        e.preventDefault();
        setShowCommodityModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    // Electron IPC shortcut listener from main process before-input-event
    let unsubscribe = null;
    if (window.api && window.api.on) {
      unsubscribe = window.api.on('shortcut-triggered', (action) => {
        if (action === 'nav-arrival') {
          closeAllModals();
          openNewArrival(null);
        } else if (action === 'nav-suppliers') {
          closeAllModals();
          setActiveTab('suppliers');
        } else if (action === 'nav-settlement') {
          closeAllModals();
          setActiveTab('settlement');
        } else if (action === 'nav-payments') {
          closeAllModals();
          setActiveTab('payments');
          setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
        } else if (action === 'nav-commitments') {
          closeAllModals();
          setActiveTab('commitments');
          setTimeout(() => setTriggerNewInTab(v => v + 1), 50);
        } else if (action === 'nav-reports') {
          closeAllModals();
          setActiveTab('reports');
        } else if (action === 'nav-dashboard') {
          closeAllModals();
          setActiveTab('dashboard');
        } else if (action === 'shortcut-new') {
          // Contextual new
          setTriggerNewInTab(v => v + 1);
        } else if (action === 'export-csv') {
          setTriggerExportInTab(v => v + 1);
        } else if (action === 'quick-add-product') {
          setShowCommodityModal(true);
        } else if (action === 'close-modal') {
          closeAllModals();
        }
      });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleOpenLedger = (supId) => {
    setSelectedSupplierId(supId);
    setShowLedgerModal(true);
  };

  const handleOpenSettlementFromLedger = (supId) => {
    setSettlementPrefillSupplierId(supId);
    setActiveTab('settlement');
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => { closeAllModals(); setActiveTab(tab); }}
        onOpenNewArrival={() => { closeAllModals(); setArrivalPrefillSupplierId(null); setShowArrivalModal(true); }}
        onOpenCommodity={() => setShowCommodityModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Main Content Viewport */}
      <div className="main-wrapper">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">
              {activeTab === 'dashboard' && 'Coffee Arrivals & Accounting Dashboard'}
              {activeTab === 'arrivals' && 'Arrival Entries & Unfixed Storage'}
              {activeTab === 'suppliers' && 'Supplier Ledger Accounts & Summary'}
              {activeTab === 'settlement' && 'Storage Coffee Settlement Wizard'}
              {activeTab === 'payments' && 'Supplier Payments & TCS Register'}
              {activeTab === 'commitments' && 'Purchase Commitments & Contracts'}
              {activeTab === 'reports' && 'Daily Arrivals & Accounting Reports'}
            </h1>
          </div>

          <div className="topbar-right">
            <button 
              className="btn btn-coffee btn-sm"
              onClick={() => { closeAllModals(); setArrivalPrefillSupplierId(null); setShowArrivalModal(true); }}
            >
              + New Arrival (Alt+A / F2)
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowCommodityModal(true)}
            >
              + Commodity (F8)
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

          {activeTab === 'suppliers' && (
            <SuppliersView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
              onAddArrivalForSupplier={(supId) => openNewArrival(supId)}
            />
          )}

          {activeTab === 'settlement' && (
            <SettlementWizard
              dataVersion={dataVersion}
              prefilledSupplierId={settlementPrefillSupplierId}
              onSettled={triggerRefresh}
            />
          )}

          {activeTab === 'commitments' && (
            <CommitmentsView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'payments' && (
            <PaymentsView
              dataVersion={dataVersion}
              onDataChanged={triggerRefresh}
              onSelectSupplier={handleOpenLedger}
              triggerNew={triggerNewInTab}
              triggerExport={triggerExportInTab}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView dataVersion={dataVersion} triggerExport={triggerExportInTab} />
          )}
        </main>

        {/* Bottom Tally-style Shortcuts bar */}
        <ShortcutsBar />
      </div>

      {/* MODALS */}
      <ArrivalEntryModal
        isOpen={showArrivalModal}
        onClose={() => { setShowArrivalModal(false); setArrivalToEdit(null); }}
        prefilledSupplierId={arrivalPrefillSupplierId}
        arrivalToEdit={arrivalToEdit}
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
    </div>
  );
}
