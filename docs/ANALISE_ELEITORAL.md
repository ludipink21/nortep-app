# NorteP Análise Eleitoral

Aplicativo em `/analise-eleitoral`, acessível pelo Ecossistema NorteP. A identidade visual mantém vinho, dourado e creme, com verde discreto para distinguir os dois candidatos na comparação. Os ícones são SVGs locais compartilhados com o ecossistema e o menu principal.

## Entrega desta etapa

- Visão geral, consulta por município/turno/zona, busca e filtro por partido.
- Comparação de dois candidatos na mesma eleição, cargo e recorte.
- Votos válidos, percentual com denominador identificado, comparecimento e abstenção.
- Links de consulta, exportação CSV com origem e impressão pelo navegador.
- Consultas salvas no navegador, separadas pelo ID da conta autenticada.
- Entradas de prévia em Fundadora > Ver todo o aplicativo, usando o componente real.
- Ecossistema repaginado; aplicativos futuros recolhidos em “O NorteP continua crescendo”.
- Remoção de três pesquisas fictícias do código e da meta arbitrária de 100 entrevistas. A página inicial passa a mostrar pesquisas e contagens recebidas do banco. Nenhum registro do banco foi removido.

Esta entrega não substitui o escopo consolidado: mapas, outras eleições/cargos/UFs, análises assistidas e os pedidos de formulários, rede de apoio e conteúdos continuam como etapas posteriores. Nada disso é apresentado aqui como funcionalidade já disponível.

## Fonte e importação

Fonte: [TSE — Resultados 2024](https://dadosabertos.tse.jus.br/dataset/resultados-2024).

Arquivos oficiais utilizados:

- `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2024.zip`
- `https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2024.zip`

Cobertura: eleições ordinárias de 2024, Minas Gerais, prefeito; 853 municípios e 855 resultados por município/turno. Os CSVs registram geração pelo TSE em 15/09/2026. Não é uma apuração ao vivo.

```sh
python3 scripts/import-electoral-data.py --votes /caminho/votacao-2024.zip --totals /caminho/detalhe-2024.zip
```

O importador usa CSV Latin-1 e separador `;`. Filtra tipo ordinário e cargo 11. Soma `QT_VOTOS_NOMINAIS_VALIDOS`, preservando separadamente os votos registrados. Confronta por zona:

1. Soma dos votos válidos dos candidatos = total de votos válidos da apuração.
2. Comparecimento = válidos + brancos + nulos + anulados + sub judice + apurados em separado.
3. Eleitorado = comparecimento + abstenção.

O JSON registra versão derivada do conteúdo e hashes SHA-256 dos arquivos. Atualizar requer rodar o importador novamente, revisar e publicar o código. Consultas salvas guardam filtros e versão de origem; ao reabrir depois de uma atualização, a tela informa que a fonte mudou.

## Acesso e persistência

Reutiliza a sessão NorteP, confirma a identidade via `/auth/v1/user` e consulta o perfil correspondente sob as regras existentes do Supabase. Permite perfis ativos de administração, coordenação, supervisão e observador. Contas removidas ou inativas são bloqueadas. A sessão é reconferida ao retornar à janela, ao mudar a sessão em outra aba e a cada minuto.

A API de dados contém apenas resultados públicos agregados do TSE e é pública. Não contém informações de pesquisas internas, contatos, intenções individuais ou apoiadores. O controle da interface não substitui a segurança do banco para dados privados.

A consulta salva usa a chave `nortep-eleitoral-consultas-v1:<id confirmado>`, com limite de 50 itens, validação de contexto e proteção de fórmulas na exportação CSV. Não há sincronização dessas consultas entre aparelhos nesta etapa. Limpar o armazenamento do navegador remove essas consultas locais.

A prévia exige perfil principal verdadeiro, aceita somente funções conhecidas e bloqueia o salvamento. Os complementos legados de presença/governança não são montados na rota eleitoral; a prévia não emite gravações de ações no Supabase.

O retorno do login aceita somente o destino fixo `/analise-eleitoral` e parâmetros eleitorais permitidos. Não há redirecionamento aberto.

## Validação

```sh
npm ci
npm run build
npm run test:electoral
npx playwright install chromium
npm run test:electoral:browser
```

O teste de navegador inicia uma instância local e intercepta todas as chamadas de identidade com contas fictícias de teste. Ele não entra nem grava no Supabase real. Valida resultados oficiais, seleção de turno e zona, comparação, limite de dois candidatos, salvar/reabrir, CSV, compartilhamento por link, celular, prévia da fundadora, isolamento por conta, bloqueio de conta inativa, navegação no ecossistema e retorno após login.

Variáveis opcionais: `NORTEP_CHROMIUM_PATH` para um executável instalado e `NORTEP_SCREENSHOTS` para o diretório das capturas. O Chrome Headless Shell foi utilizado no ambiente de revisão.

A suíte legada `tests/rendered-html.test.mjs` já tinha quatro falhas no commit base `87ee88949979c540db224ca966ba69a5cd685309`. A inconsistência de versões do service worker foi corrigida e o teste agora compara as versões de registro, cache e recarga. Permanecem três falhas anteriores: texto antigo de exclusividade da prévia e duas expectativas de conteúdo da Academia V4. Os demais 20 testes legados passam.

## Pendências de ambiente

Na execução de 16/09/2026, o projeto Vercel retornou 403 e o acesso administrativo ao banco NorteP foi recusado. Nenhuma migração, exclusão, alteração de conta ou limpeza de dados de produção foi executada. A limpeza solicitada depende de identificar os registros reais que devem permanecer e de acesso autorizado ao projeto correto. Publicação deve passar por revisão conforme `INFLINT_ACCESS_MODEL.md` e conferência das prévias conforme `REGRA_PREVIA_FUNDADORA.md`.
