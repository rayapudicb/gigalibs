/**
 * The only constants in the engines: physical constants and definitions. Everything that is a judgement (thresholds,
 * ranges, bands, library values) is an input (see criteria.ts and library.ts).
 */

/** Molar gas constant, J/(mol·K). CODATA 2018 (exact in the 2019 SI). */
export const GAS_CONSTANT_J_PER_MOL_K = 8.314462618;

/** Molar volume of an ideal gas at 273.15 K and 101.325 kPa, L/mol. CODATA 2018. */
export const MOLAR_VOLUME_STP_L_PER_MOL = 22.41396954;

/** 0 °C in kelvin. */
export const ZERO_CELSIUS_K = 273.15;

/** TD24 is, by definition, the temperature at which TMRad equals 24 hours. */
export const TD24_HORIZON_HOURS = 24;

export const SECONDS_PER_HOUR = 3600;
