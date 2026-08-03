# NorteP na Vercel — guia de produção

Atualizado em 2 de agosto de 2026.

## 1. Diagnóstico da fonte

Esta entrega usa a fonte completa da Academia NorteP V4 e preserva o NorteP Pesquisa V49/V51.

| Produto | Subdomínio | Estado real nesta fonte |
| --- | --- | --- |
| NorteP Pesquisa | `pesquisa.nortep.ia.br` | Implementado |
| Academia NorteP | `academia.nortep.ia.br` | Implementado |
| NorteP Comunicação | `comunicacao.nortep.ia.br` | Entrada reservada; funções ainda não implementadas |
| NorteP Gestão | `gestao.nortep.ia.br` | Entrada reservada; funções ainda não implementadas |
| NorteP Auditoria | `auditoria.nortep.ia.br` | Entrada reservada; funções ainda não implementadas |
| NorteP Financeiro | `financeiro.nortep.ia.br` | Entrada reservada; funções ainda não implementadas |

A `main` do GitHub ainda usa `vinext build`. O PR nº 3 contém a Academia V4, mas estava aberto durante esta auditoria. Não conecte a Vercel à `main` antiga antes de incorporar o PR nº 3 e esta adaptação.

## 2. O que foi preparado para a Vercel

- `package.json` usa o build nativo `next build`, exigido pela Vercel.
- Next.js foi atualizado para `16.2.11`, com dependências transitivas corrigidas; `npm audit --omit=dev` retorna zero vulnerabilidades conhecidas.
- Os comandos antigos do ChatGPT Sites permanecem disponíveis como `build:sites`, `dev:sites` e `start:sites`.
- `proxy.ts` identifica o `Host`/subdomínio antes da renderização.
- `subdomain-routing.mjs` concentra o mapa dos seis produtos e pode ser testado isoladamente.
- `vercel.json` fixa o projeto como Next.js e usa instalação reproduzível com `npm ci`.
- Pesquisa e Academia carregam a aplicação real; os outros quatro produtos mostram uma entrada honesta de “Em preparação”.
- Foram adicionados cabeçalhos básicos de segurança em `next.config.ts`.

Um `vercel.json` não é obrigatório para um projeto Next.js comum. Ele foi incluído aqui porque este repositório também contém a infraestrutura antiga Vinext/Cloudflare e precisamos garantir que a Vercel escolha o build correto.

## 3. Variáveis da Vercel

Em **Project → Settings → Environment Variables**, cadastre em Production e Preview:

```text
NEXT_PUBLIC_SUPABASE_URL=https://cixhcqwipugfpvhrvtiu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=cole_a_chave_publicavel_do_projeto_correto
NEXT_PUBLIC_SITE_URL=https://nortep.ia.br
NORTEP_ROOT_DOMAIN=nortep.ia.br
```

Use somente o projeto Supabase **NorteP Pesquisa**, referência `cixhcqwipugfpvhrvtiu`. A conta Supabase conectada durante esta auditoria mostrou outro projeto, criado recentemente, e não deu acesso ao banco correto. Não substitua o banco principal por esse projeto novo.

Nunca cadastre no navegador, no GitHub ou em variáveis `NEXT_PUBLIC_`:

- `SUPABASE_SECRET_KEY`;
- `service_role`;
- senha do banco;
- senha de e-mail;
- tokens pessoais.

Uma chave secreta foi compartilhada anteriormente em conversa. Antes da produção, ela deve ser revogada e substituída no painel do Supabase. Esta entrega não usa nem grava essa chave.

## 4. Configuração do Supabase Auth

No projeto correto, abra **Authentication → URL Configuration**.

Defina:

```text
Site URL: https://nortep.ia.br
```

Adicione em **Redirect URLs**:

```text
https://nortep.ia.br/**
https://pesquisa.nortep.ia.br/**
https://academia.nortep.ia.br/**
http://localhost:3000/**
```

Para testar deploys de Preview da Vercel, adicione também o padrão mostrado pela própria Vercel para a sua conta, por exemplo:

```text
https://*-SEU-USUARIO.vercel.app/**
```

