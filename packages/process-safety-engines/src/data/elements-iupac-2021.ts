import type { ElementTable } from '../types.js';

/**
 * Standard atomic weights, abridged to the precision used in screening (g/mol), with element classes.
 * Source: IUPAC Commission on Isotopic Abundances and Atomic Weights, "Standard atomic weights of the elements 2021",
 * Pure Appl. Chem. 2022, 94(5), 573–600; abridged and conventional values.
 * Physical reference data, not configuration. To be checked against the source by the cheminformatics specialist
 * before release (WI-OI-120br review items).
 */
const metal = (weight: number) => ({ weight, metal: true, halogen: false }) as const;
const nonMetal = (weight: number) => ({ weight, metal: false, halogen: false }) as const;
const halogen = (weight: number) => ({ weight, metal: false, halogen: true }) as const;

export const IUPAC_2021_ABRIDGED: ElementTable = {
  version: 'iupac-2021-abridged-1',
  citation:
    'IUPAC CIAAW, Standard atomic weights of the elements 2021, Pure Appl. Chem. 2022, 94(5), 573–600',
  elements: {
    H: nonMetal(1.008),
    He: nonMetal(4.0026),
    Li: metal(6.94),
    Be: metal(9.0122),
    B: nonMetal(10.81),
    C: nonMetal(12.011),
    N: nonMetal(14.007),
    O: nonMetal(15.999),
    F: halogen(18.998),
    Ne: nonMetal(20.18),
    Na: metal(22.99),
    Mg: metal(24.305),
    Al: metal(26.982),
    Si: nonMetal(28.085),
    P: nonMetal(30.974),
    S: nonMetal(32.06),
    Cl: halogen(35.45),
    Ar: nonMetal(39.95),
    K: metal(39.098),
    Ca: metal(40.078),
    Sc: metal(44.956),
    Ti: metal(47.867),
    V: metal(50.942),
    Cr: metal(51.996),
    Mn: metal(54.938),
    Fe: metal(55.845),
    Co: metal(58.933),
    Ni: metal(58.693),
    Cu: metal(63.546),
    Zn: metal(65.38),
    Ga: metal(69.723),
    Ge: nonMetal(72.63),
    As: nonMetal(74.922),
    Se: nonMetal(78.971),
    Br: halogen(79.904),
    Kr: nonMetal(83.798),
    Rb: metal(85.468),
    Sr: metal(87.62),
    Zr: metal(91.224),
    Mo: metal(95.95),
    Ru: metal(101.07),
    Rh: metal(102.91),
    Pd: metal(106.42),
    Ag: metal(107.87),
    Cd: metal(112.41),
    In: metal(114.82),
    Sn: metal(118.71),
    Sb: nonMetal(121.76),
    Te: nonMetal(127.6),
    I: halogen(126.904),
    Xe: nonMetal(131.29),
    Cs: metal(132.91),
    Ba: metal(137.33),
    La: metal(138.91),
    Ce: metal(140.12),
    W: metal(183.84),
    Os: metal(190.23),
    Ir: metal(192.22),
    Pt: metal(195.08),
    Au: metal(196.97),
    Hg: metal(200.59),
    Pb: metal(207.2),
    Bi: metal(208.98),
  },
};
