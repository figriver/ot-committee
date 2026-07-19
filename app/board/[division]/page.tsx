import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDivisionByNumber } from '@/lib/data';
import { textOn } from '@/lib/color';
import EditableText from '@/components/EditableText';
import {
  AddButton,
  DeleteButton,
  MoveButtons,
  VacancyToggle,
} from '@/components/Controls';
import type { PostWithHolders } from '@/lib/types';

export const dynamic = 'force-dynamic';

function PostView({ post }: { post: PostWithHolders }) {
  return (
    <div className="post">
      <div className="post-title">
        <EditableText kind="posts" id={post.id} field="title" value={post.title} />
        {post.is_vacant && <span className="vacant-badge">Vacant / HFA</span>}
      </div>

      {post.holders.length > 0 && (
        <div className="holders">
          {post.holders.map((h) => (
            <div className="holder" key={h.id}>
              <EditableText
                kind="post_holders"
                id={h.id}
                field="holder_name"
                value={h.holder_name}
                placeholder="holder name"
              />
              <MoveButtons kind="post_holders" id={h.id} />
              <DeleteButton kind="post_holders" id={h.id} label="holder" />
            </div>
          ))}
        </div>
      )}

      <div className="row-tools">
        <AddButton type="holder" parentId={post.id}>
          + Holder
        </AddButton>
        <span className="ctrls">
          <VacancyToggle id={post.id} isVacant={post.is_vacant} />
          <MoveButtons kind="posts" id={post.id} />
          <DeleteButton kind="posts" id={post.id} label="post" />
        </span>
      </div>
    </div>
  );
}

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ division: string }>;
}) {
  const { division: divisionParam } = await params;
  const divisionNumber = Number(divisionParam);
  if (!Number.isInteger(divisionNumber)) notFound();

  let division;
  try {
    division = await getDivisionByNumber(divisionNumber);
  } catch (e) {
    return (
      <div className="wrap">
        <div className="topbar">
          <Link href="/board" className="crumb">
            ← Board
          </Link>
        </div>
        <p style={{ color: 'var(--danger)' }}>
          Could not load this division: {(e as Error).message}
          <br />
          <span className="crumb">
            If the tables don’t exist yet, run the migrations in the Supabase SQL
            editor first.
          </span>
        </p>
      </div>
    );
  }
  if (!division) notFound();

  const color = division.color ?? '#e5e7eb';

  return (
    <div className="wrap">
      <div className="topbar">
        <Link href="/board" className="crumb">
          ← Board
        </Link>
      </div>

      <div className="detail-head">
        <span className="swatch" style={{ background: color }} />
        <span className="dept-num">Division {division.number}</span>
        <h1 style={{ margin: 0, fontSize: 22 }}>
          <EditableText
            kind="divisions"
            id={division.id}
            field="name"
            value={division.name}
          />
        </h1>
      </div>

      <div className="dept-scroll">
        {division.departments.map((dept) => (
          <div className="dept-col" key={dept.id}>
            <div
              className="dept-head"
              style={{ background: color, color: textOn(color) }}
            >
              <div
                className="dept-num"
                style={{ color: textOn(color), opacity: 0.85, display: 'flex', gap: 6, alignItems: 'center' }}
              >
                <span>Dept {dept.number}</span>
                <MoveButtons kind="departments" id={dept.id} orientation="horizontal" />
                <DeleteButton kind="departments" id={dept.id} label="department" />
              </div>
              <div className="dept-name">
                <EditableText
                  kind="departments"
                  id={dept.id}
                  field="name"
                  value={dept.name}
                />
              </div>
            </div>

            <div className="dept-body">
              {dept.sections.map((section) => (
                <div className="section-block" key={section.id}>
                  <div className="section-title">
                    <EditableText
                      kind="sections"
                      id={section.id}
                      field="name"
                      value={section.name}
                    />
                    <MoveButtons kind="sections" id={section.id} />
                    <DeleteButton kind="sections" id={section.id} label="section" />
                  </div>
                  {section.posts.map((post) => (
                    <PostView key={post.id} post={post} />
                  ))}
                  <AddButton type="post" parentId={dept.id} sectionId={section.id}>
                    + Post in section
                  </AddButton>
                </div>
              ))}

              {dept.posts.map((post) => (
                <PostView key={post.id} post={post} />
              ))}

              <div className="row-tools">
                <AddButton type="post" parentId={dept.id}>
                  + Post
                </AddButton>
                <AddButton type="section" parentId={dept.id}>
                  + Section
                </AddButton>
              </div>
            </div>

            <div className="dept-vfp">
              <div className="vfp-tag">Dept {dept.number} VFP</div>
              <EditableText
                kind="departments"
                id={dept.id}
                field="vfp"
                value={dept.vfp}
                multiline
                placeholder="Add a VFP"
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <span style={{ display: 'inline-block', minWidth: 200 }}>
          <AddButton type="department" parentId={division.id}>
            + Department
          </AddButton>
        </span>
      </div>

      <div
        className="division-vfp-bar"
        style={{ background: color, color: textOn(color) }}
      >
        <div className="vfp-tag" style={{ color: textOn(color), opacity: 0.85 }}>
          Division {division.number} · {division.name} — VFP
        </div>
        <EditableText
          kind="divisions"
          id={division.id}
          field="vfp"
          value={division.vfp}
          multiline
          placeholder="Add a division VFP"
        />
      </div>
    </div>
  );
}
