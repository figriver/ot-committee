import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { memberDisplayNames } from '@/lib/member-names';

// General hats: committee-level hat material that belongs to no post — what
// every member needs to know regardless of what they hold. Post hats (0017) say
// "here is your job"; these say "here is what we all run on".
//
// Groups are DATA (general_hat_groups), not a union type, so a third category is
// an INSERT rather than a code change. Reads are open to every logged-in member;
// writing is admin-only, enforced in the actions.

export type GeneralHatGroup = {
  key: string;
  label: string;
  blurb: string | null;
  sortOrder: number;
};

export type GeneralHatSummary = {
  id: string;
  groupKey: string;
  title: string;
  sortOrder: number;
  hasContent: boolean;
  /** First non-heading line of the body — a one-line taste of the document. */
  excerpt: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

export type GeneralHat = GeneralHatSummary & { body: string; groupLabel: string };

/** First readable line of a body, for the list rows. */
function excerptOf(body: string): string | null {
  for (const raw of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const text = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
    if (text) return text.length > 150 ? `${text.slice(0, 149)}…` : text;
  }
  return null;
}

/** Every group, in display order. */
export async function listGroups(): Promise<GeneralHatGroup[]> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('general_hat_groups')
    .select('key, label, blurb, sort_order')
    .order('sort_order', { ascending: true })
    .order('key', { ascending: true });
  if (error) throw new Error(`listGroups: ${error.message}`);
  return (data ?? []).map((g) => ({
    key: g.key as string,
    label: g.label as string,
    blurb: (g.blurb as string | null) ?? null,
    sortOrder: g.sort_order as number,
  }));
}

/** Every general hat, in group + sort order, for the index page. */
export async function listGeneralHats(): Promise<GeneralHatSummary[]> {
  const supa = getServiceClient();
  const { data, error } = await supa
    .from('general_hats')
    .select('id, group_key, title, body, sort_order, updated_by, updated_at')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw new Error(`listGeneralHats: ${error.message}`);
  const rows = data ?? [];
  const names = await memberDisplayNames(rows.map((r) => r.updated_by as string | null));
  return rows.map((r) => {
    const body = (r.body as string | null) ?? '';
    return {
      id: r.id as string,
      groupKey: r.group_key as string,
      title: r.title as string,
      sortOrder: r.sort_order as number,
      hasContent: body.trim() !== '',
      excerpt: excerptOf(body),
      updatedByName: r.updated_by ? names.get(r.updated_by as string) ?? null : null,
      updatedAt: (r.updated_at as string | null) ?? null,
    };
  });
}

/** One general hat with its body, or null if the id is unknown. */
export async function getGeneralHat(id: string): Promise<GeneralHat | null> {
  const supa = getServiceClient();
  const { data } = await supa
    .from('general_hats')
    .select('id, group_key, title, body, sort_order, updated_by, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;

  const groups = await listGroups();
  const body = (data.body as string | null) ?? '';
  const names = await memberDisplayNames([data.updated_by as string | null]);
  return {
    id: data.id as string,
    groupKey: data.group_key as string,
    groupLabel:
      groups.find((g) => g.key === data.group_key)?.label ?? (data.group_key as string),
    title: data.title as string,
    body,
    sortOrder: data.sort_order as number,
    hasContent: body.trim() !== '',
    excerpt: excerptOf(body),
    updatedByName: data.updated_by ? names.get(data.updated_by as string) ?? null : null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

/** Groups paired with their hats, in order — what the index page renders. */
export async function listGeneralHatsByGroup(): Promise<
  { group: GeneralHatGroup; hats: GeneralHatSummary[] }[]
> {
  const [groups, hats] = await Promise.all([listGroups(), listGeneralHats()]);
  return groups.map((group) => ({
    group,
    hats: hats.filter((h) => h.groupKey === group.key),
  }));
}
