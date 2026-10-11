'use client';

import React from 'react';
import { StatusBadge, Badge } from '@medusajs/ui';
import { DailyInspectionChecklistCard } from './DailyInspectionChecklistCard';
import { SpatialEquipmentCard } from './SpatialEquipmentCard';
import { ReportArtifactCard } from './ReportArtifactCard';
import { EmergencyAlertCard } from './EmergencyAlertCard';
import { ModuleHealthMatrixCard } from './ModuleHealthMatrixCard';
import { WorkOrderDraftCard } from './WorkOrderDraftCard';
import { ARAgingSummaryCard } from './ARAgingSummaryCard';
import { WorkflowExecutionCard } from './WorkflowExecutionCard';
import { SagaTransactionCard } from './SagaTransactionCard';
import { FormSchemaBuilderCard } from './FormSchemaBuilderCard';
import { InventoryStockCard } from './InventoryStockCard';
import { ProcurementRequisitionCard } from './ProcurementRequisitionCard';
import { SalesOrderFulfillmentCard } from './SalesOrderFulfillmentCard';
import { SpendApprovalCard } from './SpendApprovalCard';
import { CurrencyConversionCard } from './CurrencyConversionCard';
import { TaxAuditExemptionCard } from './TaxAuditExemptionCard';
import { DocumentOcrScanCard } from './DocumentOcrScanCard';
import { ESignatureEnvelopeCard } from './ESignatureEnvelopeCard';
import { OntologyObjectGraphCard } from './OntologyObjectGraphCard';
import { AutonomousRecoveryCard } from './AutonomousRecoveryCard';
import { ConnectorIntegrationCard } from './ConnectorIntegrationCard';
import { BusinessRuleCard } from './BusinessRuleCard';
import { ClipboardList, AlertCircle, CheckCircle2, Clock, Zap, Wrench, Box } from 'lucide-react';

interface ClaudeStyleMessageRendererProps {
  content: string;
  className?: string;
}

/**
 * ClaudeStyleMessageRenderer parses markdown strings into rich, semantic,
 * high-craft UI elements matching Claude's aesthetic:
 * 1. Converts daily inspection tasks directly into the interactive Generative UI Checklist Card.
 * 2. Converts spatial 3D plant queries into the SpatialEquipmentCard with co-browsing CTA.
 * 3. Converts report exports into the ReportArtifactCard with download, email & analytics CTA.
 * 4. Converts floor emergency alerts into the EmergencyAlertCard with TextFly HITL dispatch.
 * 5. Converts module health queries into the ModuleHealthMatrixCard with diagnostics.
 * 6. Converts emergency maintenance requests into the WorkOrderDraftCard with inventory check.
 * 7. Converts financial/invoice queries into the ARAgingSummaryCard with dunning notice actions.
 */
