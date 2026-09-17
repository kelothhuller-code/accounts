import React from 'react';

export default function ShortcutsBar() {
  const shortcuts = [
    { key: 'F1 / Alt+D', label: 'Dashboard' },
    { key: 'F2 / Alt+A', label: 'New Arrival' },
    { key: 'F3 / Alt+S', label: 'Suppliers' },
    { key: 'F4 / Alt+W', label: 'Settle Storage' },
    { key: 'F5 / Alt+P', label: 'Payments' },
    { key: 'F6 / Alt+C', label: 'Commitments' },
    { key: 'F7 / Alt+R', label: 'Reports' },
    { key: 'F8', label: 'Add Commodity' },
    { key: 'Alt+E', label: 'Export CSV' },
    { key: 'Esc', label: 'Close Modal' },
  ];

  return (
    <footer className="shortcuts-bar">
      <span style={{ fontWeight: 600, color: '#f8fafc', marginRight: '0.5rem' }}>SHORTCUTS:</span>
      {shortcuts.map((s, idx) => (
        <div key={idx} className="shortcut-pill">
          <kbd>{s.key}</kbd>
          <span>{s.label}</span>
        </div>
      ))}
    </footer>
  );
}
