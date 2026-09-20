# Setup Supabase — NorteP

**Data:** 20 de setembro de 2026
**Projeto:** NorteP Pesquisa
**Objetivo:** Configurar banco Supabase do zero para o formulário de mobilização

---

## Contexto

O formulário de apoio/mobilização (`/apoio/[codigo]/s/[share]`) coleta dados de pessoas que querem apoiar uma candidata. Os dados são salvos no Supabase via RPCs (funções SQL). Existiam 3 bugs críticos nas migrations que impediam o formulário de salvar — eles foram corrigidos nesta versão.

---

## O que foi implementado

### Melhorias no formulário (page.tsx + apoio.css)

| # | Melhoria |
|---|---|
| 1 | UF como `<select>` com 27 unidades (antes era input com 2 caracteres) |
| 2 | Validação de WhatsApp: regex BR, DDD 2-9, primeiro dígito 9 para celulares |
| 3 | Nome mínimo aumentado de 2 para 3 caracteres |
| 4 | Campo Região como `<select>` com 10 opções (enviado como `p_region`) |
| 5 | Barra de progresso com 4 etapas: Dados → Local → Preferências → Consentir |
| 6 | Erros inline nos campos (validação no `onBlur`) |
| 7 | Consentimento colapsável: resumo + `<details>` com texto completo |
| 8 | Spinner animado durante envio + lock de interação |
| 9 | Cooldown 30s após envio (evita double-submit) |
| 10 | Botão "Enviar pelo WhatsApp" na tela de sucesso |
| 11 | `<i aria-hidden="true">` nos checkboxes (acessibilidade) |
| 12 | Click-to-load para vídeos Instagram (não carrega iframe automaticamente) |
| 13 | `<noscript>` fallback para sem JavaScript |
| 14 | Link para `/privacidade` + e-mail de suporte no footer e consentimento |
| 15 | `CANDIDATE_NAME` dinâmico (usa `form.partner.name` em vez de string fixa) |
| 16 | Todos os campos ficam `disabled` durante envio |

### Página de Privacidade (`/privacidade`)

Nova página LGPD com 9 seções:
1. Dados coletados (nome, WhatsApp, cidade/UF/bairro/região)
2. Finalidade (comunicações da candidata)
3. Base legal (consentimento — Art. 7º, I da LGPD)
4. Retenção (enquanto candidatura estiver ativa)
5. Compartilhamento (não compartilha com terceiros)
6. Uso de localStorage
7. Direitos do titular (Art. 18 da LGPD)
8. Segurança dos dados
9. Contato: `privacidade@nortep.ia.br` (placeholder — confirmar e-mail)

### Migration de correção

**Arquivo:** `supabase/migrations/20260920000000_fix_missing_fingerprint_and_archived_at.sql`

Corrige 3 bugs que impediam o envio:

| Bug | O que causava | Correção |
|-----|---------------|----------|
| `private.mobilization_contact_fingerprint()` não existia | RPC `submit_public_mobilization_response_v2` falhava com "function does not exist" | Cria a função com SHA-256 do WhatsApp |
| `mobilization_contacts.contact_fingerprint` não existia | INSERT na tabela falhava com "column does not exist" | Adiciona a coluna + índice |
| `mobilization_partners.archived_at` não existia | Query `archived_at is null` falhava com "column does not exist" | Adiciona a coluna |

---

## Passo a passo: Setup do Supabase

### 1. Criar conta e projeto

