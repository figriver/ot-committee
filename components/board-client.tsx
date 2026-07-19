'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  addDepartment,
  addSection,
  addPost,
  addHolder,
  deleteRow,
  moveRow,
  updateField,
} from '@/app/board/actions';
import { textOn } from '@/lib/color';
import { BOARD_ORDER } from '@/lib/board-config';
import type {
  BoardOverview,
  DivisionOverview,
  DivisionFull,
  DepartmentFull,
  SectionWithPosts,
  PostWithHolders,
  Holder,
  ExecPost,
  ExecSecNode,
  EntityKind,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Context menu (shared floating menu; opened by caret click OR right-click)
// ---------------------------------------------------------------------------

type MenuItem = {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
};

type MenuCtx = {
  open: (e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]) => void;
};

const MenuContext = createContext<MenuCtx>({ open: () => {} });
const useMenu = () => useContext(MenuContext);

function MenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const open = useCallback<MenuCtx['open']>((e, items) => {
    e.preventDefault();
    e.stopPropagation();
    const W = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const H = typeof window !== 'undefined' ? window.innerHeight : 800;
    const x = Math.min(e.clientX, W - 200);
    const y = Math.min(e.clientY, H - 40 - items.length * 30);
    setState({ x: Math.max(8, x), y: Math.max(8, y), items });
  }, []);

  useEffect(() => {
    if (!state) return;
    const close = () => setState(null);
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [state]);

  return (
    <MenuContext.Provider value={{ open }}>
      {children}
      {state && (
        <ul
          className="ctx-menu"
          style={{ left: state.x, top: state.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {state.items.map((it, i) =>
            it.separator ? (
              <li key={i} className="ctx-sep" aria-hidden />
            ) : (
              <li
                key={i}
                className={`ctx-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}`}
                onClick={() => {
                  if (it.disabled) return;
                  setState(null);
                  it.onSelect?.();
                }}
              >
                {it.label}
              </li>
            ),
          )}
        </ul>
      )}
    </MenuContext.Provider>
  );
}

/** Small caret button that opens `items` as a menu. */
function Caret({ items, tone = 'dark' }: { items: MenuItem[]; tone?: 'dark' | 'light' }) {
  const { open } = useMenu();
  return (
    <button
      type="button"
      className={`caret ${tone}`}
      title="Menu"
      aria-label="Open menu"
      onClick={(e) => open(e, items)}
    >
      ▾
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline editing
// ---------------------------------------------------------------------------

function useEditable(kind: EntityKind, id: string, field: string, value: string | null) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [pending, start] = useTransition();
  useEffect(() => setVal(value ?? ''), [value]);

  const commit = () => {
    if ((val ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    start(async () => {
      await updateField(kind, id, field, val);
      setEditing(false);
    });
  };
  const cancel = () => {
    setVal(value ?? '');
    setEditing(false);
  };
  return { editing, setEditing, val, setVal, pending, commit, cancel };
}

type EditState = ReturnType<typeof useEditable>;

function EditField({
  state,
  multiline,
  placeholder,
}: {
  state: EditState;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { val, setVal, commit, cancel } = state;
  if (multiline) {
    return (
      <textarea
        autoFocus
        className="edit-textarea"
        value={val}
        placeholder={placeholder}
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
      placeholder={placeholder}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      }}
    />
  );
}

function confirmRemove(label: string) {
  return typeof window === 'undefined'
    ? true
    : window.confirm(`Remove this ${label}? This cannot be undone.`);
}

// ---------------------------------------------------------------------------
// Entity: Post (used on the division-detail page and for exec boxes)
// ---------------------------------------------------------------------------

function useRowActions() {
  const [, start] = useTransition();
  return (fn: () => Promise<void>) => start(() => fn());
}

function PostRow({ post }: { post: PostWithHolders }) {
  const { open } = useMenu();
  const edit = useEditable('posts', post.id, 'title', post.title);
  const run = useRowActions();

  const items: MenuItem[] = [
    { label: 'Edit title', onSelect: () => edit.setEditing(true) },
    { label: 'Add Position', onSelect: () => run(() => addPost(post.department_id, post.section_id)) },
    { label: 'Add Holder', onSelect: () => run(() => addHolder(post.id)) },
    {
      label: post.is_vacant ? 'Mark Filled' : 'Mark Vacant',
      onSelect: () => run(() => updateField('posts', post.id, 'is_vacant', !post.is_vacant)),
    },
    { separator: true, label: '' },
    { label: 'Move up', onSelect: () => run(() => moveRow('posts', post.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('posts', post.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('post') && run(() => deleteRow('posts', post.id)) },
  ];

  return (
    <div className={`ob-post${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-post-title">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <span className="ob-post-name" onDoubleClick={() => edit.setEditing(true)}>
            {post.title}
          </span>
        )}
        {post.is_vacant && <span className="ob-vacant">vacant</span>}
        <Caret items={items} />
      </div>
      {post.holders.length > 0 && (
        <div className="ob-holders">
          {post.holders.map((h) => (
            <HolderRow key={h.id} holder={h} />
          ))}
        </div>
      )}
    </div>
  );
}

function HolderRow({ holder }: { holder: Holder }) {
  const { open } = useMenu();
  const edit = useEditable('post_holders', holder.id, 'holder_name', holder.holder_name);
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit name', onSelect: () => edit.setEditing(true) },
    { label: 'Move up', onSelect: () => run(() => moveRow('post_holders', holder.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('post_holders', holder.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('holder') && run(() => deleteRow('post_holders', holder.id)) },
  ];
  return (
    <div className={`ob-holder${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      {edit.editing ? (
        <EditField state={edit} placeholder="holder name" />
      ) : (
        <span onDoubleClick={() => edit.setEditing(true)}>
          {holder.holder_name || <span className="ob-muted">unnamed</span>}
        </span>
      )}
      <Caret items={items} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity: Section (a group of posts inside a department)
// ---------------------------------------------------------------------------

function SectionBlock({ section }: { section: SectionWithPosts }) {
  const { open } = useMenu();
  const edit = useEditable('sections', section.id, 'name', section.name);
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => edit.setEditing(true) },
    { label: 'Add Position', onSelect: () => run(() => addPost(section.department_id, section.id)) },
    { label: 'Move up', onSelect: () => run(() => moveRow('sections', section.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('sections', section.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('section') && run(() => deleteRow('sections', section.id)) },
  ];
  return (
    <div className="ob-section" onContextMenu={(e) => open(e, items)}>
      <div className="ob-section-head">
        {edit.editing ? <EditField state={edit} /> : <span onDoubleClick={() => edit.setEditing(true)}>{section.name}</span>}
        <Caret items={items} />
      </div>
      {section.posts.map((p) => (
        <PostRow key={p.id} post={p} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity: Department column (division-detail page)
// ---------------------------------------------------------------------------

function DeptColumn({ dept, color }: { dept: DepartmentFull; color: string }) {
  const { open } = useMenu();
  const nameEdit = useEditable('departments', dept.id, 'name', dept.name);
  const vfpEdit = useEditable('departments', dept.id, 'vfp', dept.vfp);
  const run = useRowActions();
  const ink = textOn(color);

  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => nameEdit.setEditing(true) },
    { label: 'Add Section', onSelect: () => run(() => addSection(dept.id)) },
    { label: 'Add Position', onSelect: () => run(() => addPost(dept.id, null)) },
    { label: 'Edit VFP', onSelect: () => vfpEdit.setEditing(true) },
    { separator: true, label: '' },
    { label: 'Move left', onSelect: () => run(() => moveRow('departments', dept.id, 'up')) },
    { label: 'Move right', onSelect: () => run(() => moveRow('departments', dept.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('department') && run(() => deleteRow('departments', dept.id)) },
  ];

  return (
    <div className="ob-deptcol" onContextMenu={(e) => open(e, items)}>
      <div className="ob-deptcol-head" style={{ background: color, color: ink }}>
        <span className="ob-deptcol-num" style={{ color: ink }}>
          Dept {dept.number}
        </span>
        <span className="ob-deptcol-name">
          {nameEdit.editing ? (
            <EditField state={nameEdit} />
          ) : (
            <span onDoubleClick={() => nameEdit.setEditing(true)}>{dept.name}</span>
          )}
        </span>
        <Caret items={items} tone={ink === '#ffffff' ? 'light' : 'dark'} />
      </div>

      <div className="ob-deptcol-body">
        {dept.sections.map((s) => (
          <SectionBlock key={s.id} section={s} />
        ))}
        {dept.posts.map((p) => (
          <PostRow key={p.id} post={p} />
        ))}
        {dept.sections.length === 0 && dept.posts.length === 0 && (
          <div className="ob-empty">No positions yet — right-click to add.</div>
        )}
      </div>

      <div className="ob-deptcol-vfp">
        <span className="ob-vfp-key">VFP:</span>{' '}
        {vfpEdit.editing ? (
          <EditField state={vfpEdit} multiline placeholder="Department VFP" />
        ) : (
          <span className="ob-vfp-val" onDoubleClick={() => vfpEdit.setEditing(true)}>
            {dept.vfp || <span className="ob-muted">—</span>}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exec boxes (top tier)
// ---------------------------------------------------------------------------

function ExecBox({
  post,
  role,
  className = '',
}: {
  post: ExecPost | null;
  role: string;
  className?: string;
}) {
  const { open } = useMenu();
  const edit = useEditable('posts', post?.id ?? '', 'title', post?.title ?? null);
  const run = useRowActions();
  if (!post) {
    return (
      <div className={`ob-exec ${className}`}>
        <div className="ob-exec-role">{role}</div>
        <div className="ob-exec-title ob-muted">(not seeded)</div>
      </div>
    );
  }
  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => edit.setEditing(true) },
    {
      label: post.is_vacant ? 'Mark Filled' : 'Mark Vacant',
      onSelect: () => run(() => updateField('posts', post.id, 'is_vacant', !post.is_vacant)),
    },
  ];
  return (
    <div className={`ob-exec ${className}${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <div className="ob-exec-role">{role}</div>
      <div className="ob-exec-title">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <span onDoubleClick={() => edit.setEditing(true)}>{post.title}</span>
        )}
        <Caret items={items} tone="light" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: a single division column (whole-board tree)
// ---------------------------------------------------------------------------

function DivisionColumn({ division }: { division: DivisionOverview }) {
  const { open } = useMenu();
  const nameEdit = useEditable('divisions', division.id, 'name', division.name);
  const run = useRowActions();
  const color = division.color ?? '#e5e7eb';
  const ink = textOn(color);

  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => nameEdit.setEditing(true) },
    { label: 'Add Department', onSelect: () => run(() => addDepartment(division.id)) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('division') && run(() => deleteRow('divisions', division.id)) },
  ];

  return (
    <div className="ob-divcol">
      <div
        className="ob-divcol-head"
        style={{ background: color, color: ink }}
        onContextMenu={(e) => open(e, items)}
      >
        <span className="ob-divcol-num" style={{ borderColor: ink, color: ink }}>
          Div {division.number}
        </span>
        <Link href={`/board/${division.number}`} className="ob-divcol-name" style={{ color: ink }}>
          {nameEdit.editing ? (
            <span onClick={(e) => e.preventDefault()}>
              <EditField state={nameEdit} />
            </span>
          ) : (
            division.name
          )}
        </Link>
        <Caret items={items} tone={ink === '#ffffff' ? 'light' : 'dark'} />
      </div>

      <div className="ob-divcol-depts">
        {division.departments.map((dept) => (
          <DeptBox key={dept.id} dept={dept} divisionNumber={division.number} />
        ))}
      </div>

      <div className="ob-divcol-vfp" style={{ borderColor: color }}>
        <span className="ob-vfp-key">VFP:</span> {division.vfp || <span className="ob-muted">—</span>}
      </div>
    </div>
  );
}

function DeptBox({
  dept,
  divisionNumber,
}: {
  dept: DivisionOverview['departments'][number];
  divisionNumber: number;
}) {
  const { open } = useMenu();
  const edit = useEditable('departments', dept.id, 'name', dept.name);
  const run = useRowActions();
  const items: MenuItem[] = [
    { label: 'Edit', onSelect: () => edit.setEditing(true) },
    { label: 'Add Section', onSelect: () => run(() => addSection(dept.id)) },
    { label: 'Add Position', onSelect: () => run(() => addPost(dept.id, null)) },
    { separator: true, label: '' },
    { label: 'Move up', onSelect: () => run(() => moveRow('departments', dept.id, 'up')) },
    { label: 'Move down', onSelect: () => run(() => moveRow('departments', dept.id, 'down')) },
    { separator: true, label: '' },
    { label: 'Remove', danger: true, onSelect: () => confirmRemove('department') && run(() => deleteRow('departments', dept.id)) },
  ];
  return (
    <div className={`ob-deptbox${edit.pending ? ' pending' : ''}`} onContextMenu={(e) => open(e, items)}>
      <span className="ob-deptbox-num">Dept {dept.number}</span>
      <span className="ob-deptbox-name">
        {edit.editing ? (
          <EditField state={edit} />
        ) : (
          <Link href={`/board/${divisionNumber}`}>{dept.name}</Link>
        )}
      </span>
      <Caret items={items} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector lines (pure presentation) for the executive tier
// ---------------------------------------------------------------------------

// Column centers for a 7-column grid, in %.
const C = BOARD_ORDER.map((_, i) => ((i + 0.5) / 7) * 100); // c[0..6]
const COMM_MID = C[1]; // center of cols 1-3 (Div 7/1/2)
const ORG_MID = (C[3] + C[6]) / 2; // center of cols 4-7 (Div 3/4/5/6)

function VLine({ left, top, height }: { left: number; top: number; height: number }) {
  return <span className="cx-v" style={{ left: `${left}%`, top, height }} />;
}
function HLine({ left, right, top }: { left: number; right: number; top: number }) {
  return <span className="cx-h" style={{ left: `${left}%`, right: `${right}%`, top }} />;
}

function ExecConnectors() {
  return (
    <>
      {/* Chairman -> two Exec Secs */}
      <div className="cx-zone" style={{ height: 40 }}>
        <VLine left={50} top={0} height={14} />
        <HLine left={COMM_MID} right={100 - ORG_MID} top={14} />
        <VLine left={COMM_MID} top={14} height={26} />
        <VLine left={ORG_MID} top={14} height={26} />
      </div>
    </>
  );
}

function ColumnConnectors() {
  return (
    <div className="cx-zone" style={{ height: 26 }}>
      {/* Comm Exec Sec down into Div 7/1/2 (cols 1-3) */}
      <VLine left={COMM_MID} top={0} height={10} />
      <HLine left={C[0]} right={100 - C[2]} top={10} />
      <VLine left={C[0]} top={10} height={16} />
      <VLine left={C[1]} top={10} height={16} />
      <VLine left={C[2]} top={10} height={16} />
      {/* Org Exec Sec down into Div 3/4/5/6 (cols 4-7) */}
      <VLine left={ORG_MID} top={0} height={10} />
      <HLine left={C[3]} right={100 - C[6]} top={10} />
      <VLine left={C[3]} top={10} height={16} />
      <VLine left={C[4]} top={10} height={16} />
      <VLine left={C[5]} top={10} height={16} />
      <VLine left={C[6]} top={10} height={16} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page roots
// ---------------------------------------------------------------------------

export function OverviewBoard({ data }: { data: BoardOverview }) {
  const { divisions, exec } = data;
  const comm = exec.execSecs.find((s) => s.side === 'comm') ?? null;
  const org = exec.execSecs.find((s) => s.side === 'org') ?? null;

  return (
    <MenuProvider>
      <div className="ob-topbar">
        <h1>OT Committee Org Board</h1>
        <span className="ob-hint">Right-click (or the ▾ caret) on any box to edit · click a division to open it</span>
      </div>

      <div className="ob-scroll">
        <div className="ob-board">
          {/* Executive tier */}
          <div className="ob-exec-top">
            <ExecBox post={exec.chairman} role="Chairman" className="chairman" />
          </div>
          <ExecConnectors />
          <div className="ob-exec-secs">
            <ExecBox post={comm} role="Communications Exec Sec · Div 7/1/2" className="execsec" />
            <ExecBox post={org} role="Organization Exec Sec · Div 3/4/5/6" className="execsec" />
          </div>
          <ColumnConnectors />

          {/* Division columns */}
          <div className="ob-columns">
            {divisions.map((d) => (
              <DivisionColumn key={d.id} division={d} />
            ))}
          </div>

          {/* Board-wide VFP */}
          <div className="ob-board-vfp">
            <span className="ob-vfp-key">OT Committee — Valuable Final Product:</span>{' '}
            {divisions.find((d) => d.number === 7)?.vfp ?? 'A viable, expanding OT Committee'}
          </div>
        </div>
      </div>
    </MenuProvider>
  );
}

export function DivisionDetail({
  division,
  seniorExec,
  seniorRole,
}: {
  division: DivisionFull;
  seniorExec: ExecPost | null;
  seniorRole: string;
}) {
  const color = division.color ?? '#e5e7eb';
  const ink = textOn(color);
  const vfpEdit = useEditableDivisionVfp(division);

  return (
    <MenuProvider>
      <div className="ob-topbar">
        <Link href="/board" className="ob-back">
          ← Board
        </Link>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="ob-swatch" style={{ background: color }} />
          Division {division.number} · {division.name}
        </h1>
      </div>

      <div className="ob-scroll">
        <div className="ob-detail">
          {/* Senior exec box connected above */}
          <div className="ob-senior-wrap">
            <div className="ob-senior" style={{ borderColor: color }}>
              <div className="ob-exec-role">{seniorRole}</div>
              <div className="ob-senior-title">
                {seniorExec ? seniorExec.title : <span className="ob-muted">(senior exec)</span>}
              </div>
            </div>
            <div className="cx-zone" style={{ height: 18 }}>
              <VLine left={50} top={0} height={18} />
            </div>
            <div className="ob-division-band" style={{ background: color, color: ink }}>
              Division {division.number} — {division.name}
            </div>
          </div>

          {/* Departments side by side */}
          <div className="ob-detail-cols">
            {division.departments.map((dept) => (
              <DeptColumn key={dept.id} dept={dept} color={color} />
            ))}
          </div>

          {/* Division VFP bar */}
          <div className="ob-division-vfp" style={{ background: color, color: ink }}>
            <span className="ob-vfp-key" style={{ color: ink }}>
              Division {division.number} · {division.name} — VFP:
            </span>{' '}
            {vfpEdit.editing ? (
              <EditField state={vfpEdit} multiline placeholder="Division VFP" />
            ) : (
              <span onDoubleClick={() => vfpEdit.setEditing(true)}>
                {division.vfp || <span className="ob-muted">—</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </MenuProvider>
  );
}

// division VFP needs its own editable; wrap in a tiny hook so it lives above the JSX
function useEditableDivisionVfp(division: DivisionFull) {
  return useEditable('divisions', division.id, 'vfp', division.vfp);
}

export { MenuProvider };
export type { ExecSecNode };
