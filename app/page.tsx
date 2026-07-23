"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { configured, createAccessInvite, loadInterviews, loadObserverSummary, loadProfile, loadProfiles, loadSurveys, ObserverSummary, Profile, readSession, readSessionFromUrl, redeemAccessInvite, refreshSession, removeProfileAccess, requestPasswordReset, saveInterview, saveSession, SavedInterview, Session, setProfileActive, signIn, signUp, Survey, updatePassword } from "./supabase";

type View = "inicio" | "pesquisas" | "equipe" | "rankings" | "resultados" | "ecossistema" | "portal" | "entrevista" | "obrigado";
type AccessChannel = "publico" | "pesquisador" | "administracao";
type PendingInterview = { id: string; survey: Survey; responses: Record<string, string>; deviceId: string };

function readAccessChannel(): AccessChannel {
  if (typeof window === "undefined") return "publico";
  const value = new URLSearchParams(window.location.search).get("acesso");
  return value === "pesquisador" || value === "administracao" ? value : "publico";
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
  const [team, setTeam] = useState<Profile[]>([]);
  const [interviews, setInterviews] = useState<SavedInterview[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [savedCode, setSavedCode] = useState("");
  const [savedSynced, setSavedSynced] = useState(true);
  const [accessChannel, setAccessChannel] = useState<AccessChannel>("publico");
  const [inviteCode, setInviteCode] = useState("");
  const [observerSummary, setObserverSummary] = useState<ObserverSummary | null>(null);
  const [passwordRecoverySession, setPasswordRecoverySession] = useState<Session | null>(null);

  useEffect(() => {
    const channel = readAccessChannel();
    const invitation = new URLSearchParams(window.location.search).get("convite") || "";
    setAccessChannel(channel);
    setInviteCode(invitation);
    const rascunho = localStorage.getItem("nortep-rascunho");
    const video = localStorage.getItem("nortep-video-agradecimento");
    if (rascunho) setRespostas(JSON.parse(rascunho));
    if (video) setVideoUrl(video);
    const pendentes: PendingInterview[] = JSON.parse(localStorage.getItem("nortep-pendentes") || "[]");
    setPendingCount(pendentes.length);
    const updateOnline = () => setOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    const boot = async () => {
      const callback = await readSessionFromUrl();
      if (callback?.type === "recovery") {
        setPasswordRecoverySession(callback.session);
        setAuthReady(true);
        return;
      }
      const stored = callback?.session ?? readSession();
      if (!stored) return setAuthReady(true);
      try { await autenticar(stored, channel); } catch { saveSession(null); }
      setAuthReady(true);
    };
    boot();
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); };
  }, []);
  useEffect(() => localStorage.setItem("nortep-rascunho", JSON.stringify(respostas)), [respostas]);
  useEffect(() => localStorage.setItem("nortep-video-agradecimento", videoUrl), [videoUrl]);

  async function carregarAdmin(s: Session, p: Profile) {
    if (!(["admin", "coordenador"] as string[]).includes(p.role)) return;
    setTeam(await loadProfiles(s));
  }

  async function autenticar(incoming: Session, channel: AccessChannel = accessChannel) {
    const current = await refreshSession(incoming);
    const p = await loadProfile(current);
    if (!p) throw new Error("Perfil não encontrado.");
    if (channel === "administracao" && p.role === "pesquisador") {
      saveSession(null);
      throw new Error("Este acesso é exclusivo para administração e coordenação autorizadas.");
    }
    setSession(current);
    setProfile(p);
    if (p.role === "observador") {
      setObserverSummary(await loadObserverSummary(current));
      setView("inicio");
      return;
    }
    const surveys = await loadSurveys(current);
    setSurvey(surveys[0] ?? null);
    if (p.active) setInterviews(await loadInterviews(current));
    await carregarAdmin(current, p);
    setView(p.role === "pesquisador" ? "portal" : "inicio");
  }

  const aviso = (texto: string) => {
    setToast(texto);
    setTimeout(() => setToast(""), 2600);
  };
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
  const gerarConvite = async (email: string, role: "admin" | "coordenador" | "observador") => {
    if (!session) throw new Error("Entre novamente para gerar o convite.");
    const code = await createAccessInvite(session, email, role);
    return `${window.location.origin}/?acesso=administracao&convite=${encodeURIComponent(code)}`;
  };
  const fila = () => JSON.parse(localStorage.getItem("nortep-pendentes") || "[]") as PendingInterview[];
  const guardarFila = (items: PendingInterview[]) => {
    localStorage.setItem("nortep-pendentes", JSON.stringify(items));
    setPendingCount(items.length);
  };
  const finalizarEntrevista = async () => {
    if (!session || !survey) return aviso("Pesquisa ainda não foi liberada para este acesso");
    let deviceId = localStorage.getItem("nortep-dispositivo");
    if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem("nortep-dispositivo", deviceId); }
    const item: PendingInterview = { id: crypto.randomUUID(), survey, responses: { ...respostas }, deviceId };
    try {
      if (!navigator.onLine) throw new Error("offline");
      const saved = await saveInterview(session, survey, item.responses, deviceId);
      setSavedCode(saved.code);
      setSavedSynced(true);
      if (profile && profile.role !== "pesquisador") setInterviews(await loadInterviews(session));
    } catch {
      guardarFila([...fila(), item]);
      setSavedCode(`ENT-OFFLINE-${String(Date.now()).slice(-6)}`);
      setSavedSynced(false);
    }
    ir("obrigado");
  };
  const sincronizarPendentes = async () => {
    if (!session || !navigator.onLine) return aviso("Conecte o aparelho à internet para sincronizar");
    const restantes: PendingInterview[] = [];
    let enviadas = 0;
    for (const item of fila()) {
      try { await saveInterview(session, item.survey, item.responses, item.deviceId); enviadas++; }
      catch { restantes.push(item); }
    }
    guardarFila(restantes);
    aviso(enviadas ? `${enviadas} entrevista(s) sincronizada(s)` : "Nenhuma entrevista pendente");
    if (profile && profile.role !== "pesquisador") setInterviews(await loadInterviews(session));
  };
  const sair = () => { saveSession(null); setSession(null); setProfile(null); setSurvey(null); setObserverSummary(null); setView("inicio"); };

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
    resultados: "Resultados",
    ecossistema: "Ecossistema NorteP",
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
        ["resultados", "◫", "Resultados"],
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
          {campo && <button className="sync" onClick={sincronizarPendentes}>● {offline ? "Modo offline" : pendingCount ? `${pendingCount} pendente(s)` : "Sincronizado"}</button>}
          {!campo && admin && <button className="preview-field" onClick={() => ir("portal")}>Ver área do pesquisador →</button>}
          {campo && <button className="sair-campo" onClick={() => admin ? ir("inicio") : sair()}>{admin ? "Sair da prévia" : "Sair"}</button>}
        </section>
      </header>

      <div className={campo ? "content campo-content" : "content"}>
        {view === "inicio" && <Inicio ir={ir} aviso={aviso} interviews={interviews} profiles={team} pending={pendingCount} />}
        {view === "pesquisas" && <Pesquisas ir={ir} aviso={aviso} videoUrl={videoUrl} setVideoUrl={setVideoUrl} />}
        {view === "equipe" && <Equipe aviso={aviso} profiles={team} currentProfile={profile} onToggle={atualizarEquipe} onDelete={removerAcessoEquipe} onInvite={gerarConvite} />}
        {view === "rankings" && <Rankings interviews={interviews} profiles={team} />}
        {view === "resultados" && <Resultados aviso={aviso} interviews={interviews} />}
        {view === "ecossistema" && <Ecossistema />}
        {view === "portal" && <Portal profile={profile} survey={survey} interviews={interviews} pending={pendingCount} sincronizar={sincronizarPendentes} iniciar={() => { setPasso(1); ir("entrevista"); }} />}
        {view === "entrevista" && <Entrevista passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={finalizarEntrevista} cancelar={() => {
          localStorage.removeItem("nortep-rascunho");
          setRespostas({});
          ir("portal");
          aviso("Entrevista encerrada sem registrar respostas");
        }} />}
        {view === "obrigado" && <Obrigado nome={respostas.nome} videoUrl="" codigo={savedCode} sincronizado={savedSynced} concluir={() => {
          localStorage.removeItem("nortep-rascunho");
          setRespostas({});
          ir("portal");
          aviso(savedSynced ? `Entrevista ${savedCode} sincronizada` : "Entrevista salva no aparelho para sincronização");
        }} />}
      </div>
    </main>
    {menu && <div className="scrim" onClick={() => setMenu(false)} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>;
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
  const invited = access === "administracao" && Boolean(inviteCode);
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
      <p>Dados de campo protegidos, organizados e prontos para aproximar pessoas das decisões.</p>
      <div><span>✓ Entrevistado sem login</span><span>✓ Pesquisador com acesso próprio</span><span>✓ Consentimento e auditoria</span></div>
    </section>
    <form className="auth-card" onSubmit={e => { e.preventDefault(); void enviar(); }}>
      <div className="auth-logo">NP</div>
      <small>{adminAccess ? "ADMINISTRAÇÃO RESTRITA" : "ÁREA DO PESQUISADOR"}</small>
      <h2>{modo === "recuperar" ? "Recuperar minha senha" : modo === "entrar" ? (adminAccess ? "Entrar na administração" : "Entrar para pesquisar") : (invited ? "Aceitar convite" : "Criar acesso de pesquisador")}</h2>
      <p>{modo === "recuperar" ? "Digite o e-mail usado no cadastro. Enviaremos um link seguro para você criar uma nova senha." : modo === "entrar" ? (adminAccess ? "Somente contas administrativas previamente autorizadas." : "Entre com seu cadastro. Se a conta estiver ativa, a pesquisa será aberta; caso contrário, você verá a situação da aprovação.") : (invited ? "Este convite é individual, temporário e vinculado ao e-mail informado pela coordenação." : "Crie sua conta. Depois da aprovação da coordenação, a pesquisa será liberada neste mesmo acesso.")}</p>
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
      <small className="auth-help">{adminAccess ? "Convites vencem em 72 horas e funcionam uma única vez." : "O entrevistado não precisa criar conta."}</small>
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

function Inicio({ ir, aviso, interviews, profiles, pending }: { ir: (v: View) => void; aviso: (t: string) => void; interviews: SavedInterview[]; profiles: Profile[]; pending: number }) {
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(hoje); d.setDate(d.getDate() - (6 - i)); return d; });
  const contagens = dias.map(d => interviews.filter(x => new Date(x.completed_at || x.created_at).toDateString() === d.toDateString()).length);
  const max = Math.max(...contagens, 1);
  const ativos = new Set(interviews.map(x => x.researcher_id)).size;
  const progresso = Math.min(interviews.length, 100);
  const pesquisaPiloto = { ...pesquisas[0], feitas: interviews.length, equipe: ativos };
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
    <div className="duas"><div className="painel"><Topo sup="RITMO DE COLETA" titulo="Entrevistas nos últimos 7 dias" /><div className="grafico">{contagens.map((valor, i) => <div key={dias[i].toISOString()}><b>{valor}</b><i style={{ height: `${Math.max(valor ? valor / max * 90 : 3, 3)}%` }} /><small>{i === 6 ? "HOJE" : dias[i].toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3).toUpperCase()}</small></div>)}</div></div><div className="painel"><Topo sup="SITUAÇÃO DA COLETA" titulo="Acompanhamento" /><div className="alerta"><i className={pending ? "a1" : "a0"}>{pending ? "!" : "✓"}</i><span><b>{pending ? `${pending} entrevista(s) aguardando internet` : "Todas as respostas sincronizadas"}</b><small>{pending ? "Abra a área do pesquisador e toque em sincronizar" : "Nenhuma pendência neste aparelho"}</small></span></div><div className="alerta"><i className="a2">i</i><span><b>{interviews.length ? "Coleta em andamento" : "Pronto para a primeira entrevista"}</b><small>Acompanhe aqui a evolução da pesquisa.</small></span></div></div></div>
    <div className="ranking-grid"><div className="painel"><Topo sup="EQUIPE DE CAMPO" titulo="Entrevistas concluídas por pesquisador" />{rankingPesquisadores.length ? rankingPesquisadores.map(([id, total], index) => <div className="ranking-row" key={id}><i>{index + 1}</i><span><b>{nomesPesquisadores[id] || "Pesquisador"}</b><small>Entrevistas sincronizadas</small></span><strong>{total}</strong></div>) : <div className="ranking-empty">O ranking aparecerá após a primeira entrevista.</div>}</div><div className="painel"><Topo sup="CIDADES E BAIRROS" titulo="Entrevistas concluídas por território" />{rankingTerritorios.length ? rankingTerritorios.map(([local, total], index) => <div className="ranking-row" key={local}><i>{index + 1}</i><span><b>{local}</b><small>Entrevistas sincronizadas</small></span><strong>{total}</strong></div>) : <div className="ranking-empty">Os territórios aparecerão após a primeira entrevista.</div>}</div></div>
    <div className="painel lista"><div className="topo"><div><small>PESQUISAS ATIVAS</small><h3>Acompanhamento por pesquisa</h3></div><button onClick={() => ir("pesquisas")}>Ver todas →</button></div><LinhaPesquisa p={pesquisaPiloto} ir={ir} /></div>
  </>;
}

