-- OT Committee Coordination System
-- 0005_final_division_colors.sql : final, fixed division color-flash scheme
--
-- One fixed scheme for the whole board (no color-picker UI). All seven are
-- clearly distinct — in particular Div 1 (deep goldenrod) vs Div 6 (bright
-- canary), which previously read too similar. Idempotent, keyed by number.

update public.divisions set color = '#1B6EC2' where number = 7; -- Executive     — blue
update public.divisions set color = '#B8860B' where number = 1; -- Communications — goldenrod (deep, muted)
update public.divisions set color = '#2E2E4F' where number = 2; -- Dissemination  — dark navy/purple
update public.divisions set color = '#F2A0B0' where number = 3; -- Treasury       — light pink/salmon
update public.divisions set color = '#2E6B1F' where number = 4; -- Production      — green
update public.divisions set color = '#8A8A8A' where number = 5; -- Qualifications  — grey
update public.divisions set color = '#FCE34E' where number = 6; -- Public          — canary (bright light yellow)

select number, name, color from public.divisions order by sort_order;
