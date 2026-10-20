import type { MaterialInput, MaterialRole, ThermalConditions } from '../../src/index.js';

/**
 * TEST FIXTURE. The five-step reference route (BRD TC-06 to TC-12; the owner's reference route image) with the
 * illustrative charges of the prototype the BRD was computed with: the charge lists in the owner's
 * SPEED_Desk_Screening_Dossier.docx ("Illustrative data. Charge masses … are placeholders"). BRD §17: "Values for the
 * 5-step route depend on its illustrative inputs and are regression baselines, not chemistry claims." Never product
 * data. Process conditions other than step 3's (TC-07, TC-08) are placeholders for the performance test.
 */
export interface FixtureStep {
  readonly id: string;
  readonly materials: readonly MaterialInput[];
  readonly conditions: ThermalConditions;
}

function material(
  id: string,
  role: MaterialRole,
  formula: string,
  coefficient: number | null,
  massG: number | null,
  libraryMaterialId: string,
): MaterialInput {
  return { id, role, formula, coefficient, massG, libraryMaterialId };
}

function conditions(overrides: Partial<ThermalConditions>): ThermalConditions {
  return {
    processTemperatureC: null,
    maximumTechnicalTemperatureC: null,
    heatCapacityJPerGK: null,
    accumulationPercent: 100,
    reactionEnthalpy: null,
    decomposition: null,
    td24EnteredC: null,
    dscOnsetC: null,
    ...overrides,
  };
}

export const REFERENCE_ROUTE: readonly FixtureStep[] = [
  {
    id: 's1',
    conditions: conditions({
      processTemperatureC: 40,
      maximumTechnicalTemperatureC: 82,
      heatCapacityJPerGK: 2.4,
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-01' },
      dscOnsetC: 200,
    }),
    materials: [
      material('m11', 'Reactant', 'C7H5FO', 1, 100.0, 'L01'),
      material('m12', 'Reactant', 'C7H12O3', 1, 122.0, 'L02'),
      material('m13', 'Additive', 'C5H11N', null, 6.9, 'L03'),
      material('m14', 'Additive', 'C2H4O2', null, 4.8, 'L04'),
      material('m15', 'Solvent', 'C3H8O', null, 393.0, 'L05'),
      material('m16', 'Work-up', 'H2O', null, 300.0, 'L06'),
      material('m17', 'Product', 'C14H15FO3', 1, 171.5, 'L26'),
      material('m18', 'By-product', 'H2O', 1, null, 'L06'),
    ],
  },
  {
    id: 's2',
    conditions: conditions({
      processTemperatureC: 50,
      maximumTechnicalTemperatureC: 189,
      heatCapacityJPerGK: 2.0,
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-02' },
      dscOnsetC: 210,
    }),
    materials: [
      material('m21', 'Reactant', 'C14H15FO3', 1, 171.5, 'L26'),
      material('m22', 'Reactant', 'C2H6N2S', 1, 74.1, 'L07'),
      material('m23', 'Additive', 'NaHCO3', null, 115.1, 'L08'),
      material('m24', 'Solvent', 'C2H6OS', null, 943.0, 'L09'),
      material('m25', 'Work-up', 'HCl', null, 100.0, 'L10'),
      material('m26', 'Work-up', 'H2O', null, 1500.0, 'L06'),
      material('m27', 'Work-up', 'C7H8', null, 800.0, 'L20'),
      material('m28', 'Product', 'C16H19FN2O2S', 1, 176.7, 'L26'),
      material('m29', 'By-product', 'H2O', 1, null, 'L06'),
    ],
  },
  {
    id: 's3',
    conditions: conditions({
      processTemperatureC: 25,
      maximumTechnicalTemperatureC: 56,
      heatCapacityJPerGK: 2.2,
      accumulationPercent: 20,
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-03' },
      decomposition: {
        activationEnergyKJPerMol: 90,
        heatReleaseRateWPerKg: 10,
        referenceTemperatureC: 140,
      },
    }),
    materials: [
      material('m31', 'Reactant', 'C16H19FN2O2S', 1, 176.7, 'L26'),
      material('m32', 'Reactant', 'KMnO4', 2, 207.8, 'L11'),
      material('m33', 'Solvent', 'C3H6O', null, 1398.0, 'L12'),
      material('m34', 'Additive', 'H2O', null, 200.0, 'L06'),
      material('m35', 'Work-up', 'H2O', null, 1000.0, 'L06'),
      material('m36', 'Work-up', 'C3H6O', null, 316.0, 'L12'),
      material('m37', 'Product', 'C16H17FN2O4S', 1, 164.2, 'L26'),
      material('m38', 'By-product', 'MnO2', 2, null, 'L13'),
      material('m39', 'By-product', 'KOH', 2, null, 'L14'),
    ],
  },
  {
    id: 's4',
    conditions: conditions({
      processTemperatureC: 70,
      maximumTechnicalTemperatureC: 189,
      heatCapacityJPerGK: 2.0,
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-04' },
      dscOnsetC: 180,
    }),
    materials: [
      material('m41', 'Reactant', 'C16H17FN2O4S', 1, 164.2, 'L26'),
      material('m42', 'Reactant', 'C2H7NO2S', 1, 61.0, 'L16'),
      material('m43', 'Reactant', 'NaOH', 1, 24.2, 'L17'),
      material('m44', 'Solvent', 'C2H6OS', null, 903.0, 'L09'),
      material('m45', 'Work-up', 'H2O', null, 2000.0, 'L06'),
      material('m46', 'Product', 'C17H20FN3O4S', 1, 160.0, 'L26'),
      material('m47', 'By-product', 'CH3NaO2S', 1, null, 'L18'),
      material('m48', 'By-product', 'H2O', 1, null, 'L06'),
    ],
  },
  {
    id: 's5',
    conditions: conditions({
      processTemperatureC: -10,
      maximumTechnicalTemperatureC: 111,
      heatCapacityJPerGK: 1.8,
      accumulationPercent: 50,
      reactionEnthalpy: { source: 'REACTION_CLASS', reactionClassId: 'RC-05' },
      dscOnsetC: 240,
    }),
    materials: [
      material('m51', 'Reactant', 'C17H20FN3O4S', 1, 160.0, 'L26'),
      material('m52', 'Reactant', 'C8H19Al', 2, 131.1, 'L19'),
      material('m53', 'Reactant', 'H2O', 6, 100.0, 'L06'),
      material('m54', 'Solvent', 'C7H8', null, 1387.0, 'L20'),
      material('m55', 'Work-up', 'HCl', null, 800.0, 'L10'),
      material('m56', 'Work-up', 'H2O', null, 500.0, 'L06'),
      material('m57', 'Product', 'C16H20FN3O3S', 1, 130.3, 'L26'),
      material('m58', 'By-product', 'CH4O', 1, null, 'L21'),
      material('m59', 'By-product', 'Al(OH)3', 2, null, 'L22'),
      material('m5a', 'By-product', 'C4H10', 4, null, 'L23'),
    ],
  },
];
