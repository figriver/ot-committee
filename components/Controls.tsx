'use client';

import { useTransition } from 'react';
import {
  addDepartment,
  addSection,
  addPost,
  addHolder,
  deleteRow,
  moveRow,
  updateField,
} from '@/app/board/actions';
import type { EntityKind } from '@/lib/types';

export function MoveButtons({
  kind,
  id,
  orientation = 'vertical',
}: {
  kind: EntityKind;
  id: string;
  orientation?: 'vertical' | 'horizontal';
}) {
  const [pending, start] = useTransition();
  const up = orientation === 'horizontal' ? '◀' : '▲';
  const down = orientation === 'horizontal' ? '▶' : '▼';
  return (
    <span className="ctrls">
      <button
        className="btn icon"
        disabled={pending}
        title="Move earlier"
        onClick={() => start(() => moveRow(kind, id, 'up'))}
      >
        {up}
      </button>
      <button
        className="btn icon"
        disabled={pending}
        title="Move later"
        onClick={() => start(() => moveRow(kind, id, 'down'))}
      >
        {down}
      </button>
    </span>
  );
}

export function DeleteButton({
  kind,
  id,
  label,
}: {
  kind: EntityKind;
  id: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn icon danger"
      disabled={pending}
      title={`Delete ${label}`}
      onClick={() => {
        if (confirm(`Delete this ${label}? This cannot be undone.`)) {
          start(() => deleteRow(kind, id));
        }
      }}
    >
      ✕
    </button>
  );
}

type AddType = 'department' | 'section' | 'post' | 'holder';

export function AddButton({
  type,
  parentId,
  sectionId = null,
  children,
}: {
  type: AddType;
  parentId: string;
  sectionId?: string | null;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  function run() {
    start(async () => {
      if (type === 'department') await addDepartment(parentId);
      else if (type === 'section') await addSection(parentId);
      else if (type === 'post') await addPost(parentId, sectionId);
      else if (type === 'holder') await addHolder(parentId);
    });
  }
  return (
    <button className="btn add" disabled={pending} onClick={run}>
      {pending ? 'Working…' : children}
    </button>
  );
}

export function VacancyToggle({
  id,
  isVacant,
}: {
  id: string;
  isVacant: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn icon"
      disabled={pending}
      title={isVacant ? 'Mark as filled' : 'Mark as vacant (HFA)'}
      onClick={() => start(() => updateField('posts', id, 'is_vacant', !isVacant))}
    >
      {isVacant ? 'Fill' : 'Vacate'}
    </button>
  );
}
