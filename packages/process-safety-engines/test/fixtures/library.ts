import type { ScreeningLibrary } from '../../src/index.js';

const illustrative = 'TEST FIXTURE: the design-review prototype starter library (unreviewed, BRD 16.2)';

/**
 * TEST FIXTURE. A subset of the prototype's starter library, enough for the reference cases. Every entry is
 * unreviewed, as in the prototype. The product's library is imported, cited and reviewed data, not this file.
 */
export const PROTOTYPE_LIBRARY: ScreeningLibrary = {
  version: 'test-fixture-prototype-0.1',
  materials: [
    { id: 'L01', classes: ['organic', 'flammable'], noteKey: 'note.4-fluorobenzaldehyde', citation: illustrative, reviewed: false },
    { id: 'L02', classes: ['organic', 'flammable'], citation: illustrative, reviewed: false },
    { id: 'L03', classes: ['amine', 'flammable'], citation: illustrative, reviewed: false },
    { id: 'L04', classes: ['acid', 'flammable'], citation: illustrative, reviewed: false },
    { id: 'L05', classes: ['flammable', 'protic', 'peroxide-former'], citation: illustrative, reviewed: false },
    { id: 'L06', classes: ['protic'], citation: illustrative, reviewed: false },
    { id: 'L07', classes: ['sulfur', 'organic'], citation: illustrative, reviewed: false },
    { id: 'L08', classes: ['carbonate'], citation: illustrative, reviewed: false },
    { id: 'L09', classes: ['dmso', 'organic'], noteKey: 'note.dmso', citation: illustrative, reviewed: false },
    { id: 'L10', classes: ['acid'], citation: illustrative, reviewed: false },
    { id: 'L11', classes: ['oxidiser'], citation: illustrative, reviewed: false },
    { id: 'L12', classes: ['flammable', 'organic'], citation: illustrative, reviewed: false },
    { id: 'L13', classes: [], citation: illustrative, reviewed: false },
    { id: 'L14', classes: ['base'], citation: illustrative, reviewed: false },
    { id: 'L15', classes: ['reducer'], citation: illustrative, reviewed: false },
    { id: 'L16', classes: ['sulfur', 'organic'], citation: illustrative, reviewed: false },
    { id: 'L17', classes: ['base'], citation: illustrative, reviewed: false },
    { id: 'L18', classes: ['sulfur'], citation: illustrative, reviewed: false },
    { id: 'L19', classes: ['pyrophoric', 'water-reactive', 'reducer'], citation: illustrative, reviewed: false },
    { id: 'L20', classes: ['flammable', 'organic'], citation: illustrative, reviewed: false },
    { id: 'L21', classes: ['flammable', 'protic'], citation: illustrative, reviewed: false },
    { id: 'L22', classes: [], citation: illustrative, reviewed: false },
    { id: 'L23', classes: ['flammable', 'gas'], citation: illustrative, reviewed: false },
    { id: 'L24', classes: [], citation: illustrative, reviewed: false },
    { id: 'L25', classes: ['flammable', 'organic'], citation: illustrative, reviewed: false },
    { id: 'L26', classes: ['organic'], citation: illustrative, reviewed: false },
  ],
  rules: [
    { id: 'R-01', classA: 'base', classB: 'dmso', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-02', classA: 'acid', classB: 'dmso', severity: 'Medium', citation: illustrative, reviewed: false },
    { id: 'R-03', classA: 'oxidiser', classB: 'dmso', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-04', classA: 'oxidiser', classB: 'flammable', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-05', classA: 'oxidiser', classB: 'organic', severity: 'Medium', citation: illustrative, reviewed: false },
    { id: 'R-06', classA: 'oxidiser', classB: 'acid', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-07', classA: 'oxidiser', classB: 'reducer', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-08', classA: 'water-reactive', classB: 'protic', severity: 'High', citation: illustrative, reviewed: false },
    { id: 'R-09', classA: 'pyrophoric', classB: 'flammable', severity: 'Medium', citation: illustrative, reviewed: false },
    { id: 'R-10', classA: 'acid', classB: 'carbonate', severity: 'Medium', citation: illustrative, reviewed: false },
    { id: 'R-11', classA: 'acid', classB: 'base', severity: 'Medium', citation: illustrative, reviewed: false },
    { id: 'R-12', classA: 'acid', classB: 'amine', severity: 'Low', citation: illustrative, reviewed: false },
  ],
  reactionClasses: [
    { id: 'RC-01', typicalReactionEnthalpyKJPerMol: -40, citation: illustrative, reviewed: false },
    { id: 'RC-02', typicalReactionEnthalpyKJPerMol: -80, citation: illustrative, reviewed: false },
    { id: 'RC-03', typicalReactionEnthalpyKJPerMol: -450, citation: 'BRD TC-07 input', reviewed: false },
    { id: 'RC-04', typicalReactionEnthalpyKJPerMol: -120, citation: illustrative, reviewed: false },
    { id: 'RC-05', typicalReactionEnthalpyKJPerMol: -300, citation: illustrative, reviewed: false },
  ],
  formationEnthalpies: {
    H2O: { kJPerMol: -285.83, phase: 'liquid', citation: 'NIST Chemistry WebBook (test fixture)', reviewed: false },
    CO2: { kJPerMol: -393.51, phase: 'gas', citation: 'NIST Chemistry WebBook (test fixture)', reviewed: false },
    CH4: { kJPerMol: -74.87, phase: 'gas', citation: 'NIST Chemistry WebBook (test fixture)', reviewed: false },
    O2: { kJPerMol: 0, phase: 'gas', citation: 'Element in its standard state', reviewed: true },
  },
  gases: {
    C4H10: { id: 'isobutane', citation: illustrative, reviewed: false },
    CO2: { id: 'carbon-dioxide', citation: illustrative, reviewed: false },
    H2: { id: 'hydrogen', citation: illustrative, reviewed: false },
  },
};
