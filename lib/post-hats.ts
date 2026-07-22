import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { loadHierarchy } from '@/lib/hierarchy';
import { memberDisplayNames } from '@/lib/member-names';

// The post-hat INDEX: every org-board post that has a hat write-up, searchable
// by post name AND by the text of the hat itself — plus the posts with no hat,
// so the gaps are as visible as the coverage.
//
// Searching happens HERE (server-side) rather than by shipping every hat body
// to the browser: a fully-hatted board is ~250KB of text, which is not a payload
// to hand out on every page view.

export type PostHatRow = {
  postId: string;
  title: string;
  contextLabel: string; // "Div 1 · Department of Routing & Personnel"
  divisionNumber: number | null;
  holderName: string | null;
  isHFA: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
  /** First readable line, or the text around the search match. */
  snippet: string | null;
  /** True when `snippet` is a search hit rather than the opening line. */
  snippetIsMatch: boolean;
};

export type PostHatIndex = {
  hatted: PostHatRow[];
  unhatted: { postId: string; title: string; contextLabel: string; divisionNumber: number | null }[];
  totalPosts: number;
  totalHatted: number;
  query: string;
};

const contextOf = (p: {
  isDivisionHead: boolean;
  divisionNumber: number | null;
  departmentName: string | null;
}) =>
  p.isDivisionHead
    ? `Div ${p.divisionNumber ?? '?'} · (division head)`
    : `Div ${p.divisionNumber ?? '?'} · ${p.departmentName ?? '—'}`;

/** First line that is neither blank nor a heading. */
function openingLine(body: string): string | null {
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const text = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
    if (text) return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  }
  return null;
}

/** The text around the first match, so a hit on hat CONTENT shows its context. */
function matchSnippet(body: string, q: string): string | null {
  const flat = body.replace(/\r\n/g, '\n').replace(/[#*]/g, '').replace(/\s+/g, ' ');
  const i = flat.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  let start = Math.max(0, i - 60);
  const end = Math.min(flat.length, i + q.length + 90);
  // Snap the left edge to a word boundary — "…hem. If they" reads as a typo.
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space > -1 && space < i) start = space + 1;
  }
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

/**
 * Every post with a hat (optionally filtered by `q`, which matches the post
 * title OR the hat body), plus the posts still without one. Board order.
 */
export async function getPostHatIndex(q = ''): Promise<PostHatIndex> {
  const query = q.trim();
  const supa = getServiceClient();
  const [h, { data: writeups }] = await Promise.all([
    loadHierarchy(),
    supa.from('post_writeups').select('post_id, body, updated_by, updated_at'),
  ]);

  // post_id is nullable since 0021 — an UNATTACHED hat must not be counted as a
  // post's hat, or "N of 106 posts have a hat" overstates the coverage.
  const byPost = new Map(
    (writeups ?? [])
      .filter((w) => w.post_id && ((w.body as string | null) ?? '').trim() !== '')
      .map((w) => [w.post_id as string, w]),
  );
  const names = await memberDisplayNames([...byPost.values()].map((w) => w.updated_by as string | null));

  const posts = [...h.posts.values()].sort((a, b) => a.groupSort - b.groupSort);
  const needle = query.toLowerCase();

  const hatted: PostHatRow[] = [];
  const unhatted: PostHatIndex['unhatted'] = [];

  for (const p of posts) {
    const w = byPost.get(p.id);
    const titleHit = !needle || p.title.toLowerCase().includes(needle);

    if (!w) {
      // A post with no hat can only be found by its name — there is no text yet.
      if (titleHit) {
        unhatted.push({
          postId: p.id,
          title: p.title,
          contextLabel: contextOf(p),
          divisionNumber: p.divisionNumber,
        });
      }
      continue;
    }

    const body = (w.body as string) ?? '';
    const bodyHit = needle ? body.toLowerCase().includes(needle) : false;
    if (needle && !titleHit && !bodyHit) continue;

    const snippet = bodyHit ? matchSnippet(body, query) : null;
    hatted.push({
      postId: p.id,
      title: p.title,
      contextLabel: contextOf(p),
      divisionNumber: p.divisionNumber,
      holderName: p.holderName,
      isHFA: !p.holderMemberId,
      updatedByName: w.updated_by ? names.get(w.updated_by as string) ?? null : null,
      updatedAt: (w.updated_at as string | null) ?? null,
      snippet: snippet ?? openingLine(body),
      snippetIsMatch: Boolean(snippet),
    });
  }

  return {
    hatted,
    unhatted,
    totalPosts: h.posts.size,
    totalHatted: byPost.size,
    query,
  };
}
