'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileEdit,
  Plus,
  CheckCircle2,
  ArrowUpRight,
  ListPlus,
  Sliders,
} from 'lucide-react';

interface FormSchemaBuilderCardProps {
  formSlug?: string;
  formTitle?: string;
  fieldCount?: number;
}

export function FormSchemaBuilderCard({
  formSlug = 'FRM-LOTO-PERMIT-V2',
  formTitle = 'Electrical & Mechanical LOTO Clearance Permit',
  fieldCount = 8,
}: FormSchemaBuilderCardProps) {
  const router = useRouter();
  const [fields, setFields] = useState<string[]>([
    'Energy Isolation Boundary (Select)',
    'Residual Pressure Bleed Check (Boolean)',
    'Digital Padlock Box Serial (Text)',
    'Authorized Sign-off (E-Signature)',
  ]);
  const [saved, setSaved] = useState(false);

  const addCustomField = () => {
    setFields((prev) => [...prev, 'Atmospheric Oxygen % (Number)']);
    setSaved(true);
  };

  const handleOpenStudio = () => {
    router.push('/forms/q/' + formSlug);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition-all hover:border-zinc-300">
      <div className="flex items-start justify-between border-b border-zinc-100 bg-zinc-50/70 p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700 border border-teal-500/20">
            <FileEdit className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-zinc-900">{formSlug}</span>
              <span className="rounded bg-teal-100 px-1.5 py-0.2 text-[10px] font-mono font-bold text-teal-800">
                SCHEMA DRAFT
              </span>
            </div>
            <h4 className="text-xs font-semibold text-zinc-800 mt-0.5 line-clamp-1">{formTitle}</h4>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-zinc-500">
          <div>{fields.length} Fields Configured</div>
          <div className="text-[10px] text-zinc-400">Universal Forms</div>
        </div>
      </div>

      <div className="p-3.5 space-y-3">
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded bg-zinc-50 border border-zinc-100 px-2.5 py-1.5 text-xs text-zinc-700">
              <span className="font-mono text-[11px] text-zinc-500">#{i + 1}</span>
              <span className="font-medium">{f}</span>
              <span className="text-[10px] text-teal-700 font-mono font-semibold">Active</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={addCustomField}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-all hover:bg-zinc-800 active:scale-[0.99]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Oxygen % Field</span>
          </button>

          <button
            type="button"
            onClick={handleOpenStudio}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 shadow-xs transition-all hover:bg-zinc-50 active:scale-[0.99]"
          >
            <span>Open in Forms Studio</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-zinc-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
