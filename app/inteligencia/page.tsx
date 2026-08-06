"use client";

import { useEffect, useMemo, useState } from "react";
import "./inteligencia.css";

type StoredSession = {
  access_token: string;
  user?: { id?: string; email?: string };
};

type Profile = {
  id: string;
  name: string;
  email: string;
  role: string;
  observer_mode?: string;
  active: boolean;
  access_removed_at?: string | null;
};

type ThemeInsight = {
  theme: string;
  mentions: number;
  percentage: number;
  cities: number;
  regions: number;
  neighborhoods: number;
  recent_mentions: number;
  classification: "sinal_inicial" | "alta_prioridade" | "prioridade_local" | "tema_emergente" | "acompanhar";
  suggested_action: string;
};

type Suggestion = {
  text: string;
  mentions: number;
  city?: string | null;
  region?: string | null;
  neighborhood?: string | null;
};

type Territory = {
  territory: string;
  scope_type: string;
  responses: number;
};

type Mobilizer = {
  id: string;
  name: string;
  kind: string;
  city?: string | null;
  region?: string | null;
  neighborhood?: string | null;
  responses: number;
  last_response_at?: string | null;
};

type TrackedProposal = {
  id: string;
  theme: string;
  scope_type: "geral" | "cidade" | "regional" | "bairro";
  scope_value?: string | null;
  recommendation: string;
  evidence_count: number;
  status: "analysis" | "included" | "study" | "not_feasible" | "responded";
  notes: string;
  updated_at: string;
};

type RegionalSurvey = {
  id: string;
  slug: string;
  title: string;
  status: string;
  regional: string;
  intro_video_url?: string | null;
  thank_you_video_url?: string | null;
  question_count?: number;
  updated_at?: string;
};

type IntelligenceSummary = {
  generated_at: string;
  filters: { city?: string | null; region?: string | null; neighborhood?: string | null };
  summary: {
    total_responses: number;
    last_30_days: number;
    sample_warning?: string | null;
  };
  themes: ThemeInsight[];
  suggestions: Suggestion[];
  territories: Territory[];
  mobilizers: Mobilizer[];
  tracked_proposals: TrackedProposal[];
  regional_surveys: RegionalSurvey[];
};

type RuntimeConfig = { url: string; key: string };
type Tab = "visao" | "sugestoes" | "propostas" | "pesquisas";

const SESSION_KEY = "nortep-sessao";
let runtimeConfig: RuntimeConfig | null = null;

function readStoredSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as StoredSession | null;
  } catch {
    return null;
  }
}

async function getRuntimeConfig() {
  if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig;
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração do NorteP indisponível.");
  const value = await response.json() as RuntimeConfig;
  runtimeConfig = { url: value.url.trim(), key: value.key.trim() };
  return runtimeConfig;
}

async function apiRequest<T>(path: string, token: string, init: RequestInit = {}) {
  const config = await getRuntimeConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || body?.error_description || body?.error || "Não foi possível concluir a operação.");
  }
  return body as T;
}

