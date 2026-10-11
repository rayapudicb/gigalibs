'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  CheckCircle2,
  FileCheck,
  ArrowUpRight,
  Calculator,
} from 'lucide-react';

interface TaxAuditExemptionCardProps {
  entityName?: string;
  taxJurisdiction?: string;
  vatNumber?: string;
  certificateId?: string;
}

export function TaxAuditExemptionCard({
  entityName = 'Apex Heavy Industries BV',
  taxJurisdiction = 'European Union (VAT Reverse Charge)',
  vatNumber = 'NL881290314B01',
  certificateId = 'VIES-VAL-2026-99',
}: TaxAuditExemptionCardProps) {
  const router = useRouter();
  const [validated, setValidated] = useState(false);

  const handleValidate = () => {
    setValidated(true);
  };

  const handleOpenTax = () => {
    router.push('/tax');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{vatNumber}</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-emerald-800">
                EXEMPT (0% VAT)
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{entityName}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div className="font-bold text-emerald-700">Audit Proof #99</div>
          <div className="text-[10px] text-zinc-400">{taxJurisdiction}</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-2.5 text-xs flex items-center justify-between">
          <span className="text-zinc-500">Exemption Cert:</span>
          <span className="font-mono font-bold text-zinc-900">{certificateId}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleValidate}
            disabled={validated}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
          >
            {validated ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>VIES Validated</span>
              </>
            ) : (
              <span>Validate Exemption Certificate</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleOpenTax}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open Tax Engine</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
