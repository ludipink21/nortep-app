create table if not exists public.mobilization_link_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.mobilization_partners(id) on delete cascade,
  share_code text null,
  event_type text not null check (event_type in ('open','share','copy')),
  created_at timestamptz not null default now()
);
create index if not exists mobilization_link_events_partner_type_idx on public.mobilization_link_events(partner_id,event_type,created_at desc);
alter table public.mobilization_link_events enable row level security;
revoke all on public.mobilization_link_events from anon, authenticated;

create or replace function public.record_public_mobilization_event(p_code text, p_event_type text, p_share_code text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_partner_id uuid;
begin
  if p_event_type not in ('open','share','copy') then return false; end if;
  select id into v_partner_id from public.mobilization_partners
  where public_code=trim(coalesce(p_code,'')) and active and archived_at is null limit 1;
  if v_partner_id is null then return false; end if;
  insert into public.mobilization_link_events(partner_id,share_code,event_type)
  values(v_partner_id,nullif(upper(trim(coalesce(p_share_code,''))),''),p_event_type);
  return true;
end; $$;
grant execute on function public.record_public_mobilization_event(text,text,text) to anon, authenticated;

create or replace function public.list_mobilization_partners()
returns jsonb language sql security definer set search_path='' as $$
select case when not public.can_manage_mobilization() then jsonb_build_object('error','Acesso não autorizado.')
else coalesce((select jsonb_agg(jsonb_build_object(
'id',p.id,'name',p.name,'kind',p.kind,'city',p.city,'region',p.region,'neighborhood',p.neighborhood,
'code',p.public_code,'active',p.active,'video_url',p.thank_you_video_url,'parent_id',p.parent_id,'parent_name',parent.name,
'owner_profile_id',p.owner_profile_id,'personal_link',p.is_personal_link,
'responses',(select count(*) from public.mobilization_responses r where r.partner_id=p.id),
'content_opt_ins',(select count(*) from public.mobilization_responses r where r.partner_id=p.id and r.content_opt_in),
'meetings_opt_ins',(select count(*) from public.mobilization_responses r where r.partner_id=p.id and r.meetings_opt_in),
'volunteer_opt_ins',(select count(*) from public.mobilization_responses r where r.partner_id=p.id and r.volunteer_opt_in),
'shares',(select count(*) from public.mobilization_link_events e where e.partner_id=p.id and e.event_type='share'),
'opens',(select count(*) from public.mobilization_link_events e where e.partner_id=p.id and e.event_type='open'),
'copies',(select count(*) from public.mobilization_link_events e where e.partner_id=p.id and e.event_type='copy'),
'duplicate_submissions',coalesce((select sum(grouped.total-1)::integer from (
select count(*)::integer total from public.mobilization_responses r join public.mobilization_contacts c on c.response_id=r.id
where r.partner_id=p.id and c.contact_fingerprint is not null group by c.contact_fingerprint having count(*)>1) grouped),0),
'referrals',(select count(*) from public.mobilization_partners child where child.parent_id=p.id and child.active and child.archived_at is null),
'last_response_at',(select max(r.created_at) from public.mobilization_responses r where r.partner_id=p.id)
) order by p.is_personal_link desc,p.created_at asc)
from public.mobilization_partners p left join public.mobilization_partners parent on parent.id=p.parent_id where p.archived_at is null),'[]'::jsonb) end;
$$;
