"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components, react-hooks/exhaustive-deps */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { clearSurveyTestData, configured, createAccessInvite, deleteOrArchiveSurvey, FieldEvent, grantVaultAccess, loadAllSurveys, loadFieldEvents, loadInterviews, loadObserverSummary, loadProfile, loadProfiles, loadRuntimeConfig, loadSurveyAssignments, loadSurveyQuestions, loadSurveys, loadVaultAudit, loadVaultContacts, ObserverSummary, Profile, readSession, readSessionFromUrl, redeemAccessInvite, refreshSession, removeProfileAccess, requestPasswordReset, saveFieldEvent, saveInterview, saveSession, SavedInterview, saveSurveyAdmin, Session, setProfileActive, setSurveyAssignments, setupVaultKey, signIn, signUp, Survey, SurveyQuestion, unlockVault, updatePassword, updateSurveyStatusAdmin, VaultAudit, VaultContact } from "./supabase";

type View = "inicio" | "pesquisas" | "equipe" | "rankings" | "mapa" | "resultados" | "ecossistema" | "cofre" | "portal" | "entrevista" | "obrigado";
type AccessChannel = "publico" | "pesquisador" | "observador" | "coordenacao" | "administracao";
type PendingItem =
  | { kind: "interview"; id: string; survey: Survey; responses: Record<string, string>; deviceId: string; durationSeconds: number; savedAt: string; attempts: number }
  | { kind: "field_event"; id: string; survey: Survey; event: Omit<FieldEvent, "id" | "survey_id" | "researcher_id" | "occurred_at">; deviceId: string; savedAt: string; attempts: number };
type RespostasSetter = Dispatch<SetStateAction<Record<string, string>>>;
type InterviewDraft = { survey: Survey; step: number; responses: Record<string, string>; startedAt: number; savedAt: string };
type AttemptLog = { action: "inicio" | "retomada" | "recomeco" | "finalizada" | "recusa" | "interrompida"; surveyId: string; at: string; step: number };
const draftKey = (surveyId: string) => `nortep-rascunho-${surveyId}`;

function readAccessChannel(): AccessChannel {
  if (typeof window === "undefined") return "publico";
  const value = new URLSearchParams(window.location.search).get("acesso");
  return value === "pesquisador" || value === "observador" || value === "coordenacao" || value === "administracao" ? value : "publico";
}

const pesquisas = [
  { nome: "Betim: território e escolhas 2026", status: "Liberada", tipo: "Quantitativa", videoPermitido: false, feitas: 0, meta: 100, equipe: 5 },
  { nome: "Avaliação dos serviços públicos", status: "Planejada", tipo: "Qualitativa", videoPermitido: false, feitas: 0, meta: 500, equipe: 0 },
  { nome: "Prioridades da comunidade", status: "Planejada", tipo: "Direcional", videoPermitido: true, feitas: 0, meta: 400, equipe: 0 },
];

export default function Home() {
  const [view, setView] = useState<View>("inicio");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [passo, setPasso] = useState(1);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [adminSurveys, setAdminSurveys] = useState<Survey[]>([]);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [team, setTeam] = useState<Profile[]>([]);
  const [interviews, setInterviews] = useState<SavedInterview[]>([]);
  const [fieldEvents, setFieldEvents] = useState<FieldEvent[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [savedCode, setSavedCode] = useState("");
  const [savedSynced, setSavedSynced] = useState(true);
  const [accessChannel, setAccessChannel] = useState<AccessChannel>("publico");
  const [inviteCode, setInviteCode] = useState("");
  const [observerSummary, setObserverSummary] = useState<ObserverSummary | null>(null);
  const [passwordRecoverySession, setPasswordRecoverySession] = useState<Session | null>(null);
  const [interviewStartedAt, setInterviewStartedAt] = useState<number>(0);
  const [resumeDraft, setResumeDraft] = useState<InterviewDraft | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const channel = readAccessChannel();
    const invitation = new URLSearchParams(window.location.search).get("convite") || "";
    setAccessChannel(channel);
    setInviteCode(invitation);
    const video = localStorage.getItem("nortep-video-agradecimento");
    if (video) setVideoUrl(video);
    const pendentes: PendingItem[] = JSON.parse(localStorage.getItem("nortep-pendentes") || "[]");
    setPendingCount(pendentes.length);
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        const callback = await readSessionFromUrl();
        if (callback?.type === "recovery") {
          setPasswordRecoverySession(callback.session);
          return;
        }
        const stored = callback?.session ?? readSession();
        if (!stored) return;
        try { await autenticar(stored, channel); } catch { saveSession(null); }
      } finally {
        setAuthReady(true);
      }
    };
    boot();
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);
  useEffect(() => {
    if (view !== "entrevista" || !survey || !interviewStartedAt) return;
    const draft: InterviewDraft = { survey, step: passo, responses: respostas, startedAt: interviewStartedAt, savedAt: new Date().toISOString() };
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      try { localStorage.setItem(draftKey(survey.id), JSON.stringify(draft)); } catch { aviso("Não foi possível salvar o rascunho neste aparelho."); }
    }, 350);
    return () => { if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current); };
  }, [view, survey, passo, respostas, interviewStartedAt]);
  useEffect(() => {
    if (view !== "entrevista") return;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }, [view, passo]);
  useEffect(() => localStorage.setItem("nortep-video-agradecimento", videoUrl), [videoUrl]);

  async function carregarAdmin(s: Session, p: Profile) {
    if (!(["admin", "coordenador"] as string[]).includes(p.role)) return;
    const [profiles, everySurvey, events] = await Promise.all([loadProfiles(s), loadAllSurveys(s), loadFieldEvents(s)]);
    setTeam(profiles);
    setAdminSurveys(everySurvey);
    setFieldEvents(events);
  }

  async function autenticar(incoming: Session, channel: AccessChannel = accessChannel) {
    const current = await refreshSession(incoming);
    const p = await loadProfile(current);
    if (!p) throw new Error("Perfil não encontrado.");
    if (channel === "administracao" && p.role !== "admin") {
      saveSession(null);
      throw new Error("Este acesso é exclusivo para administração e coordenação autorizadas.");
    }
    if (channel === "coordenacao" && p.role !== "coordenador") {
      saveSession(null);
      throw new Error("Este link é exclusivo para coordenadores autorizados.");
    }
    if (channel === "observador" && p.role !== "observador") {
      saveSession(null);
      throw new Error("Este link é exclusivo para observadores autorizados.");
    }
    setSession(current);
    setProfile(p);
    if (p.role === "observador") {
      setObserverSummary(await loadObserverSummary(current));
      setView("inicio");
      return;
    }
    const visibleSurveys = await loadSurveys(current);
    setSurveys(visibleSurveys);
    setSurvey(visibleSurveys[0] ?? null);
    if (p.active) setInterviews(await loadInterviews(current));
    await carregarAdmin(current, p);
    setView(p.role === "pesquisador" ? "portal" : "inicio");
  }

  const aviso = (texto: string) => {
    setToast(texto);
    setTimeout(() => setToast(""), 2600);
  };
  useEffect(() => {
    if (!session || !profile || !(profile.role === "admin" || profile.role === "coordenador")) return;
    let known = fieldEvents.length;
    const checkEvents = async () => {
      try {
        const events = await loadFieldEvents(session);
        if (events.length > known) {
          const novas = events.slice(0, events.length - known);
          aviso(novas.some(event => event.is_safety_alert) ? "ALERTA DE SEGURANÇA: houve uma ocorrência grave em campo." : `${events.length - known} nova(s) ocorrência(s) de campo: confira recusas e interrupções.`);
        }
        known = events.length;
        setFieldEvents(events);
      } catch { /* A próxima verificação ocorre automaticamente. */ }
    };
    const timer = window.setInterval(() => void checkEvents(), 20000);
    return () => window.clearInterval(timer);
  }, [session, profile?.role]);
  useEffect(() => {
    if (!session || profile?.role !== "pesquisador") return;
    const refresh = () => void atualizarPesquisasPesquisador(false);
    const timer = window.setInterval(refresh, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, profile?.role]);
  useEffect(() => {
    if (!session || !profile || profile.active || profile.access_removed_at) return;
    const refreshApproval = async () => {
      try {
        const refreshed = await loadProfile(session);
        if (refreshed.active) await autenticar(session, accessChannel);
      } catch { /* A pessoa ainda pode conferir pelo botão. */ }
    };
    const timer = window.setInterval(() => void refreshApproval(), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshApproval(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session, profile?.id, profile?.active, profile?.access_removed_at]);
  const ir = (destino: View) => {
    if (profile?.role === "pesquisador" && !(["portal", "entrevista", "obrigado"] as View[]).includes(destino)) setView("portal");
    else setView(destino);
    setMenu(false);
  };
  const atualizarEquipe = async (id: string, active: boolean) => {
    if (!session) return;
    try {
      await setProfileActive(session, id, active);
      setTeam(await loadProfiles(session));
      aviso(active ? "Acesso reativado com segurança" : "Acesso suspenso com segurança");
    } catch (error) {
      aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível alterar o acesso");
    }
  };
  const removerAcessoEquipe = async (id: string) => {
    if (!session) return;
    try {
      await removeProfileAccess(session, id);
      setTeam(await loadProfiles(session));
      aviso("Acesso apagado. O histórico de entrevistas foi preservado.");
    } catch (error) {
      aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível apagar o acesso");
    }
  };
  const gerarConvite = async (email: string, role: "admin" | "coordenador" | "observador" | "pesquisador") => {
    if (!session) throw new Error("Entre novamente para gerar o convite.");
    const code = await createAccessInvite(session, email, role);
    const channel = role === "observador" ? "observador" : role === "pesquisador" ? "pesquisador" : role === "coordenador" ? "coordenacao" : "administracao";
    return `${window.location.origin}/?acesso=${channel}&convite=${encodeURIComponent(code)}`;
  };
  const fila = () => {
    const raw = JSON.parse(localStorage.getItem("nortep-pendentes") || "[]") as Array<PendingItem | Record<string, unknown>>;
    return raw.map(item => item.kind ? item as PendingItem : ({ ...item, kind: "interview", durationSeconds: 0, savedAt: new Date().toISOString(), attempts: 0 } as PendingItem));
  };
  const guardarFila = (items: PendingItem[]) => {
    try {
      localStorage.setItem("nortep-pendentes", JSON.stringify(items));
      setPendingCount(items.length);
    } catch {
      aviso("O aparelho está com pouco espaço. Sincronize antes de continuar.");
    }
  };
  const finalizarEntrevista = async () => {
    if (!session || !survey) return aviso("Pesquisa ainda não foi liberada para este acesso");
    let deviceId = localStorage.getItem("nortep-dispositivo");
    if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem("nortep-dispositivo", deviceId); }
    const durationSeconds = interviewStartedAt ? Math.max(1, Math.round((Date.now() - interviewStartedAt) / 1000)) : 0;
    const item: PendingItem = { kind: "interview", id: crypto.randomUUID(), survey, responses: { ...respostas }, deviceId, durationSeconds, savedAt: new Date().toISOString(), attempts: 0 };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const saved = await saveInterview(session, survey, item.responses, deviceId, durationSeconds);
      setSavedCode(saved.code);
      setSavedSynced(true);
      if (profile && profile.role !== "pesquisador") setInterviews(await loadInterviews(session));
    } catch {
      guardarFila([...fila(), item]);
      setSavedCode(`ENT-OFFLINE-${String(Date.now()).slice(-6)}`);
      setSavedSynced(false);
    }
    registrarTentativa("finalizada", survey);
    localStorage.removeItem(draftKey(survey.id));
    ir("obrigado");
  };
  const sincronizarPendentes = async () => {
    if (!session || !navigator.onLine) return aviso("Conecte o aparelho à internet para sincronizar");
    const restantes: PendingItem[] = [];
    let enviadas = 0;
    for (const item of fila()) {
      try {
        if (item.kind === "field_event") await saveFieldEvent(session, item.survey, item.event, item.deviceId);
        else await saveInterview(session, item.survey, item.responses, item.deviceId, item.durationSeconds);
        enviadas++;
      } catch { restantes.push({ ...item, attempts: item.attempts + 1 }); }
    }
    guardarFila(restantes);
    aviso(enviadas ? `${enviadas} entrevista(s) sincronizada(s)` : "Nenhuma entrevista pendente");
    if (profile && profile.role !== "pesquisador") {
      const [saved, events] = await Promise.all([loadInterviews(session), loadFieldEvents(session)]);
      setInterviews(saved); setFieldEvents(events);
    }
  };
  const registrarOcorrencia = async (outcome: FieldEvent["outcome"], reason = "", currentSurvey: Survey | null = survey) => {
    if (!session || !currentSurvey) return aviso("Selecione uma pesquisa antes de registrar a ocorrência");
    let deviceId = localStorage.getItem("nortep-dispositivo");
    if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem("nortep-dispositivo", deviceId); }
    const duringInterview = view === "entrevista";
    const isSafetyAlert = /\b(briga|viol[êe]ncia|agress[aã]o|espanc|amea[cç]a|arma|assalto|furto|roubo|perigo|ferid|pol[ií]cia)\b/i.test(reason);
    const event = { outcome, reason, city: duringInterview ? (respostas.localEntrevistaCidade || "") : (currentSurvey.target_cities?.[0] || ""), region: duringInterview ? (respostas.localEntrevistaRegiao || "") : (currentSurvey.target_regions?.[0] || ""), neighborhood: duringInterview ? (respostas.localEntrevistaBairro || "") : (currentSurvey.target_neighborhoods?.[0] || ""), latitude: duringInterview && respostas.latitude ? Number(respostas.latitude) : null, longitude: duringInterview && respostas.longitude ? Number(respostas.longitude) : null, is_safety_alert: isSafetyAlert };
    try {
      if (!navigator.onLine) throw new Error("offline");
      await saveFieldEvent(session, currentSurvey, event, deviceId);
      if (admin) setFieldEvents(await loadFieldEvents(session));
      aviso(isSafetyAlert ? "Alerta de segurança registrado para a administração" : "Ocorrência registrada com segurança");
    } catch {
      guardarFila([...fila(), { kind: "field_event", id: crypto.randomUUID(), survey: currentSurvey, event, deviceId, savedAt: new Date().toISOString(), attempts: 0 }]);
      aviso(isSafetyAlert ? "Alerta de segurança salvo no aparelho; sincronize assim que houver sinal" : "Ocorrência salva no aparelho para sincronização");
    }
  };
  const registrarTentativa = (action: AttemptLog["action"], currentSurvey: Survey | null = survey) => {
    if (!currentSurvey) return;
    try {
      const raw = JSON.parse(localStorage.getItem("nortep-tentativas") || "[]") as AttemptLog[];
      localStorage.setItem("nortep-tentativas", JSON.stringify([...raw.slice(-199), { action, surveyId: currentSurvey.id, at: new Date().toISOString(), step: passo }]));
    } catch { /* O registro principal de recusa/interrupção continua na fila de sincronização. */ }
  };
  const atualizarDadosAdmin = async () => {
    if (!session || !profile || !admin) return;
    const [everySurvey, saved, events, profiles] = await Promise.all([loadAllSurveys(session), loadInterviews(session), loadFieldEvents(session), loadProfiles(session)]);
    setAdminSurveys(everySurvey); setInterviews(saved); setFieldEvents(events); setTeam(profiles);
  };
  const atualizarPesquisasPesquisador = async (mostrarAviso = true) => {
    if (!session) return;
    try {
      const atuais = await loadSurveys(session);
      setSurveys(atuais);
      setSurvey(previous => previous && atuais.some(item => item.id === previous.id) ? previous : atuais[0] ?? null);
      if (mostrarAviso) aviso(atuais.length ? `${atuais.length} pesquisa(s) disponível(is)` : "Nenhuma pesquisa ativa no momento");
    } catch {
      if (mostrarAviso) aviso("Não foi possível atualizar agora. Verifique a conexão.");
    }
  };
  const abrirPesquisa = async (selected: Survey, draft?: InterviewDraft, action: AttemptLog["action"] = "inicio") => {
    if (!session) return;
    setSurvey(selected);
    setSurveyQuestions(await loadSurveyQuestions(session, selected.id));
    setPasso(draft?.step || 1);
    setRespostas(draft?.responses || { codigo: `ENT-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}` });
    setInterviewStartedAt(draft?.startedAt || Date.now());
    registrarTentativa(action, selected);
    setResumeDraft(null);
    ir("entrevista");
  };
  const iniciarPesquisa = async (selected: Survey) => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(selected.id)) || "null") as InterviewDraft | null;
      if (saved?.survey?.id === selected.id && (saved.step > 1 || Object.keys(saved.responses || {}).length > 0)) {
        setResumeDraft({ ...saved, survey: selected });
        return;
      }
    } catch { localStorage.removeItem(draftKey(selected.id)); }
    await abrirPesquisa(selected);
  };
  useEffect(() => {
    if (!session) return;
    const autoSync = () => { if (navigator.onLine && fila().length) void sincronizarPendentes(); };
    window.addEventListener("online", autoSync);
    const timer = navigator.onLine && pendingCount ? window.setTimeout(autoSync, 1200) : 0;
    return () => { window.removeEventListener("online", autoSync); if (timer) window.clearTimeout(timer); };
  }, [session, pendingCount]);
  const sair = () => { saveSession(null); setSession(null); setProfile(null); setSurvey(null); setSurveys([]); setAdminSurveys([]); setObserverSummary(null); setView("inicio"); };

  if (!authReady) return <TelaCarregando />;
  if (!configured()) return <TelaConfigErro />;
  if (passwordRecoverySession) return <RedefinirSenha session={passwordRecoverySession} concluir={() => {
    saveSession(null);
    setPasswordRecoverySession(null);
    setSession(null);
    setProfile(null);
  }} />;
  if (!session || !profile) {
    if (accessChannel === "publico") return <PublicLanding />;
    return <Login access={accessChannel} inviteCode={inviteCode} onAuthenticated={autenticar} />;
  }
  if (profile.access_removed_at) return <AcessoRemovido profile={profile} sair={sair} />;
  if (!profile.active) return <AguardandoAprovacao profile={profile} sair={sair} verificar={async () => {
    if (session) await autenticar(session, accessChannel);
  }} />;
  if (profile.role === "observador") return <ObserverPanel profile={profile} summary={observerSummary} sair={sair} atualizar={async () => { if (session) setObserverSummary(await loadObserverSummary(session)); }} />;

  const admin = profile.role === "admin" || profile.role === "coordenador";
  const campo = view === "portal" || view === "entrevista" || view === "obrigado";
  const titulos: Record<View, string> = {
    inicio: "Visão geral",
    pesquisas: "Pesquisas",
    equipe: "Pesquisadores",
    rankings: "Rankings",
    mapa: "Mapa territorial",
    resultados: "Resultados",
    ecossistema: "Ecossistema NorteP",
    cofre: "Cofre de contatos",
    portal: "Minhas pesquisas",
    entrevista: "Nova entrevista",
    obrigado: "Entrevista concluída",
  };

  return <div className={campo ? "app app-campo" : "app"}>
    <ControleFonte />
    {!campo && <aside className={menu ? "open" : ""}>
      <div className="logo"><i>NP</i><span>NorteP <b>Pesquisa</b></span></div>
      <nav>{[
        ["inicio", "⌂", "Visão geral"],
        ["pesquisas", "▤", "Pesquisas"],
        ["equipe", "♙", "Pesquisadores"],
        ["rankings", "★", "Rankings"],
        ["mapa", "◎", "Mapa territorial"],
        ["resultados", "◫", "Resultados"],
        ...(profile.role === "admin" ? [["cofre", "◉", "Cofre de contatos"]] : []),
        ["ecossistema", "◇", "Ecossistema NorteP"],
      ].map(item => <button className={view === item[0] ? "active" : ""} onClick={() => ir(item[0] as View)} key={item[0]}><i>{item[1]}</i>{item[2]}</button>)}</nav>
      <div className="coleta"><b>● Coleta conectada</b><small>{interviews.length} de 100 entrevistas</small><div><i style={{ width: `${Math.min(interviews.length, 100)}%` }} /></div></div>
      <div className="perfil"><i>{profile.name.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase()}</i><span><b>{profile.name}</b><small>{profile.role === "admin" ? "Administradora responsável" : "Coordenação"}</small></span><button onClick={sair}>Sair</button></div>
    </aside>}

    <main>
      <header>
        {!campo && <button className="hamb" onClick={() => setMenu(!menu)}>☰</button>}
        <div className={campo ? "marca-campo" : ""}>
          <small>{campo ? "NORTEP PESQUISA · ÁREA DO PESQUISADOR" : "NORTEP · DADOS QUE APROXIMAM"}</small>
          <h1>{titulos[view]}</h1>
        </div>
        <section>
          {view === "entrevista" && interviewStartedAt > 0 && <Cronometro inicio={interviewStartedAt} />}
          {campo && <button className="sync" onClick={sincronizarPendentes}>● {offline ? "Sem conexão" : pendingCount ? `${pendingCount} pendente(s)` : "Sincronizado"}</button>}
          {campo && view === "portal" && <button className="refresh-surveys" onClick={() => void atualizarPesquisasPesquisador(true)}>↻ Atualizar pesquisas</button>}
          {!campo && admin && <button className="preview-field" onClick={() => ir("portal")}>Ver área do pesquisador →</button>}
          {campo && <button className="sair-campo" onClick={() => admin ? ir("inicio") : sair()}>{admin ? "Sair da prévia" : "Sair"}</button>}
        </section>
      </header>

      <div className={campo ? "content campo-content" : "content"}>
        {view === "inicio" && <><Inicio ir={ir} aviso={aviso} interviews={interviews} profiles={team} pending={pendingCount} fieldEvents={fieldEvents} /><AlertasSeguranca events={fieldEvents} /></>}
        {view === "pesquisas" && <Pesquisas ir={ir} aviso={aviso} videoUrl={videoUrl} setVideoUrl={setVideoUrl} surveys={adminSurveys} profiles={team} session={session} currentProfile={profile} atualizar={atualizarDadosAdmin} />}
        {view === "equipe" && <Equipe aviso={aviso} profiles={team} currentProfile={profile} onToggle={atualizarEquipe} onDelete={removerAcessoEquipe} onInvite={gerarConvite} />}
        {view === "rankings" && <Rankings interviews={interviews} profiles={team} surveys={adminSurveys} fieldEvents={fieldEvents} />}
        {view === "mapa" && <MapaTerritorial interviews={interviews} fieldEvents={fieldEvents} />}
        {view === "resultados" && <Resultados aviso={aviso} interviews={interviews} surveys={adminSurveys} fieldEvents={fieldEvents} />}
        {view === "ecossistema" && <Ecossistema />}
        {view === "cofre" && profile.role === "admin" && <CofreContatos session={session} profiles={team} aviso={aviso} />}
        {view === "portal" && <Portal profile={profile} surveys={surveys} interviews={interviews} pending={pendingCount} sincronizar={sincronizarPendentes} iniciar={iniciarPesquisa} registrar={registrarOcorrencia} />}
        {view === "entrevista" && survey && (survey.slug === "betim-territorio-escolhas-2026" ? <Entrevista extraQuestions={surveyQuestions} passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={finalizarEntrevista} cancelar={() => {
          const motivo = respostas.consentirPesquisa === "Não aceito participar" ? "Consentimento recusado" : respostas.idadeMinima === "Não" || respostas.eleitorBetim === "Não" ? "Pessoa fora do público da pesquisa" : "Entrevista encerrada";
          void registrarOcorrencia(respostas.consentirPesquisa === "Não aceito participar" ? "refused" : respostas.idadeMinima === "Não" || respostas.eleitorBetim === "Não" ? "ineligible" : "interrupted", motivo, survey);
          registrarTentativa(respostas.consentirPesquisa === "NÃ£o aceito participar" ? "recusa" : "interrompida", survey);
          localStorage.removeItem(draftKey(survey.id));
          setRespostas({});
          ir("portal");
        }} /> : <EntrevistaDinamica survey={survey} questions={surveyQuestions} passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={finalizarEntrevista} cancelar={(outcome, reason) => {
          void registrarOcorrencia(outcome, reason, survey);
          registrarTentativa(outcome === "refused" ? "recusa" : "interrompida", survey);
          localStorage.removeItem(draftKey(survey.id)); setRespostas({}); ir("portal");
        }} />)}
        {view === "obrigado" && <Obrigado nome={respostas.nome} videoUrl="" codigo={savedCode} sincronizado={savedSynced} concluir={() => {
          if (survey) localStorage.removeItem(draftKey(survey.id));
          setRespostas({});
          ir("portal");
          aviso(savedSynced ? `Entrevista ${savedCode} sincronizada` : "Entrevista salva no aparelho para sincronização");
        }} />}
      </div>
    </main>
    {menu && <div className="scrim" onClick={() => setMenu(false)} />}
    {resumeDraft && <RetomarEntrevista draft={resumeDraft} continuar={() => void abrirPesquisa(resumeDraft.survey, resumeDraft, "retomada")} recomecar={() => { localStorage.removeItem(draftKey(resumeDraft.survey.id)); void abrirPesquisa(resumeDraft.survey, undefined, "recomeco"); }} cancelar={() => setResumeDraft(null)} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>;
}

