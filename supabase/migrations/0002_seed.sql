-- OT Committee Coordination System — Slice 1a
-- 0002_seed.sql : seed the blank canonical org board (CSI template, Item 18904R)
--
-- Run this SECOND, AFTER 0001_init_schema.sql.
-- This file is NOT applied automatically.
--
-- Source: OTCommitteeOrgBd.pdf (blank official template). Every post is seeded
-- is_vacant = true with NO holder names. The Nashville roster overlay is skipped.
--
-- Pure SQL only. Column names come from `SELECT ... AS name` (no VALUES column-alias
-- lists, which tripped the Supabase editor). Each insert is guarded by NOT EXISTS on
-- its own table, so the whole file is safe to re-run (seeded tables are skipped).
-- Regenerated clean: exactly one divisions block, exactly one departments block per
-- division, and one posts block. Expected result: 7 divisions / 21 departments / 97 posts.

-- ---- Divisions (board order 7,1,2,3,4,5,6) ----------------------------------
insert into public.divisions (number, name, vfp, color, sort_order)
select x.number, x.name, x.vfp, x.color, x.sort_order
from (
              select 7 as number, 'Executive'      as name, 'A viable, expanding OT Committee' as vfp, '#1B6EC2' as color, 1 as sort_order
  union all select 1,             'Communications',        'An established OT Committee that is capable of rapid expansion',                                                                                                     '#B8860B', 2
  union all select 2,             'Dissemination',         'Funds raised for OT Projects',                                                                                                                                      '#2E2E4F', 3
  union all select 3,             'Treasury',              'Preserved valuable assets and reserves of the OT Committee',                                                                                                         '#F2A0B0', 4
  union all select 4,             'Production',            'Completed OT projects resulting in another step towards an Ideal Org and the creation of a new civilization; Scientologists in the field moving up The Bridge to Full OT', '#2E6B1F', 5
  union all select 5,             'Qualifications',        'Projects or programs reviewed and corrected; OT Committee members trained on their posts and progressing up The Bridge',                                             '#8A8A8A', 6
  union all select 6,             'Public',                'Active OT Committee members who are applying Scientology towards the creation of a new civilization',                                                                 '#FCE34E', 7
) as x
where not exists (select 1 from public.divisions);

-- ---- Departments (guarded per division) --------------------------------------
-- Div 7 Executive
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 21 as number, 'Office of Source'                    as name, 'An On-Source OT Committee'        as vfp, 1 as ord
  union all select 20,             'Office of Special Affairs',                 'Acceptances of Scientology',              2
  union all select 19,             'Office of the OT Committee Chairman',        'A viable, expanding OT Committee',         3
) as x
where d.number = 7
  and not exists (select 1 from public.departments where number in (19, 20, 21));

-- Div 1 Communications
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 1 as number, 'Department of Routing & Personnel'   as name, 'Effective OTC members posted and hatted'     as vfp, 1 as ord
  union all select 2,            'Department of Communications',              'Communications routed and swiftly delivered',       2
  union all select 3,            'Department of Inspections & Reports',       'In-ethics and producing OTC members',               3
) as x
where d.number = 1
  and not exists (select 1 from public.departments where number in (1, 2, 3));

-- Div 2 Dissemination
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 4 as number, 'Department of Promotion & Marketing' as name, 'Effective marketing campaigns for OT projects, and promo items printed and into the hands of the correct publics' as vfp, 1 as ord
  union all select 5,            'Department of Publications',                'Sold and delivered books, lectures, meters, packs, insignia and audio-visual materials for OT Committee Projects',   2
  union all select 6,            'Department of Registration',                'Funds raised for OT projects',                                                                                        3
) as x
where d.number = 2
  and not exists (select 1 from public.departments where number in (4, 5, 6));

-- Div 3 Treasury
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 7 as number, 'Department of Income'                     as name, 'All funds collected for services and sales rendered'               as vfp, 1 as ord
  union all select 8,            'Department of Disbursements',                    'All bills paid and items purchased in a timely manner',                    2
  union all select 9,            'Department of Records, Assets & Materiel',       'OTC records, assets and properties properly set-up and maintained',        3
) as x
where d.number = 3
  and not exists (select 1 from public.departments where number in (7, 8, 9));

-- Div 4 Production
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 10 as number, 'Department of Project Planning' as name, '1. Effectively planned OT projects. 2. Bodies and materials assigned and routed to their OT Projects' as vfp, 1 as ord
  union all select 11,             'Department of OT Projects',            'Completed OT Projects resulting in another step towards an Ideal Org and the creation of a new civilization', 2
  union all select 12,             'Department of OT Production',          'Clears & OTs in the field moved up The Bridge to full OT',                                                   3
) as x
where d.number = 4
  and not exists (select 1 from public.departments where number in (10, 11, 12));

-- Div 5 Qualifications
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 13 as number, 'Department of Examinations'   as name, 'OTC members examined on their projects or program' as vfp, 1 as ord
  union all select 14,             'Department of Review',                '1. Projects or programs reviewed and corrected. 2. OTC members trained on their posts and progressing up The Bridge', 2
  union all select 15,             'Department of Certs & Awards',        'Earned Certs and Awards for OTC members',                                                                                3
) as x
where d.number = 5
  and not exists (select 1 from public.departments where number in (13, 14, 15));

