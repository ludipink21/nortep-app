# Relatório de auditoria e integração — Academia NorteP

Data da revisão: 31 de julho de 2026
Projeto revisado: NorteP Pesquisa V49

## Resultado principal

A versão V49 foi localizada, compilada e preservada. O site oficial, o domínio e o Supabase de produção não foram alterados. A Academia NorteP foi preparada em uma branch separada para revisão e será apresentada em Pull Request antes de qualquer publicação.

## Estrutura técnica encontrada

- Aplicação React/Next.js executada pelo vinext.
- Interface principal em `app/page.tsx` e estilos globais em `app/globals.css`.
- Autenticação, perfis, pesquisas, entrevistas e relatórios conectados ao Supabase por `app/supabase.ts`.
- Migrações versionadas existentes em `supabase/migrations`.
- PWA com manifesto, ícone e service worker em `public`.
- Configuração da hospedagem atual preservada em `.openai/hosting.json`.
- Testes estruturais existentes em `tests/rendered-html.test.mjs`.

## Funcionalidades existentes preservadas

- Entradas separadas por perfil.
- Administração principal, administração secundária, coordenação, supervisão, observação e pesquisa de campo.
- Pesquisas, liberação por equipe, entrevistas e registros de ocorrência.
- Rascunho e fila local para trabalho com conexão instável.
- Painéis, resultados, rankings, mobilização, cofre e visão estratégica.
- Tema claro e noturno, PWA, favicon e vídeo de agradecimento.

## Erros e riscos encontrados

1. O histórico do repositório GitHub `main` era diferente do histórico local da V49. Isso impediria uma comparação normal. O problema foi contornado sem alterar o `main`: a branch de revisão parte do `main` remoto e recebe a V49 como um commit identificado.
2. `app/page.tsx` e `app/globals.css` são arquivos grandes. A Academia foi criada em componentes e estilos separados para reduzir risco de regressão.
3. Os testes atuais são principalmente estruturais. Eles confirmam build e regras importantes no código, mas não substituem testes reais com todas as contas e aparelhos.
4. O kit demonstrativo salvava progresso apenas no navegador. Isso não serve como registro oficial entre aparelhos.
5. A Academia precisa de novas tabelas e políticas no Supabase para progresso central, avaliações, certificados e acompanhamento individual. Nenhuma migração foi criada ou aplicada nesta revisão.

## Arquivos ausentes ou dependências futuras

- Tabelas de progresso e avaliação da Academia no Supabase.
- Políticas de acesso por perfil, equipe e território para a Academia.
- Emissão oficial e verificável de certificados.
- Testes ponta a ponta com contas de cada perfil.
- Homologação em celulares Android, iPhone e computador antes de produção.

## Relação com o Supabase

A integração visual usa o perfil já autenticado no NorteP e não cria outra autenticação. Nesta prévia, exercícios e progresso ficam apenas no aparelho e são identificados como provisórios. A futura sincronização deverá usar o mesmo Supabase, com migração versionada, políticas de menor privilégio e auditoria. Essa etapa depende de aprovação expressa.

## Relação com a hospedagem

A configuração do site existente foi mantida. A branch de revisão não publica automaticamente. Qualquer atualização do site oficial dependerá de revisão da prévia e autorização expressa.

## Plano de backup executado

- Branch protegida: `backup/site-original-2026`.
- Conteúdo: código V49 e manuais atuais, sem credenciais.
- Branch de trabalho: `feature/academia-nortep`.
- Branch `main`: preservada.

## Plano de integração da Academia NorteP

### Etapa desta revisão

- Inserir a Formação NorteP dentro da aba Ecossistema.
- Usar a identidade visual púrpura, ouro e turquesa do NorteP.
- Organizar trilhas por perfil.
- Disponibilizar aulas, exercícios, rascunhos locais, avaliações, progresso, biblioteca, painel agregado e prévia de certificação.
- Avisar claramente que o progresso ainda é local.
- Testar lint, tipos, build e regras de segurança.
- Abrir Pull Request em rascunho, sem merge e sem publicação.

### Etapa que exige nova aprovação

- Criar e revisar a migração do Supabase.
- Sincronizar progresso entre aparelhos.
- Ativar avaliação e certificado oficiais.
- Homologar com contas reais de cada perfil.
- Publicar no site existente.

## Conclusão

A integração foi planejada para preservar integralmente a V49 e permitir revisão segura. Nenhuma senha, token, chave privada ou `service_role` foi incluída no código ou no GitHub.