function RetomarEntrevista({ draft, continuar, recomecar, cancelar }: { draft: InterviewDraft; continuar: () => void; recomecar: () => void; cancelar: () => void }) {
  const quando = new Date(draft.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Entrevista em andamento"><div className="resume-modal"><small>ENTREVISTA EM ANDAMENTO</small><h2>Continuar de onde parou?</h2><p>Encontramos um rascunho salvo neste aparelho em {quando}. Escolha continuar para manter as respostas ou recomeçar para abrir uma nova entrevista.</p><div><button onClick={cancelar}>Voltar</button><button onClick={recomecar}>Recomeçar</button><button className="primary" onClick={continuar}>Continuar entrevista</button></div></div></div>;
}

function CofreContatos({ session, profiles, aviso }: { session: Session; profiles: Profile[]; aviso: (text: string) => void }) {
  const [keyValue, setKeyValue] = useState("");
  const [token, setToken] = useState("");
  const [contacts, setContacts] = useState<VaultContact[]>([]);
  const [audit, setAudit] = useState<VaultAudit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const execute = async (action: () => Promise<void>) => { setLoading(true); try { await action(); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível concluir a ação no cofre."); } finally { setLoading(false); } };
  const refreshAudit = async () => setAudit(await loadVaultAudit(session));
  useEffect(() => { void execute(refreshAudit); }, []);
  const open = () => void execute(async () => { const unlocked = await unlockVault(session, keyValue); setToken(unlocked.token); setContacts(await loadVaultContacts(session, unlocked.token)); setKeyValue(""); await refreshAudit(); aviso("Cofre aberto por 20 minutos neste aparelho."); });
  return <div className="cofre-grid"><section className="painel cofre-intro"><small>ÁREA RESTRITA</small><h2>Cofre de contatos autorizados</h2><p>Nome, WhatsApp e e-mail não aparecem nos resultados comuns. Esta área registra cada abertura e consulta.</p><div className="cofre-nota"><b>Use uma chave diferente da senha do app.</b><span>A chave é pessoal, não é exibida nem guardada no navegador.</span></div><label>Minha chave do cofre<input type="password" value={keyValue} onChange={e => setKeyValue(e.target.value)} placeholder="Mínimo de 12 caracteres" autoComplete="new-password" /></label><div className="cofre-actions"><button disabled={loading || keyValue.length < 12} onClick={() => void execute(async () => { await setupVaultKey(session, keyValue); setKeyValue(""); await refreshAudit(); aviso("Chave individual criada. Agora use-a para abrir o cofre."); })}>Criar ou trocar minha chave</button><button className="primary" disabled={loading || !keyValue} onClick={open}>Abrir cofre</button></div></section><section className="painel"><Topo sup="CONTATOS COM CONSENTIMENTO" titulo={token ? `${contacts.length} contato(s) visível(is)` : "Cofre bloqueado"} />{token ? <div className="cofre-list">{contacts.length ? contacts.map(c => <article key={c.interview_id}><b>{c.respondent_name || "Sem nome"}</b><span>{c.contact_choice || "Finalidade não informada"}</span><small>{c.contact_whatsapp || ""} {c.contact_whatsapp && c.contact_email ? "·" : ""} {c.contact_email || ""}</small></article>) : <p>Nenhum contato autorizado armazenado ainda.</p>}</div> : <p className="ranking-empty">Informe sua chave pessoal para visualizar dados reais. A sessão expira automaticamente.</p>}</section><section className="painel"><Topo sup="CONTROLE DE RESPONSÁVEIS" titulo="Liberar acesso individual" /><label>Responsável<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione uma pessoa ativa</option>{profiles.filter(p => p.active && !p.access_removed_at).map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label><div className="cofre-actions"><button className="primary" disabled={!selected || loading} onClick={() => void execute(async () => { await grantVaultAccess(session, selected, true); await refreshAudit(); aviso("Acesso ao cofre liberado. A pessoa deve criar sua própria chave."); })}>Liberar acesso</button><button disabled={!selected || loading} onClick={() => void execute(async () => { await grantVaultAccess(session, selected, false); await refreshAudit(); aviso("Acesso ao cofre revogado e sessões encerradas."); })}>Revogar acesso</button></div><Topo sup="AUDITORIA" titulo="Últimos acessos" /> <div className="cofre-list">{audit.map((a, i) => <article key={`${a.occurred_at}-${i}`}><b>{a.actor_name}</b><span>{a.action === "vault_opened" ? "Abriu o cofre" : a.action === "vault_contacts_viewed" ? "Consultou contatos" : a.action === "vault_access_granted" ? "Liberou um responsável" : a.action === "vault_access_revoked" ? "Revogou um responsável" : "Configurou a chave"}</span><small>{new Date(a.occurred_at).toLocaleString("pt-BR")}</small></article>)}</div></section></div>;
}

function Cronometro({ inicio }: { inicio: number }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const total = Math.max(0, Math.floor((agora - inicio) / 1000));
  return <span className="cronometro" aria-label="Tempo de entrevista">⏱ {String(Math.floor(total / 60)).padStart(2, "0")}:{String(total % 60).padStart(2, "0")}</span>;
}

function TelaCarregando() {
  return <div className="auth-shell"><div className="auth-card loading-card"><div className="auth-logo">NP</div><h1>NorteP Pesquisa</h1><p>Preparando seu acesso seguro…</p></div></div>;
}

function ControleFonte() {
  const [grande, setGrande] = useState(false);
  useEffect(() => {
    const salvo = localStorage.getItem("nortep-texto-grande") === "sim";
    setGrande(salvo);
    document.documentElement.dataset.texto = salvo ? "grande" : "normal";
  }, []);
  const alterar = (valor: boolean) => {
    setGrande(valor);
    localStorage.setItem("nortep-texto-grande", valor ? "sim" : "nao");
    document.documentElement.dataset.texto = valor ? "grande" : "normal";
  };
  return <div className="font-control" role="group" aria-label="Tamanho do texto"><span>Texto</span><button type="button" className={!grande ? "active" : ""} aria-pressed={!grande} onClick={() => alterar(false)}>A</button><button type="button" className={grande ? "active" : ""} aria-pressed={grande} onClick={() => alterar(true)}>A+</button></div>;
}

function TelaConfigErro() {
  return <div className="auth-shell"><ControleFonte /><div className="auth-card"><div className="auth-logo">NP</div><h1>Acesso temporariamente indisponível</h1><p>Tente novamente em alguns minutos. Se o problema continuar, fale com a equipe NorteP.</p></div></div>;
}

function PublicLanding() {
  return <div className="public-shell">
    <ControleFonte />
    <section className="public-copy">
      <small>NORTEP PESQUISA</small>
      <h1><b>N</b>orte<b>P</b></h1>
      <h2>Dados de campo protegidos.<br />Decisões mais próximas das pessoas.</h2>
      <p>Plataforma privada para pesquisas presenciais, organização territorial e acompanhamento de equipes autorizadas.</p>
      <div className="public-points"><span>✓ Coleta anônima</span><span>✓ Consentimento registrado</span><span>✓ Acesso controlado por função</span></div>
      <div className="public-actions">
        <a className="public-researcher" href="?acesso=pesquisador">Entrar como pesquisador →</a>
        <a className="public-contact" href="mailto:pesquisadecamponortep@gmail.com?subject=Acesso%20ou%20demonstra%C3%A7%C3%A3o%20NorteP">Falar com a NorteP</a>
      </div>
    </section>
    <section className="public-shield"><div><i>NP</i><small>AMBIENTE RESTRITO</small><h3>Acesso somente para pessoas autorizadas.</h3><p>Pesquisadores e gestores recebem um link específico da coordenação. Caso tenha recebido um convite, utilize exatamente o endereço enviado.</p><span>Se precisar de ajuda, fale com a equipe NorteP.</span></div></section>
  </div>;
}

function Login({ access, inviteCode, onAuthenticated }: { access: AccessChannel; inviteCode: string; onAuthenticated: (session: Session, channel?: AccessChannel) => Promise<void> }) {
  const invited = (access === "administracao" || access === "coordenacao" || access === "observador") && Boolean(inviteCode);
  const allowSignup = access === "pesquisador" || invited;
  const [modo, setModo] = useState<"entrar" | "criar" | "recuperar">(invited ? "criar" : "entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const enviar = async () => {
    setBusy(true); setMessage("");
    try {
      if (modo === "entrar") {
        const newSession = await signIn(email.trim().toLowerCase(), password);
        if (invited) await redeemAccessInvite(newSession, inviteCode);
        await onAuthenticated(newSession, access);
      }
      else if (modo === "recuperar") {
        const redirect = `${window.location.origin}/?acesso=${access}`;
        await requestPasswordReset(email.trim().toLowerCase(), redirect);
        setRecoveryEmail(email.trim().toLowerCase());
      }
      else {
        const redirect = `${window.location.origin}/?acesso=${access}${inviteCode ? `&convite=${encodeURIComponent(inviteCode)}` : ""}`;
        const result = await signUp(name.trim(), email.trim().toLowerCase(), password, redirect);
        if (result.session) {
          if (invited) await redeemAccessInvite(result.session, inviteCode);
          await onAuthenticated(result.session, access);
        } else {
          setConfirmationEmail(email.trim().toLowerCase());
        }
      }
    } catch (error) { saveSession(null); setMessage(error instanceof Error ? traduzErro(error.message) : "Não foi possível entrar."); }
    setBusy(false);
  };
  const adminAccess = access === "administracao";
  const coordinatorAccess = access === "coordenacao";
  const observerAccess = access === "observador";
  const accessName = adminAccess ? "administração" : coordinatorAccess ? "coordenação" : observerAccess ? "observação" : "pesquisa de campo";
  if (confirmationEmail) return <div className="auth-shell"><ControleFonte />
    <section className="auth-brand">
      <small>NORTEP PESQUISA</small>
      <h1><b>N</b>orte<b>P</b> Pesquisa</h1>
      <p>Seu acesso está protegido por duas confirmações simples.</p>
      <div><span>1. Confirmação do e-mail</span><span>2. Aprovação da administração</span><span>3. Pesquisa liberada</span></div>
    </section>
    <div className="auth-card confirmation-card">
      <div className="auth-logo">NP</div>
      <small>PRIMEIRA ETAPA CONCLUÍDA</small>
      <h2>Confira seu e-mail</h2>
      <p>Enviamos uma mensagem de confirmação para <b>{confirmationEmail}</b>.</p>
      <ol className="confirmation-steps">
        <li><i>1</i><span><b>Abra o e-mail da NorteP</b><small>Confira também as pastas Spam ou Lixo eletrônico.</small></span></li>
        <li><i>2</i><span><b>Toque em “Confirmar cadastro”</b><small>O link abrirá novamente a NorteP Pesquisa.</small></span></li>
        <li><i>3</i><span><b>Aguarde a aprovação de acesso</b><small>A administração precisa liberar a pesquisa antes da primeira entrevista.</small></span></li>
      </ol>
      <div className="auth-message success-message" role="status">Cadastro recebido. Depois de confirmar o e-mail, aparecerá a mensagem “Aguardando aprovação”.</div>
      <button type="button" className="primary auth-submit" onClick={() => { setConfirmationEmail(""); setModo("entrar"); setPassword(""); }}>Já confirmei: entrar</button>
      <button type="button" className="auth-switch" onClick={() => setConfirmationEmail("")}>Voltar para corrigir o e-mail</button>
    </div>
  </div>;
  if (recoveryEmail) return <div className="auth-shell"><ControleFonte />
    <section className="auth-brand">
      <small>NORTEP PESQUISA</small>
      <h1><b>N</b>orte<b>P</b> Pesquisa</h1>
      <p>A recuperação é feita por um link individual enviado ao e-mail da conta.</p>
      <div><span>✓ Link temporário</span><span>✓ Nova senha protegida</span><span>✓ Aprovação de acesso preservada</span></div>
    </section>
    <div className="auth-card confirmation-card">
      <div className="auth-logo">NP</div>
      <small>RECUPERAÇÃO SOLICITADA</small>
      <h2>Confira seu e-mail</h2>
      <p>Se <b>{recoveryEmail}</b> estiver cadastrado, você receberá um link para criar uma nova senha.</p>
      <div className="pending-shield"><i>✉</i><span><b>Abra a mensagem da NorteP</b><small>Confira também Spam ou Lixo eletrônico. Por segurança, o link é temporário.</small></span></div>
      <button type="button" className="primary auth-submit" onClick={() => { setRecoveryEmail(""); setModo("entrar"); }}>Voltar para entrar</button>
      <button type="button" className="auth-switch" onClick={() => setRecoveryEmail("")}>Enviar novamente ou corrigir o e-mail</button>
    </div>
  </div>;
  return <div className="auth-shell"><ControleFonte />
    <section className="auth-brand">
      <small>NORTEP PESQUISA</small>
      <h1><b>N</b>orte<b>P</b> Pesquisa</h1>
      <p>{adminAccess ? "Acesso administrativo reservado para pessoas autorizadas." : coordinatorAccess ? "Acesso de coordenação reservado para acompanhar equipes autorizadas." : observerAccess ? "Acompanhamento reservado para pessoas autorizadas." : "Dados de campo protegidos, organizados e prontos para aproximar pessoas das decisões."}</p>
      <div>{adminAccess ? <><span>✓ Administração autorizada</span><span>✓ Controle de acessos</span><span>✓ Auditoria e privacidade</span></> : coordinatorAccess ? <><span>✓ Coordenação autorizada</span><span>✓ Equipes e territórios</span><span>✓ Acompanhamento protegido</span></> : observerAccess ? <><span>✓ Indicadores agrupados</span><span>✓ Sem dados pessoais</span><span>✓ Acesso protegido</span></> : <><span>✓ Entrevistado sem login</span><span>✓ Pesquisador com acesso próprio</span><span>✓ Consentimento e auditoria</span></>}</div>
    </section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <div className="auth-logo">NP</div>
      <small>{adminAccess ? "ADMINISTRAÇÃO RESTRITA" : coordinatorAccess ? "COORDENAÇÃO RESTRITA" : observerAccess ? "ACOMPANHAMENTO RESTRITO" : "ÁREA DO PESQUISADOR"}</small>
      <h2>{modo === "recuperar" ? "Recuperar minha senha" : modo === "entrar" ? (adminAccess ? "Entrar na administração" : coordinatorAccess ? "Entrar na coordenação" : observerAccess ? "Entrar como observador" : "Entrar para pesquisar") : (invited ? "Aceitar convite" : "Criar acesso de pesquisador")}</h2>
      <p>{modo === "recuperar" ? "Digite o e-mail usado no cadastro. Enviaremos um link seguro para você criar uma nova senha." : modo === "entrar" ? (adminAccess ? "Somente a administração responsável possui controle total." : coordinatorAccess ? "Acompanhe equipes e a coleta sem controlar a administração principal." : observerAccess ? "Este acesso mostra somente indicadores agrupados da coleta, sem respostas individuais." : "Entre com seu cadastro. Se a conta estiver ativa, a pesquisa será aberta; caso contrário, você verá a situação da aprovação.") : (invited ? "Este convite é individual, temporário e vinculado ao e-mail informado pela coordenação." : "Crie sua conta. Depois da aprovação da coordenação, a pesquisa será liberada neste mesmo acesso.")}</p>
      {modo === "criar" && <div className="existing-account-note"><span><b>Já possui uma conta?</b><small>Não faça outro cadastro. Entre para saber se o acesso já está ativo ou se ainda aguarda aprovação.</small></span><button type="button" onClick={() => { setModo("entrar"); setMessage(""); }}>Entrar e verificar</button></div>}
      {modo === "criar" && <><label htmlFor="auth-name">Nome completo</label><input id="auth-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" /></>}
      <label htmlFor="auth-email">E-mail</label>
      <input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@exemplo.com" />
      {modo !== "recuperar" && <><label htmlFor="auth-password">Senha</label>
        <div className="password-field">
          <input id="auth-password" type={showPassword ? "text" : "password"} autoComplete={modo === "entrar" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" />
          <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "◉" : "◎"}<span>{showPassword ? "Ocultar" : "Mostrar"}</span></button>
        </div>
        <div className="password-save-note"><i>✓</i><span><b>Você pode salvar a senha neste aparelho</b><small>Depois de enviar, aceite “Salvar senha” quando o seu celular ou navegador oferecer. A NorteP não lê nem guarda essa senha.</small></span></div></>}
      <button type="submit" className="primary auth-submit" disabled={busy || !email || (modo !== "recuperar" && password.length < 8) || (modo === "criar" && !name)}>{busy ? "Aguarde…" : modo === "recuperar" ? "Enviar link de recuperação" : modo === "entrar" ? "Entrar com segurança" : invited ? "Criar conta e aceitar convite" : "Criar meu acesso"}</button>
      {message && <div className="auth-message" role="status">{message}</div>}
      {modo === "entrar" && <button type="button" className="auth-forgot" onClick={() => { setModo("recuperar"); setMessage(""); setPassword(""); }}>Esqueci minha senha</button>}
      {modo === "recuperar" && <button type="button" className="auth-switch" onClick={() => { setModo("entrar"); setMessage(""); }}>Voltar para entrar</button>}
      {allowSignup && modo !== "recuperar" && <button type="button" className="auth-switch" onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMessage(""); }}>{modo === "entrar" ? (invited ? "Primeiro acesso? Aceitar convite" : "Primeiro acesso? Criar conta") : "Já possui acesso? Entrar"}</button>}
      <small className="auth-help">{adminAccess || coordinatorAccess || observerAccess ? `Este link é exclusivo para ${accessName} autorizada.` : "O entrevistado não precisa criar conta."}</small>
    </form>
  </div>;
}

function RedefinirSenha({ session, concluir }: { session: Session; concluir: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const enviar = async () => {
    if (password.length < 8) return setMessage("A nova senha precisa ter pelo menos 8 caracteres.");
    if (password !== confirmation) return setMessage("As duas senhas não são iguais. Digite novamente.");
    setBusy(true); setMessage("");
    try {
      await updatePassword(session, password);
      setSuccess(true);
    } catch (error) {
      setMessage(error instanceof Error ? traduzErro(error.message) : "Não foi possível alterar a senha.");
    } finally { setBusy(false); }
  };
  if (success) return <div className="auth-shell"><ControleFonte /><div className="auth-card pending-card password-success">
    <div className="auth-logo">NP</div><small>SENHA ATUALIZADA</small><h2>Nova senha criada com sucesso</h2>
    <p>Seu nível de acesso e a aprovação da administração continuam iguais. Agora entre novamente usando a nova senha.</p>
    <div className="pending-shield"><i>✓</i><span><b>A alteração foi concluída</b><small>As sessões anteriores não mostram sua nova senha.</small></span></div>
    <button type="button" className="primary pending-refresh" onClick={concluir}>Entrar com a nova senha</button>
  </div></div>;
  return <div className="auth-shell"><ControleFonte />
    <section className="auth-brand"><small>NORTEP PESQUISA</small><h1><b>N</b>orte<b>P</b> Pesquisa</h1><p>Crie uma senha nova para recuperar seu acesso.</p><div><span>✓ Link individual</span><span>✓ Senha criptografada</span><span>✓ Acesso continua controlado</span></div></section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <div className="auth-logo">NP</div><small>RECUPERAÇÃO SEGURA</small><h2>Criar nova senha</h2><p>Use pelo menos 8 caracteres e evite nomes, datas de nascimento ou senhas usadas em outros serviços.</p>
      <label htmlFor="new-password">Nova senha</label>
      <div className="password-field"><input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senhas" : "Mostrar senhas"}>{showPassword ? "◉" : "◎"}<span>{showPassword ? "Ocultar" : "Mostrar"}</span></button></div>
      <label htmlFor="confirm-password">Confirmar nova senha</label>
      <input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder="Digite a mesma senha novamente" />
      <div className="password-save-note"><i>✓</i><span><b>O navegador poderá atualizar a senha salva</b><small>A NorteP não consegue ler a sua senha.</small></span></div>
      <button type="submit" className="primary auth-submit" disabled={busy || password.length < 8 || confirmation.length < 8}>{busy ? "Alterando…" : "Salvar nova senha"}</button>
      {message && <div className="auth-message" role="alert">{message}</div>}
    </form>
  </div>;
}

function traduzErro(message: string) {
  const texto = message.toLowerCase();
  const espera = message.match(/after\s+(\d+)\s+seconds?/i);
  if (texto.includes("for security purposes") && espera) return `Por segurança, aguarde ${espera[1]} segundos antes de tentar novamente.`;
  if (texto.includes("rate limit") || texto.includes("too many requests")) return "Foram feitas muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (texto.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (texto.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (texto.includes("same password") || texto.includes("different from the old")) return "Escolha uma senha diferente da anterior.";
  if ((texto.includes("token") || texto.includes("link")) && (texto.includes("expired") || texto.includes("invalid"))) return "Este link de recuperação expirou. Solicite um novo link na tela de entrada.";
  if (texto.includes("already registered") || texto.includes("user already exists")) return "Este e-mail já possui uma conta. Entre para verificar: se estiver ativa, a pesquisa será aberta; se não, aparecerá Aguardando aprovação.";
  if (texto.includes("password") && (texto.includes("least") || texto.includes("weak"))) return "A senha precisa ter pelo menos 8 caracteres.";
  if (texto.includes("invalid") && texto.includes("email")) return "Digite um endereço de e-mail válido.";
  if (texto.includes("signup") && texto.includes("disabled")) return "A criação de novas contas está temporariamente indisponível.";
  if (texto.includes("convite inválido") || texto.includes("expirado") || texto.includes("outro e-mail")) return "Este convite é inválido, expirou ou foi aberto com outro e-mail. Peça um novo convite à administração.";
  if (texto.includes("exclusivo para administração") || texto.includes("não autorizado")) return "Este e-mail não possui autorização para entrar na administração.";
  if (texto.includes("failed to fetch") || texto.includes("network")) return "Não foi possível conectar. Verifique a internet e tente novamente.";
  return "Não foi possível concluir a operação. Aguarde um momento e tente novamente.";
}

function AguardandoAprovacao({ profile, sair, verificar }: { profile: Profile; sair: () => void; verificar: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);
  const refresh = async () => { setChecking(true); try { await verificar(); } finally { setChecking(false); } };
  return <div className="auth-shell"><ControleFonte /><div className="auth-card pending-card"><div className="auth-logo">NP</div><small>ACESSO CRIADO COM SUCESSO</small><h2>Olá, {profile.name}.</h2><p>Seu cadastro está correto e chegou à coordenação. Assim que a administração aprovar, toque no botão abaixo para abrir a pesquisa.</p><div className="pending-shield">◎ <span><b>Aguardando apenas a aprovação</b><small>Esta proteção impede que pessoas não autorizadas façam entrevistas.</small></span></div><button className="primary pending-refresh" onClick={refresh} disabled={checking}>{checking ? "Verificando…" : "Verificar liberação da pesquisa"}</button><button className="auth-switch" onClick={sair}>Sair e voltar depois</button></div></div>;
}

function AcessoRemovido({ profile, sair }: { profile: Profile; sair: () => void }) {
  return <div className="auth-shell"><ControleFonte /><div className="auth-card pending-card"><div className="auth-logo">NP</div><small>ACESSO ENCERRADO</small><h2>Olá, {profile.name}.</h2><p>Este acesso foi removido pela administração e não pode abrir pesquisas ou painéis.</p><div className="pending-shield"><i>×</i><span><b>Acesso indisponível</b><small>Se acreditar que houve um engano, fale com a coordenação da NorteP.</small></span></div><button className="auth-switch" onClick={sair}>Sair</button></div></div>;
}

function ObserverPanel({ profile, summary, sair, atualizar }: { profile: Profile; summary: ObserverSummary | null; sair: () => void; atualizar: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const refresh = async () => { setBusy(true); try { await atualizar(); } finally { setBusy(false); } };
  const lastUpdate = summary?.updated_at ? new Date(summary.updated_at).toLocaleString("pt-BR") : "Nenhuma entrevista registrada";
  return <div className="observer-shell"><ControleFonte />
    <aside><div className="observer-logo"><i>NP</i><span>NorteP <b>Pesquisa</b></span></div><div className="observer-lock"><b>◉ Somente leitura</b><span>Respostas individuais, contatos e configurações estão protegidos.</span></div><div className="observer-user"><i>{profile.name.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase()}</i><span><b>{profile.name}</b><small>Observador autorizado</small></span><button onClick={sair}>Sair</button></div></aside>
    <main><header><div><small>NORTEP · VISÃO AUTORIZADA</small><h1>Acompanhamento da coleta</h1></div><button onClick={refresh} disabled={busy}>{busy ? "Atualizando…" : "↻ Atualizar números"}</button></header><div className="observer-content"><div className="observer-intro"><div><small>ACESSO SEGURO</small><h2>Olá, {profile.name.split(" ")[0]}.</h2><p>Você pode acompanhar somente indicadores agrupados. Nenhum dado pessoal ou resposta individual é exibido.</p></div><span>Última coleta: <b>{lastUpdate}</b></span></div>{summary ? <><div className="observer-metrics"><Metrica c="verde" i="✓" t="Entrevistas realizadas" v={String(summary.total_interviews)} s="somente contagem agrupada" /><Metrica c="laranja" i="◎" t="Realizadas hoje" v={String(summary.interviews_today)} s="ritmo da coleta" /><Metrica c="roxo" i="♙" t="Pesquisadores com coleta" v={String(summary.active_researchers)} s="sem identificação pessoal" /><Metrica c="azul" i="▤" t="Pesquisas em andamento" v={String(summary.active_surveys)} s="pesquisas liberadas" /></div><div className="painel observer-surveys"><div className="topo"><div><small>PESQUISAS AUTORIZADAS</small><h3>Acompanhamento agrupado</h3></div></div>{summary.surveys.length ? summary.surveys.map(item => <div className="observer-survey-row" key={item.id}><span><b>{item.title}</b><small>Em campo</small></span><div><b>{item.interviews}</b><small>entrevistas</small></div><div><b>{item.researchers}</b><small>pesquisadores</small></div></div>) : <div className="resultado-vazio"><h3>Nenhuma pesquisa em andamento</h3><p>Os indicadores aparecerão quando uma pesquisa for liberada.</p></div>}</div></> : <div className="painel resultado-vazio"><h3>Preparando indicadores</h3><p>Aguarde um momento e atualize os números.</p></div>}<div className="observer-notice"><i>✓</i><span><b>Privacidade preservada</b><small>Este perfil não permite acessar nomes, contatos, localização, respostas, exportações, equipe ou configurações.</small></span></div></div></main>
  </div>;
}

function Inicio({ ir, aviso, interviews, profiles, pending, fieldEvents }: { ir: (v: View) => void; aviso: (t: string) => void; interviews: SavedInterview[]; profiles: Profile[]; pending: number; fieldEvents: FieldEvent[] }) {
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(hoje); d.setDate(d.getDate() - (6 - i)); return d; });
  const contagens = dias.map(d => interviews.filter(x => new Date(x.completed_at || x.created_at).toDateString() === d.toDateString()).length);
  const max = Math.max(...contagens, 1);
  const ativos = new Set(interviews.map(x => x.researcher_id)).size;
  const progresso = Math.min(interviews.length, 100);
  const pesquisaPiloto = { ...pesquisas[0], feitas: interviews.length, equipe: ativos };
  const abordagens = interviews.length + fieldEvents.length;
  const adesao = abordagens ? Math.round(interviews.length / abordagens * 100) : 0;
  const recusas = fieldEvents.filter(x => x.outcome === "refused").length;
  const interrompidas = fieldEvents.filter(x => x.outcome === "interrupted").length;
  const alertasQualidade = interviews.filter(x => (x.quality_flags || []).length).length;
  const nomesPesquisadores = Object.fromEntries(profiles.map(p => [p.id, p.name]));
  const rankingPesquisadores = Object.entries(interviews.reduce<Record<string, number>>((acc, item) => {
    acc[item.researcher_id] = (acc[item.researcher_id] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rankingTerritorios = Object.entries(interviews.reduce<Record<string, number>>((acc, item) => {
    const cidade = item.responses.cidade || "Betim";
    const bairro = item.responses.bairro || "Bairro não informado";
    const local = `${cidade} · ${bairro}`;
    acc[local] = (acc[local] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <>
    <div className="boas"><div><small>QUARTA-FEIRA, 22 DE JULHO</small><h2>Bom dia, Ludimila. <span>O campo está avançando.</span></h2><p>Acompanhe o ritmo das equipes e veja onde sua atenção é mais necessária.</p></div><button onClick={() => aviso("Dados atualizados agora")}>↻ Atualizar dados</button></div>
    <div className="metricas"><Metrica c="verde" i="✓" t="Entrevistas realizadas" v={String(interviews.length)} s="salvas com segurança" /><Metrica c="laranja" i="◎" t="Meta da pesquisa" v={`${progresso}%`} s={`${Math.max(100 - interviews.length, 0)} entrevistas restantes`} /><Metrica c="roxo" i="♙" t="Pesquisadores com coleta" v={String(ativos)} s="na pesquisa atual" /><Metrica c="azul" i="⌁" t="Neste aparelho" v={String(pending)} s="pendentes de sincronização" /></div>
    <div className="operacao-piloto"><article><small>ABORDAGENS REGISTRADAS</small><b>{abordagens}</b><span>entrevistas e ocorrências</span></article><article><small>TAXA DE CONCLUSÃO</small><b>{adesao}%</b><span>concluídas sobre abordagens</span></article><article><small>RECUSAS E INTERRUPÇÕES</small><b>{recusas + interrompidas}</b><span>{recusas} recusas · {interrompidas} interrompidas</span></article><article className={alertasQualidade ? "com-alerta" : ""}><small>ALERTAS DE QUALIDADE</small><b>{alertasQualidade}</b><span>{alertasQualidade ? "verificar antes da análise" : "nenhum alerta atual"}</span></article></div>
    <div className="duas"><div className="painel"><Topo sup="RITMO DE COLETA" titulo="Entrevistas nos últimos 7 dias" /><div className="grafico">{contagens.map((valor, i) => <div key={dias[i].toISOString()}><b>{valor}</b><i style={{ height: `${Math.max(valor ? valor / max * 90 : 3, 3)}%` }} /><small>{i === 6 ? "HOJE" : dias[i].toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3).toUpperCase()}</small></div>)}</div></div><div className="painel"><Topo sup="SITUAÇÃO DA COLETA" titulo="Acompanhamento" /><div className="alerta"><i className={pending ? "a1" : "a0"}>{pending ? "!" : "✓"}</i><span><b>{pending ? `${pending} entrevista(s) aguardando internet` : "Todas as respostas sincronizadas"}</b><small>{pending ? "Abra a área do pesquisador e toque em sincronizar" : "Nenhuma pendência neste aparelho"}</small></span></div><div className="alerta"><i className="a2">i</i><span><b>{interviews.length ? "Coleta em andamento" : "Pronto para a primeira entrevista"}</b><small>Acompanhe aqui a evolução da pesquisa.</small></span></div></div></div>
    <div className="ranking-grid"><div className="painel"><Topo sup="EQUIPE DE CAMPO" titulo="Entrevistas concluídas por pesquisador" />{rankingPesquisadores.length ? rankingPesquisadores.map(([id, total], index) => <div className="ranking-row" key={id}><i>{index + 1}</i><span><b>{nomesPesquisadores[id] || "Pesquisador"}</b><small>Entrevistas sincronizadas</small></span><strong>{total}</strong></div>) : <div className="ranking-empty">O ranking aparecerá após a primeira entrevista.</div>}</div><div className="painel"><Topo sup="CIDADES E BAIRROS" titulo="Entrevistas concluídas por território" />{rankingTerritorios.length ? rankingTerritorios.map(([local, total], index) => <div className="ranking-row" key={local}><i>{index + 1}</i><span><b>{local}</b><small>Entrevistas sincronizadas</small></span><strong>{total}</strong></div>) : <div className="ranking-empty">Os territórios aparecerão após a primeira entrevista.</div>}</div></div>
    <div className="painel lista"><div className="topo"><div><small>PESQUISAS ATIVAS</small><h3>Acompanhamento por pesquisa</h3></div><button onClick={() => ir("pesquisas")}>Ver todas →</button></div><LinhaPesquisa p={pesquisaPiloto} ir={ir} /></div>
  </>;
}

function AlertasSeguranca({ events }: { events: FieldEvent[] }) {
  const alerts = events.filter(event => event.is_safety_alert).slice(0, 6);
  if (!alerts.length) return null;
  return <section className="painel alertas-seguranca"><Topo sup="ATENÇÃO IMEDIATA" titulo="Alertas de segurança em campo" />{alerts.map(event => <div key={event.id}><span><b>⚠ Ocorrência grave</b><small>{[event.city, event.neighborhood].filter(Boolean).join(" · ") || "Local não informado"} · {new Date(event.occurred_at).toLocaleString("pt-BR")}</small><em>{event.reason || "Sem observação"}</em></span><strong>{event.outcome === "interrupted" ? "Interrompida" : "Registrada"}</strong></div>)}</section>;
}

function Rankings({ interviews, profiles, surveys, fieldEvents }: { interviews: SavedInterview[]; profiles: Profile[]; surveys: Survey[]; fieldEvents: FieldEvent[] }) {
  const [referenceTime] = useState(() => Date.now());
  const [surveyFilter, setSurveyFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("30");
  const [territoryFilter, setTerritoryFilter] = useState("");
  const inPeriod = (date: string) => periodFilter === "todos" || new Date(date).getTime() >= referenceTime - Number(periodFilter) * 86400000;
  const term = territoryFilter.trim().toLowerCase();
  const filteredInterviews = interviews.filter(item => (surveyFilter === "todos" || item.survey_id === surveyFilter) && inPeriod(item.completed_at || item.created_at) && (!term || `${item.responses.cidade || "Betim"} ${item.responses.regiao || ""} ${item.responses.bairro || ""}`.toLowerCase().includes(term)));
  const filteredEvents = fieldEvents.filter(item => (surveyFilter === "todos" || item.survey_id === surveyFilter) && inPeriod(item.occurred_at) && (!term || `${item.city || ""} ${item.region || ""} ${item.neighborhood || ""}`.toLowerCase().includes(term)));
  const nomesPesquisadores = Object.fromEntries(profiles.map(p => [p.id, p.name]));
  const pesquisadores = Object.entries(filteredInterviews.reduce<Record<string, number>>((acc, item) => {
    acc[item.researcher_id] = (acc[item.researcher_id] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const territorios = Object.entries(filteredInterviews.reduce<Record<string, number>>((acc, item) => {
    const cidade = item.responses.cidade || "Betim";
    const regiao = item.responses.regiao || item.responses.bairro || "Região não informada";
    const local = `${cidade} · ${regiao}`;
    acc[local] = (acc[local] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const maiorPesquisador = Math.max(...pesquisadores.map(([, total]) => total), 1);
  const maiorTerritorio = Math.max(...territorios.map(([, total]) => total), 1);
  const liderPesquisador = pesquisadores[0] ? nomesPesquisadores[pesquisadores[0][0]] || "Pesquisador" : "Aguardando coleta";
  const liderTerritorio = territorios[0]?.[0] || "Aguardando coleta";
  const abordagens = filteredInterviews.length + filteredEvents.length;
  const adesao = abordagens ? Math.round(filteredInterviews.length / abordagens * 100) : 0;

  return <>
    <div className="cabecalho ranking-cabecalho"><div><h2>Rankings da coleta</h2><p>Classificação atualizada pelas entrevistas concluídas e sincronizadas.</p></div><span>● Dados sincronizados</span></div>
    <div className="filtros ranking-filtros"><select value={surveyFilter} onChange={e => setSurveyFilter(e.target.value)} aria-label="Filtrar por pesquisa"><option value="todos">Todas as pesquisas</option>{surveys.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select><select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} aria-label="Filtrar por período"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="todos">Todo o período</option></select><input value={territoryFilter} onChange={e => setTerritoryFilter(e.target.value)} placeholder="Buscar cidade, região ou bairro" aria-label="Filtrar por território" /></div>
    <div className="ranking-resumo">
      <article><small>LÍDER DE CAMPO</small><b>{liderPesquisador}</b><span>{pesquisadores[0]?.[1] || 0} entrevista(s)</span></article>
      <article><small>TERRITÓRIO COM MAIS COLETA</small><b>{liderTerritorio}</b><span>{territorios[0]?.[1] || 0} entrevista(s)</span></article>
      <article><small>TAXA DE CONCLUSÃO</small><b>{adesao}%</b><span>{filteredInterviews.length} de {abordagens} abordagens</span></article>
    </div>
    <div className="ranking-page-grid">
      <section className="painel ranking-lista"><Topo sup="DESEMPENHO DA EQUIPE" titulo="Ranking de pesquisadores" />{pesquisadores.length ? pesquisadores.map(([id, total], index) => <div className="ranking-detalhe" key={id}><i>{index + 1}</i><span><b>{nomesPesquisadores[id] || "Pesquisador sem acesso ativo"}</b><small>{total} entrevista(s) concluída(s)</small><em><u style={{ width: `${total / maiorPesquisador * 100}%` }} /></em></span><strong>{total}</strong></div>) : <div className="ranking-empty">O ranking aparecerá assim que a primeira entrevista for sincronizada.</div>}</section>
      <section className="painel ranking-lista"><Topo sup="CIDADES, REGIÕES E BAIRROS" titulo="Ranking de territórios" />{territorios.length ? territorios.map(([local, total], index) => <div className="ranking-detalhe" key={local}><i>{index + 1}</i><span><b>{local}</b><small>{total} entrevista(s) concluída(s)</small><em><u style={{ width: `${total / maiorTerritorio * 100}%` }} /></em></span><strong>{total}</strong></div>) : <div className="ranking-empty">Os territórios aparecerão assim que a primeira entrevista for sincronizada.</div>}</section>
    </div>
    <div className="ranking-nota"><i>i</i><span><b>Volume e taxa são medidas diferentes.</b><small>O ranking ordena entrevistas concluídas. A taxa considera também recusas, pessoas fora do público, interrupções e locais sem resposta registrados pela equipe.</small></span></div>
  </>;
}

function MapaTerritorial({ interviews, fieldEvents }: { interviews: SavedInterview[]; fieldEvents: FieldEvent[] }) {
  const points = [
    ...interviews.filter(x => x.latitude != null && x.longitude != null).map(x => ({ id: x.id, lat: Number(x.latitude), lng: Number(x.longitude), kind: "Entrevista concluída", territory: `${x.responses.cidade || "Betim"} · ${x.responses.bairro || "Bairro não informado"}` })),
    ...fieldEvents.filter(x => x.latitude != null && x.longitude != null).map(x => ({ id: x.id, lat: Number(x.latitude), lng: Number(x.longitude), kind: "Ocorrência de campo", territory: `${x.city || "Cidade não informada"} · ${x.neighborhood || x.region || "Região não informada"}` })),
  ];
  const latitudes = points.map(p => p.lat), longitudes = points.map(p => p.lng);
  const minLat = Math.min(...latitudes, -19.99), maxLat = Math.max(...latitudes, -19.85);
  const minLng = Math.min(...longitudes, -44.28), maxLng = Math.max(...longitudes, -44.12);
  const territories = Object.entries(interviews.reduce<Record<string, number>>((acc, item) => { const name = `${item.responses.cidade || "Betim"} · ${item.responses.bairro || "Bairro não informado"}`; acc[name] = (acc[name] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  return <>
    <div className="cabecalho"><div><h2>Mapa territorial</h2><p>Visualização aproximada somente dos pontos autorizados pelo entrevistado.</p></div><span className="mapa-privacidade">◎ Localização com consentimento</span></div>
    <div className="mapa-grid"><section className="painel mapa-painel"><div className="mapa-canvas" aria-label="Mapa aproximado das entrevistas autorizadas"><span className="mapa-rio" /><b className="mapa-label l1">BETIM</b><b className="mapa-label l2">REGIÕES DE CAMPO</b>{points.map((point, index) => { const left = 8 + ((point.lng - minLng) / Math.max(maxLng - minLng, .001)) * 84; const top = 8 + (1 - (point.lat - minLat) / Math.max(maxLat - minLat, .001)) * 84; return <i className={point.kind.startsWith("Entrevista") ? "map-point completed" : "map-point event"} style={{ left: `${left}%`, top: `${top}%` }} title={`${point.kind} · ${point.territory}`} key={point.id}>{index + 1}</i>; })}{!points.length && <div className="mapa-vazio"><b>Nenhum ponto autorizado ainda</b><span>O mapa será preenchido somente quando a pessoa permitir o registro aproximado.</span></div>}</div><div className="mapa-legenda"><span><i className="completed" /> Entrevista concluída</span><span><i className="event" /> Ocorrência de campo</span></div></section><section className="painel mapa-territorios"><Topo sup="COBERTURA DA COLETA" titulo="Entrevistas por território" />{territories.length ? territories.slice(0, 12).map(([name, count]) => <div key={name}><span><b>{name}</b><small>entrevistas sincronizadas</small></span><strong>{count}</strong></div>) : <div className="ranking-empty">Os territórios aparecerão após a primeira entrevista.</div>}</section></div>
    <div className="ranking-nota"><i>✓</i><span><b>Privacidade territorial preservada.</b><small>A tela usa coordenadas aproximadas e não exibe nome ou contato do entrevistado.</small></span></div>
  </>;
}

function Metrica({ c, i, t, v, s }: { c: string; i: string; t: string; v: string; s: string }) { return <div className="metrica"><i className={c}>{i}</i><span><small>{t}</small><b>{v}</b><em>{s}</em></span></div>; }
function Topo({ sup, titulo }: { sup: string; titulo: string }) { return <div className="topo"><div><small>{sup}</small><h3>{titulo}</h3></div><button>•••</button></div>; }
function LinhaPesquisa({ p, ir }: { p: typeof pesquisas[0]; ir: (v: View) => void }) { return <div className="linha-pesquisa"><i>▤</i><span><b>{p.nome}</b><small>● {p.status} · {p.equipe} pesquisadores</small></span><div><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><strong>{Math.round(p.feitas / p.meta * 100)}%</strong><button onClick={() => ir("resultados")}>Ver detalhes</button></div>; }

function Pesquisas({ ir, aviso, videoUrl, setVideoUrl, surveys, profiles, session, currentProfile, atualizar }: { ir: (v: View) => void; aviso: (t: string) => void; videoUrl: string; setVideoUrl: (v: string) => void; surveys: Survey[]; profiles: Profile[]; session: Session; currentProfile: Profile; atualizar: () => Promise<void> }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Survey>>({});
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [assignmentSurvey, setAssignmentSurvey] = useState<Survey | null>(null);
  const [selectedResearchers, setSelectedResearchers] = useState<string[]>([]);
  const [territory, setTerritory] = useState({ team: "", city: "", region: "", neighborhood: "" });
  const canEdit = currentProfile.role === "admin";
  const typeLabels: Record<Survey["survey_type"], string> = { quantitative: "Quantitativa", qualitative: "Qualitativa", directional: "Direcional", electoral: "Eleitoral", data_collection: "Coleta de dados" };
  const statusLabels: Record<Survey["status"], string> = { draft: "Rascunho", pilot: "Teste", active: "Em campo", closed: "Arquivada" };
  const questionTypeLabels: Record<SurveyQuestion["type"], string> = { short_text: "Texto curto", long_text: "Texto longo", yes_no: "Sim ou não", single: "Escolha única", multiple: "Várias escolhas", scale: "Escala de 0 a 10", rating: "Péssimo a ótimo", region: "Bairro ou região", internal_note: "Observação interna" };
  const splitList = (value: string) => value.split(",").map(x => x.trim()).filter(Boolean);
  const newQuestion = (): SurveyQuestion => ({ code: `q${Date.now()}`, section: "Perguntas", type: "single", prompt: "", required: false, options: ["Sim", "Não"], condition: null });
  const openNew = () => { setDraft({ title: "", description: "", status: "draft", survey_type: "quantitative", estimated_minutes: 10, consent_text: "A participação é voluntária. Você pode deixar de responder qualquer pergunta ou encerrar quando quiser.", target_cities: [], target_regions: [], target_neighborhoods: [], is_test: true }); setQuestions([{ ...newQuestion(), code: "consentirPesquisa", prompt: "Você aceita participar desta pesquisa?", type: "yes_no", required: true }]); setEditorOpen(true); };
  const openEdit = async (item: Survey) => { setBusy(true); try { setDraft(item); setQuestions(await loadSurveyQuestions(session, item.id)); setEditorOpen(true); } finally { setBusy(false); } };
  const changeQuestion = (index: number, next: Partial<SurveyQuestion>) => setQuestions(questions.map((item, i) => i === index ? { ...item, ...next } : item));
  const moveQuestion = (index: number, direction: -1 | 1) => { const target = index + direction; if (target < 0 || target >= questions.length) return; const next = [...questions]; [next[index], next[target]] = [next[target], next[index]]; setQuestions(next); };
  const saveSurvey = async () => {
    if (!draft.title?.trim()) return aviso("Informe o nome da pesquisa");
    if (!questions.filter(q => q.prompt.trim()).length && draft.slug !== "betim-territorio-escolhas-2026") return aviso("Adicione pelo menos uma pergunta");
    setBusy(true);
    try { await saveSurveyAdmin(session, draft as Partial<Survey> & { title: string }, questions.filter(q => q.prompt.trim())); await atualizar(); setEditorOpen(false); aviso(draft.id ? "Pesquisa atualizada" : "Pesquisa criada como teste"); }
    catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível salvar a pesquisa"); }
    finally { setBusy(false); }
  };
  const openAssignments = async (item: Survey) => { setBusy(true); try { const assigned = await loadSurveyAssignments(session, item.id); setSelectedResearchers(assigned.filter(x => x.active).map(x => x.researcher_id)); const first = assigned.find(x => x.active); setTerritory({ team: first?.team_name || "", city: first?.city || item.target_cities?.[0] || "", region: first?.region || item.target_regions?.[0] || "", neighborhood: first?.neighborhood || item.target_neighborhoods?.[0] || "" }); setAssignmentSurvey(item); } finally { setBusy(false); } };
  const saveAssignments = async () => { if (!assignmentSurvey) return; setBusy(true); try { await setSurveyAssignments(session, assignmentSurvey.id, selectedResearchers, territory); await atualizar(); setAssignmentSurvey(null); aviso("Pesquisa liberada para a equipe selecionada"); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível liberar a pesquisa"); } finally { setBusy(false); } };
  const removeSurvey = async (item: Survey) => { if (!window.confirm(`Apagar a pesquisa “${item.title}”?\n\nSem entrevistas: será excluída. Com dados: será arquivada e o histórico permanecerá protegido.`)) return; setBusy(true); try { const result = await deleteOrArchiveSurvey(session, item.id); await atualizar(); aviso(result.action === "deleted" ? "Pesquisa excluída" : "Pesquisa arquivada para preservar os dados"); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível apagar a pesquisa"); } finally { setBusy(false); } };
  const clearTest = async (item: Survey) => { if (!window.confirm(`Limpar somente as respostas e ocorrências de TESTE da pesquisa “${item.title}”?\n\nDados reais não serão apagados.`)) return; setBusy(true); try { const result = await clearSurveyTestData(session, item.id); await atualizar(); aviso(`${result.interviews_removed} entrevista(s) e ${result.field_events_removed} ocorrência(s) de teste removidas`); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível limpar os testes"); } finally { setBusy(false); } };
  const togglePause = async (item: Survey) => { const pausada = item.status === "draft"; setBusy(true); try { await updateSurveyStatusAdmin(session, item.id, pausada ? (item.is_test ? "pilot" : "active") : "draft"); await atualizar(); aviso(pausada ? "Pesquisa ativada e disponível para as pessoas liberadas" : "Pesquisa pausada; respostas e liberações foram preservadas"); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível alterar a pesquisa"); } finally { setBusy(false); } };
  const pauseAll = async () => { const ativas = surveys.filter(item => item.status === "active" || item.status === "pilot"); if (!ativas.length) return aviso("Não há pesquisas ativas para pausar"); if (!window.confirm(`Pausar ${ativas.length} pesquisa(s)? As respostas e liberações serão preservadas.`)) return; setBusy(true); try { for (const item of ativas) await updateSurveyStatusAdmin(session, item.id, "draft"); await atualizar(); aviso("Todas as pesquisas foram pausadas"); } catch (error) { aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível pausar todas"); } finally { setBusy(false); } };
  const configurarVideo = () => { const valor = window.prompt("Cole o link do YouTube usado após uma pesquisa direcional. Não use vídeo em pesquisa qualitativa ou eleitoral. Deixe vazio para remover.", videoUrl); if (valor !== null) { setVideoUrl(valor.trim()); aviso(valor.trim() ? "Vídeo de agradecimento configurado" : "Vídeo removido desta pesquisa"); } };

  return <>
    <Cabecalho titulo="Pesquisas de campo" sub="Crie questionários, defina territórios e libere para equipes específicas." botao={canEdit ? "＋ Criar pesquisa" : "Acompanhar resultados"} acao={canEdit ? openNew : () => ir("resultados")} />
    <div className="admin-guidance"><i>✓</i><span><b>Ambiente preparado para testes</b><small>Pausar apenas retira a pesquisa do campo. Respostas, perguntas e liberações permanecem guardadas.</small></span>{canEdit && <button className="pause-all" onClick={pauseAll} disabled={busy}>Pausar todas</button>}</div>
    <div className="cards survey-admin-cards">{surveys.map(item => <article className={item.archived_at ? "survey-archived" : ""} key={item.id}><div><label className={item.status === "active" || item.status === "pilot" ? "status" : "rascunho"}>{statusLabels[item.status]}</label>{item.is_test && <label className="test-badge">TESTE</label>}</div><small className="survey-kind">{typeLabels[item.survey_type]}</small><h3>{item.title}</h3><p>{item.description || "Pesquisa sem descrição."}</p><div className="survey-target"><b>Território</b><span>{[...(item.target_cities || []), ...(item.target_regions || []), ...(item.target_neighborhoods || [])].join(" · ") || "Definido na liberação"}</span></div>{item.survey_type === "directional" && <div className="video-status"><i>▶</i><span><b>Vídeo permitido</b><small>{videoUrl ? "Link configurado" : "Somente após a conclusão"}</small></span></div>}<footer>{item.survey_type === "directional" && canEdit && <button onClick={configurarVideo}>▶ Vídeo</button>}<button onClick={() => openAssignments(item)} disabled={Boolean(item.archived_at)}>Liberar</button>{canEdit && item.status !== "closed" && <button className={item.status === "draft" ? "activate-survey" : "pause-survey"} onClick={() => togglePause(item)} disabled={busy}>{item.status === "draft" ? "Ativar" : "Pausar"}</button>}{canEdit && <button onClick={() => openEdit(item)}>Editar</button>}{canEdit && item.is_test && <button className="clear-test" onClick={() => clearTest(item)}>Limpar testes</button>}{canEdit && <button className="delete-survey" onClick={() => removeSurvey(item)}>Apagar</button>}</footer></article>)}</div>
    {!surveys.length && <div className="painel resultado-vazio"><i>◎</i><h3>Nenhuma pesquisa cadastrada</h3><p>Crie a primeira pesquisa para iniciar os testes.</p></div>}

    {editorOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Editor de pesquisa"><div className="survey-editor"><header><div><small>EDITOR ADMINISTRATIVO</small><h2>{draft.id ? "Editar pesquisa" : "Criar pesquisa"}</h2></div><button onClick={() => setEditorOpen(false)} aria-label="Fechar editor">×</button></header>{draft.slug === "betim-territorio-escolhas-2026" && <div className="editor-warning"><b>Roteiro eleitoral protegido para o teste de amanhã</b><span>Você pode editar informações e acrescentar perguntas. As sete etapas já preparadas continuarão funcionando.</span></div>}<div className="editor-grid"><label>Nome da pesquisa<input value={draft.title || ""} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label><label>Tipo<select value={draft.survey_type || "quantitative"} onChange={e => setDraft({ ...draft, survey_type: e.target.value as Survey["survey_type"] })}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Situação<select value={draft.status || "draft"} onChange={e => setDraft({ ...draft, status: e.target.value as Survey["status"] })}><option value="draft">Rascunho</option><option value="pilot">Teste</option><option value="active">Em campo</option><option value="closed">Arquivada</option></select></label><label>Duração estimada<input type="number" min="1" max="180" value={draft.estimated_minutes || 10} onChange={e => setDraft({ ...draft, estimated_minutes: Number(e.target.value) })} /></label><label className="wide">Descrição<textarea value={draft.description || ""} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label>Cidades<input value={(draft.target_cities || []).join(", ")} onChange={e => setDraft({ ...draft, target_cities: splitList(e.target.value) })} placeholder="Betim, Contagem" /></label><label>Regiões<input value={(draft.target_regions || []).join(", ")} onChange={e => setDraft({ ...draft, target_regions: splitList(e.target.value) })} placeholder="Norte, Centro" /></label><label className="wide">Bairros<input value={(draft.target_neighborhoods || []).join(", ")} onChange={e => setDraft({ ...draft, target_neighborhoods: splitList(e.target.value) })} placeholder="Digite separados por vírgula" /></label><label className="wide">Texto de consentimento<textarea value={draft.consent_text || ""} onChange={e => setDraft({ ...draft, consent_text: e.target.value })} /></label><label className="test-toggle"><input type="checkbox" checked={Boolean(draft.is_test)} onChange={e => setDraft({ ...draft, is_test: e.target.checked })} /><span><b>Pesquisa em modo de teste</b><small>Permite limpar somente as respostas de teste antes do uso oficial.</small></span></label></div><div className="question-editor-head"><div><small>PERGUNTAS</small><h3>{questions.length} pergunta(s)</h3></div><button onClick={() => setQuestions([...questions, newQuestion()])}>＋ Adicionar pergunta</button></div><div className="question-editor-list">{questions.map((question, index) => <article key={question.code}><div className="question-number">{index + 1}</div><div className="question-fields"><label>Pergunta<input value={question.prompt} onChange={e => changeQuestion(index, { prompt: e.target.value })} placeholder="Escreva de forma simples e neutra" /></label><div><label>Tipo<select value={question.type} onChange={e => changeQuestion(index, { type: e.target.value as SurveyQuestion["type"] })}>{Object.entries(questionTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Seção<input value={question.section} onChange={e => changeQuestion(index, { section: e.target.value })} /></label></div>{(["single", "multiple", "rating", "region"] as SurveyQuestion["type"][]).includes(question.type) && <label>Alternativas<input value={(question.options || []).join(", ")} onChange={e => changeQuestion(index, { options: splitList(e.target.value) })} placeholder="Separe por vírgula" /></label>}<div className="condition-row"><label><input type="checkbox" checked={question.required} onChange={e => changeQuestion(index, { required: e.target.checked })} /> Obrigatória</label><label>Mostrar se a pergunta<input value={question.condition?.field || ""} onChange={e => changeQuestion(index, { condition: e.target.value ? { field: e.target.value, equals: question.condition?.equals || "" } : null })} placeholder="código anterior" /></label><label>for igual a<input value={question.condition?.equals || ""} onChange={e => changeQuestion(index, { condition: question.condition?.field ? { field: question.condition.field, equals: e.target.value } : null })} placeholder="resposta" /></label></div></div><div className="question-actions"><button onClick={() => moveQuestion(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveQuestion(index, 1)} disabled={index === questions.length - 1}>↓</button><button className="danger" onClick={() => setQuestions(questions.filter((_, i) => i !== index))}>×</button></div></article>)}</div><footer><button onClick={() => setEditorOpen(false)}>Cancelar</button><button className="primary" onClick={saveSurvey} disabled={busy}>{busy ? "Salvando…" : "Salvar pesquisa"}</button></footer></div></div>}

    {assignmentSurvey && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Liberar pesquisa"><div className="assignment-editor"><header><div><small>LIBERAÇÃO SEGURA</small><h2>{assignmentSurvey.title}</h2></div><button onClick={() => setAssignmentSurvey(null)}>×</button></header><p>Marque quem poderá aplicar esta pesquisa. Os demais pesquisadores não verão o questionário.</p><div className="assignment-territory"><label>Equipe<input value={territory.team} onChange={e => setTerritory({ ...territory, team: e.target.value })} placeholder="Ex.: Equipe Norte" /></label><label>Cidade<input value={territory.city} onChange={e => setTerritory({ ...territory, city: e.target.value })} /></label><label>Região<input value={territory.region} onChange={e => setTerritory({ ...territory, region: e.target.value })} /></label><label>Bairro<input value={territory.neighborhood} onChange={e => setTerritory({ ...territory, neighborhood: e.target.value })} /></label></div><div className="researcher-checks">{profiles.filter(p => p.role === "pesquisador" && p.active).map(person => <label key={person.id}><input type="checkbox" checked={selectedResearchers.includes(person.id)} onChange={e => setSelectedResearchers(e.target.checked ? [...selectedResearchers, person.id] : selectedResearchers.filter(id => id !== person.id))} /><span><b>{person.name}</b><small>{person.email}</small></span></label>)}{!profiles.some(p => p.role === "pesquisador" && p.active) && <p>Nenhum pesquisador ativo. Aprove os acessos antes de liberar a pesquisa.</p>}</div><footer><button onClick={() => setAssignmentSurvey(null)}>Cancelar</button><button className="primary" onClick={saveAssignments} disabled={busy}>{busy ? "Salvando…" : "Confirmar liberação"}</button></footer></div></div>}
  </>;
}

function Equipe({ aviso, profiles, currentProfile, onToggle, onDelete, onInvite }: { aviso: (t: string) => void; profiles: Profile[]; currentProfile: Profile; onToggle: (id: string, active: boolean) => void; onDelete: (id: string) => void; onInvite: (email: string, role: "admin" | "coordenador" | "observador" | "pesquisador") => Promise<string> }) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "coordenador" | "observador" | "pesquisador">("observador");
  const [generatedLink, setGeneratedLink] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const researcherLink = typeof window === "undefined" ? "" : `${window.location.origin}/?acesso=pesquisador`;
  const copy = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value);
    aviso(message);
  };
  const generate = async () => {
    if (!inviteEmail.includes("@")) return aviso("Informe o e-mail do seu parceiro");
    setInviteBusy(true);
    try {
      const link = await onInvite(inviteEmail.trim().toLowerCase(), inviteRole);
      setGeneratedLink(link);
      await navigator.clipboard.writeText(link);
      aviso("Convite seguro criado e copiado");
    } catch (error) {
      aviso(error instanceof Error ? traduzErro(error.message) : "Não foi possível gerar o convite");
    }
    setInviteBusy(false);
  };
  const roleLabel = (role: Profile["role"]) => ({ admin: "Administrador", coordenador: "Coordenador", pesquisador: "Pesquisador", observador: "Observador" })[role];
  const canManage = (target: Profile) => {
    if (target.id === currentProfile.id || target.is_primary_admin) return false;
    if (currentProfile.role === "admin") return true;
    return currentProfile.role === "coordenador" && (target.role === "pesquisador" || target.role === "observador");
  };
  const confirmDelete = (target: Profile) => {
    if (!window.confirm(`Apagar o acesso de ${target.name}?\n\nA pessoa será removida da equipe e não poderá entrar no aplicativo. As entrevistas já realizadas serão preservadas para auditoria.`)) return;
    onDelete(target.id);
  };
  return <>
    <Cabecalho titulo="Equipe e acessos" sub={`${profiles.length} cadastro(s) · ${profiles.filter(x => x.active).length} ativo(s)`} botao="＋ Gerar convite" acao={() => setShowInvite(!showInvite)} />
    <div className="access-grid">
      <div className="painel access-box"><small>LINK DO PESQUISADOR</small><h3>Cadastro e trabalho de campo</h3><p>Este endereço nunca abre o painel administrativo. Todo novo cadastro aguarda sua aprovação.</p><div className="link-row"><input readOnly value={researcherLink} aria-label="Link oficial do pesquisador" /><button onClick={() => copy(researcherLink, "Link do pesquisador copiado")}>Copiar link</button></div></div>
      <div className="painel access-box secure"><small>ADMINISTRAÇÃO</small><h3>Convite individual obrigatório</h3><p>Não compartilhe sua senha. Cada parceiro recebe um link de uso único, vinculado ao e-mail e válido por 72 horas.</p><button onClick={() => setShowInvite(true)}>Criar convite para parceiro</button></div>
    </div>
    {showInvite && <div className="painel invite-panel"><div><small>NOVO CONVITE SEGURO</small><h3>Autorizar parceiro</h3><p>Observador é a opção recomendada para acompanhar a coleta sem acessar dados individuais. Coordenador administra a coleta; administrador possui controle total.</p></div><label>E-mail autorizado<input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="parceiro@exemplo.com" /></label><label>Permissão<select value={inviteRole} onChange={e => setInviteRole(e.target.value as "admin" | "coordenador" | "observador")}><option value="observador">Observador — recomendado</option><option value="coordenador">Coordenador — gerencia a coleta</option><option value="admin">Administrador — controle total</option></select></label><button className="primary" disabled={inviteBusy || !inviteEmail} onClick={generate}>{inviteBusy ? "Gerando…" : "Gerar e copiar convite"}</button>{generatedLink && <div className="generated-link"><b>Convite pronto</b><span>Envie somente para {inviteEmail}. O link já está copiado.</span><div className="link-row"><input readOnly value={generatedLink} aria-label="Convite administrativo gerado" /><button onClick={() => copy(generatedLink, "Convite copiado novamente")}>Copiar</button></div></div>}</div>}
    <div className="painel tabela"><div className="tr cab"><span>Usuário</span><span>Função</span><span>Status</span><span>Ações</span></div>{profiles.map(p => <div className="tr" key={p.id}><span className="pessoa"><i>{p.name.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase()}</i><span><b>{p.name}</b><small>{p.email}</small></span></span><span>{roleLabel(p.role)}{p.is_primary_admin && <small className="primary-admin-label">Conta principal</small>}</span><b className={p.active ? "ok" : "pendente"}>● {p.active ? "Ativo" : "Suspenso"}</b><span className="access-actions">{canManage(p) ? <><button className={p.active ? "suspender" : "aprovar"} onClick={() => onToggle(p.id, !p.active)}>{p.active ? "Suspender" : "Reativar"}</button><button className="apagar-acesso" onClick={() => confirmDelete(p)}>Apagar acesso</button></> : <small className="protected-access">{p.is_primary_admin ? "Protegida" : "Seu acesso"}</small>}</span></div>)}{!profiles.length && <div className="vazio-tabela">Nenhum cadastro encontrado.</div>}</div>
  </>;
}

function Resultados({ aviso, interviews, surveys, fieldEvents }: { aviso: (t: string) => void; interviews: SavedInterview[]; surveys: Survey[]; fieldEvents: FieldEvent[] }) {
  const [referenceTime] = useState(() => Date.now());
  const [surveyFilter, setSurveyFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("30");
  const [territoryFilter, setTerritoryFilter] = useState("");
  const [dataMode, setDataMode] = useState("todos");
  const inPeriod = (date: string) => periodFilter === "todos" || new Date(date).getTime() >= referenceTime - Number(periodFilter) * 86400000;
  const term = territoryFilter.trim().toLowerCase();
  const filtered = interviews.filter(item => (surveyFilter === "todos" || item.survey_id === surveyFilter) && inPeriod(item.completed_at || item.created_at) && (dataMode === "todos" || (dataMode === "teste" ? item.is_test : !item.is_test)) && (!term || `${item.responses.cidade || "Betim"} ${item.responses.regiao || ""} ${item.responses.bairro || ""}`.toLowerCase().includes(term)));
  const filteredEvents = fieldEvents.filter(item => (surveyFilter === "todos" || item.survey_id === surveyFilter) && inPeriod(item.occurred_at) && (dataMode === "todos" || (dataMode === "teste" ? item.is_test : !item.is_test)) && (!term || `${item.city || ""} ${item.region || ""} ${item.neighborhood || ""}`.toLowerCase().includes(term)));
  const exportar = () => {
    if (!filtered.length) return aviso("Não há entrevistas nos filtros escolhidos");
    const keys = Array.from(new Set(filtered.flatMap(x => Object.keys(x.responses))));
    const headers = ["codigo", "data", "pesquisa_id", "pesquisador_id", "duracao_segundos", "alertas_qualidade", "modo_teste", "nome_autorizado", "whatsapp_autorizado", "email_autorizado", "finalidade_contato", ...keys];
    const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(cell).join(","), ...filtered.map(x => [x.code, x.completed_at, x.survey_id, x.researcher_id, x.duration_seconds, (x.quality_flags || []).join("|"), x.is_test ? "sim" : "não", x.contact_consent ? x.respondent_name : "", x.contact_consent ? x.contact_whatsapp : "", x.contact_consent ? x.contact_email : "", x.contact_consent ? x.contact_choice : "", ...keys.map(k => x.responses[k] ?? "")].map(cell).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `nortep-resultados-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    aviso("Arquivo CSV exportado");
  };
  const prioridades = Object.entries(filtered.reduce<Record<string, number>>((acc, x) => { const p = x.responses.prioridadeCidade; if (p) acc[p] = (acc[p] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const alerts = filtered.filter(x => (x.quality_flags || []).length);
  const outcomes = { refused: filteredEvents.filter(x => x.outcome === "refused").length, ineligible: filteredEvents.filter(x => x.outcome === "ineligible").length, interrupted: filteredEvents.filter(x => x.outcome === "interrupted").length, no_answer: filteredEvents.filter(x => x.outcome === "no_answer").length };
  return <><Cabecalho titulo="Resultados" sub={`${filtered.length} entrevista(s) nos filtros selecionados`} botao="⇩ Exportar CSV" acao={exportar} /><div className="filtros result-filters"><select value={surveyFilter} onChange={e => setSurveyFilter(e.target.value)}><option value="todos">Todas as pesquisas</option>{surveys.map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select><select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="todos">Todo o período</option></select><select value={dataMode} onChange={e => setDataMode(e.target.value)}><option value="todos">Testes e oficiais</option><option value="teste">Somente testes</option><option value="oficial">Somente oficiais</option></select><input value={territoryFilter} onChange={e => setTerritoryFilter(e.target.value)} placeholder="Cidade, região ou bairro" /></div>{!filtered.length && !filteredEvents.length ? <div className="painel resultado-vazio"><i>◎</i><h3>Nenhum dado encontrado</h3><p>Ajuste os filtros ou aguarde a próxima sincronização.</p></div> : <><div className="result-summary"><article><small>ENTREVISTAS</small><b>{filtered.length}</b></article><article><small>ABORDAGENS SEM ENTREVISTA</small><b>{filteredEvents.length}</b></article><article className={alerts.length ? "alert" : ""}><small>ALERTAS DE QUALIDADE</small><b>{alerts.length}</b></article><article><small>TAXA DE CONCLUSÃO</small><b>{filtered.length + filteredEvents.length ? Math.round(filtered.length / (filtered.length + filteredEvents.length) * 100) : 0}%</b></article></div><div className="duas resultados"><div className="painel"><Topo sup="PRIORIDADE DA CIDADE" titulo="O que deveria melhorar primeiro?" />{prioridades.length ? prioridades.map(([nome, valor]) => <div className="barra" key={nome}><span>{nome}</span><em><i style={{ width: `${valor / Math.max(filtered.length, 1) * 100}%` }} /></em><b>{Math.round(valor / Math.max(filtered.length, 1) * 100)}%</b></div>) : <div className="ranking-empty">Esta pergunta não existe nas pesquisas filtradas.</div>}</div><div className="painel outcome-panel"><Topo sup="RESULTADO DAS ABORDAGENS" titulo="Ocorrências de campo" /><div><span>Recusas</span><b>{outcomes.refused}</b></div><div><span>Fora do público</span><b>{outcomes.ineligible}</b></div><div><span>Interrompidas</span><b>{outcomes.interrupted}</b></div><div><span>Ninguém atendeu</span><b>{outcomes.no_answer}</b></div></div></div><div className="duas resultados"><div className="painel recentes"><Topo sup="ÚLTIMAS RESPOSTAS" titulo="Entrevistas sincronizadas" />{filtered.slice(0, 8).map(x => <div key={x.id}><span><b>{x.code} {x.is_test && <mark>TESTE</mark>}</b><small>{x.responses.bairro || "Bairro não informado"}</small></span><time>{new Date(x.completed_at).toLocaleDateString("pt-BR")}</time></div>)}</div><div className="painel quality-panel"><Topo sup="AUDITORIA AUTOMÁTICA" titulo="Entrevistas para conferir" />{alerts.length ? alerts.slice(0, 8).map(item => <div key={item.id}><span><b>{item.code}</b><small>{(item.quality_flags || []).map(flag => flag === "muito_rapida" ? "Entrevista muito rápida" : "Possível resposta repetida").join(" · ")}</small></span><strong>{item.duration_seconds ? `${Math.round(item.duration_seconds / 60)} min` : "—"}</strong></div>) : <div className="ranking-empty">Nenhum alerta automático nos filtros atuais.</div>}</div></div></>}</>;
}

function Ecossistema() {
  const produtos = [
    ["NorteP Pesquisa", "Ativo", "Pesquisa de campo, coleta e resultados."],
    ["NorteP Comunicação", "Em breve", "Comunicação política e relacionamento."],
    ["NorteP Gestão", "Em breve", "Operação de campanha e mandato."],
    ["NorteP Auditoria", "Em breve", "Controle, conferência e acompanhamento."],
    ["NorteP Financeiro", "Futuro", "Gestão financeira em ambiente separado."],
  ];
  return <><Cabecalho titulo="Ecossistema NorteP" sub="Política, povo e pesquisa em uma operação integrada." botao="Dados que aproximam" acao={() => undefined} /><div className="ecos-grid">{produtos.map((p, i) => <article className={i === 0 ? "eco ativo" : "eco"} key={p[0]}><i>{i === 0 ? "NP" : "◇"}</i><label>{p[1]}</label><h3>{p[0]}</h3><p>{p[2]}</p>{i === 0 ? <button>Produto atual</button> : <button disabled>Planejado</button>}</article>)}</div></>;
}

function Portal({ iniciar, profile, surveys, interviews, pending, sincronizar, registrar }: { iniciar: (survey: Survey) => void; profile: Profile; surveys: Survey[]; interviews: SavedInterview[]; pending: number; sincronizar: () => void; registrar: (outcome: FieldEvent["outcome"], reason?: string, survey?: Survey | null) => void }) {
  const hoje = interviews.filter(x => new Date(x.completed_at || x.created_at).toDateString() === new Date().toDateString()).length;
  const [eventOpen, setEventOpen] = useState(false);
  const [eventSurveyId, setEventSurveyId] = useState(surveys[0]?.id || "");
  const [outcome, setOutcome] = useState<FieldEvent["outcome"]>("no_answer");
  const [reason, setReason] = useState("");
  const typeName = (type: Survey["survey_type"]) => ({ quantitative: "Quantitativa", qualitative: "Qualitativa", directional: "Direcional", electoral: "Eleitoral", data_collection: "Coleta de dados" })[type];
  const sendEvent = () => { const selected = surveys.find(s => s.id === eventSurveyId); if (!selected) return; registrar(outcome, reason, selected); setEventOpen(false); setReason(""); };
  return <div className="portal"><div className="portal-boas"><span><small>OLÁ, {profile.name.split(" ")[0].toUpperCase()}</small><h2>Pronto para continuar o trabalho de campo?</h2><p>Você vê somente as pesquisas liberadas pela coordenação.</p></span><div className="campo-metricas"><i><b>{hoje}</b><small>hoje</small></i><i><b>{interviews.length}</b><small>no total</small></i><i><b>{pending}</b><small>pendentes</small></i></div></div>{pending > 0 && <button className="sync-pending" onClick={sincronizar}>↻ Sincronizar {pending} item(ns) pendente(s)</button>}<div className="portal-surveys">{surveys.map(item => <article className="pesquisa-atribuida" key={item.id}><div className="pesquisa-capa"><span>{item.is_test ? "MODO TESTE" : "EM CAMPO"}</span><i><b>N</b>P</i></div><div className="pesquisa-info"><small>PESQUISA LIBERADA · {typeName(item.survey_type).toUpperCase()}</small><h3>{item.title}</h3><p>Duração estimada de {item.estimated_minutes} minutos · {[...(item.target_cities || []), ...(item.target_regions || []), ...(item.target_neighborhoods || [])].join(" · ") || "território definido pela coordenação"}</p><div className="instrucoes"><span>✓ Leia exatamente como está escrito</span><span>✓ Não sugira respostas</span><span>✓ Consentimento antes da coleta</span></div><button className="primary" onClick={() => void iniciar(item)}>＋ Iniciar nova entrevista</button></div></article>)}</div>{!surveys.length && <div className="painel resultado-vazio"><i>◎</i><h3>Nenhuma pesquisa liberada</h3><p>Fale com a coordenação para receber uma pesquisa.</p></div>}{surveys.length > 0 && <div className="painel field-event-call"><span><b>A abordagem não virou entrevista?</b><small>Registre recusa, pessoa fora do público, interrupção ou local sem resposta. Isso permite calcular a taxa real da coleta.</small></span><button onClick={() => { setEventSurveyId(surveys[0]?.id || ""); setEventOpen(true); }}>Registrar ocorrência</button></div>}<div className="painel ajuda-campo"><span><b>Dúvida durante a entrevista?</b><small>Não improvise a pergunta. Anote a ocorrência e fale com a coordenação.</small></span><button>Falar com a equipe</button></div>{eventOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Registrar ocorrência de campo"><div className="field-event-modal"><header><div><small>OCORRÊNCIA DE CAMPO</small><h2>O que aconteceu?</h2></div><button onClick={() => setEventOpen(false)}>×</button></header><label>Pesquisa<select value={eventSurveyId} onChange={e => setEventSurveyId(e.target.value)}>{surveys.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label>Resultado da abordagem<select value={outcome} onChange={e => setOutcome(e.target.value as FieldEvent["outcome"])}><option value="no_answer">Ninguém atendeu</option><option value="refused">Pessoa não quis participar</option><option value="ineligible">Pessoa fora do público da pesquisa</option><option value="interrupted">Entrevista interrompida</option></select></label><label>Observação opcional<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Não registre opinião política nem dados pessoais" /></label><footer><button onClick={() => setEventOpen(false)}>Cancelar</button><button className="primary" onClick={sendEvent}>Salvar ocorrência</button></footer></div></div>}</div>;
}

function Cabecalho({ titulo, sub, botao, acao }: { titulo: string; sub: string; botao: string; acao: () => void }) { return <div className="cabecalho"><div><h2>{titulo}</h2><p>{sub}</p></div><button className="primary" onClick={acao}>{botao}</button></div>; }
function RespostaTexto({ value, salvar, longa = false, placeholder = "" }: { value: string; salvar: (value: string) => void; longa?: boolean; placeholder?: string }) {
  const [rascunho, setRascunho] = useState(value);
  const valorAtual = useRef(value);
  useEffect(() => {
    if (value !== valorAtual.current) setRascunho(value);
  }, [value]);
  useEffect(() => {
    valorAtual.current = rascunho;
    const timer = window.setTimeout(() => salvar(rascunho), 220);
    return () => window.clearTimeout(timer);
  }, [rascunho, salvar]);
  return longa
    ? <textarea value={rascunho} onChange={event => setRascunho(event.target.value)} placeholder={placeholder} />
    : <input value={rascunho} onChange={event => setRascunho(event.target.value)} placeholder={placeholder} />;
}
function EntrevistaDinamica({ survey, questions, passo, setPasso, r, setR, fim, cancelar }: { survey: Survey; questions: SurveyQuestion[]; passo: number; setPasso: (n: number) => void; r: Record<string, string>; setR: RespostasSetter; fim: () => void; cancelar: (outcome: FieldEvent["outcome"], reason: string) => void }) {
  const set = (key: string, value: string) => setR(previous => previous[key] === value ? previous : ({ ...previous, [key]: value }));
  const visible = questions.filter(q => !q.condition?.field || r[q.condition.field] === q.condition.equals);
  const sections = Array.from(new Set(visible.map(q => q.section || "Perguntas")));
  const currentSection = sections[Math.min(passo - 1, Math.max(sections.length - 1, 0))];
  const currentQuestions = visible.filter(q => (q.section || "Perguntas") === currentSection);
  const valid = currentQuestions.filter(q => q.required).every(q => Boolean(r[q.code]));
  const consentRefused = questions.some(q => q.code === "consentirPesquisa" && /não/i.test(r[q.code] || ""));
  const ineligible = questions.some(q => ["idadeMinima", "moraMinas"].includes(q.code) && /^não/i.test(r[q.code] || ""));
  const choose = (question: SurveyQuestion, values: string[]) => <div className="opcoes">{values.map(value => <button type="button" aria-pressed={r[question.code] === value} className={r[question.code] === value ? "selecionado" : ""} onPointerDown={event => event.preventDefault()} onClick={() => set(question.code, r[question.code] === value ? "" : value)} key={value}>{value}</button>)}</div>;
  const multiple = (question: SurveyQuestion) => { const selected = (r[question.code] || "").split("||").filter(Boolean); const max = /até (três|3)/i.test(`${question.prompt} ${question.help_text || ""}`) ? 3 : Number.POSITIVE_INFINITY; return <div className="opcoes multipla">{question.options.map(value => <button type="button" aria-pressed={selected.includes(value)} className={selected.includes(value) ? "selecionado" : ""} onClick={() => set(question.code, (selected.includes(value) ? selected.filter(x => x !== value) : selected.length < max ? [...selected, value] : selected).join("||"))} key={value}><i>{selected.includes(value) ? "✓" : "+"}</i>{value}</button>)}</div>; };
  const renderQuestion = (question: SurveyQuestion) => <div className={question.type === "internal_note" ? "dynamic-question internal" : "dynamic-question"} key={question.code}><label>{question.prompt} {question.required && <b>*</b>}</label>{question.help_text && <p>{question.help_text}</p>}{question.type === "short_text" && <RespostaTexto value={r[question.code] || ""} salvar={value => set(question.code, value)} />}{(question.type === "long_text" || question.type === "internal_note") && <RespostaTexto longa value={r[question.code] || ""} salvar={value => set(question.code, value)} placeholder={question.type === "internal_note" ? "Somente para a equipe; não leia ao entrevistado" : "Registre com as palavras da pessoa"} />}{question.type === "yes_no" && choose(question, ["Sim", "Não"])}{question.type === "single" && choose(question, question.options)}{question.type === "multiple" && multiple(question)}{question.type === "scale" && <div className="escala">{Array.from({ length: 11 }, (_, index) => String(index)).map(value => <button type="button" aria-pressed={r[question.code] === value} className={r[question.code] === value ? "selecionado" : ""} onClick={() => set(question.code, r[question.code] === value ? "" : value)} key={value}>{value}</button>)}</div>}{question.type === "rating" && choose(question, question.options.length ? question.options : ["Péssimo", "Ruim", "Regular", "Bom", "Ótimo"])}{question.type === "region" && (question.options.length ? choose(question, question.options) : <RespostaTexto value={r[question.code] || ""} salvar={value => set(question.code, value)} placeholder="Informe o bairro ou a região" />)}</div>;

  if (!questions.length) return <div className="entrevista"><div className="questao resultado-vazio"><i>◎</i><h3>Questionário ainda sem perguntas</h3><p>Peça à administração para concluir o editor antes de iniciar a coleta.</p><button onClick={() => cancelar("interrupted", "Pesquisa sem perguntas disponíveis")}>Voltar às pesquisas</button></div></div>;
  return <div className="entrevista dynamic-interview"><div className="entrevista-topo"><div><small>{survey.survey_type.toUpperCase()} · {survey.is_test ? "MODO TESTE" : "COLETA OFICIAL"}</small><h2>{survey.title}</h2></div><label>✓ Rascunho salvo no aparelho</label></div><div className="passos">{sections.map((section, index) => <div className={index + 1 <= passo ? "feito" : ""} key={section}><i>{index + 1 < passo ? "✓" : index + 1}</i><span>{section}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE {sections.length} · COLETA EM CAMPO</small><h3>{currentSection}</h3>{passo === 1 && survey.consent_text && <div className="leitura"><b>LEIA AO ENTREVISTADO</b><p>{survey.consent_text}</p></div>}{currentQuestions.map(renderQuestion)}{(consentRefused || ineligible) && <div className="encerrar"><b>{consentRefused ? "Respeite a decisão da pessoa." : "A pessoa está fora do público desta pesquisa."}</b><span>Agradeça pela atenção e encerre sem guardar respostas da pesquisa.</span><button onClick={() => cancelar(consentRefused ? "refused" : "ineligible", consentRefused ? "Consentimento recusado" : "Pessoa fora do público da pesquisa")}>{consentRefused ? "Registrar recusa" : "Registrar fora do público"} e encerrar</button></div>}<footer><button onClick={() => passo > 1 ? setPasso(passo - 1) : cancelar("interrupted", "Entrevista encerrada pelo pesquisador")}>{passo > 1 ? "← Voltar" : "Encerrar"}</button>{passo < sections.length ? <button className="primary" disabled={!valid || consentRefused || ineligible} onClick={() => setPasso(passo + 1)}>Continuar →</button> : <button className="primary" disabled={!valid || consentRefused || ineligible} onClick={fim}>✓ Finalizar entrevista</button>}</footer>{!valid && !consentRefused && !ineligible && <div className="faltam">Preencha os campos marcados com * para continuar.</div>}</div></div>;
}

function Entrevista({ passo, setPasso, r, setR, fim, cancelar, extraQuestions }: { passo: number; setPasso: (n: number) => void; r: Record<string, string>; setR: RespostasSetter; fim: () => void; cancelar: () => void; extraQuestions: SurveyQuestion[] }) {
  const set = (k: string, v: string) => setR(previous => ({ ...previous, [k]: v }));
  const [geoStatus, setGeoStatus] = useState("");
  const Opcoes = ({ itens, campo, compacta = false }: { itens: string[]; campo: string; compacta?: boolean }) => <div className={compacta ? "opcoes compactas" : "opcoes"}>{itens.map(x => <button type="button" aria-pressed={r[campo] === x} className={r[campo] === x ? "selecionado" : ""} onPointerDown={event => event.preventDefault()} onClick={() => set(campo, r[campo] === x ? "" : x)} key={x}>{x}</button>)}</div>;
  const Multiplas = ({ itens, campo, max = 3 }: { itens: string[]; campo: string; max?: number }) => {
    const atuais = (r[campo] || "").split("||").filter(Boolean);
    const alternar = (item: string) => {
      const novas = atuais.includes(item) ? atuais.filter(x => x !== item) : atuais.length < max ? [...atuais, item] : atuais;
      set(campo, novas.join("||"));
    };
    return <div className="opcoes multipla">{itens.map(x => <button type="button" aria-pressed={atuais.includes(x)} className={atuais.includes(x) ? "selecionado" : ""} onClick={() => alternar(x)} key={x}><i>{atuais.includes(x) ? "✓" : "+"}</i>{x}</button>)}</div>;
  };
  const capturarLocalizacao = () => {
    if (!navigator.geolocation) return setGeoStatus("Localização indisponível neste aparelho.");
    setGeoStatus("Aguardando autorização do aparelho…");
    navigator.geolocation.getCurrentPosition(pos => {
      setR(previous => ({ ...previous, latitude: pos.coords.latitude.toFixed(3), longitude: pos.coords.longitude.toFixed(3), geoHorario: new Date().toISOString() }));
      setGeoStatus("Ponto aproximado registrado com sucesso.");
    }, () => setGeoStatus("Não foi possível registrar. Continue pelo bairro informado."), { enableHighAccuracy: false, timeout: 10000 });
  };
  const recebeContato = r.interesse && r.interesse !== "Não desejo receber contato";
  useEffect(() => {
    if (r.autorizaGeo === "Sim, autoriza" && !r.latitude && !geoStatus) capturarLocalizacao();
  }, [r.autorizaGeo, r.latitude, geoStatus]);
  const inelegivel = r.consentirPesquisa === "Não aceito participar" || r.idadeMinima === "Não";
  const visibleExtras = extraQuestions.filter(q => !q.condition?.field || r[q.condition.field] === q.condition.equals);
  const textoValido = (valor?: string, minimo = 2) => Boolean(valor && valor.trim().length >= minimo);
  const extrasValid = visibleExtras.filter(q => q.required).every(q => Boolean(r[q.code]));
  const totalPassos = visibleExtras.length ? 8 : 7;
  const obrigatorios: Record<number, boolean> = {
    1: r.consentirPesquisa === "Sim, aceito participar" && r.idadeMinima === "Sim" && Boolean(r.eleitorBetim),
    2: textoValido(r.localEntrevistaCidade, 3) && textoValido(r.localEntrevistaBairro, 2) && textoValido(r.cidade, 3) && textoValido(r.bairro, 2) && Boolean(r.tempoMoradia && r.prioridadesBairro),
    3: Boolean(r.direcaoCidade && r.avaliacaoPrefeitura && r.prioridadeCidade),
    4: Boolean(r.reconhecimentoVinicius && r.reconhecimentoOlavo),
    5: ["votoFederal", "votoEstadual", "votoSenador1", "votoSenador2", "votoGovernador", "votoPresidente"].every(k => textoValido(r[k], 2)),
    6: Boolean(r.idade && r.genero && r.escolaridade && r.renda),
    7: Boolean(r.interesse) && (!recebeContato || Boolean(r.canal && r.consentimentoContato === "sim" && (r.whatsapp || r.email))),
    8: extrasValid,
  };
  const campoVoto = (campo: string, pergunta: string) => {
    const respostasRapidas = ["Branco/nulo", "Prefere não declarar"];
    return <div className="campo-voto" key={campo}><label>{pergunta} *</label><div className="campo-voto-linha"><input value={r[campo] || ""} onChange={e => set(campo, e.target.value)} placeholder="Resposta espontânea" autoComplete="off" /><div className="campo-voto-atalhos">{respostasRapidas.map(opcao => <button type="button" aria-pressed={r[campo] === opcao} className={r[campo] === opcao ? "selecionado" : ""} onClick={() => set(campo, r[campo] === opcao ? "" : opcao)} key={opcao}>{opcao}</button>)}</div></div></div>;
  };
  const nomes = Number((r.codigo || "ENT-2026-000799").slice(-1)) % 2 === 0 ? ["Dr. Vinícius", "Olavo Keesen"] : ["Olavo Keesen", "Dr. Vinícius"];
  const blocoNome = (nome: string) => {
    const vinicius = nome === "Dr. Vinícius";
    const chave = vinicius ? "Vinicius" : "Olavo";
    const reconhece = r[`reconhecimento${chave}`] && r[`reconhecimento${chave}`] !== "Nunca ouviu falar";
    const atendido = r.atendimentoVinicius?.startsWith("Sim");
    return <section className="bloco-nome" key={nome}><span className="nome-publico">NOME PÚBLICO · ORDEM ALTERNADA</span><h4>{nome}</h4><label>Antes desta entrevista, você já tinha ouvido falar em {nome}? *</label><Opcoes campo={`reconhecimento${chave}`} itens={["Nunca ouviu falar", "Conhece só de nome", "Conhece um pouco o trabalho", "Conhece bem o trabalho"]} />{reconhece && <><label>De modo geral, qual é a sua opinião sobre {nome}?</label><Opcoes campo={`opiniao${chave}`} itens={["Muito positiva", "Positiva", "Nem positiva nem negativa", "Negativa", "Muito negativa", "Não sabe avaliar"]} /></>}{vinicius && reconhece && <><label>Você já foi atendido pessoalmente pelo Dr. Vinícius?</label><p className="instrucao">Não pergunte diagnóstico, doença ou tratamento.</p><Opcoes campo="atendimentoVinicius" itens={["Sim, em UBS/posto público de Betim", "Sim, em outro atendimento", "Não", "Não se lembra / prefere não informar"]} />{atendido && <><label>Como você avalia somente aquele atendimento?</label><Opcoes campo="avaliacaoAtendimentoVinicius" itens={["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não se lembra"]} /></>}</>}</section>;
  };
  const renderExtra = (question: SurveyQuestion) => <div className={question.type === "internal_note" ? "dynamic-question internal" : "dynamic-question"} key={question.code}><label>{question.prompt} {question.required && "*"}</label>{question.help_text && <p className="instrucao">{question.help_text}</p>}{question.type === "short_text" && <input value={r[question.code] || ""} onChange={e => set(question.code, e.target.value)} />}{(question.type === "long_text" || question.type === "internal_note") && <textarea value={r[question.code] || ""} onChange={e => set(question.code, e.target.value)} />}{question.type === "yes_no" && <Opcoes campo={question.code} itens={["Sim", "Não"]} />}{question.type === "single" && <Opcoes campo={question.code} itens={question.options} />}{question.type === "multiple" && <Multiplas campo={question.code} itens={question.options} max={Math.max(question.options.length, 1)} />}{question.type === "scale" && <div className="escala">{Array.from({ length: 11 }, (_, index) => String(index)).map(value => <button type="button" className={r[question.code] === value ? "selecionado" : ""} onClick={() => set(question.code, value)} key={value}>{value}</button>)}</div>}{question.type === "rating" && <Opcoes campo={question.code} itens={question.options.length ? question.options : ["Péssimo", "Ruim", "Regular", "Bom", "Ótimo"]} />}{question.type === "region" && (question.options.length ? <Opcoes campo={question.code} itens={question.options} /> : <input value={r[question.code] || ""} onChange={e => set(question.code, e.target.value)} placeholder="Bairro ou região" />)}</div>;
  return <div className="entrevista"><div className="entrevista-topo"><div><small>BETIM · TERRITÓRIO E ESCOLHAS 2026</small><h2>Entrevista <span>ENT-2026-000799</span></h2></div><label>✓ Respostas salvas neste dispositivo</label></div><div className="passos">{["Consentimento", "Território", "Gestão", "Lideranças", "6 escolhas", "Perfil", "Contato", ...(visibleExtras.length ? ["Adicionais"] : [])].map((x, i) => <div className={i + 1 <= passo ? "feito" : ""} key={x}><i>{i + 1 < passo ? "✓" : i + 1}</i><span>{x}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE {totalPassos} · COLETA EM CAMPO</small>
    {passo === 1 && <><h3>Convite e autorização</h3><div className="leitura"><b>LEIA AO ENTREVISTADO</b><p>“Olá. Eu faço parte da equipe NorteP Pesquisa. Estamos ouvindo moradores de Betim sobre o bairro, os serviços públicos e as eleições. A conversa dura cerca de 10 minutos. Participar é uma escolha sua: você pode deixar de responder qualquer pergunta ou encerrar quando quiser. Como falaremos de opiniões políticas, trataremos suas respostas com cuidado e sempre de forma agrupada. Você não precisa informar nome nem contato.”</p></div><label>Você tem 16 anos ou mais? *</label><Opcoes campo="idadeMinima" itens={["Sim", "Não"]} /><label>Você mora em Betim e pode votar no município? *</label><Opcoes campo="eleitorBetim" itens={["Sim", "Não", "Não sabe informar"]} /><label>Você aceita participar desta pesquisa? *</label><Opcoes campo="consentirPesquisa" itens={["Sim, aceito participar", "Não aceito participar"]} />{inelegivel && <div className="encerrar"><b>Não prossiga com o questionário.</b><span>Agradeça pela atenção e encerre sem registrar respostas.</span><button onClick={cancelar}>Encerrar sem registrar</button></div>}</>}
    {passo === 2 && <><h3>Relação com o território</h3><p className="instrucao">Registre separadamente onde a pessoa mora e onde a entrevista está sendo realizada.</p><div className="local-coleta"><label>Cidade onde esta entrevista está acontecendo *<input value={r.localEntrevistaCidade || ""} onChange={e => set("localEntrevistaCidade", e.target.value)} placeholder="Betim, Contagem, Belo Horizonte…" /></label><label>Bairro onde esta entrevista está acontecendo *<input value={r.localEntrevistaBairro || ""} onChange={e => set("localEntrevistaBairro", e.target.value)} placeholder="Bairro do ponto da coleta" /></label></div><label>Em qual cidade você mora e reside? *</label><input value={r.cidade || ""} onChange={e => set("cidade", e.target.value)} placeholder="Cidade informada pelo entrevistado" /><label>Em qual bairro você mora e reside? *</label><input value={r.bairro || ""} onChange={e => set("bairro", e.target.value)} placeholder="Bairro informado pelo entrevistado" /><label>Há quanto tempo mora nessa cidade? *</label><Opcoes campo="tempoMoradia" itens={["Menos de 1 ano", "1 a 5 anos", "6 a 10 anos", "11 a 20 anos", "Mais de 20 anos", "Desde que nasceu", "Prefere não responder"]} /><label>Na sua opinião, qual é hoje o principal problema do seu bairro?</label><textarea value={r.problemaBairro || ""} onChange={e => set("problemaBairro", e.target.value)} placeholder="Registre sem resumir ou interpretar" /><label>Quais três áreas deveriam receber mais atenção no seu bairro? * <small>Selecione até 3</small></label><Multiplas campo="prioridadesBairro" itens={["Saúde", "Educação", "Segurança", "Transporte e trânsito", "Limpeza urbana", "Iluminação", "Asfalto e vias", "Moradia", "Emprego e renda", "Lazer e cultura", "Assistência social", "Outra", "Prefere não responder"]} /><label>Autoriza registrar o ponto aproximado do celular onde esta entrevista aconteceu?</label><Opcoes campo="autorizaGeo" itens={["Sim, autoriza", "Não autoriza"]} />{r.autorizaGeo === "Sim, autoriza" && <div className="geo"><span>{geoStatus || "A localização aproximada será solicitada automaticamente pelo aparelho."}</span>{r.latitude && <b>Ponto aproximado registrado</b>}</div>}</>}
    {passo === 3 && <><h3>Cidade, prefeitura e prioridades</h3><label>Pensando em Betim hoje, você diria que a cidade está indo na direção certa, na direção errada ou em nenhuma das duas? *</label><Opcoes campo="direcaoCidade" itens={["Direção certa", "Direção errada", "Nem certa nem errada", "Não sabe"]} /><label>Como você avalia o trabalho da Prefeitura de Betim? *</label><Opcoes campo="avaliacaoPrefeitura" itens={["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não sabe avaliar"]} /><label>Na sua opinião, qual serviço municipal mais precisa melhorar?</label><Opcoes campo="servicoMelhorar" itens={["Saúde", "Educação", "Transporte", "Segurança e prevenção", "Limpeza urbana", "Obras e vias", "Assistência social", "Outro", "Não sabe"]} /><label>Se a prefeitura pudesse priorizar apenas uma área agora, qual deveria vir primeiro? *</label><Opcoes campo="prioridadeCidade" itens={["Saúde", "Educação", "Segurança", "Emprego e renda", "Transporte", "Obras e infraestrutura", "Habitação", "Assistência social", "Meio ambiente", "Outra"]} />{r.prioridadeCidade === "Saúde" ? <><label>Por que a saúde deveria vir primeiro?</label><textarea value={r.motivoSaude || ""} onChange={e => set("motivoSaude", e.target.value)} placeholder="Registre a resposta com as palavras da pessoa" /></> : r.prioridadeCidade && <><label>E, para você, qual deveria ser o nível de prioridade da saúde?</label><Opcoes campo="nivelSaude" itens={["Muito alta", "Alta", "Média", "Baixa", "Não sabe"]} /><label>Por que você pensa assim?</label><textarea value={r.motivoNivelSaude || ""} onChange={e => set("motivoNivelSaude", e.target.value)} placeholder="Registre com as palavras da pessoa" /></>}<label>O que você mais gostaria que mudasse em Betim nos próximos quatro anos?</label><textarea value={r.esperaCidade || ""} onChange={e => set("esperaCidade", e.target.value)} placeholder="Resposta espontânea" /></>}
    {passo === 4 && <><h3>Conhecimento de lideranças públicas</h3><p className="instrucao"><b>Primeiro, lembrança espontânea.</b> Não leia nomes na pergunta abaixo.</p><label>Quando pensa em pessoas da política ligadas a Betim, qual nome vem primeiro à sua cabeça?</label><input value={r.politicoEspontaneo || ""} onChange={e => set("politicoEspontaneo", e.target.value)} placeholder="Nome citado ou “nenhum”" /><label>O que você pensa dessa pessoa?</label><textarea value={r.opiniaoEspontanea || ""} onChange={e => set("opiniaoEspontanea", e.target.value)} placeholder="Registre sem concordar ou discordar" /><label>Você conhece algum nome de Betim que pretende disputar deputado federal em 2026? Qual?</label><input value={r.conheceFederalBetim || ""} onChange={e => set("conheceFederalBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><label>E para deputado estadual?</label><input value={r.conheceEstadualBetim || ""} onChange={e => set("conheceEstadualBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><div className="separador"><span>AGORA LEIA CADA NOME</span></div>{nomes.map(blocoNome)}</>}
    {passo === 5 && <><h3>Intenção de voto</h3><p className="instrucao">Registre somente o que a pessoa disser. Não apresente nomes nem sugira respostas. Escreva o nome citado ou use uma das respostas rápidas ao lado.</p>{campoVoto("votoFederal", "1. Se a eleição para deputado federal fosse hoje, em quem você votaria?")}{campoVoto("votoEstadual", "2. E para deputado estadual, em quem você votaria?")}{campoVoto("votoSenador1", "3. Para senador, qual seria sua primeira escolha?")}{campoVoto("votoSenador2", "4. E qual seria sua segunda escolha para senador?")}{campoVoto("votoGovernador", "5. Para governador de Minas Gerais, em quem você votaria?")}{campoVoto("votoPresidente", "6. Para presidente da República, em quem você votaria?")}<label>Hoje, sua decisão de voto está?</label><Opcoes campo="certezaVoto" itens={["Totalmente decidida", "Pode mudar", "Ainda não decidiu", "Prefere não responder"]} /></>}
    {passo === 6 && <><h3>Para conhecer melhor quem participou</h3><p className="instrucao">Explique que estas respostas ajudam a analisar o conjunto dos participantes e não serão usadas para identificar a pessoa.</p><label>Em qual faixa de idade você está? *</label><Opcoes campo="idade" itens={["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"]} /><label>Como você se identifica em relação ao gênero? *</label><Opcoes campo="genero" itens={["Feminino", "Masculino", "Outra identidade", "Prefere não informar"]} /><label>Qual é a sua escolaridade? *</label><Opcoes campo="escolaridade" itens={["Até fundamental", "Ensino médio", "Superior incompleto", "Superior completo ou mais", "Prefere não informar"]} /><label>Em qual faixa está a renda mensal da sua família? *</label><Opcoes campo="renda" itens={["Até 2 salários mínimos", "Mais de 2 a 5", "Mais de 5 a 10", "Mais de 10", "Não sabe", "Prefere não informar"]} /><label>Como você declara sua raça ou cor, seguindo as opções do IBGE?</label><Opcoes campo="racaCor" itens={["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"]} /></>}
    {passo === 7 && <div className="contato-opcional"><h3>Identificação e contato opcional</h3><div className="privacidade"><i>◉</i><span><b>A pesquisa já está respondida</b><small>Nome e contato ficam em cadastro separado e só aparecem se a pessoa quiser receber a finalidade escolhida.</small></span></div><label>Deseja se identificar?</label><Opcoes campo="identificacao" itens={["Permanecer anônimo", "Quero me identificar"]} />{r.identificacao === "Quero me identificar" && <><label>Nome do entrevistado (opcional)</label><input value={r.nome || ""} onChange={e => set("nome", e.target.value)} placeholder="Como gostaria de ser chamado?" /></>}<label>Deseja receber algo da NorteP? *</label><Opcoes campo="interesse" itens={["Não desejo receber contato", "Resultado desta pesquisa", "Conteúdos e atualizações", "Resultado e conteúdos"]} />{recebeContato && <div className="dados-contato"><label>Como prefere receber?</label><Opcoes campo="canal" itens={["WhatsApp", "E-mail", "WhatsApp e e-mail"]} />{r.canal?.includes("WhatsApp") && <><label>WhatsApp</label><input value={r.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></>}{r.canal?.toLowerCase().includes("mail") && <><label>E-mail</label><input value={r.email || ""} onChange={e => set("email", e.target.value)} placeholder="nome@exemplo.com" /></>}<button type="button" className={r.consentimentoContato === "sim" ? "consentimento marcado" : "consentimento"} onClick={() => set("consentimentoContato", r.consentimentoContato === "sim" ? "" : "sim")}>{r.consentimentoContato === "sim" ? "✓" : "□"} Autorizo o contato exclusivamente para a finalidade escolhida.</button></div>}<label>Observação interna do pesquisador</label><textarea value={r.observacaoInterna || ""} onChange={e => set("observacaoInterna", e.target.value)} placeholder="Não registre opinião política do pesquisador nem informação médica." /></div>}
    {passo === 8 && <><h3>Perguntas adicionais</h3><p className="instrucao">Estas perguntas foram acrescentadas pela administração para esta coleta.</p>{visibleExtras.map(renderExtra)}</>}
    {passo === totalPassos && <div className="dynamic-question internal"><label>Manifestação espontânea do entrevistado (opcional)</label><p>Registre apenas algo que a pessoa disse por iniciativa própria. Não leia este campo como pergunta.</p><textarea value={r.manifestacaoEspontanea || ""} onChange={e => set("manifestacaoEspontanea", e.target.value)} placeholder="Palavras espontâneas da pessoa, sem indução" /></div>}<footer><button disabled={passo === 1} onClick={() => setPasso(passo - 1)}>← Voltar</button>{passo < totalPassos ? <button className="primary" disabled={!obrigatorios[passo] || inelegivel} onClick={() => setPasso(passo + 1)}>Continuar →</button> : <button className="primary" disabled={!obrigatorios[totalPassos]} onClick={fim}>✓ Finalizar entrevista</button>}</footer>{!obrigatorios[passo] && !inelegivel && <div className="faltam">Preencha os campos marcados com * para continuar.</div>}
  </div></div>;
}

function getYoutubeId(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] ?? "";
}

function Obrigado({ nome, videoUrl, codigo, sincronizado, concluir }: { nome?: string; videoUrl: string; codigo: string; sincronizado: boolean; concluir: () => void }) {
  const videoId = getYoutubeId(videoUrl);
  return <div className="obrigado"><div className="check-final">✓</div><small>ENTREVISTA CONCLUÍDA</small><h2>Obrigado{nome ? `, ${nome}` : ""} por participar.</h2><p>Sua opinião ajuda a compreender as prioridades do bairro e a aproximar pessoas das decisões.</p>{videoId && <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoId}`} title="Vídeo de agradecimento" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div>}<div className="codigo-final"><small>CÓDIGO DA ENTREVISTA</small><b>{codigo || "ENT-PENDENTE"}</b><span className={sincronizado ? "salvo-central" : "salvo-local"}>{sincronizado ? "✓ Resposta salva com segurança" : "⌁ Salva neste aparelho · sincronização pendente"}</span></div><button className="primary" onClick={concluir}>Concluir e voltar às pesquisas</button></div>;
}
