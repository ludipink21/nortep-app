"use client";

import { useEffect, useMemo, useState } from "react";
import { configured, loadProfile, loadProfiles, loadRuntimeConfig, Profile, readSession, rest, Session } from "../supabase";
import "./qualidade.css";

type ResearcherQuality = {
  researcher_id: string;
  researcher_name: string;
  interviews: number;
  avg_duration_seconds: number | null;
  very_fast: number;
  possible_duplicates: number;
  very_short_answers: number;
  flagged: number;
};

type QualitySummary = {
  window_days: number;
  total_interviews: number;
  flagged_interviews: number;
  researchers: ResearcherQuality[];
  flagged_rows: Array<{ code: string; researcher_name: string; survey_title: string; duration_seconds?: number | null; quality_flags: string[]; completed_at: string }>;
  guidance: string[];
};

type ServiceCheck = {
  profile: Profile & { last_seen_at?: string | null; current_path?: string | null; device_label?: string | null; admin_level?: string | null };
  manager?: { id: string; name: string; role: string } | null;
  coordinator?: { id: string; name: string } | null;
  territories: Array<{ type: string; value: string }>;
  survey_assignments: Array<{ id: string; title: string; status: string; is_test: boolean; team?: string | null; city?: string | null; region?: string | null; neighborhood?: string | null; intro_video: boolean; thank_you_video: boolean }>;
  academy_track: string;
  academy_progress: { started_lessons: number; completed_lessons: number; practice_status: string };
  collection: { interviews: number; flagged: number; last_interview?: string | null };
};

const roleLabel = (role?: string) => ({ admin: "Administração", coordenador: "Coordenação", supervisor: "Supervisão", pesquisador: "Pesquisador", observador: "Observador" }[role || ""] || role || "Perfil");
const flagLabel = (flag: string) => ({ muito_rapida: "Duração abaixo do esperado", possivel_repetida: "Respostas idênticas para revisar", resposta_muito_curta: "Resposta muito curta" }[flag] || flag.replaceAll("_", " "));
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Ainda não registrado";
const formatDuration = (seconds?: number | null) => seconds ? `${Math.floor(seconds / 60)} min ${seconds % 60}s` : "—";

