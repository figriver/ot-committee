'use client';

import { HatEditor } from '@/components/hat-editor';
import { saveWriteup } from '@/app/post/[postId]/actions';

// A post's hat write-up. Everything about the card, the markdown subset and the
// editor lives in HatEditor / hat-body — this only binds it to THIS post's save
// action, so a post hat and a general committee hat can never render differently.

export function WriteupEditor({
  postId,
  initialBody,
  updatedByName,
  updatedAtLabel,
  canEdit,
}: {
  postId: string;
  initialBody: string;
  updatedByName: string | null;
  updatedAtLabel: string | null;
  canEdit: boolean;
}) {
  return (
    <HatEditor
      cardTitle="Hat write-up"
      initialBody={initialBody}
      save={(body) => saveWriteup(postId, body)}
      canEdit={canEdit}
      updatedByName={updatedByName}
      updatedAtLabel={updatedAtLabel}
      emptyText={
        canEdit
          ? 'No hat write-up yet. Use “Write hat” to add the post’s Purpose, Duties, Stats, and VFP.'
          : 'No hat write-up yet.'
      }
    />
  );
}