export function ClaudeStyleMessageRenderer({
  content,
  className,
}: ClaudeStyleMessageRendererProps) {
  if (!content) return null;

  // 1. Daily Inspection Checklist
  const isDailyInspection =
    content.includes('Daily Inspection Checklist') ||
    content.includes('Daily Inspection Routine') ||
    content.includes('INSP-2026-ABC-09');

  if (isDailyInspection) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="flex items-center gap-2 border-b border-zinc-200/80 pb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
              Daily Inspection Checklist — Unit ABC
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
              <span>Shift: Day Operations (08:00–16:00)</span>
              <span>•</span>
              <span>Form: <code className="font-mono text-xs bg-zinc-100 px-1 py-0.5 rounded text-zinc-700">INSP-2026-ABC-09</code></span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-1 shadow-xs">
          <DailyInspectionChecklistCard />
        </div>

        <p className="text-xs text-zinc-500 italic">
          💡 You can toggle checks, enter pump vibration readings, and commit directly to CMMS above.
        </p>
      </div>
    );
  }

  // 2. Spatial Digital Twin / Equipment 3D request / Asset Register
  const isSpatialTwin =
    content.includes('3D Plant Spatial Twin') ||
    content.includes('Plant Spatial Twin') ||
    content.includes('Feed Pump FP-101') ||
    content.includes('PUMP-FP-101') ||
    content.includes('Plant Asset Register Summary') ||
    content.includes('registered asset(s)');

  if (isSpatialTwin) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <SpatialEquipmentCard
          assetTag="PUMP-FP-101"
          assetName="Feed Pump FP-101 (High Pressure)"
          unit="Unit ABC"
          bay="Bay 3"
          status="NOMINAL"
          vibration="1.4 mm/s RMS"
          temperature="58.4 °C"
          pressure="14.2 bar"
          rpm="2,950 RPM"
        />
      </div>
    );
  }

  // 3. Report & Excel Export Artifact
  const isReportArtifact =
    content.includes('Downtime & MTBF Reliability Parameters Report') ||
    content.includes('REP-2026-DT-88') ||
    content.includes('Excel Report Generated');

  if (isReportArtifact) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ReportArtifactCard />
      </div>
    );
  }

  // 4. Floor Safety & Emergency Alert Dispatch
  const isEmergencyAlert =
    content.includes('Floor Safety & Equipment Alert Dispatch') ||
    content.includes('TextFly Emergency Broadcast') ||
    content.includes('Broadcast Floor Alert');

  if (isEmergencyAlert) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <EmergencyAlertCard />
      </div>
    );
  }

  // 5. Multi-Module Health & Diagnostics
  const isModuleHealth =
    content.includes('Multi-Module Operational Diagnostics') ||
    content.includes('PLATFORM-HEALTH') ||
    content.includes('Module Latency & Health Sweep');

  if (isModuleHealth) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ModuleHealthMatrixCard />
      </div>
    );
  }

  // 6. Emergency Work Order Draft
  const isWorkOrderDraft =
    content.includes('Emergency Maintenance Work Order') ||
    content.includes('WO-2026-EM-4890') ||
    content.includes('Draft Work Order Generated');

  if (isWorkOrderDraft) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <WorkOrderDraftCard />
      </div>
    );
  }

  // 7. Accounts Receivable Aging Summary
  const isARAging =
    content.includes('Outstanding Accounts Receivable') ||
    content.includes('AR-AGING-SUMMARY') ||
    content.includes('AR Aging Statement');

  if (isARAging) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ARAgingSummaryCard />
      </div>
    );
  }

  // 8. Workflow Studio Execution
  const isWorkflow =
    content.includes('Critical Asset Preventative Overhaul Pipeline') ||
    content.includes('WF-PUMP-OVERHAUL-09') ||
    content.includes('Workflow Execution');

  if (isWorkflow) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <WorkflowExecutionCard />
      </div>
    );
  }

  // 9. Saga Orchestrator
  const isSaga =
    content.includes('Distributed Procurement & General Ledger Commit Saga') ||
    content.includes('SAGA-2026-PO-991') ||
    content.includes('Compensating Transaction Triggered');

  if (isSaga) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <SagaTransactionCard />
      </div>
    );
  }

  // 10. Universal Forms Studio
  const isFormSchema =
    content.includes('Electrical & Mechanical LOTO Clearance Permit') ||
    content.includes('FRM-LOTO-PERMIT-V2') ||
    content.includes('Dynamic Form Schema');

  if (isFormSchema) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <FormSchemaBuilderCard />
      </div>
    );
  }

  // 11. Universal Inventory
  const isInventory =
    content.includes('BRG-SKF-6312') ||
    content.includes('Deep Groove Ball Bearing 60mm Bore') ||
    content.includes('Inventory Stock Monitor');

  if (isInventory) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <InventoryStockCard />
      </div>
    );
  }

  // 12. Universal Procurement
  const isProcurement =
    content.includes('PR-2026-VALVE-44') ||
    content.includes('Flowserve Fluid Controls Corp') ||
    content.includes('Purchase Requisition');

  if (isProcurement) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ProcurementRequisitionCard />
      </div>
    );
  }

  // 13. Universal Orders
  const isOrders =
    content.includes('SO-2026-TITAN-8821') ||
    content.includes('Sales Order Fulfillment') ||
    content.includes('DHL Freight');

  if (isOrders) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <SalesOrderFulfillmentCard />
      </div>
    );
  }

  // 14. Spend Management
  const isSpend =
    content.includes('SPEND-2026-0419') ||
    content.includes('Emergency Equipment Overhaul & Tooling') ||
    content.includes('Spend Approval Request');

  if (isSpend) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <SpendApprovalCard />
      </div>
    );
  }

  // 15. Multi-Currency
  const isCurrency =
    content.includes('Multi-Currency Hedging & Conversion') ||
    content.includes('USD / EUR') ||
    content.includes('FX Rate Lock');

  if (isCurrency) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <CurrencyConversionCard />
      </div>
    );
  }

  // 16. Tax Configuration
  const isTax =
    content.includes('Apex Heavy Industries BV') ||
    content.includes('VIES-VAL-2026-99') ||
    content.includes('VAT Reverse Charge');

  if (isTax) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <TaxAuditExemptionCard />
      </div>
    );
  }

  // 17. Document Scanner
  const isScanner =
    content.includes('DOC-SCAN-2026-88') ||
    content.includes('Commercial Packing List & Bill of Lading') ||
    content.includes('OCR Extraction');

  if (isScanner) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <DocumentOcrScanCard />
      </div>
    );
  }

  // 18. E-Signature
  const isEsign =
    content.includes('ENV-2026-SLA-991') ||
    content.includes('Industrial Equipment Maintenance SLA Master Agreement') ||
    content.includes('E-Signature Envelope');

  if (isEsign) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ESignatureEnvelopeCard />
      </div>
    );
  }

  // 19. Enterprise Ontology
  const isOntology =
    content.includes('Enterprise Ontology Knowledge Graph') ||
    content.includes('PUMP_EQUIPMENT') ||
    content.includes('Ontology Graph Schema');

  if (isOntology) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <OntologyObjectGraphCard />
      </div>
    );
  }

  // 20. Autonomous Recovery
  const isRecovery =
    content.includes('Autonomous Self-Healing Policy') ||
    content.includes('SVC-SCADA-INGEST-01') ||
    content.includes('Circuit Breaker Tripped');

  if (isRecovery) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <AutonomousRecoveryCard />
      </div>
    );
  }

  // 21. Connector Hub
  const isConnector =
    content.includes('SAP S/4HANA OData & RFC Connector') ||
    content.includes('CONN-SAP-ERP') ||
    content.includes('Universal Connector Integration');

  if (isConnector) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <ConnectorIntegrationCard />
      </div>
    );
  }

  // 22. Business Rule Pro
  const isRule =
    content.includes('Automated Safety LOTO Interlock Trigger Rule') ||
    content.includes('RULE-LOTO-TRIP-01') ||
    content.includes('Business Rule Evaluation');

  if (isRule) {
    return (
      <div className={`space-y-3 ${className ?? ''}`}>
        <div className="space-y-2.5 text-xs leading-relaxed text-zinc-800">
          {renderMarkdownContent(content)}
        </div>
        <BusinessRuleCard />
      </div>
    );
  }

  // Otherwise, render general content with Claude-level markdown parsing
  return (
    <div className={`space-y-2.5 text-xs leading-relaxed text-zinc-800 ${className ?? ''}`}>
      {renderMarkdownContent(content)}
    </div>
  );
}

