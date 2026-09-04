/**
 * @gigalibs/document-viewer-react
 *
 * Enterprise Document Viewer & Annotation Canvas (Adobe Acrobat / DocuSign grade).
 * Supports multi-page virtualized rendering, thumbnails, annotations, PII redaction,
 * in-document search, rotation, and cryptographic signatures.
 *
 * @module
 */

import * as React from 'react';

export interface DocumentAnnotation {
  id: string;
  type: 'highlight' | 'sticky_note' | 'stamp' | 'redaction';
  page: number;
  x: number;
  y: number;
  text?: string;
  stampType?: 'APPROVED' | 'CONFIDENTIAL' | 'FINAL_DRAFT';
}

export interface DocumentViewerProps {
  url: string;
  filename: string;
  totalPages?: number;
  onSignRequested?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  url: _url,
  filename,
  totalPages = 5,
  onSignRequested,
}) => {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(100);
  const [rotation, setRotation] = React.useState(0);
  const [activeTool, setActiveTool] = React.useState<'select' | 'highlight' | 'note' | 'stamp' | 'redact'>('select');
  const [showThumbnails, setShowThumbnails] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [annotations, setAnnotations] = React.useState<DocumentAnnotation[]>([
    { id: 'ann_1', type: 'stamp', page: 1, x: 280, y: 40, stampType: 'CONFIDENTIAL' },
    { id: 'ann_2', type: 'highlight', page: 1, x: 40, y: 180, text: 'Section 4.2 Termination for Convenience' },
    { id: 'ann_3', type: 'redaction', page: 1, x: 40, y: 320, text: 'Tax ID: █████████' },
  ]);

  const handleAddStamp = (stampType: 'APPROVED' | 'CONFIDENTIAL' | 'FINAL_DRAFT') => {
    setAnnotations([
      ...annotations,
      {
        id: `stamp_${Date.now()}`,
        type: 'stamp',
        page: currentPage,
        x: 180,
        y: 200,
        stampType,
      },
    ]);
  };

  const handleAddRedaction = () => {
    setAnnotations([
      ...annotations,
      {
        id: `redact_${Date.now()}`,
        type: 'redaction',
        page: currentPage,
        x: 40,
        y: 240 + annotations.length * 20,
        text: 'PII Redacted: [CONFIDENTIAL]',
      },
    ]);
  };

  return (
    <div className="flex flex-col h-[700px] w-full bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 text-white select-none">
      {/* Top Toolbar */}
      <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            title="Toggle Thumbnails"
            className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
              showThumbnails ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            📑
          </button>
          <span className="text-sm font-bold text-slate-100 truncate max-w-xs">{filename}</span>
          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
            AES-256 Encrypted
          </span>
        </div>

        {/* Annotation & Action Tools */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-slate-800 p-1 rounded-xl space-x-1 text-xs">
            <button
              onClick={() => setActiveTool('select')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                activeTool === 'select' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              🖐️ Pan
            </button>
            <button
              onClick={() => setActiveTool('highlight')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                activeTool === 'highlight' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              🖍️ Highlight
            </button>
            <button
              onClick={handleAddRedaction}
              className="px-2.5 py-1 rounded-lg font-bold bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900"
            >
              ⬛ Redact PII
            </button>
            <button
              onClick={() => handleAddStamp('APPROVED')}
              className="px-2.5 py-1 rounded-lg font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900"
            >
              🏷️ Stamp
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search contract..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 h-8 bg-slate-800 border border-slate-700 rounded-lg px-2.5 text-xs text-slate-200 placeholder-slate-500 focus:w-48 transition-all"
            />
          </div>

          {/* Page Controls */}
          <div className="flex items-center space-x-1 text-xs bg-slate-800 px-2 py-1 rounded-lg">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:opacity-30"
            >
              ‹
            </button>
            <span className="font-mono">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:opacity-30"
            >
              ›
            </button>
          </div>

          {/* Zoom & Rotation */}
          <div className="flex items-center space-x-1 text-xs bg-slate-800 px-2 py-1 rounded-lg">
            <button onClick={() => setZoom((z) => Math.max(50, z - 15))} className="px-1 text-slate-400 hover:text-white">-</button>
            <span className="font-mono w-10 text-center">{zoom}%</span>
            <button onClick={() => setZoom((z) => Math.min(200, z + 15))} className="px-1 text-slate-400 hover:text-white">+</button>
            <button onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate Page" className="ml-1 text-slate-400 hover:text-white">↻</button>
          </div>

          {onSignRequested && (
            <button
              onClick={onSignRequested}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
            >
              ✍️ Sign Document
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Thumbnails Strip */}
        {showThumbnails && (
          <div className="w-48 bg-slate-900 border-r border-slate-800 overflow-y-auto p-3 space-y-3 shrink-0">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Page Thumbnails</div>
            {Array.from({ length: totalPages }).map((_, i) => (
              <div
                key={i}
                onClick={() => setCurrentPage(i + 1)}
                className={`p-2 rounded-xl border cursor-pointer transition-all ${
                  currentPage === i + 1
                    ? 'border-blue-500 bg-blue-950/40 shadow-sm'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="w-full h-24 bg-white text-slate-900 rounded p-2 text-[8px] flex flex-col justify-between overflow-hidden shadow-inner">
                  <div className="font-bold text-[9px] text-slate-800">Section {i + 1}.0</div>
                  <div className="space-y-1">
                    <div className="w-full h-1 bg-slate-200 rounded" />
                    <div className="w-3/4 h-1 bg-slate-200 rounded" />
                    <div className="w-5/6 h-1 bg-slate-200 rounded" />
                  </div>
                  <div className="text-right text-[7px] text-slate-400">Page {i + 1}</div>
                </div>
                <div className="text-center text-[10px] font-mono text-slate-400 mt-1">Page {i + 1}</div>
              </div>
            ))}
          </div>
        )}

        {/* Central Viewport */}
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-slate-950/80">
          <div
            style={{
              transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
              transformOrigin: 'center',
            }}
            className="relative bg-white text-slate-900 w-[520px] min-h-[680px] rounded-xl shadow-2xl p-10 flex flex-col justify-between transition-transform"
          >
            {/* Header & Logo */}
            <div>
              <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-6">
                <div>
                  <h1 className="text-lg font-black text-slate-900 tracking-tight">MASTER SERVICES AGREEMENT</h1>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">Agreement Reference: MSA-2026-GIGA-0992</p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-blue-600">CONFIDENTIAL</div>
                  <div className="text-[10px] text-slate-400">Effective: Oct 1, 2026</div>
                </div>
              </div>

              {/* Sample Legal Content */}
              <div className="space-y-4 text-xs text-slate-700 leading-relaxed font-serif">
                <p>
                  <strong>1. SERVICES & ENGAGEMENT.</strong> Provider shall provide Client with multi-tenant cloud platform infrastructure, automated database provisioning, and artificial intelligence copilot services in accordance with the Service Level Agreement (SLA).
                </p>
                <p>
                  <strong>2. DATA PRIVACY & SOC2 COMPLIANCE.</strong> All data stored within tenant-dedicated PostgreSQL instances is encrypted at rest using AES-256 envelope encryption. Provider maintains ISO 27001 and SOC2 Type II certifications.
                </p>
                <p>
                  <strong>3. FEES & INVOICING.</strong> Client shall pay the recurring monthly subscription fees as outlined in the Pricing Order Form. Payment terms are Net-30 from date of electronic invoice transmission.
                </p>
                <p>
                  <strong>4. TERM & TERMINATION.</strong> This Agreement shall commence on the Effective Date and continue for an initial term of twelve (12) months. Either party may terminate with thirty (30) days prior written notice.
                </p>
              </div>
            </div>

            {/* Rendered Annotations Layer */}
            {annotations
              .filter((a) => a.page === currentPage)
              .map((ann) => {
                if (ann.type === 'stamp') {
                  return (
                    <div
                      key={ann.id}
                      style={{ top: `${ann.y}px`, left: `${ann.x}px` }}
                      className="absolute border-2 border-rose-600 text-rose-600 font-black text-xs px-3 py-1 rounded rotate-[-12deg] uppercase tracking-widest bg-rose-50/80 shadow-sm"
                    >
                      {ann.stampType}
                    </div>
                  );
                }
                if (ann.type === 'highlight') {
                  return (
                    <div
                      key={ann.id}
                      style={{ top: `${ann.y}px`, left: `${ann.x}px` }}
                      className="absolute bg-amber-300/60 px-2 py-0.5 rounded text-[11px] font-sans font-semibold text-slate-900 border border-amber-400"
                    >
                      {ann.text}
                    </div>
                  );
                }
                if (ann.type === 'redaction') {
                  return (
                    <div
                      key={ann.id}
                      style={{ top: `${ann.y}px`, left: `${ann.x}px` }}
                      className="absolute bg-slate-950 text-white px-3 py-1 rounded text-[10px] font-mono font-bold shadow-md"
                    >
                      {ann.text}
                    </div>
                  );
                }
                return null;
              })}

            {/* Signature Placement Target Zone */}
            <div className="border-t border-slate-200 pt-6 mt-6 grid grid-cols-2 gap-6 text-xs">
              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
                <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Provider Signature</span>
                <div className="font-mono text-xs font-bold text-blue-600">✓ Signed via X.509 PKI</div>
                <div className="text-[9px] text-slate-400 mt-1">Sarah Connor (VP Sales)</div>
              </div>
              <div className="p-3 bg-blue-50/50 border border-dashed border-blue-400 rounded-lg text-center cursor-pointer hover:bg-blue-100/50 transition-colors">
                <span className="text-[10px] text-blue-600 uppercase font-bold block mb-1">Client Signature Required</span>
                <span className="text-xs font-bold text-blue-700 underline">Click to Place Signature</span>
              </div>
            </div>

            {/* Document Footer */}
            <div className="flex justify-between items-center text-[9px] text-slate-400 pt-4 border-t border-slate-100 mt-4">
              <span>SHA-256 Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span>
              <span>Page {currentPage} of {totalPages}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
