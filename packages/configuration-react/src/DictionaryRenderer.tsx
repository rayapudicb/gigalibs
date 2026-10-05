import { useState, useMemo } from 'react';
import type { CompiledDictionaryManifestV1, DictionaryViewV1 } from '@gigalibs/contracts';

export interface DictionaryRendererProps {
  manifest: CompiledDictionaryManifestV1;
  values: Record<string, unknown>;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  device?: 'DESKTOP' | 'TABLET' | 'MOBILE' | 'ALL' | undefined;
  activeViewKey?: string | undefined;
  /** The signed-in user's permissions. Without them, fields and actions that name a permission are not shown. */
  permissions?: readonly string[] | undefined;
  onChange?: ((values: Record<string, unknown>) => void) | undefined;
  onAction?: ((actionKey: string) => void) | undefined;
}

// WI-OI-120f (F0.1): one evaluator for the browser and the server, failing closed (M-03). Re-exported here for the
// module screens that import it from this package.
export { evaluateDictionaryCondition, validateDictionaryRules } from '@gigalibs/configuration-core/dictionary-evaluator';

export function DictionaryRenderer({
  manifest,
  values,
  errors = {},
  disabled = false,
  device = 'ALL',
  activeViewKey,
  // WI-OI-120e (U3.2, P1-24): deny by default. A caller that passes no permissions gets no permission-gated field.
  permissions = [],
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
      <div className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 text-center text-xs text-ui-fg-muted">
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
        <div className="flex border-b border-ui-border-base space-x-2">
          {targetView.tabs.map((tab) => {
            const isTabActive = tab.tabKey === (currentTab?.tabKey ?? '');
            return (
              <button
                key={tab.tabKey}
                type="button"
                onClick={() => setActiveTabKey(tab.tabKey)}
                className={`py-2 px-4 text-xs font-medium border-b-2 transition ${
                  isTabActive
                    ? 'border-ui-border-interactive text-ui-tag-green-text font-semibold'
                    : 'border-transparent text-ui-fg-muted hover:text-ui-fg-base'
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
            className="rounded-xl border border-ui-border-base bg-ui-bg-base overflow-hidden shadow-xs"
          >
            {/* Section Header */}
            <div
              className={`flex items-center justify-between p-4 ${
                section.collapsible ? 'cursor-pointer hover:bg-ui-bg-base-hover select-none' : ''
              }`}
              onClick={() => section.collapsible && toggleSection(section.sectionKey)}
            >
              <div>
                <h3 className="text-sm font-semibold text-ui-fg-base">{section.label}</h3>
                {section.description && (
                  <p className="text-xs text-ui-fg-muted mt-0.5">{section.description}</p>
                )}
              </div>
              {section.collapsible && (
                <span className="text-xs text-ui-fg-muted font-mono">
                  {isCollapsed ? '[+]' : '[-]'}
                </span>
              )}
            </div>

            {/* Section Content */}
            {!isCollapsed && (
              <div className="p-4 pt-0 border-t border-ui-border-base">
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
                          <label className="text-xs font-semibold text-ui-fg-subtle">
                            {field.label}
                            {field.required && <span className="text-ui-fg-error ml-0.5">*</span>}
                          </label>
                          {field.isSystemLocked && (
                            <span className="text-[10px] text-ui-fg-muted font-medium">Locked</span>
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
                            className="w-full rounded-lg border border-ui-border-base px-3 py-1.5 text-xs text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive disabled:bg-ui-bg-disabled"
                          />
                        ) : field.type === 'SELECT' && ref?.staticValues ? (
                          <select
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value)}
                            className="w-full rounded-lg border border-ui-border-base px-3 py-1.5 text-xs text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive disabled:bg-ui-bg-disabled"
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
                              className="h-4 w-4 rounded border-ui-border-base text-ui-tag-green-text focus:ring-ui-border-interactive disabled:opacity-50"
                            />
                            <span className="text-xs text-ui-fg-subtle">{field.helpText || field.label}</span>
                          </div>
                        ) : field.type === 'TEXTAREA' ? (
                          <textarea
                            rows={3}
                            value={String(val ?? '')}
                            disabled={!canWrite}
                            readOnly={!canWrite}
                            onChange={(e) => handleFieldChange(field.fieldKey, e.target.value)}
                            className="w-full rounded-lg border border-ui-border-base px-3 py-1.5 text-xs text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive disabled:bg-ui-bg-disabled"
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
                            className={`w-full rounded-lg border px-3 py-1.5 text-xs text-ui-fg-base focus:outline-none focus:ring-1 disabled:bg-ui-bg-disabled ${
                              error
                                ? 'border-ui-tag-red-border focus:ring-ui-border-error'
                                : 'border-ui-border-base focus:ring-ui-border-interactive'
                            }`}
                          />
                        )}

                        {error && <p className="text-[11px] text-ui-fg-error font-medium">{error}</p>}
                        {field.helpText && !error && (
                          <p className="text-[11px] text-ui-fg-muted">{field.helpText}</p>
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
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-ui-border-base">
          {manifest.actions
            .filter((act) => !act.requiredPermissions?.length || act.requiredPermissions.every((p) => hasPermission(p)))
            .map((act) => (
              <button
                key={act.actionKey}
                type="button"
                onClick={() => onAction && onAction(act.actionKey)}
                className="rounded-xl border border-ui-border-base bg-ui-bg-base px-4 py-2 text-xs font-semibold text-ui-fg-base shadow-2xs hover:bg-ui-bg-base-hover transition"
              >
                {act.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
