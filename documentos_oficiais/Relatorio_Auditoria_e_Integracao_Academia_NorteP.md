# Relatório de auditoria e integração — Academia NorteP

Data da revisão: 31 de julho de 2026
Projeto revisado: NorteP Pesquisa V49

## Resultado principal

A versão V49 foi localizada, compilada e preservada. A Academia NorteP foi integrada em uma branch separada, revisada e autorizada. A migração versionada foi aplicada no mesmo Supabase de produção em 31 de julho de 2026, sem excluir usuários, pesquisas, entrevistas ou respostas.

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
4. O kit demonstrativo salvava progresso apenas no navegador. A integração final mantém um cache local para tolerar falhas de conexão e usa o Supabase como registro central.
5. A primeira tentativa de aplicação foi cancelada integralmente pelo próprio banco devido a um trecho antigo mantido pelo editor SQL. O conteúdo foi substituído pelo arquivo versionado, executado novamente e validado com uma consulta independente.

## Arquivos ausentes ou dependências futuras

- Testes ponta a ponta com contas de cada perfil.
- Homologação em celulares Android, iPhone e computador antes de produção.

## Relação com o Supabase

A Academia usa o perfil já autenticado no NorteP e não cria outra autenticação. A migração `20260731150000_academia_nortep.sql` criou progresso, certificados e gabaritos protegidos. A auditoria confirmou 57 aulas, bloqueio do papel anônimo, permissão de gravação somente pela função autenticada e ausência de acesso do navegador aos gabaritos. Gestores recebem somente os dados agregados da equipe permitida pelas regras atuais.

## Relação com a hospedagem

A configuração do site existente foi mantida. A publicação foi autorizada para o mesmo projeto, sem criação de outro site ou domínio.

## Plano de backup executado

- Branch protegida: `backup/site-original-2026`.
- Conteúdo: código V49 e manuais atuais, sem credenciais.
- Branch de trabalho: `feature/academia-nortep`.
- Branch `main`: preservada.

## Plano de integração da Academia NorteP

### Etapa concluída

- Inserir a Formação NorteP dentro da aba Ecossistema.
- Usar a identidade visual púrpura, ouro e turquesa do NorteP.
- Organizar trilhas por perfil.
- Disponibilizar aulas, exercícios, cache local, avaliações, progresso sincronizado, biblioteca, painel agregado e certificação oficial.
- Aplicar políticas de menor privilégio no Supabase.
- Testar lint, tipos, build e 17 regras funcionais e de segurança.
- Abrir Pull Request em rascunho e registrar a autorização de publicação.

### Próxima homologação operacional

- Homologar com contas reais de cada perfil.
- Validar o fluxo em celulares Android, iPhone e computador com conexão estável e instável.

## Conclusão

A integração preserva integralmente a V49 e acrescenta a Academia dentro da aba Ecossistema. Nenhuma senha, token, chave privada ou `service_role` foi incluída no código ou no GitHub.
