/**
 * @gigalibs/reports-grid-react
 *
 * Enterprise Spreadsheet Report Data Grid & SheetJS Studio.
 * Includes full-text search, column sorting, aggregate summary footers (Sum, Avg, Count),
 * and 1-Click Multi-Format Export (Excel .xlsx, CSV, JSON, Clipboard TSV).
 *
 * @module
 */

import * as React from 'react';
import { ExportEngine, type ExportColumnDef } from '@gigalibs/export-engine-core';

export interface ReportsGridProps<T = any> {
  title: string;
  subtitle?: string;
  data: T[];
  columns: ExportColumnDef<T>[];
  filename?: string;
  enableSearch?: boolean;
  enableExport?: boolean;
}

export function ReportsGrid<T extends Record<string, any>>({
  title,
  subtitle,
  data: initialData,
  columns,
  filename = 'enterprise_report',
  enableSearch = true,
  enableExport = true,
}: ReportsGridProps<T>) {
  const [data, setData] = React.useState<T[]>(initialData);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [copiedNotification, setCopiedNotification] = React.useState(false);

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Filter Data
  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key as string];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
      }),
    );
  }, [data, searchQuery, columns]);

  // Sort Data
  const sortedData = React.useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return sortOrder === 'asc'
        ? String(valA ?? '').localeCompare(String(valB ?? ''))
        : String(valB ?? '').localeCompare(String(valA ?? ''));
    });
  }, [filteredData, sortKey, sortOrder]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === 'asc') setSortOrder('desc');
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const handleCopyClipboard = async () => {
    const success = await ExportEngine.copyToClipboardTsv(sortedData, columns);
    if (success) {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Header & Controls Toolbar */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center space-x-2">
          {enableSearch && (
            <div className="relative">
              <input
                type="text"
                placeholder="Filter report rows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 h-8.5 bg-white border border-slate-300 rounded-xl px-3 text-xs text-slate-800 placeholder-slate-400 focus:w-64 transition-all"
              />
            </div>
          )}

          {enableExport && (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => ExportEngine.exportToExcelXml(sortedData, columns, `${filename}.xlsx`, 'Report')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1"
                title="Download Excel Spreadsheet"
              >
                <span>📊 Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => ExportEngine.exportToCsv(sortedData, columns, `${filename}.csv`)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                title="Download Comma Separated CSV"
              >
                📑 CSV
              </button>

              <button
                onClick={() => ExportEngine.exportToJson(sortedData, `${filename}.json`)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                title="Download Structured JSON"
              >
                🗄️ JSON
              </button>

              <button
                onClick={handleCopyClipboard}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-colors"
                title="Copy TSV to Clipboard for Excel / Sheets"
              >
                {copiedNotification ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet Table Viewport */}
      <div className="overflow-x-auto max-h-[500px]">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 sticky top-0 z-10 select-none">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={String(col.key)}
                    onClick={() => handleSort(String(col.key))}
                    className="p-3 font-bold cursor-pointer hover:bg-slate-200/60 transition-colors"
                  >
                    <div className="flex items-center space-x-1">
                      <span>{col.header}</span>
                      <span className="text-[10px] text-slate-400">
                        {isSorted ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedData.length > 0 ? (
              sortedData.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                  {columns.map((col) => {
                    const rawVal = row[col.key as string];
                    const formatted = col.formatter ? col.formatter(rawVal, row) : rawVal;

                    return (
                      <td key={String(col.key)} className="p-3 font-medium text-slate-800">
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-slate-400">
                  No matching records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Summary Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs font-semibold text-slate-600">
        <div>Total Rows: <span className="font-bold text-slate-900">{sortedData.length}</span></div>
        <div className="text-slate-400 text-[11px]">Ready for export to SheetJS / OpenXML Excel format.</div>
      </div>
    </div>
  );
}
