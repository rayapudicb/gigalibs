// WI-OI-120s (S16): the shared builder for module window baselines (`modules/<module>/dictionary/*.window.json`). A module
// keeps its windows' source in `dictionary/windows.mjs`, which exports `windows(builder)` returning `{ surface: window }`;
// `node scripts/generate-windows.mjs <module>` writes them and `--check` proves the committed files match.
// Key order is part of the output: the files are reviewed as text and must regenerate byte for byte.

const COMPONENT = {
  TEXT: 'text-input',
  TEXTAREA: 'textarea',
  NUMBER: 'number-input',
  INTEGER: 'number-input',
  CURRENCY: 'currency-input',
  BOOLEAN: 'checkbox',
  DATE: 'date-input',
  DATETIME: 'datetime-input',
  SELECT: 'select',
  REFERENCE: 'lookup',
};

/**
 * Helpers for one module. `route` is the module page the windows open on; `createWith` maps a lookup resolver to the
 * window that creates its records (F0.6 "Add new"): `{ resolver: [moduleKey, surfaceKey, permission] }`.
 */
export function windowBuilder({ moduleKey, route, createWith = {} }) {
  const entity = (key, label) => ({
    entityKey: key,
    moduleKey,
    label,
    ownership: 'MODULE_CORE',
    primaryKeyField: 'id',
    isVersioned: true,
    isAuditLogged: true,
    isSoftDeletable: false,
  });

  /** A field; `writePermission` shows it read-only to anyone without that permission (the dispatcher also refuses it). */
  const field = (entityKey, key, label, type = 'TEXT', { required = false, readOnly = false, ref, scale, help, classification = 'INTERNAL', writePermission } = {}) => {
    const value = { fieldKey: key, entityKey, label, type, required, readOnly, isSystemLocked: false, classification, maskOnDisplay: false };
    if (ref) value.referenceKey = ref;
    if (scale !== undefined && scale !== null) value.scale = scale;
    if (help) value.helpText = help;
    if (writePermission) value.writePermission = writePermission;
    return value;
  };

  const values = (key, items) => ({
    referenceKey: key,
    referenceType: 'VALUE_LIST',
    staticValues: items.map(([value, label]) => ({ value, label })),
  });

  /** A lookup resolved by a registered resolver; any window can use it. Offers "Add new" when `createWith` names it. */
  const lookup = (key, resolver) => {
    const reference = { referenceKey: key, referenceType: 'SEARCH_LOOKUP', resolverKey: resolver };
    if (createWith[resolver]) {
      const [module, surface, permission] = createWith[resolver];
      reference.createWith = { moduleKey: module, surfaceKey: surface, permission };
    }
    return reference;
  };

  /** A tab; each placement is `[fieldKey, span, sectionKey?]`, its component chosen from the field's type. */
  const tab = (key, label, level, entityKey, placements, allFields, { sections, parent } = {}) => {
    const fields = placements.map(([fieldKey, span, sectionKey], position) => {
      const declared = allFields.find((candidate) => candidate.fieldKey === fieldKey && candidate.entityKey === entityKey);
      if (!declared) throw new Error(`${moduleKey}: tab ${key} places ${fieldKey}, which ${entityKey} does not declare`);
      const placement = { fieldKey, position, span, componentKey: COMPONENT[declared.type] };
      if (sectionKey) placement.sectionKey = sectionKey;
      return placement;
    });
    const value = { tabKey: key, label, position: level, level, targetEntityKey: entityKey, sections: sections ?? [], fields };
    if (parent) value.parentRelationshipKey = parent;
    return value;
  };

  const section = (key, label, position) => ({ sectionKey: key, label, collapsible: false, defaultCollapsed: false, position });

  const relationship = (key, source, target, foreignKey) => ({
    relationshipKey: key,
    sourceEntityKey: source,
    targetEntityKey: target,
    type: 'ONE_TO_MANY',
    foreignKeyField: foreignKey,
  });

  /**
   * A record action shown when `[field, operator, value]` holds; `parameters` are asked for before it runs.
   * `parametersLast` writes them after the condition (the order the Finance windows were first written in).
   */
  const action = (entityKey, key, label, permission, [whenField, operator, whenValue], prompt, parameters, { parametersLast = false } = {}) => {
    const value = {
      actionKey: key,
      label,
      type: 'COMMAND',
      handlerKey: `${entityKey}.${key}`,
      requiredPermissions: [permission],
      confirmationPrompt: prompt,
    };
    if (parameters && !parametersLast) value.parameters = parameters;
    value.visibilityCondition = { field: whenField, operator, value: whenValue };
    if (parameters && parametersLast) value.parameters = parameters;
    return value;
  };

  const view = (key, label, tabs, { search, sort } = {}) => {
    const value = { viewKey: key, label, mode: 'LIST', device: 'ALL', defaultSortDirection: 'ASC', tabs };
    if (search) value.searchFields = search;
    if (sort) value.defaultSortField = sort;
    return value;
  };

  const dictionary = (surface, name, target, entities, fields, relationships, references, views, actions = []) => ({
    packageKey: `${surface}-module-baseline`,
    name,
    version: '1.0.0',
    moduleKey,
    targetEntityKey: target,
    entities,
    fields,
    relationships,
    references,
    validationRules: [],
    views,
    navigation: [],
    actions,
    messages: [],
  });

  /** The window baseline: the route it opens on, its label and read permission, and its dictionary package. */
  const window = (surface, title, label, description, permission, pkg, { entityKey = surface, route: windowRoute } = {}) => ({
    contractVersion: '1.0',
    window: { route: windowRoute ?? route, label, description, readPermission: permission },
    definition: {
      kind: 'APPLICATION_DICTIONARY',
      contractVersion: '1.0',
      moduleKey,
      entityKey,
      surfaceKey: surface,
      title,
      dictionary: pkg,
    },
  });

  const REASON_REQUIRED = [{ key: 'reason', label: 'Reason', type: 'TEXTAREA', required: true }];
  const REASON_OPTIONAL = [{ key: 'reason', label: 'Reason', type: 'TEXTAREA', required: false }];

  return { entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED, REASON_OPTIONAL };
}

/** A window file's text: two-space JSON with non-ASCII characters escaped, and a final newline. */
export function windowText(value) {
  return `${JSON.stringify(value, null, 2).replace(/[\u007f-￿]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)}\n`;
}