export default function QualidadePiloto() {
  const [session, setSession] = useState<Session | null>(null);
  const [founder, setFounder] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [quality, setQuality] = useState<QualitySummary | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [check, setCheck] = useState<ServiceCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const selectable = useMemo(() => profiles.filter(item => !item.access_removed_at && !item.is_primary_admin), [profiles]);

  const loadServiceCheck = async (current: Session, profileId: string) => {
    if (!profileId) { setCheck(null); return; }
    setCheck(await rest<ServiceCheck>(current, "rpc/founder_profile_service_check", { method: "POST", body: JSON.stringify({ p_profile_id: profileId }) }));
  };

  const refresh = async () => {
    if (!session) return;
    setMessage("");
    try {
      const [people, summary] = await Promise.all([
        loadProfiles(session),
        rest<QualitySummary>(session, "rpc/pilot_quality_summary", { method: "POST", body: JSON.stringify({ p_days: 14 }) }),
      ]);
      setProfiles(people);
      setQuality(summary);
      const target = selectedId || people.find(item => item.role === "pesquisador" && item.active)?.id || people.find(item => !item.is_primary_admin)?.id || "";
      setSelectedId(target);
      await loadServiceCheck(session, target);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o painel.");
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        if (!configured()) throw new Error("Configuração do NorteP indisponível.");
        const current = readSession();
        if (!current) throw new Error("Entre na administração principal para abrir este painel.");
        const profile = await loadProfile(current);
        if (!(profile.role === "admin" && profile.active && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary"))) throw new Error("Esta área é exclusiva da Fundadora e do Administrador Primário.");
        setSession(current); setFounder(profile);
        const [people, summary] = await Promise.all([
          loadProfiles(current),
          rest<QualitySummary>(current, "rpc/pilot_quality_summary", { method: "POST", body: JSON.stringify({ p_days: 14 }) }),
        ]);
        setProfiles(people); setQuality(summary);
        const target = people.find(item => item.role === "pesquisador" && item.active)?.id || people.find(item => !item.is_primary_admin)?.id || "";
        setSelectedId(target);
        await loadServiceCheck(current, target);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível abrir o painel.");
      } finally { setLoading(false); }
    };
    void boot();
  }, []);

  if (loading) return <main className="quality-shell quality-center"><div className="quality-spinner"/><h1>Preparando a qualidade do piloto…</h1></main>;
  if (!founder || !session) return <main className="quality-shell quality-center"><div className="quality-mark">NP</div><h1>Qualidade do piloto</h1><p>{message}</p><a className="quality-primary" href="/?acesso=administracao">Entrar na administração</a></main>;

  return <main className="quality-shell">
    <header className="quality-header">
      <div><small>NORTEP · ADMINISTRAÇÃO PRINCIPAL</small><h1>Qualidade do piloto</h1><p>Acompanhe o teste com poucas pessoas antes de aumentar a equipe. Alertas servem para revisar o processo, não para julgar ninguém.</p></div>
      <div><button onClick={() => void refresh()}>↻ Atualizar</button><a href="/?acesso=administracao">← Voltar ao painel</a></div>
    </header>

    {message && <div className="quality-message">{message}</div>}

    <section className="quality-metrics">
      <article><small>JANELA DE ANÁLISE</small><b>{quality?.window_days || 14} dias</b><span>piloto recente</span></article>
      <article><small>ENTREVISTAS REAIS</small><b>{quality?.total_interviews || 0}</b><span>testes não entram</span></article>
      <article><small>PARA CONFERIR</small><b>{quality?.flagged_interviews || 0}</b><span>alertas automáticos</span></article>
      <article><small>PESQUISADORES COM COLETA</small><b>{quality?.researchers?.length || 0}</b><span>na janela atual</span></article>
    </section>

    <section className="quality-card">
      <div className="quality-title"><div><small>ACOMPANHAMENTO POR PESSOA</small><h2>Ela está recebendo tudo o que precisa?</h2><p>Escolha um perfil para conferir acesso, pesquisas, formação e atividade sem entrar na conta da pessoa.</p></div>
        <label>Perfil<select value={selectedId} onChange={async event => { const value = event.target.value; setSelectedId(value); setCheck(null); await loadServiceCheck(session, value); }}>{selectable.map(item => <option value={item.id} key={item.id}>{item.name} · {roleLabel(item.role)}</option>)}</select></label>
      </div>
      {check ? <div className="quality-person-grid">
        <article className="quality-person-main"><div className="quality-avatar">{check.profile.name.split(" ").slice(0,2).map(x => x[0]).join("").toUpperCase()}</div><div><small>{roleLabel(check.profile.role).toUpperCase()}</small><h3>{check.profile.name}</h3><p>{check.profile.email}</p><span className={check.profile.active ? "quality-ok" : "quality-warn"}>● {check.profile.active ? "Acesso ativo" : "Acesso suspenso"}</span></div></article>
        <article><small>RESPONSÁVEL</small><b>{check.coordinator?.name || check.manager?.name || "Sem responsável específico"}</b><span>{check.coordinator ? "Coordenação direta" : check.manager ? roleLabel(check.manager.role) : "Verifique se isso é esperado"}</span></article>
        <article><small>TERRITÓRIO</small><b>{check.territories.length ? check.territories.map(item => item.value).join(" · ") : "Sem território próprio"}</b><span>{check.territories.length ? `${check.territories.length} vínculo(s) territorial(is)` : "Pode estar definido pela pesquisa ou coordenação"}</span></article>
        <article><small>ÚLTIMA PRESENÇA</small><b>{formatDate(check.profile.last_seen_at)}</b><span>{check.profile.current_path || "Sem tela registrada"}</span></article>
        <article><small>ACADEMIA</small><b>{check.academy_track || "—"}</b><span>{check.academy_progress.completed_lessons} aula(s) concluída(s) · {check.academy_progress.started_lessons} iniciada(s)</span></article>
        <article><small>COLETA REAL</small><b>{check.collection.interviews} entrevista(s)</b><span>{check.collection.flagged ? `${check.collection.flagged} item(ns) para revisar` : "Sem alerta atual"}</span></article>
      </div> : <div className="quality-loading-line">Carregando o perfil selecionado…</div>}

      {check && <div className="quality-subsection"><h3>Pesquisas liberadas para este perfil</h3>{check.survey_assignments.length ? <div className="quality-surveys">{check.survey_assignments.map(item => <article key={item.id}><div><small>{item.is_test ? "TESTE" : item.status.toUpperCase()}</small><b>{item.title}</b><span>{[item.city,item.region,item.neighborhood].filter(Boolean).join(" · ") || "Sem recorte adicional"}</span></div><div className="quality-video-status"><em className={item.intro_video ? "on" : "off"}>Abertura {item.intro_video ? "✓" : "—"}</em><em className={item.thank_you_video ? "on" : "off"}>Agradecimento {item.thank_you_video ? "✓" : "—"}</em></div></article>)}</div> : <div className="quality-empty">Nenhuma pesquisa foi atribuída diretamente a este perfil.</div>}</div>}
    </section>

    <section className="quality-card">
      <div className="quality-title"><div><small>CONTROLE DE QUALIDADE</small><h2>Sinais para revisar no piloto</h2><p>Use padrões repetidos para melhorar treinamento, texto e tecnologia. Um alerta isolado não prova erro.</p></div></div>
      <div className="quality-researchers">{quality?.researchers?.map(item => <article key={item.researcher_id}><h3>{item.researcher_name}</h3><div><span><b>{item.interviews}</b> entrevistas</span><span><b>{formatDuration(item.avg_duration_seconds)}</b> média</span><span><b>{item.flagged}</b> para conferir</span></div><small>{item.very_fast} duração(ões) curta(s) · {item.possible_duplicates} repetição(ões) provável(is) · {item.very_short_answers} resposta(s) curta(s)</small></article>) || null}{!quality?.researchers?.length && <div className="quality-empty">Os indicadores aparecerão depois das primeiras entrevistas reais.</div>}</div>
      {!!quality?.flagged_rows?.length && <div className="quality-review-list"><h3>Registros que merecem conferência</h3>{quality.flagged_rows.map(row => <article key={row.code}><span><b>{row.code}</b><small>{row.researcher_name} · {row.survey_title}</small></span><span><b>{formatDuration(row.duration_seconds)}</b><small>{formatDate(row.completed_at)}</small></span><div>{row.quality_flags.map(flag => <em key={flag}>{flagLabel(flag)}</em>)}</div></article>)}</div>}
      <div className="quality-guidance">{quality?.guidance?.map(text => <p key={text}>✓ {text}</p>)}</div>
    </section>

    <section className="quality-card quality-next"><small>REGRA DO PILOTO</small><h2>Primeiro corrigir o processo. Depois aumentar o volume.</h2><p>Com duas pesquisadoras, cada falha ainda é barata de encontrar e corrigir. O objetivo desta fase é chegar a um fluxo estável: acesso correto, consentimento claro, entrevista salva, operação offline recuperável, sincronização completa e dados revisáveis.</p></section>
  </main>;
}
