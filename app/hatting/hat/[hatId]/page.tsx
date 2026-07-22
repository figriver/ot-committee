import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireMember } from '@/lib/auth';
import { getHatById, canEditHat, listPostOptions } from '@/lib/writeups';
import { HattingSubNav } from '@/components/hatting-subnav';
import { HatEditor } from '@/components/hat-editor';
import { PostPicker } from '@/components/post-picker';
import { saveHatBody } from '@/app/hatting/hat-body-action';

export const dynamic = 'force-dynamic';

// An UNATTACHED hat's home (0021). A hat that has found its post lives at
// /post/[postId] as it always has, so this page forwards there rather than
// becoming a second URL for the same document.

export default async function UnattachedHatPage({
  params,
}: {
  params: Promise<{ hatId: string }>;
}) {
  const member = await requireMember();
  const { hatId } = await params;
  const hat = await getHatById(hatId);
  if (!hat) notFound();
  if (hat.postId) redirect(`/post/${hat.postId}`);

  const isAdmin = member.role === 'admin';
  const [canEdit, posts] = await Promise.all([
    canEditHat(member, hat),
    isAdmin ? listPostOptions() : Promise.resolve([]),
  ]);
  const updatedAtLabel = hat.updatedAt
    ? new Date(hat.updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <>
      <HattingSubNav active="posts" />
      <div className="pw-wrap">
        <div className="pw-head">
          <div className="pw-headmain">
            <p className="pw-ctx">Post Hat · unattached</p>
            <h1>{hat.displayTitle}</h1>
            <p className="pw-holder">
              <span className="pw-hfa">On no post</span>
            </p>
          </div>
          <Link href="/hatting" className="pw-back">
            ← Post Hats
          </Link>
        </div>

        <p className="pw-alsoread">
          This hat is written but sits on no post, so no one holds it yet.
          {isAdmin
            ? ' Attach it below and it moves onto that post’s page.'
            : ' An admin can attach it to a post.'}
        </p>

        <HatEditor
          cardTitle="Hat write-up"
          initialBody={hat.body}
          save={saveHatBody.bind(null, hat.id)}
          canEdit={canEdit}
          updatedByName={hat.updatedByName}
          updatedAtLabel={updatedAtLabel}
          emptyText={
            canEdit
              ? 'Nothing written yet. Use “Write hat” to add its Purpose, Duties, Stats and VFP.'
              : 'Nothing written yet.'
          }
        />

        {isAdmin && (
          <section className="gh-admin">
            <h2 className="gh-admintitle">Attach to a post</h2>
            <div className="gh-adminform">
              <PostPicker
                hatId={hat.id}
                posts={posts}
                currentPostId={null}
                allowDetach={false}
                label="Pick the post this hat belongs to."
              />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
