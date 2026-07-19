const INK = '#111827'; // near-black body text
const PAPER = '#ffffff';

/** WCAG relative luminance of an sRGB hex color. */
function relLuminance(hex: string): number | null {
  const h = hex.replace('#', '').trim();
  if (h.length < 6) return null;
  const toLin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(parseInt(h.slice(0, 2), 16));
  const g = toLin(parseInt(h.slice(2, 4), 16));
  const b = toLin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (l1: number, l2: number) =>
  (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// Precompute the ink/paper luminances once.
const INK_L = relLuminance(INK)!;
const PAPER_L = relLuminance(PAPER)!;

/**
 * Readable text color (near-black or white) for a given background hex — picks
 * whichever gives the HIGHER WCAG contrast, so mid-tone colors (goldenrod, grey)
 * get dark text instead of low-contrast white. Falls back to dark ink.
 */
export function textOn(hex?: string | null): string {
  if (!hex) return INK;
  const bg = relLuminance(hex);
  if (bg === null) return INK;
  return contrast(bg, INK_L) >= contrast(bg, PAPER_L) ? INK : PAPER;
}
