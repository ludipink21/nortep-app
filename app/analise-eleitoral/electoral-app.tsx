"use client";

// Root login reads its access channel on mount, so these links deliberately
// request a fresh document rather than retaining the current account screen.

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { NortePIcon as Icon, type IconName } from "../nortep-icons";
import { electoralAccess, type Access } from "./access";
import { candidatesFor, csvCell, INITIAL_QUERY, normalize, number, percent, queryFromUrl, queryUrl, ratio, readSaved, totalsFor, type Dataset, type Query, type SavedQuery, validateQuery } from "./model";
import "./electoral.css";

type Section = "inicio" | "consulta" | "comparar" | "salvas" | "fontes";
const navigation: { id: Section; label: string; icon: IconName }[] = [{ id: "inicio", label: "Visão geral", icon: "grid" }, { id: "consulta", label: "Consultar resultados", icon: "ballot" }, { id: "comparar", label: "Comparar candidatos", icon: "compare" }, { id: "salvas", label: "Minhas consultas", icon: "bookmark" }, { id: "fontes", label: "Sobre os dados", icon: "shield" }];
const titleCase = (text: string) => text.toLocaleLowerCase("pt-BR").replace(/(^|\s)\S/g, v => v.toLocaleUpperCase("pt-BR"));

export default function ElectoralApp() {
  const [access, setAccess] = useState<Access | null>(null);
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState<Section>("inicio");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState<Query>({ ...INITIAL_QUERY, candidateIds: [] });
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [copyUrl, setCopyUrl] = useState("");
  const [order, setOrder] = useState<"votes" | "name">("votes");
  const saveInput = useRef<HTMLInputElement>(null);
  const profileId = access?.profile.id;
  const storageKey = access ? `nortep-eleitoral-consultas-v1:${access.profile.id}` : "";

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const allowed = await electoralAccess();
        if (!alive) return;
        setAccess(allowed);
        if (!allowed.allowed) return;
        const response = await fetch("/api/analise-eleitoral/dados", { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("Os resultados não puderam ser carregados. Tente novamente.");
        const dataset = await response.json() as Dataset;
        if (dataset.schemaVersion !== 1 || !dataset.contests?.length) throw new Error("Os resultados estão indisponíveis no momento.");
        if (!alive) return;
        setData(dataset);
        const params = new URLSearchParams(window.location.search);
        const incoming = queryFromUrl(params, dataset);
        setQuery(incoming);
        if (params.has("eleicao")) setSection(incoming.candidateIds.length === 2 ? "comparar" : "consulta");
        if (!allowed.preview) {
          try { setSaved(readSaved(localStorage.getItem(`nortep-eleitoral-consultas-v1:${allowed.profile.id}`), dataset)); }
          catch { setNotice("O navegador não permitiu abrir suas consultas salvas."); }
        }
      } catch (err) { if (alive) setError(err instanceof Error ? err.message : "Não foi possível abrir a análise eleitoral."); }
    };
    void load();
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    const check = async () => {
      try {
        const current = await electoralAccess();
        if (!alive) return;
        if (current.profile.id !== profileId) { setData(null); setSaved([]); setAccess(null); setAttempt(v => v + 1); }
        else { setAccess(current); if (!current.allowed) { setData(null); setSaved([]); } }
      } catch (err) { if (alive) { setData(null); setSaved([]); setError(err instanceof Error ? err.message : "Entre novamente para continuar."); } }
    };
    const storageChanged = (event: StorageEvent) => { if (event.key === "nortep-sessao" || event.key === null) void check(); };
    window.addEventListener("focus", check);
    window.addEventListener("storage", storageChanged);
    const interval = window.setInterval(check, 60000);
    return () => { alive = false; window.removeEventListener("focus", check); window.removeEventListener("storage", storageChanged); window.clearInterval(interval); };
  }, [profileId]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [section]);
  useEffect(() => { if (saving) saveInput.current?.focus(); }, [saving]);
  const municipalities = useMemo(() => data ? Array.from(new Map(data.contests.map(c => [c.municipalityId, { id: c.municipalityId, name: c.municipality }])).values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) : [], [data]);
  const contest = data?.contests.find(c => c.id === query.contestId);
  const totals = contest ? totalsFor(contest, query.zone) : null;
  const candidates = contest ? candidatesFor(contest, query.zone) : [];
  const selected = query.candidateIds.flatMap(id => { const c = candidates.find(item => item.id === id); return c ? [c] : []; });
  const visible = candidates.filter(c => (query.party === "all" || c.party === query.party) && normalize(`${c.name} ${c.number} ${c.party}`).includes(normalize(query.search))).sort((a, b) => order === "name" ? a.name.localeCompare(b.name, "pt-BR") : b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"));
  const town = contest ? titleCase(contest.municipality) : "";
  const scope = `${town} · ${contest?.round}º turno${query.zone !== "all" ? ` · Zona ${query.zone}` : ""}`;
  const loginHref = (channel: string) => {
    const params = new URLSearchParams({ acesso: channel, continuar: "analise-eleitoral" });
    if (typeof window !== "undefined") for (const key of ["eleicao", "zona", "candidato"]) for (const value of new URLSearchParams(window.location.search).getAll(key).slice(0, 2)) params.append(key, value.slice(0, 80));
    return `/?${params}`;
  };
  const back = access?.preview ? "/?abrir=visoes" : "/?abrir=ecossistema";
  const changeSection = (next: Section) => { setSection(next); setMenu(false); setSaving(false); setNotice(""); setCopyUrl(""); };
  const changeContest = (id: string) => { setQuery({ ...INITIAL_QUERY, contestId: id, candidateIds: [] }); setNotice(""); setSaving(false); setCopyUrl(""); };
  const toggleCandidate = (id: string) => {
    setQuery(q => {
      if (q.candidateIds.includes(id)) return { ...q, candidateIds: q.candidateIds.filter(item => item !== id) };
      const ids = q.candidateIds.filter(Boolean);
      if (ids.length >= 2) return q;
      return { ...q, candidateIds: [...ids, id] };
    });
  };
  const persist = (items: SavedQuery[]) => {
    if (!access || access.preview || !data) return false;
    try { localStorage.setItem(storageKey, JSON.stringify(items)); setSaved(items); return true; }
    catch { setNotice("Não foi possível salvar neste navegador. Libere espaço ou tente outro navegador."); return false; }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || !saveName.trim() || access?.preview) return;
    const item: SavedQuery = { id: crypto.randomUUID(), name: saveName.trim().slice(0, 100), savedAt: new Date().toISOString(), datasetVersion: data.version, query: validateQuery(query, data)! };
    if (saved.length >= 50) { setNotice("Você já tem 50 consultas. Remova uma para salvar outra."); return; }
    if (persist([item, ...saved])) { setSaving(false); setNotice("Consulta salva. Você pode retomá-la em Minhas consultas."); }
  };
  const copy = async () => {
    const url = `${window.location.origin}${queryUrl(query)}`;
    try { await navigator.clipboard.writeText(url); setNotice("Link copiado. Quem abrir verá este recorte com o próprio acesso NorteP."); }
    catch { setCopyUrl(url); setNotice("Selecione e copie o endereço abaixo."); }
  };
  const exportCsv = () => {
    if (!data || !contest || !totals) return;
    const rows: (string | number)[][] = [["Fonte", data.source.name, data.source.url], ["Versão", data.version], ["Recorte", "2024", "MG", "Prefeito", scope], ["Base do percentual", "Votos válidos do recorte", totals.valid], ["Candidato", "Número", "Partido", "Votos válidos", "Percentual dos válidos", "Situação no município"]];
    for (const c of section === "comparar" && selected.length === 2 ? selected : visible) rows.push([c.name, c.number, c.party, c.votes, percent(c.percentage), c.status]);
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url; link.download = `nortep-2024-${contest.municipalityId}-turno-${contest.round}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Arquivo preparado com os dados e a fonte da consulta.");
  };

  if (error || (access && !access.allowed)) return <main className="ea ea-gate"><Image src="/nortep-icon-v1.png" alt="NorteP" width={64} height={64}/><span className="ea-eyebrow">ANÁLISE ELEITORAL</span><h1>{access && !access.allowed ? "Um acesso para cada função." : "Vamos continuar?"}</h1><p role="alert">{error || (access?.preview ? `A análise eleitoral não está disponível para o perfil ${access.previewLabel}.` : "A análise eleitoral está disponível para administração, coordenação, supervisão e observadores com acesso ativo.")}</p><div className="ea-actions"><a className="ea-primary" href={back}>Voltar ao NorteP</a>{error && <button onClick={() => { setError(""); setAccess(null); setData(null); setAttempt(v => v + 1); }}>Tentar novamente</button>}</div>{error && <div className="ea-login-options"><p>Entre pelo seu acesso:</p><a href={loginHref("principal")}>Administração principal</a><a href={loginHref("administracao")}>Administração</a><a href={loginHref("coordenacao")}>Coordenação</a><a href={loginHref("supervisao")}>Supervisão</a><a href={loginHref("observador")}>Observador</a></div>}</main>;
  if (!data || !access || !contest || !totals) return <main className="ea ea-gate" aria-busy="true"><Icon name="compass" size={48}/><h1>Abrindo sua análise.</h1><p role="status">Conferindo seu acesso e carregando os resultados.</p></main>;

  const Filters = <section className="ea-filters" aria-label="Filtros da consulta"><div className="ea-fixed-context"><Icon name="ballot"/><span><small>ELEIÇÃO</small><strong>2024 · Prefeito · MG</strong></span></div><label>Município<select aria-label="Município" value={contest.municipalityId} onChange={e => { const next = data.contests.find(c => c.municipalityId === e.target.value && c.round === 1); if (next) changeContest(next.id); }}>{municipalities.map(m => <option key={m.id} value={m.id}>{titleCase(m.name)}</option>)}</select></label><label>Turno<select aria-label="Turno" value={contest.id} onChange={e => changeContest(e.target.value)}>{data.contests.filter(c => c.municipalityId === contest.municipalityId).map(c => <option key={c.id} value={c.id}>{c.round}º turno</option>)}</select></label><label>Recorte<select aria-label="Recorte" value={query.zone} onChange={e => { setQuery({ ...query, zone: e.target.value }); setCopyUrl(""); }}>{[<option key="all" value="all">Todo o município</option>, ...Object.keys(contest.zones).sort((a, b) => Number(a) - Number(b)).map(z => <option key={z} value={z}>Zona {z}</option>)]}</select></label></section>;
  const ActionBar = <div className="ea-toolbar"><div><span className="ea-eyebrow">PREFEITO · 2024</span><h2>{town}<span>{contest.round}º turno{query.zone !== "all" ? ` · Zona ${query.zone}` : " · Município completo"}</span></h2></div><div className="ea-actions"><button disabled={access.preview} onClick={() => { setSaveName(`${scope} · 2024`); setSaving(true); }}><Icon name="bookmark"/>Salvar consulta</button><button onClick={() => void copy()}><Icon name="arrow"/>Copiar link</button><button onClick={exportCsv}><Icon name="download"/>Baixar dados</button><button onClick={() => window.print()} className="ea-print-button">Imprimir</button></div></div>;

  return <div className="ea ea-shell">
    <a className="ea-skip" href="#eleitoral-conteudo">Ir para o conteúdo</a>
    {menu && <button className="ea-scrim" aria-label="Fechar menu" onClick={() => setMenu(false)}/>}
    <aside className={`ea-sidebar ${menu ? "is-open" : ""}`}><a className="ea-brand" href={back}><Image src="/nortep-icon-v1.png" alt="" width={40} height={40}/><span>NorteP<small>Análise Eleitoral</small></span></a><p className="ea-nav-label">SEU ESPAÇO DE ANÁLISE</p><nav aria-label="Análise eleitoral">{navigation.map(item => <button key={item.id} className={section === item.id ? "is-active" : ""} aria-current={section === item.id ? "page" : undefined} onClick={() => changeSection(item.id)}><Icon name={item.icon}/>{item.label}{item.id === "salvas" && saved.length > 0 && <span className="ea-count">{saved.length}</span>}</button>)}</nav><div className="ea-side-bottom"><div className="ea-source-small"><Icon name="shield"/><div><strong>Informação com origem</strong><p>Resultados oficiais do TSE, com fonte e período visíveis.</p></div></div><a className="ea-back" href={back}><Icon name="back"/>{access.preview ? "Voltar à visão completa" : access.profile.role === "observador" ? "Voltar ao meu painel" : "Voltar ao ecossistema"}</a></div></aside>
    <div className="ea-main"><header className="ea-header"><div><button className="ea-menu-button" aria-label="Abrir menu" onClick={() => setMenu(true)}><Icon name="menu"/></button><span>Ecossistema NorteP <span className="ea-header-slash">/</span> <strong>Análise Eleitoral</strong></span></div><span className="ea-account"><span className="ea-avatar">{access.profile.name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join("")}</span>{access.profile.name.split(" ")[0]}</span></header>
    <main id="eleitoral-conteudo" className="ea-content">
      {access.preview && <div className="ea-preview"><Icon name="info"/><span><strong>Prévia: {access.previewLabel}.</strong> Você pode consultar e comparar. Nenhuma consulta será gravada nesta prévia.</span><a href={back}>Voltar</a></div>}
      {notice && <div className="ea-notice" role="status"><Icon name="info"/><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")}><Icon name="close" size={17}/></button></div>}
      {copyUrl && <label className="ea-copy">Endereço da consulta<input readOnly value={copyUrl} onFocus={e => e.target.select()}/></label>}
      {section === "inicio" && <>
        <section className="ea-hero"><div><span className="ea-eyebrow"><span className="ea-dot"/> UM NOVO OLHAR PARA OS RESULTADOS</span><h1>Informação clara.<br/><em>Comparações que fazem sentido.</em></h1><p>Explore os resultados eleitorais, compare candidatos e guarde as consultas que importam para você.</p><button className="ea-primary" onClick={() => changeSection("consulta")}>Começar uma consulta <Icon name="arrow"/></button><div className="ea-hero-note"><Icon name="shield" size={17}/>Dados oficiais. Fontes sempre à vista.</div></div><div className="ea-hero-art" aria-hidden="true"><div className="ea-orbit ea-orbit-one"/><div className="ea-orbit ea-orbit-two"/><div className="ea-art-center"><Icon name="compass" size={110}/></div><div className="ea-art-card"><Icon name="chart" size={28}/><span>CLAREZA PARA ANALISAR<strong>2024</strong>ELEIÇÕES MUNICIPAIS</span></div><span className="ea-art-point p1"/><span className="ea-art-point p2"/><span className="ea-art-point p3"/></div></section>
        <section className="ea-coverage" aria-label="Cobertura dos dados"><div><Icon name="pin"/><span><strong>{number(municipalities.length)}</strong><small>municípios de Minas Gerais</small></span></div><div><Icon name="ballot"/><span><strong>Prefeito</strong><small>1º e 2º turnos disponíveis</small></span></div><div><Icon name="clock"/><span><strong>{data.source.generatedAt[0].split(" ")[0]}</strong><small>geração do arquivo pelo TSE</small></span></div></section>
        <div className="ea-section-heading"><div><span className="ea-eyebrow">POR ONDE VOCÊ QUER COMEÇAR?</span><h2>Seu próximo passo, bem simples.</h2></div></div><section className="ea-start-grid"><button onClick={() => changeSection("consulta")}><span className="ea-feature-icon"><Icon name="ballot" size={29}/></span><h3>Conhecer os resultados</h3><p>Escolha uma cidade e veja os votos, os candidatos e a participação na eleição.</p><span className="ea-text-link">Consultar <Icon name="arrow" size={18}/></span></button><button onClick={() => changeSection("comparar")}><span className="ea-feature-icon teal"><Icon name="compare" size={29}/></span><h3>Colocar lado a lado</h3><p>Compare dois candidatos no mesmo recorte, com números e percentuais claros.</p><span className="ea-text-link">Comparar <Icon name="arrow" size={18}/></span></button><button onClick={() => changeSection("salvas")}><span className="ea-feature-icon gold"><Icon name="bookmark" size={29}/></span><h3>Continuar de onde parou</h3><p>Reabra as consultas que você guardou neste navegador para sua conta.</p><span className="ea-text-link">Minhas consultas <Icon name="arrow" size={18}/></span></button></section>
        <div className="ea-bottom-note"><Icon name="info"/><p>Começamos pelos resultados de prefeito em Minas Gerais, em 2024. Você pode consultar o município completo ou uma zona eleitoral.</p><button onClick={() => changeSection("fontes")}>Conhecer a fonte <Icon name="arrow" size={17}/></button></div>
      </>}
      {(section === "consulta" || section === "comparar") && <>
        <div className="ea-page-heading"><span className="ea-eyebrow">{section === "consulta" ? "CONSULTA ELEITORAL" : "COMPARAÇÃO ELEITORAL"}</span><h1>{section === "consulta" ? "Conheça os resultados da sua cidade." : "Dois candidatos, a mesma base."}</h1><p>{section === "consulta" ? "Escolha o município e veja os números daquele recorte." : "Escolha dois candidatos da mesma eleição para comparar votos e percentuais."}</p></div>
        {Filters}{ActionBar}
        {saving && <form className="ea-save-form" onSubmit={save}><label>Nome da consulta<input ref={saveInput} value={saveName} onChange={e => setSaveName(e.target.value)} maxLength={100} required/></label><button className="ea-primary" type="submit">Salvar neste navegador</button><button type="button" onClick={() => setSaving(false)}>Cancelar</button></form>}
        <div className="ea-metrics"><article><span>Eleitorado</span><strong>{number(totals.electorate)}</strong><small>Pessoas aptas no recorte</small></article><article><span>Comparecimento</span><strong>{percent(ratio(totals.turnout, totals.electorate))}</strong><small>{number(totals.turnout)} compareceram</small></article><article><span>Votos válidos</span><strong>{number(totals.valid)}</strong><small>Base dos percentuais dos candidatos</small></article><article><span>Abstenção</span><strong>{percent(ratio(totals.abstentions, totals.electorate))}</strong><small>{number(totals.abstentions)} ausentes</small></article></div>
        {section === "comparar" && <section className="ea-comparison" aria-label="Comparação de candidatos"><div className="ea-section-heading"><div><h2>Selecione dois candidatos</h2><p>A comparação usa os votos válidos de {query.zone === "all" ? town : `Zona ${query.zone}, ${town}`}.</p></div></div><div className="ea-compare-selects">{[0, 1].map((position) => <label key={position}>Candidato {position + 1}<select aria-label={`Candidato ${position + 1}`} value={query.candidateIds[position] || ""} onChange={e => { const ids = [...query.candidateIds]; ids[position] = e.target.value; setQuery({ ...query, candidateIds: ids }); }}><option value="">Selecione um candidato</option>{candidates.map(c => <option value={c.id} key={c.id} disabled={query.candidateIds[1 - position] === c.id}>{c.name} · {c.party}</option>)}</select></label>)}</div>{selected.length === 2 && new Set(selected.map(c => c.id)).size === 2 ? <><div className="ea-compare-cards">{selected.map((c, i) => <article key={c.id} className={i === 1 ? "second" : ""}><span className="ea-candidate-initials">{c.number}</span><span>{c.party}</span><h3>{c.name}</h3><strong>{number(c.votes)}</strong><small>votos válidos</small><b>{percent(c.percentage)}</b><div className="ea-bar-track"><span style={{ width: `${c.percentage ?? 0}%` }}/></div></article>)}</div><div className="ea-explanation"><Icon name="info"/><p>A diferença entre os candidatos selecionados é de <strong>{number(Math.abs(selected[0].votes - selected[1].votes))} votos válidos</strong>{selected.every(c => c.percentage !== null) && <> e <strong>{Math.abs((selected[0].percentage ?? 0) - (selected[1].percentage ?? 0)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pontos percentuais</strong></>}. Os dois percentuais usam a mesma base: {number(totals.valid)} votos válidos neste recorte.</p></div></> : <div className="ea-empty compact"><Icon name="compare" size={32}/><h3>Escolha quem você quer comparar.</h3><p>Os resultados aparecerão lado a lado assim que selecionar os dois nomes.</p></div>}</section>}
        <section className="ea-results"><div className="ea-results-heading"><h2>Candidatos <span>{candidates.length}</span></h2><div className="ea-table-filters"><label className="ea-search"><Icon name="search" size={18}/><span className="ea-sr-only">Buscar candidato, número ou partido</span><input placeholder="Buscar nome, número ou partido" value={query.search} onChange={e => setQuery({ ...query, search: e.target.value })}/></label><label><span className="ea-sr-only">Filtrar partido</span><select value={query.party} onChange={e => setQuery({ ...query, party: e.target.value })}><option value="all">Todos os partidos</option>{[...new Set(candidates.map(c => c.party))].sort().map(p => <option key={p}>{p}</option>)}</select></label><label><span className="ea-sr-only">Ordenar candidatos</span><select value={order} onChange={e => setOrder(e.target.value as "votes" | "name")}><option value="votes">Mais votos</option><option value="name">Nome A–Z</option></select></label></div></div><div className="ea-table-scroll"><table><caption className="ea-sr-only">Votos válidos dos candidatos a prefeito — {scope}, 2024</caption><thead><tr><th scope="col">Comparar</th><th scope="col">Candidato</th><th scope="col">Partido</th><th scope="col">Votos válidos</th><th scope="col">% dos válidos</th><th scope="col">Situação no município</th></tr></thead><tbody>{visible.map(c => <tr key={c.id}><td><input type="checkbox" aria-label={`Comparar ${c.name}`} checked={query.candidateIds.includes(c.id)} disabled={query.candidateIds.filter(Boolean).length >= 2 && !query.candidateIds.includes(c.id)} onChange={() => toggleCandidate(c.id)}/></td><th scope="row"><span className="ea-candidate-name">{c.name}</span><span className="ea-row-detail">Nº {c.number} · {c.rank}ª posição no recorte</span>{c.recorded !== c.votes && <span className="ea-row-detail">{number(c.recorded)} votos registrados; válidos na coluna ao lado.</span>}</th><td><span className="ea-party">{c.party}</span></td><td className="ea-numeric"><strong>{number(c.votes)}</strong></td><td className="ea-numeric"><strong>{percent(c.percentage)}</strong><span className="ea-table-bar"><i style={{ width: `${c.percentage ?? 0}%` }}/></span></td><td><span className={`ea-status ${c.status === "ELEITO" ? "elected" : ""}`}>{c.status.startsWith("#") ? "Não informada" : titleCase(c.status)}</span></td></tr>)}</tbody></table></div>{!visible.length && <div className="ea-empty compact"><Icon name="search" size={30}/><h3>Nenhum candidato encontrado.</h3><p>Experimente outro nome ou limpe os filtros.</p><button onClick={() => setQuery({ ...query, search: "", party: "all" })}>Limpar busca</button></div>}<div className="ea-table-footer"><span>{visible.length} de {candidates.length} candidatos · Percentuais calculados sobre {number(totals.valid)} votos válidos.</span>{query.candidateIds.filter(Boolean).length === 2 && <button className="ea-primary" onClick={() => { setSection("comparar"); window.scrollTo({ top: 0, behavior: "instant" }); }}>Comparar selecionados <Icon name="arrow" size={17}/></button>}</div></section>
        <details className="ea-glossary"><summary>Entenda os números desta consulta <Icon name="info" size={18}/></summary><dl><div><dt>Comparecimento e abstenção</dt><dd>Usam como base as {number(totals.electorate)} pessoas aptas a votar neste recorte.</dd></div><div><dt>Percentual do candidato</dt><dd>Votos válidos do candidato divididos pelos {number(totals.valid)} votos válidos do recorte. Não é uma projeção de uma eleição futura.</dd></div><div><dt>Outros votos</dt><dd>{number(totals.blank)} brancos; {number(totals.nullVotes)} nulos; {number(totals.annulled)} anulados; {number(totals.pending)} anulados sub judice; {number(totals.separate)} anulados apurados em separado.</dd></div><div><dt>Situação e posição</dt><dd>A situação é a informada pelo TSE no município. A posição na tabela considera somente os votos válidos do recorte selecionado; empates mantêm a mesma posição.</dd></div></dl></details>
      </>}
      {section === "salvas" && <><div className="ea-page-heading"><span className="ea-eyebrow">SUAS ESCOLHAS, ORGANIZADAS</span><h1>Minhas consultas.</h1><p>Guardadas neste navegador para sua conta. Você pode reabrir os filtros ou remover uma consulta quando quiser.</p></div>{saved.length ? <div className="ea-saved-list">{saved.map(item => <article key={item.id}><span className="ea-feature-icon"><Icon name="bookmark"/></span><div><h2>{item.name}</h2><p>Salva em {new Date(item.savedAt).toLocaleDateString("pt-BR")}{item.datasetVersion !== data.version && " · A fonte foi atualizada desde o salvamento"}</p></div><button className="ea-primary" onClick={() => { setQuery(item.query); setSection(item.query.candidateIds.filter(Boolean).length === 2 ? "comparar" : "consulta"); if (item.datasetVersion !== data.version) setNotice("Reabrimos seus filtros com a versão atual dos dados. Os números podem ter sido atualizados pelo TSE."); }}>Abrir <Icon name="arrow" size={18}/></button><button aria-label={`Remover consulta ${item.name}`} onClick={() => { if (persist(saved.filter(s => s.id !== item.id))) setNotice("Consulta removida deste navegador."); }}><Icon name="trash" size={19}/></button></article>)}</div> : <div className="ea-empty"><span className="ea-feature-icon gold"><Icon name="bookmark" size={34}/></span><h2>Sua próxima consulta pode ficar aqui.</h2><p>Ao encontrar um resultado que queira acompanhar, escolha “Salvar consulta”.</p><button className="ea-primary" onClick={() => changeSection("consulta")}>Fazer uma consulta <Icon name="arrow"/></button></div>}</>}
      {section === "fontes" && <><div className="ea-page-heading"><span className="ea-eyebrow">TRANSPARÊNCIA EM CADA CONSULTA</span><h1>Você sabe de onde vem.</h1><p>Os números são públicos. A origem, o período e o significado precisam ser claros também.</p></div><section className="ea-source-card"><span className="ea-feature-icon"><Icon name="shield" size={32}/></span><h2>Tribunal Superior Eleitoral</h2><p>Resultados das eleições ordinárias de 2024 para prefeito em Minas Gerais. Inclui os municípios e os turnos encontrados nos arquivos oficiais.</p><dl><div><dt>Abrangência</dt><dd>{number(municipalities.length)} municípios · {data.contests.length} resultados municipais por turno</dd></div><div><dt>Arquivos utilizados</dt><dd>Votação nominal por município e zona; detalhe da apuração por município e zona.</dd></div><div><dt>Geração pelo TSE</dt><dd>{data.source.generatedAt.join(" · ")}</dd></div><div><dt>Conferência dos totais</dt><dd>Os votos válidos dos candidatos foram confrontados com a apuração de cada zona. Comparecimento e abstenção foram confrontados com o eleitorado.</dd></div><div><dt>Atualizações</dt><dd>Esta consulta usa uma versão dos arquivos, não uma apuração em tempo real. Retificações do TSE podem alterar resultados históricos.</dd></div><div><dt>O que estes dados representam</dt><dd>Resultados agregados de uma eleição. Eles não revelam o voto de uma pessoa, nem substituem pesquisas atuais.</dd></div></dl><a className="ea-primary" href={data.source.url} target="_blank" rel="noopener noreferrer">Abrir fonte oficial <Icon name="arrow"/></a></section></>}
      <footer className="ea-footer"><span>NorteP <span>·</span> Dados que aproximam.</span><a href={data.source.url} target="_blank" rel="noopener noreferrer">Fonte: Tribunal Superior Eleitoral <Icon name="arrow" size={14}/></a></footer>
    </main></div>
  </div>;
}
