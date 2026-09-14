'use client';

import React, { useState, useMemo } from 'react';
import {
  MASTER_CUSTOMERS,
  MASTER_VENDORS,
  MASTER_ACCOUNTS,
  MASTER_COST_CENTERS,
  MASTER_SIGNERS,
  MASTER_CATEGORIES,
  type MasterCustomer,
  type MasterVendor,
  type MasterAccount,
  type MasterCostCenter,
  type MasterSigner,
} from '@/lib/master-data-catalog';

export type MasterDataType =
  | 'vendor'
  | 'customer'
  | 'account'
  | 'cost-center'
  | 'category'
  | 'signer';

interface MasterDataSelectProps {
  label: string;
  name: string;
  type: MasterDataType;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  onChange?: (value: string, item?: any) => void;
  className?: string;
}

export function MasterDataSelect({
  label,
  name,
  type,
  value: controlledValue,
  defaultValue = '',
  required = false,
  placeholder = 'Select from Master Data...',
  onChange,
  className = '',
}: MasterDataSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = controlledValue !== undefined ? controlledValue : internalValue;
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [customEntry, setCustomEntry] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__ADD_NEW__') {
      setIsAddingNew(true);
      return;
    }
    setInternalValue(val);
    if (onChange) {
      let matchedItem: any = null;
      if (type === 'vendor') matchedItem = MASTER_VENDORS.find((v) => v.name === val || v.code === val);
      if (type === 'customer') matchedItem = MASTER_CUSTOMERS.find((c) => c.id === val || c.name === val);
      if (type === 'account') matchedItem = MASTER_ACCOUNTS.find((a) => a.code === val);
      if (type === 'cost-center') matchedItem = MASTER_COST_CENTERS.find((cc) => cc.id === val);
      if (type === 'signer') matchedItem = MASTER_SIGNERS.find((s) => s.email === val);
      onChange(val, matchedItem);
    }
  };

  const handleCustomAdd = () => {
    if (!customEntry.trim()) return;
    setInternalValue(customEntry.trim());
    setIsAddingNew(false);
    if (onChange) {
      onChange(customEntry.trim());
    }
  };

  return (
    <div className={`grid gap-1.5 text-sm font-medium text-zinc-800 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5">
          <span>{label}</span>
          <span className="text-[10px] font-mono font-normal text-purple-600 bg-purple-50 border border-purple-200 px-1 rounded">
            MASTER DATA
          </span>
        </label>
        {!isAddingNew ? (
          <button
            type="button"
            onClick={() => setIsAddingNew(true)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            + Quick Add
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingNew(false)}
            className="text-xs font-semibold text-zinc-500 hover:text-zinc-700"
          >
            Cancel
          </button>
        )}
      </div>

      {isAddingNew ? (
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-lg border border-emerald-500 bg-emerald-50/20 px-3 py-2 text-sm font-normal outline-none"
            placeholder={`Enter custom ${label}...`}
            value={customEntry}
            onChange={(e) => setCustomEntry(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            onClick={handleCustomAdd}
            className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Confirm
          </button>
        </div>
      ) : (
        <select
          name={name}
          required={required}
          value={selectedValue}
          onChange={handleChange}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-normal text-zinc-900 outline-none focus:border-violet-600 shadow-xs"
        >
          <option value="">{placeholder}</option>

          {type === 'vendor' &&
            MASTER_VENDORS.map((vendor) => (
              <option key={vendor.id} value={vendor.name}>
                {vendor.name} ({vendor.code} • {vendor.defaultCategory})
              </option>
            ))}

          {type === 'customer' &&
            MASTER_CUSTOMERS.map((cust) => (
              <option key={cust.id} value={cust.name}>
                {cust.name} ({cust.code} • {cust.paymentTerms})
              </option>
            ))}

          {type === 'account' &&
            MASTER_ACCOUNTS.map((acc) => (
              <option key={acc.code} value={acc.code}>
                {acc.code} — {acc.title} ({acc.category})
              </option>
            ))}

          {type === 'cost-center' &&
            MASTER_COST_CENTERS.map((cc) => (
              <option key={cc.id} value={cc.id}>
                {cc.code} — {cc.name} ({cc.department})
              </option>
            ))}

          {type === 'category' &&
            MASTER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}

          {type === 'signer' &&
            MASTER_SIGNERS.map((s) => (
              <option key={s.id} value={s.email}>
                {s.name} ({s.title} • {s.department})
              </option>
            ))}

          {selectedValue &&
            !MASTER_VENDORS.some((v) => v.name === selectedValue) &&
            !MASTER_CUSTOMERS.some((c) => c.name === selectedValue) &&
            !MASTER_CATEGORIES.some((c) => c === selectedValue) && (
              <option value={selectedValue}>Custom: {selectedValue}</option>
            )}

          <option value="__ADD_NEW__">+ Add Custom Entity...</option>
        </select>
      )}
    </div>
  );
}
