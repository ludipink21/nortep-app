"use client";

import { useEffect, useState } from "react";
import { configured, loadProfile, loadRuntimeConfig, readSession, type Profile } from "../supabase";
import "./perfil-pesquisador.css";

const principal = (profile: Profile | null) => Boolean(profile?.role === "admin" && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary"));

export default function PerfilPesquisadorPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        if (!configured()) return;
        const session = readSession();
        if (!session) return;
        const current = await loadProfile(session);
        if (current.active && (current.role === "pesquisador" || principal(current))) setProfile(current);
      } finally { setReady(true); }
    };
    void boot();
  }, []);

  if (!ready) return <main className="research-profile-loading">Preparando sua apresentação…</main>;
  if (!profile) return <main className="research-profile-loading"><h1>Acesso protegido</h1><p>Entre no NorteP com um perfil autorizado para visualizar esta apresentação.</p><a href="/?acesso=pesquisador">Voltar ao acesso</a></main>;

  const preview = principal(profile);
  return <main className="research-profile-page">
    <header className="research-profile-header">
      <div><small>NORTEP ACADEMIA · PERFIL PESQUISADOR(A)</small><h1>Meu papel no <b>NorteP</b></h1><p>Formação prática para ouvir, registrar e transformar dados em conhecimento com responsabilidade.</p></div>
      <a href={preview ? "/?acesso=principal" : "/?acesso=pesquisador"}>← Voltar ao NorteP</a>
    </header>

    {preview && <div className="research-profile-preview"><b>Prévia da Administração Principal</b><span>Você está vendo a apresentação entregue ao perfil Pesquisador.</span></div>}

    <section className="research-profile-grid">
      <article>
        <figure><img src="/academia/mist-pesquisa.jpg" alt="Pesquisadora em atividade de campo" /><i>01</i></figure>
        <div><small>MEU PAPEL NO NORTEP</small><h2>Escuto com respeito e registro com clareza</h2><p>Meu trabalho começa pela escuta. Eu acolho opiniões diferentes sem julgar e sem tentar mudar a resposta de ninguém. O que a pessoa diz precisa chegar ao NorteP de forma fiel, organizada e protegida.</p><ul><li>Faço as perguntas como foram planejadas.</li><li>Registro respostas e observações com atenção.</li><li>Protejo informações pessoais e respeito o consentimento.</li><li>Sigo o roteiro e peço orientação quando surge algo fora dele.</li></ul><em>Na Academia, isso aparece nas aulas de escuta, neutralidade, ética, registro e qualidade dos dados.</em></div>
      </article>

      <article>
        <figure><img src="/academia/mist-escuta.jpg" alt="Pesquisadora conversando com uma pessoa da comunidade" /><i>02</i></figure>
        <div><small>COMO ATUO NA PRÁTICA</small><h2>Da abertura da pesquisa até a sincronização</h2><p>Cada entrevista tem começo, meio e fim. Eu primeiro confiro a pesquisa correta e explico o objetivo em linguagem simples. Só começo depois do consentimento. Ao terminar, confiro o registro e a sincronização.</p><ol><li>Abro a pesquisa correta e identifico o objetivo.</li><li>Explico a atividade de forma simples e transparente.</li><li>Peço consentimento antes de começar.</li><li>Preencho respostas e observações com cuidado.</li><li>Finalizo e confirmo se a entrevista foi salva ou ficou pendente para sincronizar.</li></ol><em>Nos exercícios, eu pratico entrevista, observação, registro, recusa, interrupção e situações de conexão ruim.</em></div>
      </article>

      <article>
        <figure><img src="/academia/mist-supervisao.jpg" alt="Equipe revisando uma atividade de pesquisa" /><i>03</i></figure>
        <div><small>CUIDADOS ESSENCIAIS</small><h2>Qualidade também é saber como perguntar</h2><p>Uma pesquisa pode estar tecnicamente correta e ainda ser mal conduzida. Por isso, meu jeito de falar, esperar, ouvir e registrar faz parte da qualidade da pesquisa.</p><ul><li>Uso linguagem humana, simples e respeitosa.</li><li>Nunca induzo, pressiono ou sugiro uma resposta.</li><li>Respeito o tempo, a privacidade e o contexto de cada pessoa.</li><li>Não exponho dados nem conversas fora do ambiente autorizado.</li><li>Se houver risco, dúvida ou situação incomum, procuro a coordenação.</li></ul><em>O objetivo não é fazer muitas entrevistas a qualquer custo. É fazer cada entrevista com responsabilidade.</em></div>
      </article>

      <article className="research-profile-academy">
        <figure><div className="research-profile-np">NP</div><i>04</i></figure>
        <div><small>A ACADEMIA AO MEU LADO</small><h2>Estudo, pratico e volto ao conteúdo sempre que precisar</h2><p>A Academia não é separada do trabalho de campo. Cada matéria existe para me ajudar em situações que vou encontrar na prática. Posso revisar uma aula, refazer exercícios, acompanhar meu progresso e usar os exemplos antes ou depois de uma atividade.</p><ul><li>Aulas e apresentações ligadas à prática.</li><li>Exemplos, exercícios e avaliações rápidas.</li><li>Biblioteca de materiais de apoio.</li><li>Progresso salvo e processo de certificação.</li></ul><em>Escutar é o primeiro passo. Transformar essa escuta em conhecimento confiável é o propósito do meu trabalho.</em></div>
      </article>
    </section>

    <footer className="research-profile-footer"><b>NorteP</b><span>Pesquisa com responsabilidade, estudo e prática.</span></footer>
  </main>;
}