async function rpc<T>(name: string, token: string, body: Record<string, unknown> = {}) {
  return apiRequest<T>(`rpc/${name}`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function classificationLabel(value: ThemeInsight["classification"]) {
  return ({
    sinal_inicial: "Sinal inicial",
    alta_prioridade: "Alta prioridade",
    prioridade_local: "Prioridade local",
    tema_emergente: "Tema emergente",
    acompanhar: "Acompanhar",
  } as const)[value];
}

function statusLabel(value: TrackedProposal["status"]) {
  return ({
    analysis: "Em análise",
    included: "Incluída na proposta",
    study: "Encaminhada para estudo",
    not_feasible: "Inviável no momento",
    responded: "Respondida",
  } as const)[value];
}

function formatDate(value?: string | null) {
  if (!value) return "Sem registro";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function locationLabel(item: Suggestion) {
  return item.neighborhood || item.region || item.city || "Território não informado";
}

export default function IntelligencePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<IntelligenceSummary | null>(null);
  const [tab, setTab] = useState<Tab>("visao");
  const [city, setCity] = useState("Betim");
  const [region, setRegion] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [videoDrafts, setVideoDrafts] = useState<Record<string, { intro: string; final: string }>>({});
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, { status: TrackedProposal["status"]; notes: string }>>({});
  const [sessionInfo, setSessionInfo] = useState({ token: "", userId: "" });

  const regionOptions = useMemo(
    () => Array.from(new Set((data?.regional_surveys || []).map(item => item.regional).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [data?.regional_surveys],
  );

  const refresh = async (showLoading = true) => {
    const stored = readStoredSession();
    if (!stored?.access_token || !stored.user?.id) {
      setSessionInfo({ token: "", userId: "" });
      setError("Entre primeiro no perfil administrativo do NorteP.");
      setLoading(false);
      return;
    }

    setSessionInfo({ token: stored.access_token, userId: stored.user.id });
    if (showLoading) setLoading(true);
    setError("");
    try {
      const [profiles, summary, surveys] = await Promise.all([
        apiRequest<Profile[]>(
          `profiles?id=eq.${encodeURIComponent(stored.user.id)}&select=id,name,email,role,observer_mode,active,access_removed_at`,
          stored.access_token,
        ),
        rpc<IntelligenceSummary>("mobilization_intelligence_summary", stored.access_token, {
          p_city: city.trim() || null,
          p_region: region.trim() || null,
          p_neighborhood: neighborhood.trim() || null,
        }),
        rpc<RegionalSurvey[]>("regional_surveys_admin", stored.access_token).catch(() => []),
      ]);

      const current = profiles[0] || null;
      if (!current || !current.active || current.access_removed_at) {
        throw new Error("Este perfil não está ativo.");
      }
      if (current.role !== "admin" && !(current.role === "observador" && current.observer_mode === "candidato")) {
        throw new Error("Esta área é reservada à administração e ao acompanhamento autorizado do candidato.");
      }

      const completeSummary = {
        ...summary,
        regional_surveys: surveys.length ? surveys : summary.regional_surveys,
      };
      setProfile(current);
      setData(completeSummary);

      setVideoDrafts(previous => {
        const next = { ...previous };
        for (const survey of completeSummary.regional_surveys) {
          if (!next[survey.id]) {
            next[survey.id] = {
              intro: survey.intro_video_url || "",
              final: survey.thank_you_video_url || "",
            };
          }
        }
        return next;
      });

      setProposalDrafts(previous => {
        const next = { ...previous };
        for (const item of completeSummary.tracked_proposals) {
          if (!next[item.id]) next[item.id] = { status: item.status, notes: item.notes || "" };
        }
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a inteligência de mobilização.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, []);

  const applyFilters = () => void refresh(true);

  const saveTheme = async (theme: ThemeInsight) => {
    if (!sessionInfo.token || profile?.role !== "admin") return;
    const scopeType: TrackedProposal["scope_type"] = neighborhood.trim()
      ? "bairro"
      : region.trim()
        ? "regional"
        : city.trim()
          ? "cidade"
          : "geral";
    const scopeValue = neighborhood.trim() || region.trim() || city.trim() || null;
    setBusyKey(`theme-${theme.theme}`);
    setMessage("");
    try {
      await rpc("save_mobilization_proposal_item", sessionInfo.token, {
        p_theme: theme.theme,
        p_scope_type: scopeType,
        p_scope_value: scopeValue,
        p_recommendation: theme.suggested_action,
        p_evidence_count: theme.mentions,
        p_status: "analysis",
        p_notes: `Classificação automática: ${classificationLabel(theme.classification)}. Revisar competência, orçamento, viabilidade jurídica e diversidade territorial antes de aprovar.`,
      });
      setMessage(`${theme.theme} foi incluído no acompanhamento de propostas.`);
      await refresh(false);
      setTab("propostas");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível salvar a proposta.");
    } finally {
      setBusyKey("");
    }
  };

  const updateTrackedProposal = async (item: TrackedProposal) => {
    if (!sessionInfo.token || profile?.role !== "admin") return;
    const draft = proposalDrafts[item.id] || { status: item.status, notes: item.notes || "" };
    setBusyKey(`proposal-${item.id}`);
    setMessage("");
    try {
      await rpc("save_mobilization_proposal_item", sessionInfo.token, {
        p_theme: item.theme,
        p_scope_type: item.scope_type,
        p_scope_value: item.scope_value || null,
        p_recommendation: item.recommendation,
        p_evidence_count: item.evidence_count,
        p_status: draft.status,
        p_notes: draft.notes,
      });
      setMessage(`Situação de ${item.theme} atualizada.`);
      await refresh(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível atualizar a proposta.");
    } finally {
      setBusyKey("");
    }
  };

  const saveVideos = async (survey: RegionalSurvey) => {
    if (!sessionInfo.token || profile?.role !== "admin") return;
    const draft = videoDrafts[survey.id] || { intro: "", final: "" };
    setBusyKey(`video-${survey.id}`);
    setMessage("");
    try {
      await rpc("set_survey_videos_admin", sessionInfo.token, {
        p_survey_id: survey.id,
        p_intro_video_url: draft.intro.trim() || null,
        p_thank_you_video_url: draft.final.trim() || null,
      });
      setMessage(`Vídeos da Regional ${survey.regional} atualizados.`);
      await refresh(false);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível salvar os vídeos.");
    } finally {
      setBusyKey("");
    }
  };

  if (loading) {
    return <main className="intel-shell intel-centered">
      <div className="intel-loader" />
      <h1>Preparando a inteligência territorial…</h1>
      <p>Organizando temas, sugestões e pesquisas regionais.</p>
    </main>;
  }

  if (error || !data || !profile || !sessionInfo.token || !sessionInfo.userId) {
    return <main className="intel-shell intel-centered">
      <div className="intel-brand">NP</div>
      <small>INTELIGÊNCIA DE MOBILIZAÇÃO</small>
      <h1>Acesso não liberado</h1>
      <p>{error || "Entre novamente no NorteP."}</p>
      <a className="intel-primary-link" href="/?acesso=administracao">Entrar na administração</a>
    </main>;
  }

  const isAdmin = profile.role === "admin";

  return <main className="intel-shell">
    <header className="intel-header">
      <div>
        <small>NORTEP · DADOS QUE APROXIMAM</small>
        <h1>Inteligência de propostas</h1>
        <p>Triagem territorial da mobilização e gestão das pesquisas regionais de Betim.</p>
      </div>
      <div className="intel-header-actions">
        <span><b>{profile.name}</b><small>{isAdmin ? "Administração" : "Acompanhamento do candidato"}</small></span>
        <a href="/?acesso=administracao">Voltar ao NorteP</a>
      </div>
    </header>

    <section className="intel-filters">
      <label>Cidade<input value={city} onChange={event => setCity(event.target.value)} placeholder="Betim" /></label>
      <label>Regional
        <select value={region} onChange={event => setRegion(event.target.value)}>
          <option value="">Todas as regionais</option>
          {regionOptions.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>Bairro<input value={neighborhood} onChange={event => setNeighborhood(event.target.value)} placeholder="Todos os bairros" /></label>
      <button type="button" onClick={applyFilters}>Aplicar filtros</button>
    </section>

    {data.summary.sample_warning && <div className="intel-warning"><b>Leitura responsável:</b> {data.summary.sample_warning}</div>}
    {message && <div className="intel-message" role="status">{message}</div>}

    <nav className="intel-tabs" aria-label="Seções da inteligência">
      <button className={tab === "visao" ? "active" : ""} onClick={() => setTab("visao")}>Visão geral</button>
      <button className={tab === "sugestoes" ? "active" : ""} onClick={() => setTab("sugestoes")}>Sugestões da população</button>
      <button className={tab === "propostas" ? "active" : ""} onClick={() => setTab("propostas")}>Acompanhamento</button>
      <button className={tab === "pesquisas" ? "active" : ""} onClick={() => setTab("pesquisas")}>Pesquisas regionais</button>
    </nav>

    {tab === "visao" && <>
      <section className="intel-kpis">
        <article><small>Respostas da mobilização</small><strong>{data.summary.total_responses}</strong><span>{data.summary.last_30_days} nos últimos 30 dias</span></article>
        <article><small>Temas identificados</small><strong>{data.themes.length}</strong><span>agrupados sem dados pessoais</span></article>
        <article><small>Territórios com respostas</small><strong>{data.territories.length}</strong><span>cidade, regional ou bairro</span></article>
        <article><small>Pesquisas de Betim</small><strong>{data.regional_surveys.length}</strong><span>todas em rascunho</span></article>
      </section>

      <section className="intel-grid">
        <div className="intel-card intel-card-wide">
          <div className="intel-title-row"><div><small>TRIAGEM AUTOMÁTICA</small><h2>Temas mais citados</h2></div><span>Atualizado {formatDate(data.generated_at)}</span></div>
          <div className="intel-theme-list">
            {data.themes.length ? data.themes.map((theme, index) => <article key={theme.theme}>
              <div className="intel-rank">{index + 1}</div>
              <div className="intel-theme-main">
                <div><h3>{theme.theme}</h3><span className={`intel-badge ${theme.classification}`}>{classificationLabel(theme.classification)}</span></div>
                <p>{theme.suggested_action}</p>
                <div className="intel-bar"><i style={{ width: `${Math.min(100, theme.percentage)}%` }} /></div>
                <small>{theme.mentions} citação(ões) · {theme.percentage}% das respostas filtradas · {theme.neighborhoods} bairro(s)</small>
              </div>
              {isAdmin && <button disabled={busyKey === `theme-${theme.theme}`} onClick={() => void saveTheme(theme)}>
                {busyKey === `theme-${theme.theme}` ? "Salvando…" : "Acompanhar"}
              </button>}
            </article>) : <div className="intel-empty">Ainda não há temas suficientes para a triagem.</div>}
          </div>
        </div>

        <div className="intel-card">
          <small>COBERTURA</small>
          <h2>Territórios</h2>
          <div className="intel-simple-list">
            {data.territories.length ? data.territories.map(item => <div key={`${item.scope_type}-${item.territory}`}><span><b>{item.territory}</b><small>{item.scope_type}</small></span><strong>{item.responses}</strong></div>) : <p>Sem respostas territoriais.</p>}
          </div>
        </div>

        <div className="intel-card">
          <small>REDE</small>
          <h2>Mobilizadores por link</h2>
          <div className="intel-simple-list">
            {data.mobilizers.map(item => <div key={item.id}><span><b>{item.name}</b><small>{item.kind} · {item.neighborhood || item.region || item.city || "sem território"}</small></span><strong>{item.responses}</strong></div>)}
          </div>
        </div>
      </section>
    </>}

    {tab === "sugestoes" && <section className="intel-card">
      <div className="intel-title-row"><div><small>VOZES DO TERRITÓRIO</small><h2>Sugestões e manifestações</h2></div><span>Sem telefone ou e-mail</span></div>
      <p className="intel-explain">As frases são exibidas apenas para compreender como a população descreve os problemas. Elas não substituem análise técnica, jurídica ou orçamentária.</p>
      <div className="intel-suggestions">
        {data.suggestions.length ? data.suggestions.map((item, index) => <article key={`${item.text}-${index}`}>
          <blockquote>“{item.text.trim()}”</blockquote>
          <span>{locationLabel(item)} · {item.mentions} ocorrência(s)</span>
        </article>) : <div className="intel-empty">Ainda não há sugestões escritas neste filtro.</div>}
      </div>
    </section>}

    {tab === "propostas" && <section className="intel-card">
      <div className="intel-title-row"><div><small>DECISÃO HUMANA</small><h2>Acompanhamento de propostas</h2></div><span>{data.tracked_proposals.length} item(ns)</span></div>
      <p className="intel-explain">A triagem sugere caminhos. A decisão final deve considerar competência do cargo, orçamento, viabilidade jurídica, diversidade territorial e qualidade da amostra.</p>
      <div className="intel-proposals">
        {data.tracked_proposals.length ? data.tracked_proposals.map(item => {
          const draft = proposalDrafts[item.id] || { status: item.status, notes: item.notes || "" };
          return <article key={item.id}>
            <header><div><h3>{item.theme}</h3><small>{item.scope_type}{item.scope_value ? ` · ${item.scope_value}` : ""} · {item.evidence_count} evidência(s)</small></div><span>{statusLabel(item.status)}</span></header>
            <p>{item.recommendation}</p>
            {isAdmin ? <div className="intel-proposal-edit">
              <label>Situação
                <select value={draft.status} onChange={event => setProposalDrafts(previous => ({
                  ...previous,
                  [item.id]: { ...draft, status: event.target.value as TrackedProposal["status"] },
                }))}>
                  <option value="analysis">Em análise</option>
                  <option value="included">Incluída na proposta</option>
                  <option value="study">Encaminhada para estudo</option>
                  <option value="not_feasible">Inviável no momento</option>
                  <option value="responded">Respondida</option>
                </select>
              </label>
              <label>Observações
                <textarea value={draft.notes} onChange={event => setProposalDrafts(previous => ({
                  ...previous,
                  [item.id]: { ...draft, notes: event.target.value },
                }))} placeholder="Registre análise, encaminhamento ou justificativa." />
              </label>
              <button disabled={busyKey === `proposal-${item.id}`} onClick={() => void updateTrackedProposal(item)}>
                {busyKey === `proposal-${item.id}` ? "Salvando…" : "Salvar acompanhamento"}
              </button>
            </div> : <p className="intel-notes">{item.notes || "Sem observações públicas da equipe."}</p>}
          </article>;
        }) : <div className="intel-empty">Nenhum tema foi colocado em acompanhamento. Na visão geral, use o botão “Acompanhar”.</div>}
      </div>
    </section>}

    {tab === "pesquisas" && <section className="intel-card">
      <div className="intel-title-row"><div><small>BETIM · 10 REGIONAIS</small><h2>Pesquisas específicas</h2></div><span>Rascunhos protegidos</span></div>
      <p className="intel-explain">Cada pesquisa possui núcleo comparável, módulo territorial próprio, perguntas equivalentes sobre Dr. Vinícius Rezende e Olavo Keesen, consentimento acadêmico opcional e espaço para dois vídeos.</p>
      <div className="intel-surveys">
        {data.regional_surveys.map(survey => {
          const draft = videoDrafts[survey.id] || { intro: survey.intro_video_url || "", final: survey.thank_you_video_url || "" };
          return <article key={survey.id}>
            <header><div><small>{survey.regional}</small><h3>{survey.title}</h3></div><span>{survey.status === "draft" ? "Rascunho" : survey.status}</span></header>
            <p>{survey.question_count ?? 26} perguntas · vídeo de abertura antes das perguntas · vídeo de agradecimento ao final</p>
            {isAdmin ? <div className="intel-video-form">
              <label>Vídeo de abertura
                <input value={draft.intro} onChange={event => setVideoDrafts(previous => ({
                  ...previous,
                  [survey.id]: { ...draft, intro: event.target.value },
                }))} placeholder="Link do YouTube para apresentação" />
              </label>
              <label>Vídeo de encerramento
                <input value={draft.final} onChange={event => setVideoDrafts(previous => ({
                  ...previous,
                  [survey.id]: { ...draft, final: event.target.value },
                }))} placeholder="Link do YouTube para agradecimento" />
              </label>
              <button disabled={busyKey === `video-${survey.id}`} onClick={() => void saveVideos(survey)}>
                {busyKey === `video-${survey.id}` ? "Salvando…" : "Salvar vídeos"}
              </button>
            </div> : <div className="intel-video-status">
              <span>{survey.intro_video_url ? "Abertura configurada" : "Abertura aguardando vídeo"}</span>
              <span>{survey.thank_you_video_url ? "Encerramento configurado" : "Encerramento aguardando vídeo"}</span>
            </div>}
          </article>;
        })}
      </div>
    </section>}

    <footer className="intel-footer">
      <b>NorteP Pesquisa</b>
      <span>A triagem apoia decisões, mas não substitui análise humana, técnica, jurídica e orçamentária.</span>
    </footer>
  </main>;
}
