"use client";

import { NortePIcon as Icon, type IconName } from "./nortep-icons";
import type { Profile } from "./supabase";
import { canUseElectoral } from "./analise-eleitoral/model";
import "./ecosystem-hub.css";

type Props = { profile: Profile; preview: boolean; abrirPesquisa: () => void; abrirAcademia: () => void; abrirInstrutoria: () => void };
export default function EcosystemHub({ profile, preview, abrirPesquisa, abrirAcademia, abrirInstrutoria }: Props) {
  const principal = profile.role === "admin" && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary");
  const academy = principal || profile.role === "supervisor" || profile.role === "pesquisador";
  const upcoming: { title: string; text: string; icon: IconName }[] = [
    { title: "Comunicação", text: "Conteúdos e relacionamento em um só lugar.", icon: "message" },
    { title: "Gestão", text: "Organização das equipes e das atividades.", icon: "people" },
    { title: "Auditoria", text: "Conferência e acompanhamento dos registros.", icon: "shield" },
    { title: "Financeiro", text: "Organização financeira da operação.", icon: "wallet" },
  ];
  const electoralUrl = `/analise-eleitoral${preview ? `?previa=${profile.role}` : ""}`;
  return <div className="np-hub">
    <section className="np-hub-intro"><div><span className="np-hub-eyebrow">ECOSSISTEMA NORTEP</span><h2>Um lugar para cada passo.<br/><em>Tudo conectado a você.</em></h2><p>Pesquise, aprenda e conheça os resultados. Escolha por onde quer seguir hoje.</p></div><div className="np-hub-seal" aria-hidden="true"><Icon name="compass" size={68}/><span>DADOS QUE<br/>APROXIMAM</span></div></section>
    <div className="np-hub-heading"><h3>Seus aplicativos</h3><span>O mesmo acesso. Novas possibilidades.</span></div>
    <div className="np-hub-apps">
      {canUseElectoral(profile.role) && <a href={electoralUrl} className="np-hub-card np-hub-featured"><div className="np-hub-card-top"><span className="np-hub-symbol"><Icon name="compass" size={31}/></span><span className="np-hub-badge">NOVO</span></div><span className="np-hub-category">CONHECER E COMPARAR</span><h3>Análise Eleitoral</h3><p>Resultados oficiais, comparações claras e consultas salvas para continuar depois.</p><div className="np-hub-card-foot"><span>Abrir análise eleitoral</span><Icon name="arrow" size={20}/></div></a>}
      <button type="button" onClick={abrirPesquisa} className="np-hub-card"><div className="np-hub-card-top"><span className="np-hub-symbol teal"><Icon name="ballot" size={31}/></span><span className="np-hub-available">Disponível</span></div><span className="np-hub-category">ESCUTAR E COMPREENDER</span><h3>Pesquisa</h3><p>Organize as pesquisas, acompanhe as coletas e encontre os resultados da sua equipe.</p><div className="np-hub-card-foot"><span>Abrir pesquisas</span><Icon name="arrow" size={20}/></div></button>
      <button type="button" aria-label="Formação NorteP" onClick={principal ? abrirInstrutoria : abrirAcademia} disabled={!academy} className="np-hub-card"><div className="np-hub-card-top"><span className="np-hub-symbol gold"><Icon name="book" size={31}/></span><span className="np-hub-available">{academy ? "Disponível" : "Acesso por função"}</span></div><span className="np-hub-category">APRENDER E PRATICAR</span><h3>Formação</h3><p>{principal ? "Prepare as aulas e acompanhe a formação de pesquisadores e supervisores." : "Aulas e atividades para aprender no seu ritmo e levar o conhecimento para a prática."}</p><div className="np-hub-card-foot"><span>{principal ? "Abrir instrutoria" : academy ? "Abrir minhas aulas" : "Para pesquisadores e supervisores"}</span>{academy && <Icon name="arrow" size={20}/>}</div></button>
    </div>
    <details className="np-hub-future"><summary><span><Icon name="grid" size={20}/>O NorteP continua crescendo</span><span className="np-hub-future-label">Conheça o que vem depois <Icon name="chevron" size={18}/></span></summary><div className="np-hub-future-grid">{upcoming.map(app => <article key={app.title}><Icon name={app.icon} size={24}/><h3>{app.title}</h3><p>{app.text}</p><span>Em desenvolvimento</span></article>)}</div></details>
    <div className="np-hub-note"><Icon name="shield" size={19}/><p>Cada aplicativo tem seu espaço. Sua conta acompanha você.</p></div>
  </div>;
}

export function ElectoralFounderPreviews() {
  const profiles = [{ id: "admin", label: "Administração" }, { id: "coordenador", label: "Coordenação" }, { id: "supervisor", label: "Supervisão" }, { id: "observador", label: "Observador" }, { id: "candidato", label: "Candidato" }, { id: "pesquisador", label: "Pesquisador" }, { id: "publico", label: "Visitante" }];
  return <section className="np-electoral-previews"><span className="np-hub-symbol"><Icon name="compass" size={28}/></span><div><h3>Conheça a Análise Eleitoral</h3><p>Veja o que cada pessoa pode acessar. As consultas feitas nesta prévia não ficam salvas.</p><div className="np-electoral-preview-links">{profiles.map(profile => <a key={profile.id} href={`/analise-eleitoral?previa=${profile.id}`}>{profile.label}<Icon name="arrow" size={15}/></a>)}</div></div></section>;
}
