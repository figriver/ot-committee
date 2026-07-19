'use client';

import { useEffect, useState, useTransition } from 'react';
import { updateField } from '@/app/board/actions';
import type { EntityKind } from '@/lib/types';

type Props = {
  kind: EntityKind;
  id: string;
  field: string;
  value: string | null;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
};

export default function EditableText({
  kind,
  id,
  field,
  value,
  multiline = false,
  placeholder = 'Click to edit',
  className = '',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [pending, start] = useTransition();

  useEffect(() => {
    setVal(value ?? '');
  }, [value]);

  function commit() {
    if ((val ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    start(async () => {
      await updateField(kind, id, field, val);
      setEditing(false);
    });
  }

  function cancel() {
    setVal(value ?? '');
    setEditing(false);
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          autoFocus
          className="edit-textarea"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
          }}
        />
      );
    }
    return (
      <input
        autoFocus
        className="edit-input"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
      />
    );
  }

  const hasValue = (value ?? '').trim().length > 0;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      className={`editable ${pending ? 'pending' : ''} ${className}`}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
    >
      {hasValue ? value : <span className="placeholder">{placeholder}</span>}
    </span>
  );
}