Antes da ativação, confirme no banco se as migrações abaixo já foram aplicadas, sempre em ordem e sem apagar dados:

1. `20260731230000_academia_v49_operacional.sql`
2. `20260802120000_academia_pesquisa_supervisao_v4.sql`

## 5. Continuar o projeto na Vercel

O projeto `nortep-app` já foi criado na equipe `ludipink21's projects`. O primeiro build técnico ficou `READY` em 2 de agosto de 2026, mas permanece sem variáveis do Supabase e sem domínio próprio. Não crie outro projeto Vercel.

1. No GitHub, crie uma branch contendo o PR nº 3 mais esta entrega Vercel.
2. Na Vercel, abra o projeto existente `nortep-app`.
3. Conecte o repositório `ludipink21/nortep-app` ao projeto existente.
4. Confirme **Framework Preset: Next.js**.
5. Mantenha **Root Directory: `./`**.
6. Confirme **Install Command: `npm ci`**.
7. Confirme **Build Command: `npm run build`**.
8. Use Node.js 22.
9. Cadastre as quatro variáveis da seção anterior.
10. Faça primeiro um deploy de Preview e valide login, Pesquisa e Academia.
11. Só depois promova para Production.

## 6. Domínio e subdomínios na Vercel

No projeto, abra **Settings → Domains** e adicione individualmente:

```text
nortep.ia.br
pesquisa.nortep.ia.br
academia.nortep.ia.br
comunicacao.nortep.ia.br
gestao.nortep.ia.br
auditoria.nortep.ia.br
financeiro.nortep.ia.br
```

Não é necessário usar `*.nortep.ia.br` agora. São apenas seis endereços fixos; adicioná-los individualmente facilita a verificação e permite continuar usando o DNS da Cloudflare.

## 7. DNS na Cloudflare e Registro.br

Se o Registro.br já aponta os servidores DNS para a Cloudflare, faça os registros somente na Cloudflare. Não duplique registros no Registro.br.

Na Cloudflare, use **Proxy status: DNS only** (nuvem cinza) para os registros da Vercel.

| Tipo | Nome | Destino |
| --- | --- | --- |
| A | `@` | IP recomendado em **Vercel → Domains**; frequentemente `76.76.21.21` |
| CNAME | `pesquisa` | CNAME exibido pela Vercel; frequentemente `cname.vercel-dns-0.com` |
| CNAME | `academia` | Mesmo CNAME confirmado pela Vercel |
| CNAME | `comunicacao` | Mesmo CNAME confirmado pela Vercel |
| CNAME | `gestao` | Mesmo CNAME confirmado pela Vercel |
| CNAME | `auditoria` | Mesmo CNAME confirmado pela Vercel |
| CNAME | `financeiro` | Mesmo CNAME confirmado pela Vercel |

Copie o valor exato mostrado em **Vercel → Settings → Domains** caso seja fornecido um endereço específico para o projeto. Depois aguarde a verificação do DNS e a emissão automática do certificado HTTPS.

## 8. Validação antes da produção

Execute localmente:

```bash
npm ci
npm run lint
npm test
```

Teste os subdomínios locais com:

```text
http://pesquisa.localhost:3000
http://academia.localhost:3000
http://comunicacao.localhost:3000
```

Na Vercel, valide:

- `pesquisa.nortep.ia.br` abre o NorteP Pesquisa;
- `academia.nortep.ia.br` mostra a Academia e, após o login, entra diretamente em Aulas;
- os outros quatro subdomínios mostram “Em preparação”;
- confirmação de e-mail e recuperação de senha retornam ao mesmo subdomínio;
- nenhuma variável secreta aparece no navegador;
- Pesquisa e Academia usam o mesmo projeto Supabase correto;
- os 21 testes originais e os testes de subdomínio continuam aprovados.

## 9. Regra de segurança para a migração

Não desligue o site atual do ChatGPT Sites antes de a Vercel passar em todos os testes. A migração deve ser por troca de DNS somente depois da validação, permitindo retorno rápido ao endereço anterior se algo falhar.