function renderMarkdownContent(content: string): React.ReactNode[] {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  const flushTable = (key: number) => {
    if (tableBuffer.length > 0) {
      elements.push(renderTable(tableBuffer, `tbl-${key}`));
      tableBuffer = [];
      inTable = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Markdown Table Detection
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableBuffer.push(trimmed);
      return;
    } else if (inTable) {
      flushTable(index);
    }

    // Empty lines
    if (!trimmed) {
      return;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${index}`} className="text-sm font-bold text-zinc-900 mt-3 mb-1 tracking-tight flex items-center gap-1.5">
          {formatInline(trimmed.replace('### ', ''))}
        </h4>,
      );
      return;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${index}`} className="text-base font-bold text-zinc-950 mt-3 mb-1 tracking-tight">
          {formatInline(trimmed.replace('## ', ''))}
        </h3>,
      );
      return;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${index}`} className="text-lg font-bold text-zinc-950 mt-4 mb-2 tracking-tight">
          {formatInline(trimmed.replace('# ', ''))}
        </h2>,
      );
      return;
    }

    // Key-value metadata bar lines (e.g. **Shift:** Day Operations | **Inspector:** ...)
    if (trimmed.startsWith('**') && trimmed.includes('|')) {
      const parts = trimmed.split('|').map((p) => p.trim());
      elements.push(
        <div key={`kv-bar-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200/60 px-3 py-1.5 my-1.5 text-[11px] text-zinc-600">
          {parts.map((part, pIdx) => (
            <React.Fragment key={pIdx}>
              {pIdx > 0 && <span className="text-zinc-300">•</span>}
              <span>{formatInline(part)}</span>
            </React.Fragment>
          ))}
        </div>,
      );
      return;
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={`li-${index}`} className="flex items-start gap-2 pl-1 my-1">
          <span className="text-zinc-400 mt-1 select-none">•</span>
          <span className="flex-1">{formatInline(trimmed.substring(2))}</span>
        </div>,
      );
      return;
    }

    // Numbered lists
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        <div key={`num-${index}`} className="flex items-start gap-2 pl-1 my-1">
          <span className="font-mono text-[10px] font-semibold text-zinc-500 bg-zinc-100 rounded px-1 mt-0.5 select-none">
            {numMatch[1]}
          </span>
          <span className="flex-1">{formatInline(numMatch[2])}</span>
        </div>,
      );
      return;
    }

    // Default paragraph
    elements.push(
      <p key={`p-${index}`} className="text-xs text-zinc-700 leading-relaxed my-1">
        {formatInline(trimmed)}
      </p>,
    );
  });

  if (inTable) {
    flushTable(lines.length);
  }

  return elements;
}

