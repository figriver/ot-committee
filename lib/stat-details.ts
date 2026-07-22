// THE DETAIL REGISTRY — what each kind of stat has to say for itself.
//
// A number alone does not make the upline report. "Service Starts: 2" has to be
// two named people, each with a service and an org. This file is the single
// place that knows which fields a given kind of stat collects; the database
// stores them as a jsonb blob and knows nothing about their names.
//
// ADDING OR CHANGING A DETAIL TABLE IS A REGISTRY EDIT, NEVER A MIGRATION:
//   * new requirement on an existing stat → add a field to its spec here
//   * new stat that needs detail          → set stats.detail_kind to a spec key
//                                           (one row, no deploy needed)
// The same shape as the checklist parent registry (CHECKLIST.md): behaviour is
// declared in one table, and the rest of the system reads it.
//
// COUNT SPECS vs LIST SPECS
//   countsRows: true  → the value IS the number of rows. Service Starts = 2
//                       means two lines, and the form asks for exactly two.
//   countsRows: false → one or more lines describe the value without counting
//                       it (funds: which donors made up the amount).
//
// No 'server-only': the entry form is a client component and needs the specs to
// render its fields. Nothing here touches the database.

export type DetailFieldType = 'text' | 'number';

export type DetailField = {
  key: string;
  label: string;
  type: DetailFieldType;
  required: boolean;
  placeholder?: string;
};

export type DetailSpec = {
  kind: string;
  /** What one row is called, for buttons and messages ("start", "donation"). */
  noun: string;
  /** Plural, when adding "s" would be wrong ("person" → "people"). */
  nounPlural?: string;
  fields: DetailField[];
  /** The value equals the number of rows (see above). */
  countsRows: boolean;
  /** A value cannot be saved without its detail. */
  required: boolean;
  /** One line explaining what the report wants, shown above the rows. */
  hint: string;
};

const text = (key: string, label: string, required = true, placeholder?: string): DetailField => ({
  key,
  label,
  type: 'text',
  required,
  placeholder,
});
const number = (key: string, label: string, required = true): DetailField => ({
  key,
  label,
  type: 'number',
  required,
});

/** The kind used for a member's HOURS, which are not a stat row at all. */
export const HOURS_KIND = 'hours_project';

export const DETAIL_SPECS: Record<string, DetailSpec> = {
  service_starts: {
    kind: 'service_starts',
    noun: 'start',
    countsRows: true,
    required: true,
    hint: 'The report names every start: who, on what service, at which org.',
    fields: [
      text('person_name', 'Person', true, 'Name'),
      text('service', 'Service', true, 'e.g. Purif, HQS, OT V'),
      text('org', 'Org', true, 'e.g. CC Nashville, Flag'),
    ],
  },

  funds: {
    kind: 'funds',
    noun: 'donation',
    countsRows: false,
    required: true,
    hint: 'The report breaks the total down by donor.',
    fields: [
      text('donor_name', 'Donor', true, 'Name'),
      number('amount', 'Amount', true),
      text('org', 'Org', true, 'Which org it went to'),
    ],
  },

  [HOURS_KIND]: {
    kind: HOURS_KIND,
    noun: 'block of hours',
    countsRows: false,
    required: true,
    hint: 'What the hours went to — one line per project or post.',
    fields: [
      text('project_or_post', 'Project or post', true, 'e.g. Bridge flow; hat turnover'),
      number('hours', 'Hours', true),
    ],
  },

  member_activity: {
    kind: 'member_activity',
    noun: 'member',
    countsRows: true,
    required: false, // the count can be reported before every name is known
    hint: 'What each active member worked on this week.',
    fields: [
      text('member_name', 'Member', true, 'Name'),
      text('project_or_post', 'Worked on', true, 'Project or post'),
    ],
  },

  event: {
    kind: 'event',
    noun: 'event',
    countsRows: true,
    required: false,
    // NOTE: the Events subsystem (0019) already holds name, I/C and attendance.
    // These are typed by hand today; stat_detail_lines.source_event_id exists so
    // they can be generated from the real event later without a schema change.
    hint: 'Each event held: what it was, who ran it, what came of it.',
    fields: [
      text('event_name', 'Event', true, 'What was held'),
      text('ic', 'I/C', true, 'Who ran it'),
      text('products_gotten', 'Products gotten', false, 'What came of it'),
    ],
  },

  file_project: {
    kind: 'file_project',
    noun: 'volunteer',
    countsRows: true,
    required: false,
    hint: 'Who turned up, and which files project they worked on.',
    fields: [
      text('volunteer_name', 'Volunteer', true, 'Name'),
      text('project', 'Project', true, 'Which files project'),
    ],
  },

  joined_staff: {
    kind: 'joined_staff',
    noun: 'person',
    nounPlural: 'people',
    countsRows: true,
    required: true,
    hint: 'The report names who joined, and where.',
    fields: [
      text('person_name', 'Person', true, 'Name'),
      text('org', 'Org', true, 'Which org they joined'),
    ],
  },
};

export function specFor(kind: string | null | undefined): DetailSpec | null {
  if (!kind) return null;
  return DETAIL_SPECS[kind] ?? null;
}

export type DetailLineInput = Record<string, string>;

/**
 * Validate the lines a member typed for one stat, against its spec.
 * Returns a refusal SENTENCE, or null when they are acceptable.
 *
 * Blank rows are ignored, so a form can render three empty rows and the member
 * can fill in one. `value` is the number being reported, needed by countsRows.
 */
export function validateLines(
  spec: DetailSpec,
  lines: DetailLineInput[],
  value: number | null,
  statName: string,
): string | null {
  const filled = lines.filter((l) => spec.fields.some((f) => (l[f.key] ?? '').trim() !== ''));

  if (spec.required && (value ?? 0) > 0 && filled.length === 0) {
    return `${statName} needs its detail: ${spec.hint.toLowerCase()}`;
  }
  if (filled.length === 0) return null;

  for (const [i, line] of filled.entries()) {
    for (const f of spec.fields) {
      const raw = (line[f.key] ?? '').trim();
      if (f.required && raw === '') {
        return `${statName}: ${spec.noun} ${i + 1} needs ${f.label.toLowerCase()}.`;
      }
      if (f.type === 'number' && raw !== '' && !Number.isFinite(Number(raw))) {
        return `${statName}: ${f.label.toLowerCase()} must be a number (${spec.noun} ${i + 1}).`;
      }
    }
  }

  if (spec.countsRows && value !== null && filled.length !== value) {
    const unit = value === 1 ? spec.noun : spec.nounPlural ?? `${spec.noun}s`;
    return `${statName} is ${value}, so the report wants ${value} ${unit} — ${filled.length} filled in.`;
  }
  return null;
}

/** Drop empty rows and keep only the spec's own keys, trimmed. */
export function cleanLines(spec: DetailSpec, lines: DetailLineInput[]): DetailLineInput[] {
  return lines
    .map((l) => {
      const out: DetailLineInput = {};
      for (const f of spec.fields) {
        const v = (l[f.key] ?? '').trim();
        if (v !== '') out[f.key] = v;
      }
      return out;
    })
    .filter((l) => Object.keys(l).length > 0);
}

/** One-line summary of a saved line, for compact display in history. */
export function summarize(spec: DetailSpec, fields: Record<string, unknown>): string {
  return spec.fields
    .map((f) => {
      const v = fields[f.key];
      return v === undefined || v === null || v === '' ? null : String(v);
    })
    .filter(Boolean)
    .join(' · ');
}
