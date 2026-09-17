// CSV Export Utility for Accounts and Supplier Ledgers
import { dbAction } from './api';

export async function exportToCsv(filename, headers, rows) {
  // Build CSV content
  const escapeCell = (cell) => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(h => escapeCell(h.label || h.key)).join(',');
  const rowLines = rows.map(row => {
    return headers.map(h => escapeCell(row[h.key])).join(',');
  });

  const csvContent = [headerLine, ...rowLines].join('\r\n');

  // Try Electron native Save Dialog first
  try {
    if (window.api && window.api.invoke) {
      const res = await dbAction('dialog:save-file', {
        defaultName: filename.endsWith('.csv') ? filename : `${filename}.csv`,
        content: csvContent,
        ext: 'csv'
      });
      if (res && res.success) {
        return { success: true, path: res.path };
      }
      if (res && res.canceled) {
        return { canceled: true };
      }
    }
  } catch (e) {
    console.warn('Native save dialog failed, falling back to browser download:', e);
  }

  // Browser Blob download fallback
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return { success: true };
}
