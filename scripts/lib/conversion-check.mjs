// WI-OI-120s (S16): the findings of the conversion check for one module, as a pure function of what the module ships
// (windows, manifest, module roles) and what its record dispatcher registers. Used by scripts/verify-module-conversion.mjs
// and tested with deliberately broken inputs (packages/configuration-core/src/conversion-check.test.ts).

// Fields every record carries; windows may place them without the adapter listing them.
const ALWAYS = new Set(['id', 'version']);

/**
 * @param {object} input
 * @param {Array} input.windows       the module's window baselines (parsed)
 * @param {object} input.description  `RecordDispatcher.describe()`
 * @param {object} input.manifest     the module's parsed module.yaml
 * @param {Array} input.roles         the module's default roles
 * @param {Set<string>} input.servedLookups  lookup keys served by any converted module or by the platform
 * @param {object} input.engine       `{ executableCapabilityFindings, entityRules, holdsPermission, notDelegable? }`
 * @param {Map<string, string>} [input.heldBack]  record types registered but shown by no window yet, with their card
 * @returns {{ findings: string[], permissions: string[] }}
 */
export function conversionFindings({ windows, description, manifest, roles, servedLookups, engine, heldBack = new Map() }) {
  const { executableCapabilityFindings, entityRules, holdsPermission, notDelegable = () => false } = engine;
  const findings = [];
  const fail = (message) => findings.push(message);
  const adapters = new Map(description.entities.map((entity) => [entity.entityKey, entity]));

  // 1. The windows compile, with one set of field rules per record type (S1).
  if (windows.length === 0) fail('ships no window');
  for (const baseline of windows) {
    const surface = baseline.definition.surfaceKey;
    for (const finding of executableCapabilityFindings(baseline.definition.dictionary, undefined).filter((candidate) => candidate.severity === 'ERROR'))
      fail(`${surface}: ${finding.code} at ${finding.path}`);
  }
  for (const conflict of entityRules(windows.map((baseline) => baseline.definition.dictionary)).conflicts) fail(conflict);

  const permissions = new Set();
  for (const baseline of windows) {
    const surface = baseline.definition.surfaceKey;
    const dictionary = baseline.definition.dictionary;
    permissions.add(baseline.window.readPermission);

    // 2. Every placed field is one the record type declares; an editable field is one it accepts.
    for (const view of dictionary.views)
      for (const tab of view.tabs) {
        const adapter = adapters.get(tab.targetEntityKey);
        if (!adapter) {
          fail(`${surface}: tab ${tab.tabKey} shows ${tab.targetEntityKey}, which the dispatcher does not register`);
          continue;
        }
        for (const placement of tab.fields) {
          if (ALWAYS.has(placement.fieldKey)) continue;
          const policy = adapter.fields[placement.fieldKey];
          const field = dictionary.fields.find((candidate) => candidate.entityKey === tab.targetEntityKey && candidate.fieldKey === placement.fieldKey);
          if (!policy) fail(`${surface}: ${tab.targetEntityKey}.${placement.fieldKey} is shown but the adapter does not declare it`);
          else if (field && !field.readOnly && !policy.writable && (adapter.permissions.create || adapter.permissions.update))
            fail(`${surface}: ${tab.targetEntityKey}.${placement.fieldKey} is editable in the window but the adapter does not accept it`);
        }
      }
    for (const field of dictionary.fields) {
      if (field.readPermission) permissions.add(field.readPermission);
      if (field.writePermission) permissions.add(field.writePermission);
    }

    // 3. Every action runs on the server, under a permission the window also asks for.
    for (const action of dictionary.actions.filter((candidate) => candidate.type === 'COMMAND')) {
      action.requiredPermissions.forEach((permission) => permissions.add(permission));
      const split = action.handlerKey.lastIndexOf('.');
      const serverPermission = adapters.get(action.handlerKey.slice(0, split))?.actions[action.handlerKey.slice(split + 1)];
      if (serverPermission === undefined) fail(`${surface}: action ${action.handlerKey} is not registered by the dispatcher`);
      else if (!holdsPermission(action.requiredPermissions, serverPermission))
        fail(`${surface}: action ${action.handlerKey} is shown for ${action.requiredPermissions.join(', ')} but the server requires ${serverPermission}`);
    }

    // 4. Every lookup is served, by this module, another converted one or the platform.
    for (const reference of dictionary.references.filter((candidate) => candidate.resolverKey))
      if (!servedLookups.has(reference.resolverKey)) fail(`${surface}: lookup ${reference.resolverKey} is registered by no converted module`);

    // 5. The window opens on one of the module's pages.
    if (!(manifest.spec.ui?.pages ?? []).some((page) => page.route === baseline.window.route))
      fail(`${surface}: opens on ${baseline.window.route}, which is not a page of the module`);
  }

  // 6. The gateway exposes the record routes.
  if (manifest.spec.gateway?.records !== true) fail('the gateway does not expose the record routes (records: true)');

  // 7. A module role grants every permission the windows ask for, so someone other than a Tenant Admin can work. A
  //    permission that is never delegable (NOT_DELEGABLE_PERMISSIONS) is held only by administrators, never by a role.
  for (const permission of [...permissions].sort())
    if (!notDelegable(permission) && !roles.some((role) => holdsPermission(role.permissions, permission)))
      fail(`permission ${permission} is granted by no module role`);

  // 8. WI-OI-120af: a record operation is never wider than the REST route it mirrors. Each record type names, per
  //    operation, the gateway route it mirrors (`METHOD path`) or null when there is none, and holding the record
  //    permission must imply holding the route's.
  const gateway = new Map();
  for (const route of manifest.spec.gateway?.routes ?? [])
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) if (route[method]) gateway.set(`${method} ${route.path}`, route[method]);
  for (const entity of description.entities) {
    if (!entity.rest) {
      fail(`${entity.entityKey}: names no REST routes it mirrors (rest)`);
      continue;
    }
    const operations = [['read', entity.permissions.read, entity.rest.read]];
    if (entity.permissions.create) operations.push(['create', entity.permissions.create, entity.rest.create]);
    if (entity.permissions.update) operations.push(['update', entity.permissions.update, entity.rest.update]);
    for (const [action, permission] of Object.entries(entity.actions))
      operations.push([`action ${action}`, permission, entity.rest.actions?.[action]]);
    for (const [operation, permission, route] of operations) {
      // A read may need several permissions, all of them; a gateway route given a list accepts any one of them, as the
      // web gateway does (lib/signed-module-proxy.ts).
      const held = typeof permission === 'string' ? [permission] : permission;
      const value = route ? gateway.get(route) : undefined;
      const accepted = Array.isArray(value) ? value : [value];
      // Security review of d17db37 (Low 2): a read mirrors a GET (or a POST search); a write mirrors a write.
      const [method, path = ''] = route ? route.split(' ') : [];
      const readRoute = method === 'GET' || (method === 'POST' && path.endsWith('/search'));
      if (route === undefined) fail(`${entity.entityKey}: ${operation} names no REST route (null when there is none)`);
      else if (route !== null && !gateway.has(route)) fail(`${entity.entityKey}: ${operation} mirrors ${route}, which the gateway does not declare`);
      else if (route !== null && (operation === 'read') !== readRoute)
        fail(`${entity.entityKey}: ${operation} mirrors ${route}, which is a ${readRoute ? 'read' : 'write'} route`);
      else if (route !== null && !accepted.some((required) => holdsPermission(held, required)))
        fail(`${entity.entityKey}: ${operation} needs ${held.join(' + ')}, wider than ${route} (${accepted.join(' or ')})`);
    }
  }

  // 9. WI-OI-120af: every record type the dispatcher serves is shown by a window, or is held back by a named card.
  const shown = new Set(windows.flatMap((baseline) => baseline.definition.dictionary.views.flatMap((view) => view.tabs.map((tab) => tab.targetEntityKey))));
  for (const entity of description.entities)
    if (!shown.has(entity.entityKey) && !heldBack.has(entity.entityKey))
      fail(`${entity.entityKey} is served by the record API but shown by no window; show it, or hold it back with its card`);
  for (const [entityKey, card] of heldBack) {
    if (!adapters.has(entityKey)) fail(`held back ${entityKey} (${card}) is not registered; remove it from the held-back list`);
    else if (shown.has(entityKey)) fail(`held back ${entityKey} (${card}) is shown by a window; remove it from the held-back list`);
  }

  return { findings, permissions: [...permissions].sort() };
}
