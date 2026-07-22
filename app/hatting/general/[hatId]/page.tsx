import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getGeneralHat, listGroups } from '@/lib/general-hats';
import { HatEditor } from '@/components/hat-editor';
import {
  saveGeneralHatBody,
  updateGeneralHatMeta,
  deleteGeneralHat,
} from '@/app/hatting/actions';
import { HattingSubNav } from '@/components/hatting-subnav';

export const dynamic = 'force-dynamic';

// One general hat, read long-form — the same card, markdown subset and editor as
// a post's hat (HatEditor), only bound to this hat's save action. Reading is open
// to every member; every write action re-checks for admin server-side.

export default async function GeneralHatPage({
  params,
}: {
  params: Promise<{ hatId: string }>;
}) {
  const member = await requireMember();
  const { hatId } = await params;
  const hat = await getGeneralHat(hatId);
  if (!hat) notFound();

  const isAdmin = member.role === 'admin';
  const groups = isAdmin ? await listGroups() : [];
  const updatedAtLabel = hat.updatedAt
    ? new Date(hat.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <HattingSubNav active="general" />
      <div className="pw-wrap">
      <div className="pw-head">
        <div className="pw-headmain">
          <p className="pw-ctx">General Hat · {hat.groupLabel}</p>
          <h1>{hat.title}</h1>
        </div>
        <Link href="/hatting/general" className="pw-back">
          ← General Hats
        </Link>
      </div>

      <HatEditor
        cardTitle="Hat write-up"
        initialBody={hat.body}
        save={saveGeneralHatBody.bind(null, hat.id)}
        canEdit={isAdmin}
        updatedByName={hat.updatedByName}
        updatedAtLabel={updatedAtLabel}
        emptyText={
          isAdmin
            ? 'Nothing written yet. Use “Write hat” to add this hat’s sections.'
            : 'Nothing written yet.'
        }
      />

      {isAdmin && (
        <section className="gh-admin">
          <h2 className="gh-admintitle">Hat settings</h2>
          <form action={updateGeneralHatMeta} className="gh-adminform">
            <input type="hidden" name="id" value={hat.id} />
            <label className="gh-field">
              <span className="gh-label">Title</span>
              <input
                type="text"
                name="title"
                defaultValue={hat.title}
                required
                maxLength={120}
                className="gh-input"
              />
            </label>
            <label className="gh-field">
              <span className="gh-label">Group</span>
              <select name="group" className="gh-select" defaultValue={hat.groupKey}>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="gh-create">
              Save settings
            </button>
          </form>

          {/* Two deliberate steps rather than a JS confirm() — the disclosure is
              the guard, so this stays a pure server form. */}
          <details className="gh-danger">
            <summary className="gh-dangersummary">Delete this hat</summary>
            <form action={deleteGeneralHat} className="gh-dangerform">
              <input type="hidden" name="id" value={hat.id} />
              <p className="gh-dangertext">
                Deleting removes “{hat.title}” and its write-up for everyone. This cannot be
                undone.
              </p>
              <button type="submit" className="gh-delete">
                Delete permanently
              </button>
            </form>
          </details>
        </section>
      )}
      </div>
    </>
  );
}
