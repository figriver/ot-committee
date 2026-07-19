/** Readable text color (dark or white) for a given background hex. */
export function textOn(hex?: string | null): string {
  if (!hex) return '#111827';
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return '#111827';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#ffffff';
}
