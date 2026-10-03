import { useState, useMemo } from 'react';
import type {
  CompiledDictionaryManifestV1,
  DictionaryValidationExpression,
  DictionaryValidationRuleV1,
  DictionaryViewV1,
} from '@gigalibs/contracts';

export interface DictionaryRendererProps {
  manifest: CompiledDictionaryManifestV1;
  values: Record<string, unknown>;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  device?: 'DESKTOP' | 'TABLET' | 'MOBILE' | 'ALL' | undefined;
  activeViewKey?: string | undefined;
  permissions?: string[] | undefined;
  onChange?: ((values: Record<string, unknown>) => void) | undefined;
  onAction?: ((actionKey: string) => void) | undefined;
}

/**
 * Client-side Safe AST evaluator for bounded dictionary validation rules.
 */
export function evaluateDictionaryCondition(
  expr: DictionaryValidationExpression,
  values: Record<string, unknown>,
  currentDepth = 1,
): boolean {
  if (currentDepth > 10) return false;

  if (expr.all && expr.all.length > 0) {
    return expr.all.every((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.any && expr.any.length > 0) {
    return expr.any.some((child) => evaluateDictionaryCondition(child, values, currentDepth + 1));
  }
  if (expr.not) {
    return !evaluateDictionaryCondition(expr.not, values, currentDepth + 1);
  }

  if (!expr.field || !expr.operator) return true;
  const val = values[expr.field];

  switch (expr.operator) {
    case 'EQ':
      return val === expr.value;
    case 'NEQ':
      return val !== expr.value;
    case 'IS_NULL':
      return val === null || val === undefined || val === '';
    case 'IS_NOT_NULL':
      return val !== null && val !== undefined && val !== '';
    case 'GT':
      return typeof val === 'number' && typeof expr.value === 'number' && val > expr.value;
    case 'LT':
      return typeof val === 'number' && typeof expr.value === 'number' && val < expr.value;
    case 'GTE':
      return typeof val === 'number' && typeof expr.value === 'number' && val >= expr.value;
    case 'LTE':
      return typeof val === 'number' && typeof expr.value === 'number' && val <= expr.value;
    case 'IN':
      return Array.isArray(expr.value) && expr.value.includes(val);
    case 'NOT_IN':
      return Array.isArray(expr.value) && !expr.value.includes(val);
    case 'CONTAINS':
      return typeof val === 'string' && typeof expr.value === 'string' && val.includes(expr.value);
    case 'MATCHES_REGEX':
      if (typeof val !== 'string' || typeof expr.value !== 'string') return false;
      try {
        const regex = new RegExp(expr.value);
        return regex.test(val);
      } catch {
        return false;
      }
    default:
      return true;
  }
}

/**
 * Evaluates all validation rules declared in the manifest against form values.
 */
export function validateDictionaryRules(
  rules: readonly DictionaryValidationRuleV1[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const rule of rules) {
    const passed = evaluateDictionaryCondition(rule.condition, values);
    if (!passed) {
      const fieldKey = rule.condition.field || rule.ruleKey;
      errors[fieldKey] = rule.errorMessage;
    }
  }
  return errors;
}

export function DictionaryRenderer({
  manifest,
  values,
  errors = {},
  disabled = false,
  device = 'ALL',
  activeViewKey,
  permissions = ['*'],
  onChange,
  onAction,
}: DictionaryRendererProps) {
  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    return permissions.includes('*') || permissions.includes(perm);
  };

  // Find target view
  const targetView: DictionaryViewV1 | undefined = useMemo(() => {
    if (activeViewKey) {
      return manifest.views.find((v) => v.viewKey === activeViewKey);
    }
    return (
      manifest.views.find((v) => v.device === device || v.device === 'ALL') ??
      manifest.views[0]
    );
  }, [manifest.views, activeViewKey, device]);

  const [activeTabKey, setActiveTabKey] = useState<string>(
    targetView?.tabs[0]?.tabKey ?? '',
  );
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const fieldMap = useMemo(() => {
    return new Map(manifest.fields.map((f) => [f.fieldKey, f]));
  }, [manifest.fields]);

  const referenceMap = useMemo(() => {
    return new Map(manifest.references.map((r) => [r.referenceKey, r]));
  }, [manifest.references]);

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleFieldChange = (fieldKey: string, val: unknown) => {
    if (disabled || !onChange) return;
    onChange({ ...values, [fieldKey]: val });
  };

  if (!targetView) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-xs text-zinc-500">
        No view layout declared for this application dictionary.
      </div>
    );
  }

  const currentTab = targetView.tabs.find((t) => t.tabKey === activeTabKey) ?? targetView.tabs[0];

  return (
    <div
      className="space-y-6"
      data-dictionary-package={manifest.packageKey}
      data-manifest-checksum={manifest.checksum}
    >
      {/* Tab Navigation */}
      {targetView.tabs.length > 1 && (
        <div className="flex border-b border-zinc-200 space-x-2">
          {targetView.tabs.map((tab) => {
            const isTabActive = tab.tabKey === (currentTab?.tabKey ?? '');
            return (
              <button
                key={tab.tabKey}
                type="button"
                onClick={() => setActiveTabKey(tab.tabKey)}
                className={`py-2 px-4 text-xs font-medium border-b-2 transition ${
                  isTabActive
                    ? 'border-emerald-600 text-emerald-700 font-semibold'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Sections and Fields */}
      {currentTab?.sections.map((section) => {
        const isCollapsed = collapsedSections[section.sectionKey] ?? section.defaultCollapsed;
        const sectionFields = currentTab.fields.filter(
          (f) => f.sectionKey === section.sectionKey,
        );

        return (
          <div
            key={section.sectionKey}
            className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-xs"
          >
            {/* Section Header */}
            <div
              className={`flex items-center justify-between p-4 ${
                section.collapsible ? 'cursor-pointer hover:bg-zinc-50 select-none' : ''
              }`}
              onClick={() => section.collapsible && toggleSection(section.sectionKey)}
            >
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">{section.label}</h3>
                {section.description && (
                  <p className="text-xs text-zinc-500 mt-0.5">{section.description}</p>
                )}
              </div>
              {section.collapsible && (
                <span className="text-xs text-zinc-400 font-mono">
                  {isCollapsed ? '[+]' : '[-]'}
                </span>
              )}
            </div>

            {/* Section Content */}
            {!isCollapsed && (
              <div className="p-4 pt-0 border-t border-zinc-100">
                <div className="grid grid-cols-12 gap-4 mt-3">
                  {sectionFields.map((fieldPlacement) => {
                    const field = fieldMap.get(fieldPlacement.fieldKey);
                    if (!field) return null;
                    if (!hasPermission(field.readPermission)) return null;

                    const canWrite = hasPermission(field.writePermission) && !field.readOnly && !disabled;
                    const val = values[field.fieldKey];
                    const error = errors[field.fieldKey];
                    const ref = field.referenceKey ? referenceMap.get(field.referenceKey) : undefined;
                    const span = fieldPlacement.span ?? 6;

                    return (
                      <div
                        key={field.fieldKey}
                        style={{ gridColumn: `span ${span} / span ${span}` }}
                        className="space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-zinc-700">
                            {field.label}
                            {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                          </label>
                          {field.isSystemLocked && (
                            <span className="text-[10px] text-zinc-400 font-medium">Locked</span>
                          )}
                        </div>

                        {/* Masked Display */}
                        {field.maskOnDisplay ? (
                          <input
                            type="password"
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            readOnly={!canWrite}
                            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50"
                          />
                        ) : field.type === 'SELECT' && ref?.staticValues ? (
                          <select
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50"
                          >
                            <option value="">Select…</option>
                            {ref.staticValues.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'BOOLEAN' ? (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="checkbox"
                              checked={Boolean(val)}
                              disabled={!canWrite}
                              onChange={(e) => handleFieldChange(field.fieldKey, e.target.checked)}
                              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                            />
                            <span className="text-xs text-zinc-600">{field.helpText || field.label}</span>
                          </div>
                        ) : field.type === 'TEXTAREA' ? (
                          <textarea
                            rows={3}
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            readOnly={!canWrite}
                            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value)}
                            className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-50"
                          />
                        ) : (
                          <input
                            type={field.type === 'NUMBER' || field.type === 'INTEGER' ? 'number' : 'text'}
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            readOnly={!canWrite}
                            onChange={(e) =>
                              handleFieldChange(
                                field.fieldKey,
                                field.type === 'NUMBER' || field.type === 'INTEGER'
                                  ? Number(e.target.value)
                                  : e.target.value,
                              )
                            }
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 disabled:bg-zinc-50 ${
                              error
                                ? 'border-rose-300 focus:ring-rose-500'
                                : 'border-zinc-200 focus:ring-emerald-500'
                            }`}
                          />
                        )}

                        {error && <p className="text-[11px] text-rose-600 font-medium">{error}</p>}
                        {field.helpText && !error && (
                          <p className="text-[11px] text-zinc-400">{field.helpText}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Action Handlers */}
      {manifest.actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-zinc-100">
          {manifest.actions
            .filter((act) => !act.requiredPermissions?.length || act.requiredPermissions.every((p) => hasPermission(p)))
            .map((act) => (
              <button
                key={act.actionKey}
                type="button"
                onClick={() => onAction && onAction(act.actionKey)}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50 transition"
              >
                {act.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
