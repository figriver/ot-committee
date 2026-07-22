// The event TYPE vocabulary — no 'server-only' and no DB import, because the
// composer and editor are client components and need these labels. Everything
// that touches the database lives in lib/events.ts, which re-exports these.
//
// The values must stay in step with the events_type_chk constraint (0019).

export const EVENT_TYPES = [
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'recruitment', label: 'Recruitment' },
  { value: 'dianetics_seminar', label: 'Dianetics seminar' },
  { value: 'bridge_event', label: 'Bridge event' },
  { value: 'other', label: 'Other' },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]['value'];

export function isEventType(v: unknown): v is EventType {
  return EVENT_TYPES.some((t) => t.value === v);
}

export function eventTypeLabel(t: string): string {
  return EVENT_TYPES.find((x) => x.value === t)?.label ?? 'Other';
}
