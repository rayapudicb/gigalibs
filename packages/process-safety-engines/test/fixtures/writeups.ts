// WI-OI-120cc (SPEED S8; FR-INP-07, 08): TEST FIXTURE write-ups, written for this test in the style of lab notebook
// procedures and patent examples, each annotated with the quantities a chemist would take from it (value in the
// parser's units: °C, g, mL, mol, equiv, min). They exercise the patterns; the pilot lab's own annotated procedures
// replace them as the acceptance set (SPEED S9d).

import type { WriteupType } from '../../src/writeup.js';

export interface AnnotatedWriteup {
  readonly id: string;
  readonly text: string;
  readonly expected: readonly { readonly type: WriteupType; readonly value: number }[];
}

export const WRITEUPS: readonly AnnotatedWriteup[] = [
  {
    id: 'W01',
    text: 'TEST FIXTURE. To a solution of 4-fluorobenzaldehyde (12.4 g, 0.10 mol) in ethanol (100 mL) was added piperidine (0.85 g, 10 mmol). The mixture was stirred at 40 °C for 4 h.',
    expected: [
      { type: 'MASS', value: 12.4 },
      { type: 'AMOUNT', value: 0.1 },
      { type: 'VOLUME', value: 100 },
      { type: 'MASS', value: 0.85 },
      { type: 'AMOUNT', value: 0.01 },
      { type: 'TEMPERATURE', value: 40 },
      { type: 'TIME', value: 240 },
    ],
  },
  {
    id: 'W02',
    text: 'TEST FIXTURE. Sodium hydroxide (1.2 equiv) was added portionwise over 30 min, keeping the temperature at 0–5 °C. Stirring was continued for 2 h.',
    expected: [
      { type: 'EQUIVALENTS', value: 1.2 },
      { type: 'TIME', value: 30 },
      { type: 'TEMPERATURE', value: 5 },
      { type: 'TIME', value: 120 },
    ],
  },
  {
    id: 'W03',
    text: 'TEST FIXTURE. The reactor was charged with toluene (2.5 L) and the intermediate (450 g). The batch was heated to reflux (110 °C) for 12 h, then cooled to 20-25 °C.',
    expected: [
      { type: 'VOLUME', value: 2500 },
      { type: 'MASS', value: 450 },
      { type: 'TEMPERATURE', value: 110 },
      { type: 'TIME', value: 720 },
      { type: 'TEMPERATURE', value: 25 },
    ],
  },
  {
    id: 'W04',
    text: 'TEST FIXTURE. Potassium permanganate (2.0 eq.) was dosed via a syringe pump over 2 hours at -10 to 0 °C.',
    expected: [
      { type: 'EQUIVALENTS', value: 2 },
      { type: 'TIME', value: 120 },
      { type: 'TEMPERATURE', value: 0 },
    ],
  },
  {
    id: 'W05',
    text: 'TEST FIXTURE. Example 3: A mixture of the acid (25 mg, 0.12 mmol), HATU (55 mg) and DIPEA (60 µL) in DMF (1.5 mL) was stirred at room temperature overnight.',
    expected: [
      { type: 'MASS', value: 0.025 },
      { type: 'AMOUNT', value: 0.00012 },
      { type: 'MASS', value: 0.055 },
      { type: 'VOLUME', value: 0.06 },
      { type: 'VOLUME', value: 1.5 },
    ],
  },
  {
    id: 'W06',
    text: 'TEST FIXTURE. Diisobutylaluminium hydride (1.0 M in hexane, 120 mL, 0.12 mol, 1.5 equiv) was added dropwise at -78 °C. After 45 min the reaction was quenched with methanol (10 mL).',
    expected: [
      { type: 'VOLUME', value: 120 },
      { type: 'AMOUNT', value: 0.12 },
      { type: 'EQUIVALENTS', value: 1.5 },
      { type: 'TEMPERATURE', value: -78 },
      { type: 'TIME', value: 45 },
      { type: 'VOLUME', value: 10 },
    ],
  },
  {
    id: 'W07',
    text: 'TEST FIXTURE. The suspension was warmed to 60°C and held for 1.5 hours. Water (200 mL) was added slowly and the solid filtered.',
    expected: [
      { type: 'TEMPERATURE', value: 60 },
      { type: 'TIME', value: 90 },
      { type: 'VOLUME', value: 200 },
    ],
  },
  {
    id: 'W08',
    text: 'TEST FIXTURE. Charge 3.2 kg of the amine and 18 L of 2-MeTHF. Heat to 65 deg C. Add 1.05 equivalents of acetic anhydride over 1 h.',
    expected: [
      { type: 'MASS', value: 3200 },
      { type: 'VOLUME', value: 18000 },
      { type: 'TEMPERATURE', value: 65 },
      { type: 'EQUIVALENTS', value: 1.05 },
      { type: 'TIME', value: 60 },
    ],
  },
  {
    id: 'W09',
    text: 'TEST FIXTURE. The ester (8.0 g, 41 mmol) was dissolved in THF (80 mL) and LiOH (2.0 equiv) in water (40 mL) was added. The mixture was stirred at 50 °C for 3 h.',
    expected: [
      { type: 'MASS', value: 8 },
      { type: 'AMOUNT', value: 0.041 },
      { type: 'VOLUME', value: 80 },
      { type: 'EQUIVALENTS', value: 2 },
      { type: 'VOLUME', value: 40 },
      { type: 'TEMPERATURE', value: 50 },
      { type: 'TIME', value: 180 },
    ],
  },
  {
    id: 'W10',
    text: 'TEST FIXTURE. Thionyl chloride (14.3 g, 120 mmol) was added in three portions to the acid in DCM (150 mL) at 0 °C, then the solution was refluxed for 90 min.',
    expected: [
      { type: 'MASS', value: 14.3 },
      { type: 'AMOUNT', value: 0.12 },
      { type: 'VOLUME', value: 150 },
      { type: 'TEMPERATURE', value: 0 },
      { type: 'TIME', value: 90 },
    ],
  },
  {
    id: 'W11',
    text: 'TEST FIXTURE. In a 500 mL flask, compound 7 (21.0 g) and K2CO3 (27.6 g, 0.2 mol) in DMSO (100 mL) were heated at 80 °C for 16 h.',
    expected: [
      { type: 'VOLUME', value: 500 },
      { type: 'MASS', value: 21 },
      { type: 'MASS', value: 27.6 },
      { type: 'AMOUNT', value: 0.2 },
      { type: 'VOLUME', value: 100 },
      { type: 'TEMPERATURE', value: 80 },
      { type: 'TIME', value: 960 },
    ],
  },
  {
    id: 'W12',
    text: 'TEST FIXTURE. Sodium azide (6.5 g, 100 mmol) was added; the mixture was kept below 30 °C during the addition and stirred for 24 hours.',
    expected: [
      { type: 'MASS', value: 6.5 },
      { type: 'AMOUNT', value: 0.1 },
      { type: 'TEMPERATURE', value: 30 },
      { type: 'TIME', value: 1440 },
    ],
  },
  {
    id: 'W13',
    text: 'TEST FIXTURE. Hydrogen peroxide (30 %, 11.3 g) was added dropwise over 20 minutes at 10-15 °C.',
    expected: [
      { type: 'MASS', value: 11.3 },
      { type: 'TIME', value: 20 },
      { type: 'TEMPERATURE', value: 15 },
    ],
  },
  {
    id: 'W14',
    text: 'TEST FIXTURE. The crude oil (5.4 g) was purified on silica (200 g) eluting with 10 % EtOAc in heptane (1.2 L).',
    expected: [
      { type: 'MASS', value: 5.4 },
      { type: 'MASS', value: 200 },
      { type: 'VOLUME', value: 1200 },
    ],
  },
  {
    id: 'W15',
    text: 'TEST FIXTURE. Triethylamine (3.0 equiv, 42 mL) and methanesulfonyl chloride (1.2 eq, 9.3 mL) were added at -5 °C; after 30 min the mixture was warmed to 20 °C.',
    expected: [
      { type: 'EQUIVALENTS', value: 3 },
      { type: 'VOLUME', value: 42 },
      { type: 'EQUIVALENTS', value: 1.2 },
      { type: 'VOLUME', value: 9.3 },
      { type: 'TEMPERATURE', value: -5 },
      { type: 'TIME', value: 30 },
      { type: 'TEMPERATURE', value: 20 },
    ],
  },
  {
    id: 'W16',
    text: 'TEST FIXTURE. The nitration was run at 104 °F with fuming nitric acid (2.2 equiv) added via an addition funnel over 40 min.',
    expected: [
      { type: 'TEMPERATURE', value: 40 },
      { type: 'EQUIVALENTS', value: 2.2 },
      { type: 'TIME', value: 40 },
    ],
  },
  {
    id: 'W17',
    text: 'TEST FIXTURE. Sodium borohydride (1.9 g, 50 mmol) was added in portions at 0 °C and the reaction was stirred for 2–3 h.',
    expected: [
      { type: 'MASS', value: 1.9 },
      { type: 'AMOUNT', value: 0.05 },
      { type: 'TEMPERATURE', value: 0 },
      { type: 'TIME', value: 180 },
    ],
  },
  {
    id: 'W18',
    text: 'TEST FIXTURE. A 20 L jacketed vessel was charged with water (8 L) and the salt (1.25 kg); the slurry was heated to 95 °C for 6 hrs.',
    expected: [
      { type: 'VOLUME', value: 20000 },
      { type: 'VOLUME', value: 8000 },
      { type: 'MASS', value: 1250 },
      { type: 'TEMPERATURE', value: 95 },
      { type: 'TIME', value: 360 },
    ],
  },
  {
    id: 'W19',
    text: 'TEST FIXTURE. n-Butyllithium (2.5 M, 44 mL, 110 mmol) was added over 15 min at -70 °C; the anion was stirred for 1 h before DMF (9.3 mL) was added.',
    expected: [
      { type: 'VOLUME', value: 44 },
      { type: 'AMOUNT', value: 0.11 },
      { type: 'TIME', value: 15 },
      { type: 'TEMPERATURE', value: -70 },
      { type: 'TIME', value: 60 },
      { type: 'VOLUME', value: 9.3 },
    ],
  },
  {
    id: 'W20',
    text: 'TEST FIXTURE. Example 12. The amide (0.50 g, 1.8 mmol) in POCl3 (5 mL) was heated at 100 °C for 2 h, poured onto ice (50 g) and neutralised with NaHCO3.',
    expected: [
      { type: 'MASS', value: 0.5 },
      { type: 'AMOUNT', value: 0.0018 },
      { type: 'VOLUME', value: 5 },
      { type: 'TEMPERATURE', value: 100 },
      { type: 'TIME', value: 120 },
      { type: 'MASS', value: 50 },
    ],
  },
];