-- Div 6 Public
insert into public.departments (division_id, number, name, vfp, sort_order)
select d.id, x.number, x.name, x.vfp, x.ord
from public.divisions d
cross join (
              select 16 as number, 'Department of Public Information' as name, 'OTC activities made popular resulting in favorable public recognition and more active participation' as vfp, 1 as ord
  union all select 17,             'Department of Clearing',                '1. An expanding OT Committee membership. 2. OTC members sending public into orgs',                                     2
  union all select 18,             'Department of Success',                 'Active OT Committee members who are applying Scientology towards the creation of a new civilization',                  3
) as x
where d.number = 6
  and not exists (select 1 from public.departments where number in (16, 17, 18));

-- ---- Posts (all vacant, no holders; guarded: only when no posts exist yet) ---
insert into public.posts (department_id, title, is_vacant, sort_order)
select d.id, u.title, true, u.ord
from public.departments d
cross join lateral unnest(
  case d.number
    when 21 then array['LRH Comm for I/A','Liaison to Org']
    when 20 then array['Liaison to DSA for External Affairs Projects']
    when 19 then array['OT Committee Chairman','OTC Communications Executive Secretary','OTC Organization Executive Secretary','OT Committee Secretary']
    when 1  then array['Director of Routing & Personnel','Routing Officer','Org Board I/C','Recruitment Officer','Personnel Control Officer','New OTC Members I/C','Hatting Officer']
    when 2  then array['Director of Communications','Public Originations Officer (Mail In)','Outflow Comm Officer (Mail Out)','Internal Comm Flow Officer','Comm System I/C','Comm Routing I/C','Photocopy I/C','Mimeo Liaison','Inter-Org Comm Liaison']
    when 3  then array['Director of Inspections & Reports','Stats Officer','Chief Ethics Officer']
    when 4  then array['Director of Promotion & Marketing','Survey Officer','Marketing Officer','Promo Officer','Newsletter I/C','Photographer I/C','Videographer I/C']
    when 5  then array['Director of Publications','Liaison to Org Bookstore']
    when 6  then array['Director of Fundraising','Fundraising Officer','OT Project Fundraisers']
    when 7  then array['Director of Income','Collections Officer']
    when 8  then array['Director of Disbursements','Purchasing Officer']
    when 9  then array['Director of Records, Assets & Materiel','Assets & Materiel Officer','Supply Officer','Records Officer']
    when 10 then array['Director of Project Planning','Pjt Writing Officer','Production Services Officer','Volunteer Call-In & Scheduling Officer']
    when 11 then array['Director of OT Projects','OT Projects Officer','Pjt I/C 1','Pjt I/C 2','Pjt I/C 3','Pjt I/C 4','Pjt I/C 5','OT Pjts Admin Officer (Target Board & Compliance Tracking I/C)']
    when 12 then array['Director of OT Production','Tours, OT Events, Conventions & Seminars Set-Up Officer','Liaison to Field Control Sec (Org, AO, FSO, FSSO)','OT Events Officer','OT Tours Officer','OT Conventions & Seminars Officer','OT Tracking Officer']
    when 13 then array['Director of Examinations','Project Examiner']
    when 14 then array['Director of Review','Project Review & Handling Officer','OTC Training Officer','OTC Correction Officer','Chaplain Liaison to Org']
    when 15 then array['Director of Certs & Awards','OT Committee Certifications']
    when 16 then array['Director of Public Information','PR Officer','PR Properties Officer','Appearances Officer']
    when 17 then array['Director of Clearing','Liaison to Org Dir of Clearing','OT Committee FSM Officer','OT Committee Membership Officer','Public Events Officer','Public Events Preps I/C','Public Events Call-In I/C','Public Events Execution I/C']
    when 18 then array['Director of Success','OT Committee Success Compilation Officer','New Civilization Officer','Liaison to Other Groups & VMs','VM I/C Liaison','WISE I/C Liaison','ABLE I/C Liaison','IHELP I/C Liaison','Missions I/C Liaison','CCHR I/C Liaison','Honorary PROs Liaison']
    else array[]::text[]
  end
) with ordinality as u(title, ord)
where not exists (select 1 from public.posts);

-- ---- Executive hierarchy (senior_post_id) ------------------------------------
-- The board's top tier: the OT Committee Chairman is senior to the two Executive
-- Secretaries (Communications side over Divs 1/2/7, Organization side over Divs
-- 3/4/5/6) and to the OT Committee Secretary. This drives the connector tree.
-- Idempotent: a plain UPDATE keyed by title, safe to re-run.
update public.posts sub
set senior_post_id = (select id from public.posts where title = 'OT Committee Chairman')
where sub.title in (
  'OTC Communications Executive Secretary',
  'OTC Organization Executive Secretary',
  'OT Committee Secretary'
);

-- ---- Confirmation counts (should be 7 / 21 / 97) -----------------------------
select
  (select count(*) from public.divisions)   as divisions,
  (select count(*) from public.departments) as departments,
  (select count(*) from public.posts)       as posts;
