/** App-wide settings that aren't branding. */
export const appConfig = {
  /** Timestamps in tables and exports are shown in this time zone (PPI Malaysia). */
  timeZone: "Asia/Kuala_Lumpur",
  /** UTC offset of timeZone in hours (Malaysia has no daylight saving). */
  utcOffsetHours: 8,
  /**
   * "This semester" on the secretary dashboard: semesters start on the 1st of
   * these months (Malaysian public universities: ~February and ~September).
   */
  semesterStartMonths: [2, 9],
  /** Rows per page in the responses table and the form registry. */
  responsesPageSize: 25,
  registryPageSize: 50,
} as const;
