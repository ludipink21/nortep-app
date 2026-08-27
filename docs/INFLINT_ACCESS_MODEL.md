# INFLINT — Modelo de acesso e governança

Este projeto integra o ecossistema tecnológico da **INFLINT**.

## Administração global

A INFLINT terá dois perfis principais de administração global:

- **Founder / Owner** — acesso global ao ecossistema, estratégia, produto, dados, operação e gestão.
- **Founder / Owner + Developer** — acesso global ao ecossistema, incluindo engenharia, revisão de código, arquitetura, deploys e manutenção técnica.

Cada fundador deve usar **sua própria conta**, nunca compartilhar senha. Isso permite auditoria, rastreabilidade e recuperação segura de acesso.

## Princípio de acesso

- Fundadores da INFLINT: acesso aos projetos autorizados, infraestrutura e painéis técnicos.
- Gestores de cada aplicativo: acesso somente ao aplicativo e aos módulos que lhes forem atribuídos.
- Usuários finais/clientes: acesso somente aos próprios dados e funções autorizadas.

## Fluxo recomendado de código

1. Mudanças técnicas entram em branch própria.
2. Alterações relevantes passam por revisão antes de produção.
3. Mudanças críticas em autenticação, banco, financeiro, permissões e exclusões devem ser revisadas pelo outro fundador quando possível.
4. Toda publicação deve ser rastreável por commit/deploy.

## INFLINT Core

O projeto poderá consumir módulos compartilhados do **INFLINT Core**, incluindo autenticação, permissões, CRM, tarefas, analytics, IA, financeiro-base, auditoria, notificações e automações.

## Segurança

O frontend mostra; o backend decide; o banco protege; a auditoria registra; a IA auxilia; o usuário confirma.
