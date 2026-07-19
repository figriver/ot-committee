// Board layout config for the Hubbard-style org board.
//
// Board order left-to-right and the executive grouping are org-board conventions,
// not something derivable from the row data alone, so they live here as config.
// Everything else (names, VFPs, colors, posts, hierarchy) is data-driven off the DB.

/** Divisions left-to-right across the board. */
export const BOARD_ORDER = [7, 1, 2, 3, 4, 5, 6] as const;

/** Executive Secretary sides and the divisions each one is senior over. */
export const EXEC_SIDES = {
  comm: { key: 'comm', label: 'Communications', divisions: [7, 1, 2] },
  org: { key: 'org', label: 'Organization', divisions: [3, 4, 5, 6] },
} as const;

export type ExecSide = keyof typeof EXEC_SIDES;

/** Which Exec-Sec side a division sits under (drives the connector + the senior box). */
export function sideForDivision(divisionNumber: number): ExecSide {
  return (EXEC_SIDES.org.divisions as readonly number[]).includes(divisionNumber)
    ? 'org'
    : 'comm';
}

/** Classify an Executive Secretary post title to its side. */
export function sideForExecTitle(title: string): ExecSide | null {
  if (/communications executive secretary/i.test(title)) return 'comm';
  if (/organization executive secretary/i.test(title)) return 'org';
  return null;
}
