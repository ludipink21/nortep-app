"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { configured, loadInterviews, loadProfile, loadProfiles, loadSurveys, Profile, readSession, refreshSession, saveInterview, saveSession, SavedInterview, Session, setProfileActive, signIn, signUp, Survey } from "./supabase";

type View = "inicio" | "pesquisas" | "equipe" | "resultados" | "ecossistema" | "portal" | "entrevista" | "obrigado";
type PendingInterview = { id: string; survey: Survey; responses: Record<string, string>; deviceId: string };

const pesquisas = [
  { nome: "Betim: território e escolhas 2026", status: "Piloto interno", feitas: 0, meta: 100, equipe: 5 },
  { nome: "Avaliação dos serviços públicos", status: "Planejada", feitas: 0, meta: 500, equipe: 0 },
  { nome: "Prioridades da comunidade", status: "Rascunho", feitas: 0, meta: 400, equipe: 0 },
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

  useEffect(() => {
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
      const stored = readSession();
      if (!stored) return setAuthReady(true);
      try { await autenticar(stored); } catch { saveSession(null); }
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

  async function autenticar(incoming: Session) {
    const current = await refreshSession(incoming);
    const p = await loadProfile(current);
    if (!p) throw new Error("Perfil não encontrado.");
    setSession(current);
    setProfile(p);
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
    await setProfileActive(session, id, active);
    setTeam(await loadProfiles(session));
    aviso(active ? "Pesquisador aprovado e pesquisa liberada" : "Acesso do pesquisador suspenso");
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
  const sair = () => { saveSession(null); setSession(null); setProfile(null); setSurvey(null); setView("inicio"); };

  if (!authReady) return <TelaCarregando />;
  if (!configured()) return <TelaConfigErro />;
  if (!session || !profile) return <Login onAuthenticated={autenticar} />;
  if (!profile.active) return <AguardandoAprovacao profile={profile} sair={sair} />;

  const admin = profile.role === "admin" || profile.role === "coordenador";
  const campo = view === "portal" || view === "entrevista" || view === "obrigado";
  const titulos: Record<View, string> = {
    inicio: "Visão geral",
    pesquisas: "Pesquisas",
    equipe: "Pesquisadores",
    resultados: "Resultados",
    ecossistema: "Ecossistema NorteP",
    portal: "Minhas pesquisas",
    entrevista: "Nova entrevista",
    obrigado: "Entrevista concluída",
  };

  return <div className={campo ? "app app-campo" : "app"}>
    {!campo && <aside className={menu ? "open" : ""}>
      <div className="logo"><i>NP</i><span>NorteP <b>Pesquisa</b></span></div>
      <nav>{[
        ["inicio", "⌂", "Visão geral"],
        ["pesquisas", "▤", "Pesquisas"],
        ["equipe", "♙", "Pesquisadores"],
        ["resultados", "◫", "Resultados"],
        ["ecossistema", "◇", "Ecossistema NorteP"],
      ].map(item => <button className={view === item[0] ? "active" : ""} onClick={() => ir(item[0] as View)} key={item[0]}><i>{item[1]}</i>{item[2]}</button>)}</nav>
      <div className="coleta"><b>● Piloto conectado</b><small>{interviews.length} de 100 entrevistas</small><div><i style={{ width: `${Math.min(interviews.length, 100)}%` }} /></div></div>
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
        {view === "inicio" && <Inicio ir={ir} aviso={aviso} interviews={interviews} pending={pendingCount} />}
        {view === "pesquisas" && <Pesquisas ir={ir} aviso={aviso} videoUrl={videoUrl} setVideoUrl={setVideoUrl} />}
        {view === "equipe" && <Equipe aviso={aviso} profiles={team} onToggle={atualizarEquipe} />}
        {view === "resultados" && <Resultados aviso={aviso} interviews={interviews} />}
        {view === "ecossistema" && <Ecossistema />}
        {view === "portal" && <Portal profile={profile} survey={survey} interviews={interviews} pending={pendingCount} sincronizar={sincronizarPendentes} iniciar={() => { setPasso(1); ir("entrevista"); }} />}
        {view === "entrevista" && <Entrevista passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={finalizarEntrevista} cancelar={() => {
          localStorage.removeItem("nortep-rascunho");
          setRespostas({});
          ir("portal");
          aviso("Entrevista encerrada sem registrar respostas");
        }} />}
        {view === "obrigado" && <Obrigado nome={respostas.nome} videoUrl={videoUrl} codigo={savedCode} sincronizado={savedSynced} concluir={() => {
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

function TelaConfigErro() {
  return <div className="auth-shell"><div className="auth-card"><div className="auth-logo">NP</div><h1>Configuração pendente</h1><p>O banco de dados ainda não foi conectado à publicação.</p></div></div>;
}

function Login({ onAuthenticated }: { onAuthenticated: (session: Session) => Promise<void> }) {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const enviar = async () => {
    setBusy(true); setMessage("");
    try {
      if (modo === "entrar") await onAuthenticated(await signIn(email.trim().toLowerCase(), password));
      else {
        const result = await signUp(name.trim(), email.trim().toLowerCase(), password);
        if (result.session) await onAuthenticated(result.session);
        else setMessage("Conta criada. Abra o e-mail de confirmação enviado pelo Supabase e depois volte para entrar.");
      }
    } catch (error) { setMessage(error instanceof Error ? traduzErro(error.message) : "Não foi possível entrar."); }
    setBusy(false);
  };
  return <div className="auth-shell"><section className="auth-brand"><small>NORTEP · POLÍTICA, POVO E PESQUISA</small><h1><b>N</b>orte<b>P</b> Pesquisa</h1><p>Dados de campo protegidos, organizados e prontos para aproximar pessoas das decisões.</p><div><span>✓ Entrevistado sem login</span><span>✓ Pesquisador com acesso próprio</span><span>✓ Consentimento e auditoria</span></div></section><section className="auth-card"><div className="auth-logo">NP</div><small>ACESSO DA EQUIPE</small><h2>{modo === "entrar" ? "Entrar no NorteP" : "Criar acesso"}</h2><p>{modo === "entrar" ? "Use o e-mail cadastrado pela coordenação." : "Novos pesquisadores aguardam aprovação da administração."}</p>{modo === "criar" && <><label>Nome completo</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" /></>}<label>E-mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@exemplo.com" /><label>Senha</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 8 caracteres" /><button className="primary auth-submit" disabled={busy || !email || password.length < 8 || (modo === "criar" && !name)} onClick={enviar}>{busy ? "Aguarde…" : modo === "entrar" ? "Entrar com segurança" : "Criar meu acesso"}</button>{message && <div className="auth-message">{message}</div>}<button className="auth-switch" onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setMessage(""); }}>{modo === "entrar" ? "Primeiro acesso? Criar conta" : "Já possui acesso? Entrar"}</button><small className="auth-help">O entrevistado não precisa criar conta.</small></section></div>;
}

function traduzErro(message: string) {
  if (message.toLowerCase().includes("invalid login")) return "E-mail ou senha incorretos.";
  if (message.toLowerCase().includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.toLowerCase().includes("already registered")) return "Este e-mail já possui uma conta. Use a opção Entrar.";
  return message;
}

function AguardandoAprovacao({ profile, sair }: { profile: Profile; sair: () => void }) {
  return <div className="auth-shell"><div className="auth-card pending-card"><div className="auth-logo">NP</div><small>ACESSO CRIADO</small><h2>Olá, {profile.name}.</h2><p>Seu cadastro chegou à coordenação. Assim que a administração aprovar, a pesquisa aparecerá neste aparelho.</p><div className="pending-shield">◎ <span><b>Conta aguardando aprovação</b><small>Nenhuma resposta pode ser coletada antes da liberação.</small></span></div><button className="auth-switch" onClick={sair}>Sair e voltar depois</button></div></div>;
}

function Inicio({ ir, aviso, interviews, pending }: { ir: (v: View) => void; aviso: (t: string) => void; interviews: SavedInterview[]; pending: number }) {
  const hoje = new Date();
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(hoje); d.setDate(d.getDate() - (6 - i)); return d; });
  const contagens = dias.map(d => interviews.filter(x => new Date(x.completed_at || x.created_at).toDateString() === d.toDateString()).length);
  const max = Math.max(...contagens, 1);
  const ativos = new Set(interviews.map(x => x.researcher_id)).size;
  const progresso = Math.min(interviews.length, 100);
  const pesquisaPiloto = { ...pesquisas[0], feitas: interviews.length, equipe: ativos };
  return <>
    <div className="boas"><div><small>QUARTA-FEIRA, 22 DE JULHO</small><h2>Bom dia, Ludimila. <span>O campo está avançando.</span></h2><p>Acompanhe o ritmo das equipes e veja onde sua atenção é mais necessária.</p></div><button onClick={() => aviso("Dados atualizados agora")}>↻ Atualizar dados</button></div>
    <div className="metricas"><Metrica c="verde" i="✓" t="Entrevistas realizadas" v={String(interviews.length)} s="salvas no banco central" /><Metrica c="laranja" i="◎" t="Meta do piloto" v={`${progresso}%`} s={`${Math.max(100 - interviews.length, 0)} entrevistas restantes`} /><Metrica c="roxo" i="♙" t="Pesquisadores com coleta" v={String(ativos)} s="no piloto atual" /><Metrica c="azul" i="⌁" t="Neste aparelho" v={String(pending)} s="pendentes de sincronização" /></div>
    <div className="duas"><div className="painel"><Topo sup="RITMO DE COLETA" titulo="Entrevistas nos últimos 7 dias" /><div className="grafico">{contagens.map((valor, i) => <div key={dias[i].toISOString()}><b>{valor}</b><i style={{ height: `${Math.max(valor ? valor / max * 90 : 3, 3)}%` }} /><small>{i === 6 ? "HOJE" : dias[i].toLocaleDateString("pt-BR", { weekday: "short" }).slice(0, 3).toUpperCase()}</small></div>)}</div></div><div className="painel"><Topo sup="SITUAÇÃO DO PILOTO" titulo="Acompanhamento" /><div className="alerta"><i className={pending ? "a1" : "a0"}>{pending ? "!" : "✓"}</i><span><b>{pending ? `${pending} entrevista(s) aguardando internet` : "Todas as respostas sincronizadas"}</b><small>{pending ? "Abra a área do pesquisador e toque em sincronizar" : "Nenhuma pendência neste aparelho"}</small></span></div><div className="alerta"><i className="a2">i</i><span><b>{interviews.length ? "Coleta piloto em andamento" : "Pronto para a primeira entrevista"}</b><small>Resultados eleitorais ainda não devem ser divulgados.</small></span></div></div></div>
    <div className="painel lista"><div className="topo"><div><small>PESQUISAS ATIVAS</small><h3>Acompanhamento por pesquisa</h3></div><button onClick={() => ir("pesquisas")}>Ver todas →</button></div><LinhaPesquisa p={pesquisaPiloto} ir={ir} /></div>
  </>;
}

function Metrica({ c, i, t, v, s }: { c: string; i: string; t: string; v: string; s: string }) { return <div className="metrica"><i className={c}>{i}</i><span><small>{t}</small><b>{v}</b><em>{s}</em></span></div>; }
function Topo({ sup, titulo }: { sup: string; titulo: string }) { return <div className="topo"><div><small>{sup}</small><h3>{titulo}</h3></div><button>•••</button></div>; }
function LinhaPesquisa({ p, ir }: { p: typeof pesquisas[0]; ir: (v: View) => void }) { return <div className="linha-pesquisa"><i>▤</i><span><b>{p.nome}</b><small>● {p.status} · {p.equipe} pesquisadores</small></span><div><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><strong>{Math.round(p.feitas / p.meta * 100)}%</strong><button onClick={() => ir("resultados")}>Ver detalhes</button></div>; }

function Pesquisas({ ir, aviso, videoUrl, setVideoUrl }: { ir: (v: View) => void; aviso: (t: string) => void; videoUrl: string; setVideoUrl: (v: string) => void }) {
  const configurarVideo = () => {
    const valor = window.prompt("Cole o link de um vídeo do YouTube. Deixe vazio para remover.", videoUrl);
    if (valor !== null) {
      setVideoUrl(valor.trim());
      aviso(valor.trim() ? "Vídeo de agradecimento configurado" : "Vídeo removido desta pesquisa");
    }
  };
  return <>
    <Cabecalho titulo="Pesquisas de campo" sub="Crie, edite e acompanhe todos os questionários." botao="＋ Criar pesquisa" acao={() => aviso("Novo questionário criado como rascunho")} />
    <Filtros busca="Buscar pesquisa..." />
    <div className="cards">{pesquisas.map((p, i) => <article key={p.nome}><div><label className={p.status === "Em campo" ? "status" : "rascunho"}>{p.status}</label><button>•••</button></div><h3>{p.nome}</h3><p>{i === 0 ? "Diagnóstico territorial, serviços públicos, lideranças e intenção de voto nas seis escolhas de 2026." : i === 1 ? "Avaliação da saúde, educação, limpeza e transporte público." : "Mapeamento das principais demandas dos moradores."}</p>{i === 0 && <><div className="aviso-piloto"><b>Rascunho técnico</b><small>Validar amostra, questionário e regras eleitorais antes de divulgar resultados.</small></div><div className="video-status"><i>▶</i><span><b>Vídeo de agradecimento</b><small>{videoUrl ? "Link do YouTube configurado" : "Opcional · ainda não configurado"}</small></span></div></>}<section><span><b>{p.feitas}</b> respostas</span><span><b>{p.equipe}</b> pesquisadores</span><span><b>{i === 0 ? 39 : i === 2 ? 18 : 24}</b> perguntas</span></section><div className="progresso"><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><footer>{i === 0 && <button onClick={configurarVideo}>▶ Vídeo</button>}<button onClick={() => aviso("Editor de perguntas aberto")}>Editar</button><button onClick={() => i === 0 ? ir("portal") : i === 2 ? aviso("Pesquisa liberada para a equipe") : ir("resultados")}>{i === 0 ? "Testar" : i === 2 ? "Liberar" : "Acompanhar"}</button></footer></article>)}</div>
  </>;
}

function Equipe({ aviso, profiles, onToggle }: { aviso: (t: string) => void; profiles: Profile[]; onToggle: (id: string, active: boolean) => void }) { return <><Cabecalho titulo="Equipe de pesquisadores" sub={`${profiles.length} cadastro(s) · ${profiles.filter(x => x.active).length} ativo(s)`} botao="＋ Orientar cadastro" acao={() => aviso("Peça ao pesquisador para usar Criar conta na tela inicial")} /><div className="painel tabela"><div className="tr cab"><span>Usuário</span><span>Função</span><span>Status</span><span>Ação</span></div>{profiles.map(p => <div className="tr" key={p.id}><span className="pessoa"><i>{p.name.split(" ").slice(0, 2).map(x => x[0]).join("").toUpperCase()}</i><span><b>{p.name}</b><small>{p.email}</small></span></span><span>{p.role}</span><b className={p.active ? "ok" : "pendente"}>● {p.active ? "Ativo" : "Aguardando"}</b><span>{p.role === "pesquisador" && <button className={p.active ? "suspender" : "aprovar"} onClick={() => onToggle(p.id, !p.active)}>{p.active ? "Suspender" : "Aprovar"}</button>}</span></div>)}{!profiles.length && <div className="vazio-tabela">Nenhum cadastro encontrado.</div>}</div></>; }

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
  return <div className="portal"><div className="portal-boas"><span><small>OLÁ, {profile.name.split(" ")[0].toUpperCase()}</small><h2>Pronto para continuar o trabalho de campo?</h2><p>Você vê somente a pesquisa liberada pela coordenação.</p></span><div className="campo-metricas"><i><b>{hoje}</b><small>hoje</small></i><i><b>{interviews.length}</b><small>no total</small></i><i><b>{pending}</b><small>pendentes</small></i></div></div>{survey ? <article className="pesquisa-atribuida"><div className="pesquisa-capa"><span>{survey.status === "pilot" ? "PILOTO INTERNO" : "EM CAMPO"}</span><i><b>N</b>P</i></div><div className="pesquisa-info"><small>PESQUISA LIBERADA · BETIM</small><h3>{survey.title.replace("Betim: ", "")}</h3><p>39 perguntas com desvios · duração estimada de {survey.estimated_minutes} minutos</p><div className="instrucoes"><span>✓ Leia exatamente como está escrito</span><span>✓ Não sugira respostas</span><span>✓ Consentimento antes da coleta</span></div><div className="nota-eleitoral"><b>Uso de teste</b><span>A lista oficial de candidaturas e a metodologia amostral ainda precisam de validação antes do campo real.</span></div>{pending > 0 && <button className="sync-pending" onClick={sincronizar}>↻ Sincronizar {pending} pendente(s)</button>}<button className="primary" onClick={iniciar}>＋ Iniciar nova entrevista</button></div></article> : <div className="painel resultado-vazio"><i>◎</i><h3>Nenhuma pesquisa liberada</h3><p>Fale com a coordenação para receber uma pesquisa.</p></div>}<div className="painel ajuda-campo"><span><b>Dúvida durante o teste?</b><small>Não improvise a pergunta. Anote a ocorrência e fale com a coordenação.</small></span><button>Falar com a equipe</button></div></div>;
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
  return <div className="entrevista"><div className="entrevista-topo"><div><small>BETIM · TERRITÓRIO E ESCOLHAS 2026</small><h2>Entrevista <span>ENT-2026-000799</span></h2></div><label>✓ Rascunho salvo neste dispositivo</label></div><div className="passos">{["Consentimento", "Território", "Gestão", "Lideranças", "6 escolhas", "Perfil", "Contato"].map((x, i) => <div className={i + 1 <= passo ? "feito" : ""} key={x}><i>{i + 1 < passo ? "✓" : i + 1}</i><span>{x}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE 7 · PILOTO INTERNO</small>
    {passo === 1 && <><h3>Convite e autorização</h3><div className="leitura"><b>LEIA AO ENTREVISTADO</b><p>“Olá. Somos da NorteP Pesquisa. Estamos realizando um estudo sobre Betim, serviços públicos e escolhas eleitorais. A participação é voluntária, dura cerca de 10 minutos e você pode parar a qualquer momento. Suas opiniões políticas são dados sensíveis e serão analisadas de forma agrupada. Nome e contato não são necessários para responder.”</p></div><label>A pessoa tem 16 anos ou mais? *</label><Opcoes campo="idadeMinima" itens={["Sim", "Não"]} /><label>Mora em Betim e está apta a votar no município? *</label><Opcoes campo="eleitorBetim" itens={["Sim", "Não", "Não sabe informar"]} /><label>Após ouvir a explicação, aceita participar? *</label><Opcoes campo="consentirPesquisa" itens={["Sim, aceito participar", "Não aceito participar"]} />{inelegivel && <div className="encerrar"><b>Não prossiga com o questionário.</b><span>Agradeça e encerre sem salvar respostas.</span><button onClick={cancelar}>Encerrar sem registrar</button></div>}</>}
    {passo === 2 && <><h3>Relação com o território</h3><p className="instrucao">Comece pelo cotidiano. Ainda não mencione políticos ou eleições.</p><label>Bairro onde a pessoa mora *</label><input value={r.bairro || ""} onChange={e => set("bairro", e.target.value)} placeholder="Digite e selecione o bairro na versão final" /><label>Há quanto tempo mora em Betim? *</label><Opcoes campo="tempoMoradia" itens={["Menos de 1 ano", "1 a 5 anos", "6 a 10 anos", "11 a 20 anos", "Mais de 20 anos", "Desde que nasceu"]} /><label>Na sua opinião, qual é hoje o principal problema do seu bairro?</label><textarea value={r.problemaBairro || ""} onChange={e => set("problemaBairro", e.target.value)} placeholder="Registre sem resumir ou interpretar" /><label>Quais três áreas deveriam receber mais atenção no seu bairro? * <small>Selecione até 3</small></label><Multiplas campo="prioridadesBairro" itens={["Saúde", "Educação", "Segurança", "Transporte e trânsito", "Limpeza urbana", "Iluminação", "Asfalto e vias", "Moradia", "Emprego e renda", "Lazer e cultura", "Assistência social", "Outra"]} /><label>Autoriza registrar a localização aproximada do ponto desta entrevista?</label><Opcoes campo="autorizaGeo" itens={["Sim, autoriza", "Não autoriza"]} />{r.autorizaGeo === "Sim, autoriza" && <div className="geo"><button type="button" onClick={capturarLocalizacao}>◎ Registrar ponto aproximado</button><span>{geoStatus || "O aparelho solicitará permissão. O mapa deve usar acesso restrito."}</span>{r.latitude && <b>{r.latitude}, {r.longitude}</b>}</div>}</>}
    {passo === 3 && <><h3>Cidade, prefeitura e prioridades</h3><label>De modo geral, Betim está indo na direção certa ou errada? *</label><Opcoes campo="direcaoCidade" itens={["Direção certa", "Direção errada", "Nem certa nem errada", "Não sabe"]} /><label>Como você avalia a administração da Prefeitura de Betim? *</label><Opcoes campo="avaliacaoPrefeitura" itens={["Ótima", "Boa", "Regular", "Ruim", "Péssima", "Não sabe avaliar"]} /><label>Qual serviço municipal mais precisa melhorar?</label><Opcoes campo="servicoMelhorar" itens={["Saúde", "Educação", "Transporte", "Segurança e prevenção", "Limpeza urbana", "Obras e vias", "Assistência social", "Outro", "Não sabe"]} /><label>Se a prefeitura pudesse priorizar apenas uma área agora, qual deveria vir primeiro? *</label><Opcoes campo="prioridadeCidade" itens={["Saúde", "Educação", "Segurança", "Emprego e renda", "Transporte", "Obras e infraestrutura", "Habitação", "Assistência social", "Meio ambiente", "Outra"]} />{r.prioridadeCidade === "Saúde" ? <><label>Por que a saúde deveria vir primeiro?</label><textarea value={r.motivoSaude || ""} onChange={e => set("motivoSaude", e.target.value)} placeholder="Registre a resposta com as palavras da pessoa" /></> : r.prioridadeCidade && <><label>E qual deveria ser o nível de prioridade da saúde?</label><Opcoes campo="nivelSaude" itens={["Também muito alta", "Alta", "Média", "Baixa", "Não sabe"]} /><label>Por quê?</label><textarea value={r.motivoNivelSaude || ""} onChange={e => set("motivoNivelSaude", e.target.value)} placeholder="Resposta aberta" /></>}<label>O que você mais espera que mude em Betim nos próximos quatro anos?</label><textarea value={r.esperaCidade || ""} onChange={e => set("esperaCidade", e.target.value)} placeholder="Resposta espontânea" /></>}
    {passo === 4 && <><h3>Conhecimento de lideranças públicas</h3><p className="instrucao"><b>Primeiro, lembrança espontânea.</b> Não leia nomes na pergunta abaixo.</p><label>Quando pensa em pessoas da política ligadas a Betim, qual nome vem primeiro à sua cabeça?</label><input value={r.politicoEspontaneo || ""} onChange={e => set("politicoEspontaneo", e.target.value)} placeholder="Nome citado ou “nenhum”" /><label>O que você pensa dessa pessoa?</label><textarea value={r.opiniaoEspontanea || ""} onChange={e => set("opiniaoEspontanea", e.target.value)} placeholder="Registre sem concordar ou discordar" /><label>Você conhece algum nome de Betim que pretende disputar deputado federal em 2026? Qual?</label><input value={r.conheceFederalBetim || ""} onChange={e => set("conheceFederalBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><label>E para deputado estadual?</label><input value={r.conheceEstadualBetim || ""} onChange={e => set("conheceEstadualBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><div className="separador"><span>AGORA LEIA CADA NOME</span></div>{nomes.map(blocoNome)}</>}
    {passo === 5 && <><h3>Intenção de voto — seis escolhas</h3><div className="leitura discreta"><b>INSTRUÇÃO AO PESQUISADOR</b><p>Faça todas de forma espontânea e na ordem abaixo. Não mostre nomes nesta versão. Para senador, são duas escolhas diferentes.</p></div><Intencao campo="votoFederal" titulo="1. Se a eleição fosse hoje, em quem votaria para deputado federal?" /><Intencao campo="votoEstadual" titulo="2. E para deputado estadual?" /><Intencao campo="votoSenador1" titulo="3. Qual seria seu primeiro voto para senador?" /><Intencao campo="votoSenador2" titulo="4. E qual seria seu segundo voto para senador?" ajuda="Não repita automaticamente o primeiro nome." /><Intencao campo="votoGovernador" titulo="5. Em quem votaria para governador de Minas Gerais?" /><Intencao campo="votoPresidente" titulo="6. E para presidente da República?" /><label>Hoje, sua decisão de voto está:</label><Opcoes campo="certezaVoto" itens={["Totalmente decidida", "Pode mudar", "Ainda não decidiu", "Prefere não responder"]} /></>}
    {passo === 6 && <><h3>Perfil para análise estatística</h3><p className="instrucao">Estas respostas permitem verificar se a amostra representa o eleitorado. Não use para identificar a pessoa.</p><label>Faixa etária *</label><Opcoes campo="idade" itens={["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"]} /><label>Gênero *</label><Opcoes campo="genero" itens={["Feminino", "Masculino", "Outra identidade", "Prefere não informar"]} /><label>Escolaridade *</label><Opcoes campo="escolaridade" itens={["Até fundamental", "Ensino médio", "Superior incompleto", "Superior completo ou mais", "Prefere não informar"]} /><label>Renda familiar mensal *</label><Opcoes campo="renda" itens={["Até 2 salários mínimos", "Mais de 2 a 5", "Mais de 5 a 10", "Mais de 10", "Não sabe", "Prefere não informar"]} /><label>Raça ou cor, conforme autodeclaração do IBGE</label><Opcoes campo="racaCor" itens={["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"]} /></>}
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
  return <div className="obrigado"><div className="check-final">✓</div><small>ENTREVISTA CONCLUÍDA</small><h2>Obrigado{nome ? `, ${nome}` : ""} por participar.</h2><p>Sua opinião ajuda a compreender as prioridades do bairro e a aproximar pessoas das decisões.</p>{videoId ? <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoId}`} title="Vídeo de agradecimento" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <div className="video-vazio"><i>▶</i><span><b>Vídeo de agradecimento</b><small>A coordenação pode adicionar um único link do YouTube nesta pesquisa.</small></span></div>}<div className="codigo-final"><small>CÓDIGO DA ENTREVISTA</small><b>{codigo || "ENT-PENDENTE"}</b><span className={sincronizado ? "salvo-central" : "salvo-local"}>{sincronizado ? "✓ Resposta salva no banco central" : "⌁ Salva neste aparelho · sincronização pendente"}</span></div><button className="primary" onClick={concluir}>Concluir e voltar às pesquisas</button></div>;
}
