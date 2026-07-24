-- NorteP Pesquisa · sinalização persistente de riscos em campo.
-- Não remove dados nem altera registros existentes.

begin;

alter table public.field_events
  add column if not exists is_safety_alert boolean not null default false;

-- Classifica também ocorrências que já tinham sido registradas antes deste alerta.
update public.field_events
set is_safety_alert = true
where is_safety_alert = false
  and coalesce(reason, '') ~* '(briga|viol[êe]ncia|agress[aã]o|espanc|amea[cç]a|arma|assalto|furto|roubo|perigo|ferid|pol[ií]cia)';

create index if not exists field_events_safety_alert_idx
  on public.field_events (is_safety_alert, occurred_at desc)
  where is_safety_alert = true;

commit;
