# Packs moved to the solution layer

The JSON industry and country packs that lived here (and the hand copy in
`packages/configuration-core/src/governed-catalogues.ts`) were removed in WI-OI-107 (ADR-0016 F10). Industry and
country packs are now one set of files in `solutions/packs/`, one section per module, compiled into
`@gigalibs/contracts` (`SHIPPED_INDUSTRY_PACKS`, `SHIPPED_COUNTRY_PACKS`) by `pnpm modules:catalog`.

A tenant activates a pack in Configuration Studio; the kernel then sends Workforce its section, which Workforce keeps
(`GET v1/pack`). The unregistered prototype `PacksService` reads the shipped packs; removing the prototype is a
package-inventory decision (F7).
