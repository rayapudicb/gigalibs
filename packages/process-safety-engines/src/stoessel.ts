/** Stoessel criticality class, 1 to 5 (BRD §15). A definition, not a threshold: it orders MTSR, MTT and TD24. */
export type StoesselClass = 1 | 2 | 3 | 4 | 5;

/**
 * 1: MTSR < MTT < TD24 · 2: MTSR < TD24 < MTT · 3: MTT ≤ MTSR < TD24 · 4: MTT < TD24 ≤ MTSR · 5: TD24 ≤ MTSR and
 * TD24 ≤ MTT. Null when any temperature is unknown. Temperatures in °C.
 */
export function stoesselClass(
  mtsrC: number | null,
  mttC: number | null,
  td24C: number | null,
): StoesselClass | null {
  if (mtsrC === null || mttC === null || td24C === null) return null;
  if (td24C <= mtsrC && td24C <= mttC) return 5;
  if (mttC < td24C && td24C <= mtsrC) return 4;
  if (mttC <= mtsrC && mtsrC < td24C) return 3;
  if (mtsrC < td24C && td24C <= mttC) return 2;
  return 1;
}
