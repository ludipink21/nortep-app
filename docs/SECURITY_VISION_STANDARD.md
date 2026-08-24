# Padrão de Segurança Vision — base FinGuardian

O NorteP/Academia NorteP adota o padrão de segurança comum da Vision das Gerais, inspirado nos princípios usados no FinGuardian AI.

## Regras obrigatórias

1. Toda operação privada exige sessão válida; autorização deve ser validada no backend/banco.
2. Dados devem ser isolados por usuário, organização/projeto, território e papel quando aplicável.
3. Tabelas privadas no Supabase precisam de RLS e políticas explícitas.
4. Aplicar menor privilégio aos perfis de pesquisador, supervisor, mobilizador, coordenador, administrador, analista, observador, instrutor e fundadora/administração principal.
5. Gabaritos, cofre, contatos, exportações e dados sensíveis nunca podem depender apenas de ocultação visual.
6. Nunca expor `service_role`, segredos, senhas ou tokens administrativos em variáveis públicas ou no repositório.
7. Sessões e convites devem expirar; 401 = sem autenticação e 403 = autenticado sem permissão.
8. Alterações de perfis, permissões, pesquisas, publicações, certificados, notas, exportações e configurações críticas devem ser auditáveis.
9. Arquivos e respostas privadas são privados por padrão; relatórios públicos devem ser agregados e autorizados.
10. Soft delete/arquivamento deve preservar rastreabilidade quando necessário.
11. IA auxilia análise e treinamento, mas não altera respostas, notas ou decisões críticas sem regra e confirmação.
12. Falha de IA não pode interromper coleta, sincronização, exercícios ou acesso seguro.
13. LGPD e minimização de dados são obrigatórias.
14. Migrations, políticas e funções devem ser versionadas e validadas antes de publicação.

## Regra-resumo

> O frontend mostra. O backend decide. O banco protege. A auditoria registra. A IA auxilia. O usuário confirma.

## Academia

Trilhas, exercícios, notas, feedback, certificados e liberação operacional devem respeitar o perfil do usuário. Gabaritos protegidos permanecem fora do alcance do aluno e a gestora vê apenas o que sua permissão autoriza.
