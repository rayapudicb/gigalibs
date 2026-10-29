/** WI-OI-130: formula measures; performance and quality require production output facts (not wired in this slice). */
export const OEE_FORMULA_MEASURES = {
  availability:
    '(Planned_Operating_Time - Downtime) / Planned_Operating_Time',
  performance:
    '(Actual_Output * Ideal_Cycle_Time) / Planned_Operating_Time',
  quality: 'Good_Units / Total_Units',
  oee: 'Availability * Performance * Quality',
  mtbf: 'Operating_Time / Failure_Count',
  mttr: 'Total_Repair_Time / Failure_Count',
} as const;