1. Acessar [supabase.com](https://supabase.com)
2. Criar conta (ou fazer login)
3. Criar novo projeto
4. Anotar:
   - **Project URL** (formato: `https://xxxxx.supabase.co`)
   - **Anon Key** (em Settings → API → Project API keys → `anon` `public`)

### 2. Configurar variáveis de ambiente

Criar arquivo `.env.local` na raiz do projeto:

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-anon-key-aqui
```

### 3. Rodar as migrations

Abrir o **SQL Editor** no painel do Supabase e rodar TODAS as 52 migrations **na ordem do nome do arquivo**. Copiar e colar cada uma individualmente, ou concatenar em blocos.

#### Grupo 1: Core Schema (5 migrations)
```
20260722140000_nortep_mvp.sql
20260722200000_access_invites.sql
20260722210000_observer_role.sql
20260722230000_repair_researcher_profiles.sql
20260722234500_secure_access_management.sql
```

#### Grupo 2: Pilot Operations (4 migrations)
```
20260723003000_pilot_operations.sql
20260723130000_harden_function_privileges.sql
20260723150000_researcher_invites.sql
20260723235900_field_events_and_quality_audit.sql
```

#### Grupo 3: Safety & Surveys (5 migrations)
```
20260724010000_safety_alerts.sql
20260724023000_survey_pause_and_refresh.sql
20260724024000_seed_minas_gerais_exploratory_survey.sql
20260724170000_contact_vault_and_spontaneous.sql
20260724223000_restore_removed_access_on_invite.sql
```

#### Grupo 4: Founder & Self-Service (3 migrations)
```
20260727010000_self_service_unsubscribe.sql
20260728090000_founder_and_role_boundaries.sql
20260728100000_founder_survey_structure_guard.sql
```

#### Grupo 5: Coordinator (3 migrations)
```
20260728130000_coordinator_team_scope.sql
20260729100000_coordinator_territories_and_invite_hierarchy.sql
20260729173000_secondary_admin_researcher_invites.sql
```

#### Grupo 6: Mobilization — CRÍTICO (6 migrations)
```
20260730100000_supervisor_territory_and_mobilization.sql
20260730101500_scoped_survey_status.sql
20260730110000_reset_pilot_and_seed_surveys.sql
20260730112000_fix_question_scope.sql
20260730140000_strategy_observer_network.sql
20260730170000_candidate_mobilization_control.sql
```

#### Grupo 7: Academy (3 migrations)
```
20260731150000_academia_nortep.sql
20260731230000_academia_v49_operacional.sql
20260802120000_academia_pesquisa_supervisao_v4.sql
```

#### Grupo 8: Bootstrap & Admin (5 migrations)
```
20260803154000_fix_fresh_founder_bootstrap.sql
20260803190000_academia_roles_and_instructor_access.sql
20260806100000_admin_hierarchy_presence_and_invites.sql
```

#### Grupo 9: Intelligence & Social (4 migrations)
```
20260806170000_mobilization_intelligence.sql
20260806170100_betim_regional_surveys.sql
20260806173000_survey_intro_video_delivery.sql
20260806210000_social_quiz_network_tracking.sql
```

#### Grupo 10: Copy & Security (8 migrations)
```
20260807011813_humanize_survey_copy_20260807.sql
20260807012519_humanize_social_quiz_regional_20260807.sql
20260807023000_remove_mais_from_user_questions.sql
20260807024000_brazilian_spoken_question_copy.sql
20260807120000_security_hardening_public_rpcs.sql
20260807120100_pilot_quality_summary.sql
20260807120200_founder_profile_service_check.sql
20260807133000_primary_admin_founder_parity.sql
```

#### Grupo 11: Share Chain & Fix — CRÍTICO (8 migrations)
```
20260918123000_supporter_share_chain.sql
20260918202000_reuse_existing_supporter_share_link.sql
20260918205200_public_share_preview_name.sql
20260918221500_auto_confirm_preapproved_invites.sql
20260918235500_mobilization_video_gallery.sql
20260918235730_maria_vanuzia_initial_videos.sql
20260919001000_position_mobilization_videos.sql
20260920000000_fix_missing_fingerprint_and_archived_at.sql  ← NOVA (corrige bugs)
```

### 4. Criar conta de founder

O primeiro usuário que fizer login via **Supabase Auth** com e-mail de fundador receberá automaticamente o papel de admin (via trigger `handle_new_user()`).

### 5. Verificar se funciona

1. Rodar `npm run dev`
2. Acessar `http://localhost:3000/apoio/4c65de645080acf0b74ea5e6e19e4358f3da/s/03C20648107C`
3. O formulário deve carregar os dados do parceiro
4. Preencher e enviar — deve salvar sem erro
5. No painel admin, acessar **Mobilização** e **Rede > Apoios** para ver os dados

---

## Tabelas criadas pelas migrations

| Tabela | O que guarda |
|--------|-------------|
| `profiles` | Perfis de usuários (admin, pesquisador, etc.) |
| `surveys` | Formulários/pesquisas (inclui o tipo "relationship" para mobilização) |
| `survey_questions` | Perguntas dos formulários |
| `mobilization_partners` | Parceiros de mobilização (geram links de apoio) |
| `mobilization_responses` | Respostas do formulário de apoio |
| `mobilization_contacts` | Dados de contato (nome, WhatsApp) — separado das respostas |
| `mobilization_videos` | Vídeos vinculados ao formulário |
| `interviews` | Entrevistas de pesquisa |
| `academy_lessons` | Lições da academia NorteP |

---

## RPCs principais

| RPC | Função | Chamado por |
|-----|--------|-------------|
| `get_public_mobilization_form(p_code)` | Busca dados do parceiro + formulário | Formulário público (sem auth) |
| `submit_public_mobilization_response_v2(...)` | Salva resposta do formulário | Formulário público (sem auth) |
| `get_public_mobilization_share_preview(p_code, p_share_code)` | Preview para OpenGraph | Metadata do share |
| `list_mobilization_partners()` | Lista parceiros com métricas | Painel admin |
| `list_mobilization_share_network()` | Árvore de compartilhamento | Rede > Apoios |

---

## Notas importantes

- **RLS (Row Level Security):** Todas as tabelas têm RLS habilitado. Os RPCs públicos usam `security definer` para bypass do RLS.
- **Seed data:** As migrations criam automaticamente 4 parceiros iniciais (RAF26, TAT26, VAN26, JES26) e vídeos da Maria Vanuzia.
- **Não precisa criar Storage buckets** — os vídeos são carregados de URLs externas (Instagram, MP4 direto).
- **E-mail de privacidade:** `privacidade@nortep.ia.br` é placeholder. Confirmar e-mail correto antes de publicar.