/**
 * Formats inline bold (**text**), code (`code`), and status markers.
 */
function formatInline(text: string): React.ReactNode {
  // Replace [x] and [ ] with badges
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="font-mono text-[11px] bg-zinc-100 border border-zinc-200/60 px-1 py-0.5 rounded text-zinc-800 font-medium">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      if (inner === 'Verified') {
        return <StatusBadge key={idx} color="green" className="inline-flex ml-1">Verified</StatusBadge>;
      }
      if (inner === 'Pending Check' || inner === 'Pending') {
        return <StatusBadge key={idx} color="orange" className="inline-flex ml-1">Pending Check</StatusBadge>;
      }
      return <strong key={idx} className="font-semibold text-zinc-900">{inner}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx} className="text-zinc-600 italic">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

/**
 * Renders a markdown table as a clean, Claude-style styled table.
 */
function renderTable(tableRows: string[], keyPrefix: string): React.ReactNode {
  if (tableRows.length < 2) return null;

  const headerCols = tableRows[0]
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);

  const dataRows = tableRows
    .slice(2) // Skip separator row
    .map((r) =>
      r
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean),
    );

  return (
    <div key={keyPrefix} className="my-2.5 overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">
          <tr>
            {headerCols.map((col, idx) => (
              <th key={idx} className="px-3 py-2">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 text-zinc-700">
          {dataRows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-zinc-50/50 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="px-3 py-2 text-xs">
                  {formatInline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
