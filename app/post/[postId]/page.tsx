import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getPostHeader, getWriteup, canEditPostWriteup, listPostOptions } from '@/lib/writeups';
import { PostPicker } from '@/components/post-picker';
import { AccountBar } from '@/components/account-bar';
import { WriteupEditor } from '@/components/writeup-editor';

export const dynamic = 'force-dynamic';

// Per-post detail: the post's hat write-up. Reachable from any board post. Reads
// open to every member; editing is the effective holder or an admin.
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const member = await requireMember();
  const { postId } = await params;

  const header = await getPostHeader(postId);
  if (!header) notFound();

  const isAdmin = member.role === 'admin';
  const [writeup, canEdit, posts] = await Promise.all([
    getWriteup(postId),
    canEditPostWriteup(member, postId),
    // Moving a hat between posts is an org-board decision — admin only, so the
    // option list is not even built for anyone else.
    isAdmin ? listPostOptions() : Promise.resolve([]),
  ]);

  const updatedAtLabel = writeup.updatedAt
    ? new Date(writeup.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <div className="pw-wrap">
        <div className="pw-head">
          <div className="pw-headmain">
            <p className="pw-ctx">{header.contextLabel}</p>
            <h1>{header.title}</h1>
            <p className="pw-holder">
              {header.isHFA ? (
                <span className="pw-hfa">HFA — unfilled</span>
              ) : (
                <>Held by {header.holderName ?? '—'}</>
              )}
            </p>
          </div>
          <Link href="/board" className="pw-back">
            ← Org Board
          </Link>
        </div>

        {/* This post's hat is only half of what a member is hatted on — the
            committee-level material sits in General Hats. */}
        <p className="pw-alsoread">
          Every member also reads the <Link href="/hatting/general">general hats</Link> — the member
          hat, meeting guidelines and committee reference. All post hats are indexed under{' '}
          <Link href="/hatting">Hatting</Link>.
        </p>

        <WriteupEditor
          postId={postId}
          initialBody={writeup.body}
          updatedByName={writeup.updatedByName}
          updatedAtLabel={updatedAtLabel}
          canEdit={canEdit}
        />

        {isAdmin && writeup.hatId && (
          <section className="gh-admin">
            <h2 className="gh-admintitle">Which post is this hat on?</h2>
            <div className="gh-adminform">
              <PostPicker
                hatId={writeup.hatId}
                posts={posts}
                currentPostId={postId}
                allowDetach
                label="Move this hat to a different post, or detach it into the unattached pool."
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