function Rankings({ interviews, profiles }: { interviews: SavedInterview[]; profiles: Profile[] }) {
  const nomesPesquisadores = Object.fromEntries(profiles.map(p => [p.id, p.name]));
  const pesquisadores = Object.entries(interviews.reduce<Record<string, number>>((acc, item) => {
    acc[item.researcher_id] = (acc[item.researcher_id] || 0) + 1;
    return acc;
  }, {})).sort((a, b) => b[1] - a[1]);
  const territorios = Object.entries(interviews.reduce<Record<string, number>>((acc, item) => {
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

  return <>
    <div className="cabecalho ranking-cabecalho"><div><h2>Rankings da coleta</h2><p>Classificação atualizada pelas entrevistas concluídas e sincronizadas.</p></div><span>● Dados sincronizados</span></div>
    <div className="ranking-resumo">
      <article><small>LÍDER DE CAMPO</small><b>{liderPesquisador}</b><span>{pesquisadores[0]?.[1] || 0} entrevista(s)</span></article>
      <article><small>TERRITÓRIO COM MAIS COLETA</small><b>{liderTerritorio}</b><span>{territorios[0]?.[1] || 0} entrevista(s)</span></article>
      <article><small>TOTAL CONSIDERADO</small><b>{interviews.length}</b><span>entrevistas sincronizadas</span></article>
    </div>
    <div className="ranking-page-grid">
      <section className="painel ranking-lista"><Topo sup="DESEMPENHO DA EQUIPE" titulo="Ranking de pesquisadores" />{pesquisadores.length ? pesquisadores.map(([id, total], index) => <div className="ranking-detalhe" key={id}><i>{index + 1}</i><span><b>{nomesPesquisadores[id] || "Pesquisador sem acesso ativo"}</b><small>{total} entrevista(s) concluída(s)</small><em><u style={{ width: `${total / maiorPesquisador * 100}%` }} /></em></span><strong>{total}</strong></div>) : <div className="ranking-empty">O ranking aparecerá assim que a primeira entrevista for sincronizada.</div>}</section>
      <section className="painel ranking-lista"><Topo sup="CIDADES, REGIÕES E BAIRROS" titulo="Ranking de territórios" />{territorios.length ? territorios.map(([local, total], index) => <div className="ranking-detalhe" key={local}><i>{index + 1}</i><span><b>{local}</b><small>{total} entrevista(s) concluída(s)</small><em><u style={{ width: `${total / maiorTerritorio * 100}%` }} /></em></span><strong>{total}</strong></div>) : <div className="ranking-empty">Os territórios aparecerão assim que a primeira entrevista for sincronizada.</div>}</section>
    </div>
    <div className="ranking-nota"><i>i</i><span><b>Este ranking mostra volume de entrevistas.</b><small>A taxa de adesão será calculada futuramente quando o aplicativo também registrar abordagens, recusas e entrevistas interrompidas.</small></span></div>
  </>;
}

function Metrica({ c, i, t, v, s }: { c: string; i: string; t: string; v: string; s: string }) { return <div className="metrica"><i className={c}>{i}</i><span><small>{t}</small><b>{v}</b><em>{s}</em></span></div>; }
function Topo({ sup, titulo }: { sup: string; titulo: string }) { return <div className="topo"><div><small>{sup}</small><h3>{titulo}</h3></div><button>•••</button></div>; }
function LinhaPesquisa({ p, ir }: { p: typeof pesquisas[0]; ir: (v: View) => void }) { return <div className="linha-pesquisa"><i>▤</i><span><b>{p.nome}</b><small>● {p.status} · {p.equipe} pesquisadores</small></span><div><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><strong>{Math.round(p.feitas / p.meta * 100)}%</strong><button onClick={() => ir("resultados")}>Ver detalhes</button></div>; }

function Pesquisas({ ir, aviso, videoUrl, setVideoUrl }: { ir: (v: View) => void; aviso: (t: string) => void; videoUrl: string; setVideoUrl: (v: string) => void }) {
  const configurarVideo = () => {
    const valor = window.prompt("Cole o link do YouTube usado após uma pesquisa direcional. Não use vídeo em pesquisa qualitativa ou eleitoral. Deixe vazio para remover.", videoUrl);
    if (valor !== null) {
      setVideoUrl(valor.trim());
      aviso(valor.trim() ? "Vídeo de agradecimento configurado" : "Vídeo removido desta pesquisa");
    }
  };
  return <>
    <Cabecalho titulo="Pesquisas de campo" sub="Crie, edite e acompanhe todos os questionários." botao="＋ Criar pesquisa" acao={() => aviso("Novo questionário criado como rascunho")} />
    <Filtros busca="Buscar pesquisa..." />
    <div className="cards">{pesquisas.map((p, i) => <article key={p.nome}><div><label className={p.status === "Liberada" ? "status" : "rascunho"}>{p.status}</label><button>•••</button></div><small className="survey-kind">{p.tipo}</small><h3>{p.nome}</h3><p>{i === 0 ? "Diagnóstico territorial, serviços públicos, lideranças e intenção de voto nas seis escolhas de 2026." : i === 1 ? "Avaliação da saúde, educação, limpeza e transporte público." : "Mapeamento das principais demandas dos moradores."}</p>{p.videoPermitido && <div className="video-status"><i>▶</i><span><b>Vídeo de agradecimento permitido</b><small>{videoUrl ? "Link do YouTube configurado" : "Somente para pesquisa direcional"}</small></span></div>}<section><span><b>{p.feitas}</b> respostas</span><span><b>{p.equipe}</b> pesquisadores</span><span><b>{i === 0 ? 39 : i === 2 ? 18 : 24}</b> perguntas</span></section><div className="progresso"><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><footer>{p.videoPermitido && <button onClick={configurarVideo}>▶ Vídeo</button>}<button onClick={() => aviso("Editor de perguntas aberto")}>Editar</button><button onClick={() => i === 0 ? ir("portal") : i === 2 ? aviso("Pesquisa liberada para a equipe") : ir("resultados")}>{i === 0 ? "Aplicar" : i === 2 ? "Liberar" : "Acompanhar"}</button></footer></article>)}</div>
  </>;
}

function Equipe({ aviso, profiles, currentProfile, onToggle, onDelete, onInvite }: { aviso: (t: string) => void; profiles: Profile[]; currentProfile: Profile; onToggle: (id: string, active: boolean) => void; onDelete: (id: string) => void; onInvite: (email: string, role: "admin" | "coordenador" | "observador") => Promise<string> }) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "coordenador" | "observador">("observador");
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

function Resultados({ aviso, interviews }: { aviso: (t: string) => void; interviews: SavedInterview[] }) {
  const exportar = () => {
    if (!interviews.length) return aviso("Ainda não há entrevistas para exportar");
    const keys = Array.from(new Set(interviews.flatMap(x => Object.keys(x.responses))));
    const headers = ["codigo", "data", "pesquisador_id", ...keys];
    const cell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.map(cell).join(","), ...interviews.map(x => [x.code, x.completed_at, x.researcher_id, ...keys.map(k => x.responses[k] ?? "")].map(cell).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `nortep-resultados-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    aviso("Arquivo CSV exportado");
  };
  const prioridades = Object.entries(interviews.reduce<Record<string, number>>((acc, x) => { const p = x.responses.prioridadeCidade; if (p) acc[p] = (acc[p] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return <><Cabecalho titulo="Resultados" sub={`Betim: território e escolhas 2026 · ${interviews.length} entrevista(s)`} botao="⇩ Exportar CSV" acao={exportar} /><Filtros />{!interviews.length ? <div className="painel resultado-vazio"><i>◎</i><h3>Aguardando a primeira entrevista</h3><p>Quando uma resposta for sincronizada, os resultados aparecerão aqui.</p></div> : <div className="duas resultados"><div className="painel"><Topo sup="PRIORIDADE DA CIDADE" titulo="O que deveria melhorar primeiro?" />{prioridades.map(([nome, valor]) => <div className="barra" key={nome}><span>{nome}</span><em><i style={{ width: `${valor / interviews.length * 100}%` }} /></em><b>{Math.round(valor / interviews.length * 100)}%</b></div>)}</div><div className="painel recentes"><Topo sup="ÚLTIMAS RESPOSTAS" titulo="Entrevistas sincronizadas" />{interviews.slice(0, 6).map(x => <div key={x.id}><span><b>{x.code}</b><small>{x.responses.bairro || "Bairro não informado"}</small></span><time>{new Date(x.completed_at).toLocaleDateString("pt-BR")}</time></div>)}</div></div>}</>;
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

function Portal({ iniciar, profile, survey, interviews, pending, sincronizar }: { iniciar: () => void; profile: Profile; survey: Survey | null; interviews: SavedInterview[]; pending: number; sincronizar: () => void }) {
  const hoje = interviews.filter(x => new Date(x.completed_at || x.created_at).toDateString() === new Date().toDateString()).length;
  return <div className="portal"><div className="portal-boas"><span><small>OLÁ, {profile.name.split(" ")[0].toUpperCase()}</small><h2>Pronto para continuar o trabalho de campo?</h2><p>Você vê somente a pesquisa liberada pela coordenação.</p></span><div className="campo-metricas"><i><b>{hoje}</b><small>hoje</small></i><i><b>{interviews.length}</b><small>no total</small></i><i><b>{pending}</b><small>pendentes</small></i></div></div>{survey ? <article className="pesquisa-atribuida"><div className="pesquisa-capa"><span>EM CAMPO</span><i><b>N</b>P</i></div><div className="pesquisa-info"><small>PESQUISA LIBERADA · BETIM</small><h3>{survey.title.replace("Betim: ", "")}</h3><p>39 perguntas · duração estimada de {survey.estimated_minutes} minutos</p><div className="instrucoes"><span>✓ Leia exatamente como está escrito</span><span>✓ Não sugira respostas</span><span>✓ Consentimento antes da coleta</span></div>{pending > 0 && <button className="sync-pending" onClick={sincronizar}>↻ Sincronizar {pending} pendente(s)</button>}<button className="primary" onClick={iniciar}>＋ Iniciar nova entrevista</button></div></article> : <div className="painel resultado-vazio"><i>◎</i><h3>Nenhuma pesquisa liberada</h3><p>Fale com a coordenação para receber uma pesquisa.</p></div>}<div className="painel ajuda-campo"><span><b>Dúvida durante a entrevista?</b><small>Não improvise a pergunta. Anote a ocorrência e fale com a coordenação.</small></span><button>Falar com a equipe</button></div></div>;
}

function Cabecalho({ titulo, sub, botao, acao }: { titulo: string; sub: string; botao: string; acao: () => void }) { return <div className="cabecalho"><div><h2>{titulo}</h2><p>{sub}</p></div><button className="primary" onClick={acao}>{botao}</button></div>; }
function Filtros({ busca }: { busca?: string }) { return <div className="filtros">{busca && <input placeholder={"⌕  " + busca} />}<button>Todos os status⌄</button><button>Mais recentes⌄</button></div>; }

function Entrevista({ passo, setPasso, r, setR, fim, cancelar }: { passo: number; setPasso: (n: number) => void; r: Record<string, string>; setR: (v: Record<string, string>) => void; fim: () => void; cancelar: () => void }) {
  const set = (k: string, v: string) => setR({ ...r, [k]: v });
  const [geoStatus, setGeoStatus] = useState("");
  const Opcoes = ({ itens, campo, compacta = false }: { itens: string[]; campo: string; compacta?: boolean }) => <div className={compacta ? "opcoes compactas" : "opcoes"}>{itens.map(x => <button type="button" aria-pressed={r[campo] === x} className={r[campo] === x ? "selecionado" : ""} onClick={() => set(campo, x)} key={x}>{x}</button>)}</div>;
  const Multiplas = ({ itens, campo, max = 3 }: { itens: string[]; campo: string; max?: number }) => {
    const atuais = (r[campo] || "").split("||").filter(Boolean);
    const alternar = (item: string) => {
      const novas = atuais.includes(item) ? atuais.filter(x => x !== item) : atuais.length < max ? [...atuais, item] : atuais;
      set(campo, novas.join("||"));
    };
    return <div className="opcoes multipla">{itens.map(x => <button type="button" aria-pressed={atuais.includes(x)} className={atuais.includes(x) ? "selecionado" : ""} onClick={() => alternar(x)} key={x}><i>{atuais.includes(x) ? "✓" : "+"}</i>{x}</button>)}</div>;
  };
  const Intencao = ({ campo, titulo, ajuda }: { campo: string; titulo: string; ajuda?: string }) => <div className="intencao"><label>{titulo} *</label>{ajuda && <small>{ajuda}</small>}<input value={r[campo] || ""} onChange={e => set(campo, e.target.value)} placeholder="Registre a resposta espontânea" /><Opcoes campo={campo} compacta itens={["Não sabe", "Branco/nulo", "Não pretende votar"]} /></div>;
  const capturarLocalizacao = () => {
    if (!navigator.geolocation) return setGeoStatus("Localização indisponível neste aparelho.");
    setGeoStatus("Aguardando autorização do aparelho…");
    navigator.geolocation.getCurrentPosition(pos => {
      setR({ ...r, latitude: pos.coords.latitude.toFixed(3), longitude: pos.coords.longitude.toFixed(3), geoHorario: new Date().toISOString() });
      setGeoStatus("Ponto aproximado registrado com sucesso.");
    }, () => setGeoStatus("Não foi possível registrar. Continue pelo bairro informado."), { enableHighAccuracy: false, timeout: 10000 });
  };
  const recebeContato = r.interesse && r.interesse !== "Não desejo receber contato";
  const inelegivel = r.consentirPesquisa === "Não aceito participar" || r.eleitorBetim === "Não" || r.idadeMinima === "Não";
  const obrigatorios: Record<number, boolean> = {
    1: r.consentirPesquisa === "Sim, aceito participar" && r.idadeMinima === "Sim" && r.eleitorBetim === "Sim",
    2: Boolean(r.bairro && r.tempoMoradia && r.prioridadesBairro),
    3: Boolean(r.direcaoCidade && r.avaliacaoPrefeitura && r.prioridadeCidade),
    4: Boolean(r.reconhecimentoVinicius && r.reconhecimentoOlavo),
    5: ["votoFederal", "votoEstadual", "votoSenador1", "votoSenador2", "votoGovernador", "votoPresidente"].every(k => Boolean(r[k])),
    6: Boolean(r.idade && r.genero && r.escolaridade && r.renda),
    7: Boolean(r.interesse) && (!recebeContato || Boolean(r.canal && r.consentimentoContato === "sim" && (r.whatsapp || r.email))),
  };
  const nomes = Number((r.codigo || "ENT-2026-000799").slice(-1)) % 2 === 0 ? ["Dr. Vinícius", "Olavo Keesen"] : ["Olavo Keesen", "Dr. Vinícius"];
  const blocoNome = (nome: string) => {
    const vinicius = nome === "Dr. Vinícius";
    const chave = vinicius ? "Vinicius" : "Olavo";
    const reconhece = r[`reconhecimento${chave}`] && r[`reconhecimento${chave}`] !== "Nunca ouviu falar";
    const atendido = r.atendimentoVinicius?.startsWith("Sim");
    return <section className="bloco-nome" key={nome}><span className="nome-publico">NOME PÚBLICO · ORDEM ALTERNADA</span><h4>{nome}</h4><label>Antes desta entrevista, você já tinha ouvido falar em {nome}? *</label><Opcoes campo={`reconhecimento${chave}`} itens={["Nunca ouviu falar", "Conhece só de nome", "Conhece um pouco o trabalho", "Conhece bem o trabalho"]} />{reconhece && <><label>De modo geral, qual é a sua opinião sobre {nome}?</label><Opcoes campo={`opiniao${chave}`} itens={["Muito positiva", "Positiva", "Nem positiva nem negativa", "Negativa", "Muito negativa", "Não sabe avaliar"]} /></>}{vinicius && reconhece && <><label>Você já foi atendido pessoalmente pelo Dr. Vinícius?</label><p className="instrucao">Não pergunte diagnóstico, doença ou tratamento.</p><Opcoes campo="atendimentoVinicius" itens={["Sim, em UBS/posto público de Betim", "Sim, em outro atendimento", "Não", "Não se lembra / prefere não informar"]} />{atendido && <><label>Como você avalia somente aquele atendimento?</label><Opcoes campo="avaliacaoAtendimentoVinicius" itens={["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não se lembra"]} /></>}</>}</section>;
  };
  return <div className="entrevista"><div className="entrevista-topo"><div><small>BETIM · TERRITÓRIO E ESCOLHAS 2026</small><h2>Entrevista <span>ENT-2026-000799</span></h2></div><label>✓ Respostas salvas neste dispositivo</label></div><div className="passos">{["Consentimento", "Território", "Gestão", "Lideranças", "6 escolhas", "Perfil", "Contato"].map((x, i) => <div className={i + 1 <= passo ? "feito" : ""} key={x}><i>{i + 1 < passo ? "✓" : i + 1}</i><span>{x}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE 7 · COLETA EM CAMPO</small>
    {passo === 1 && <><h3>Convite e autorização</h3><div className="leitura"><b>LEIA AO ENTREVISTADO</b><p>“Olá. Eu faço parte da equipe NorteP Pesquisa. Estamos ouvindo moradores de Betim sobre o bairro, os serviços públicos e as eleições. A conversa dura cerca de 10 minutos. Participar é uma escolha sua: você pode deixar de responder qualquer pergunta ou encerrar quando quiser. Como falaremos de opiniões políticas, trataremos suas respostas com cuidado e sempre de forma agrupada. Você não precisa informar nome nem contato.”</p></div><label>Você tem 16 anos ou mais? *</label><Opcoes campo="idadeMinima" itens={["Sim", "Não"]} /><label>Você mora em Betim e pode votar no município? *</label><Opcoes campo="eleitorBetim" itens={["Sim", "Não", "Não sabe informar"]} /><label>Você aceita participar desta pesquisa? *</label><Opcoes campo="consentirPesquisa" itens={["Sim, aceito participar", "Não aceito participar"]} />{inelegivel && <div className="encerrar"><b>Não prossiga com o questionário.</b><span>Agradeça pela atenção e encerre sem registrar respostas.</span><button onClick={cancelar}>Encerrar sem registrar</button></div>}</>}
    {passo === 2 && <><h3>Relação com o território</h3><p className="instrucao">Comece pelo cotidiano. Ainda não mencione políticos ou eleições.</p><label>Bairro onde a pessoa mora *</label><input value={r.bairro || ""} onChange={e => set("bairro", e.target.value)} placeholder="Digite o bairro informado" /><label>Há quanto tempo mora em Betim? *</label><Opcoes campo="tempoMoradia" itens={["Menos de 1 ano", "1 a 5 anos", "6 a 10 anos", "11 a 20 anos", "Mais de 20 anos", "Desde que nasceu"]} /><label>Na sua opinião, qual é hoje o principal problema do seu bairro?</label><textarea value={r.problemaBairro || ""} onChange={e => set("problemaBairro", e.target.value)} placeholder="Registre sem resumir ou interpretar" /><label>Quais três áreas deveriam receber mais atenção no seu bairro? * <small>Selecione até 3</small></label><Multiplas campo="prioridadesBairro" itens={["Saúde", "Educação", "Segurança", "Transporte e trânsito", "Limpeza urbana", "Iluminação", "Asfalto e vias", "Moradia", "Emprego e renda", "Lazer e cultura", "Assistência social", "Outra"]} /><label>Autoriza registrar a localização aproximada do ponto desta entrevista?</label><Opcoes campo="autorizaGeo" itens={["Sim, autoriza", "Não autoriza"]} />{r.autorizaGeo === "Sim, autoriza" && <div className="geo"><button type="button" onClick={capturarLocalizacao}>◎ Registrar ponto aproximado</button><span>{geoStatus || "O aparelho solicitará permissão para registrar o ponto aproximado."}</span>{r.latitude && <b>{r.latitude}, {r.longitude}</b>}</div>}</>}
    {passo === 3 && <><h3>Cidade, prefeitura e prioridades</h3><label>Pensando em Betim hoje, você diria que a cidade está indo na direção certa, na direção errada ou em nenhuma das duas? *</label><Opcoes campo="direcaoCidade" itens={["Direção certa", "Direção errada", "Nem certa nem errada", "Não sabe"]} /><label>Como você avalia o trabalho da Prefeitura de Betim? *</label><Opcoes campo="avaliacaoPrefeitura" itens={["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não sabe avaliar"]} /><label>Na sua opinião, qual serviço municipal mais precisa melhorar?</label><Opcoes campo="servicoMelhorar" itens={["Saúde", "Educação", "Transporte", "Segurança e prevenção", "Limpeza urbana", "Obras e vias", "Assistência social", "Outro", "Não sabe"]} /><label>Se a prefeitura pudesse priorizar apenas uma área agora, qual deveria vir primeiro? *</label><Opcoes campo="prioridadeCidade" itens={["Saúde", "Educação", "Segurança", "Emprego e renda", "Transporte", "Obras e infraestrutura", "Habitação", "Assistência social", "Meio ambiente", "Outra"]} />{r.prioridadeCidade === "Saúde" ? <><label>Por que a saúde deveria vir primeiro?</label><textarea value={r.motivoSaude || ""} onChange={e => set("motivoSaude", e.target.value)} placeholder="Registre a resposta com as palavras da pessoa" /></> : r.prioridadeCidade && <><label>E, para você, qual deveria ser o nível de prioridade da saúde?</label><Opcoes campo="nivelSaude" itens={["Muito alta", "Alta", "Média", "Baixa", "Não sabe"]} /><label>Por que você pensa assim?</label><textarea value={r.motivoNivelSaude || ""} onChange={e => set("motivoNivelSaude", e.target.value)} placeholder="Registre com as palavras da pessoa" /></>}<label>O que você mais gostaria que mudasse em Betim nos próximos quatro anos?</label><textarea value={r.esperaCidade || ""} onChange={e => set("esperaCidade", e.target.value)} placeholder="Resposta espontânea" /></>}
    {passo === 4 && <><h3>Conhecimento de lideranças públicas</h3><p className="instrucao"><b>Primeiro, lembrança espontânea.</b> Não leia nomes na pergunta abaixo.</p><label>Quando pensa em pessoas da política ligadas a Betim, qual nome vem primeiro à sua cabeça?</label><input value={r.politicoEspontaneo || ""} onChange={e => set("politicoEspontaneo", e.target.value)} placeholder="Nome citado ou “nenhum”" /><label>O que você pensa dessa pessoa?</label><textarea value={r.opiniaoEspontanea || ""} onChange={e => set("opiniaoEspontanea", e.target.value)} placeholder="Registre sem concordar ou discordar" /><label>Você conhece algum nome de Betim que pretende disputar deputado federal em 2026? Qual?</label><input value={r.conheceFederalBetim || ""} onChange={e => set("conheceFederalBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><label>E para deputado estadual?</label><input value={r.conheceEstadualBetim || ""} onChange={e => set("conheceEstadualBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><div className="separador"><span>AGORA LEIA CADA NOME</span></div>{nomes.map(blocoNome)}</>}
    {passo === 5 && <><h3>Intenção de voto — seis escolhas</h3><div className="leitura discreta"><b>INSTRUÇÃO AO PESQUISADOR</b><p>Faça todas de forma espontânea e na ordem abaixo. Não apresente uma lista de nomes. Para senador, são duas escolhas diferentes.</p></div><Intencao campo="votoFederal" titulo="1. Se a eleição fosse hoje, em quem votaria para deputado federal?" /><Intencao campo="votoEstadual" titulo="2. E para deputado estadual?" /><Intencao campo="votoSenador1" titulo="3. Qual seria seu primeiro voto para senador?" /><Intencao campo="votoSenador2" titulo="4. E qual seria seu segundo voto para senador?" ajuda="Não repita automaticamente o primeiro nome." /><Intencao campo="votoGovernador" titulo="5. Em quem votaria para governador de Minas Gerais?" /><Intencao campo="votoPresidente" titulo="6. E para presidente da República?" /><label>Hoje, sua decisão de voto está:</label><Opcoes campo="certezaVoto" itens={["Totalmente decidida", "Pode mudar", "Ainda não decidiu", "Prefere não responder"]} /></>}
    {passo === 6 && <><h3>Para conhecer melhor quem participou</h3><p className="instrucao">Explique que estas respostas ajudam a analisar o conjunto dos participantes e não serão usadas para identificar a pessoa.</p><label>Em qual faixa de idade você está? *</label><Opcoes campo="idade" itens={["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"]} /><label>Como você se identifica em relação ao gênero? *</label><Opcoes campo="genero" itens={["Feminino", "Masculino", "Outra identidade", "Prefere não informar"]} /><label>Qual é a sua escolaridade? *</label><Opcoes campo="escolaridade" itens={["Até fundamental", "Ensino médio", "Superior incompleto", "Superior completo ou mais", "Prefere não informar"]} /><label>Em qual faixa está a renda mensal da sua família? *</label><Opcoes campo="renda" itens={["Até 2 salários mínimos", "Mais de 2 a 5", "Mais de 5 a 10", "Mais de 10", "Não sabe", "Prefere não informar"]} /><label>Como você declara sua raça ou cor, seguindo as opções do IBGE?</label><Opcoes campo="racaCor" itens={["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"]} /></>}
    {passo === 7 && <div className="contato-opcional"><h3>Identificação e contato opcional</h3><div className="privacidade"><i>◉</i><span><b>A pesquisa já está respondida</b><small>Nome e contato ficam em cadastro separado e só aparecem se a pessoa quiser receber a finalidade escolhida.</small></span></div><label>Deseja se identificar?</label><Opcoes campo="identificacao" itens={["Permanecer anônimo", "Quero me identificar"]} />{r.identificacao === "Quero me identificar" && <><label>Nome do entrevistado (opcional)</label><input value={r.nome || ""} onChange={e => set("nome", e.target.value)} placeholder="Como gostaria de ser chamado?" /></>}<label>Deseja receber algo da NorteP? *</label><Opcoes campo="interesse" itens={["Não desejo receber contato", "Resultado desta pesquisa", "Conteúdos e atualizações", "Resultado e conteúdos"]} />{recebeContato && <div className="dados-contato"><label>Como prefere receber?</label><Opcoes campo="canal" itens={["WhatsApp", "E-mail", "WhatsApp e e-mail"]} />{r.canal?.includes("WhatsApp") && <><label>WhatsApp</label><input value={r.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></>}{r.canal?.toLowerCase().includes("mail") && <><label>E-mail</label><input value={r.email || ""} onChange={e => set("email", e.target.value)} placeholder="nome@exemplo.com" /></>}<button type="button" className={r.consentimentoContato === "sim" ? "consentimento marcado" : "consentimento"} onClick={() => set("consentimentoContato", r.consentimentoContato === "sim" ? "" : "sim")}>{r.consentimentoContato === "sim" ? "✓" : "□"} Autorizo o contato exclusivamente para a finalidade escolhida.</button></div>}<label>Observação interna do pesquisador</label><textarea value={r.observacaoInterna || ""} onChange={e => set("observacaoInterna", e.target.value)} placeholder="Não registre opinião política do pesquisador nem informação médica." /></div>}
    <footer><button disabled={passo === 1} onClick={() => setPasso(passo - 1)}>← Voltar</button>{passo < 7 ? <button className="primary" disabled={!obrigatorios[passo] || inelegivel} onClick={() => setPasso(passo + 1)}>Continuar →</button> : <button className="primary" disabled={!obrigatorios[7]} onClick={fim}>✓ Finalizar entrevista</button>}</footer>{!obrigatorios[passo] && !inelegivel && <div className="faltam">Preencha os campos marcados com * para continuar.</div>}
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
