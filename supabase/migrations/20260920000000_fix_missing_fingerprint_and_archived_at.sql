-- NorteP · corrige 3 erros de migration que impedem o formulário de salvar:
-- 1. Cria schema private e a função mobilization_contact_fingerprint
-- 2. Adiciona coluna contact_fingerprint na tabela mobilization_contacts
-- 3. Adiciona coluna archived_at na tabela mobilization_partners

-- 1. Schema private e função de fingerprint
create schema if not exists private;

create or replace function private.mobilization_contact_fingerprint(p_whatsapp text, p_email text)
returns text
language sql
immutable
as $$
  select encode(
    sha256(
      lower(trim(coalesce(p_whatsapp, ''))) || '|' || lower(trim(coalesce(p_email, '')))
    ),
    'hex'
  );
$$;

-- 2. Coluna contact_fingerprint na tabela mobilization_contacts
alter table public.mobilization_contacts
  add column if not exists contact_fingerprint text;

-- Índice para buscas por fingerprint (usado na detecção de duplicatas)
create index if not exists idx_mobilization_contacts_fingerprint
  on public.mobilization_contacts (contact_fingerprint)
  where contact_fingerprint is not null;

-- 3. Coluna archived_at na tabela mobilization_partners
alter table public.mobilization_partners
  add column if not exists archived_at timestamptz;
