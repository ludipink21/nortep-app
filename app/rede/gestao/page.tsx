"use client";

import { useEffect, useMemo, useState } from "react";
import "./gestao.css";

type StoredSession = { access_token: string; user?: { id?: string } };
type RuntimeConfig = { url: string; key: string };
type Profile = { id: string; name: string; role: string; observer_mode?: string; active: boolean; access_removed_at?: string | null };
type LinkRow = {
  id: string; code: string; channel: string; label: string; intro_video_url?: string | null; thank_you_video_url?: string | null;
  active: boolean; created_at: string; visits: number; starts: number; submissions: number; contacts: number; meeting_interest: number; volunteer_interest: number;
};
type MetricRow = { label: string; responses: number };
type ChannelRow = { channel: string; visits: number; starts: number; responses: number };
type Summary = {
  total_responses: number; visits: number; starts: number; contacts: number; meeting_interest: number; volunteer_interest: number;
  sample_label: string; by_channel: ChannelRow[]; priorities: MetricRow[]; formats: MetricRow[]; regions: MetricRow[]; participation: MetricRow[];
};

type Channel = "instagram" | "facebook" | "tiktok" | "whatsapp" | "youtube" | "outro";
const channels: Channel[] = ["instagram","facebook","tiktok","whatsapp","youtube","outro"];
const labels: Record<Channel,string> = { instagram:"Instagram", facebook:"Facebook", tiktok:"TikTok", whatsapp:"WhatsApp", youtube:"YouTube", outro:"Outra rede" };
const icons: Record<Channel,string> = { instagram:"◎", facebook:"f", tiktok:"♪", whatsapp:"◉", youtube:"▶", outro:"＋" };
let runtimeConfig: RuntimeConfig | null = null;

function readSession() { try { return JSON.parse(localStorage.getItem("nortep-sessao") || "null") as StoredSession | null; } catch { return null; } }
async function getConfig() { if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig; const response = await fetch("/api/runtime-config",{cache:"no-store"}); if(!response.ok) throw new Error("Configuração indisponível."); const value=await response.json() as RuntimeConfig; runtimeConfig={url:value.url.trim(),key:value.key.trim()}; return runtimeConfig; }
async function request<T>(path:string, token:string, init:RequestInit={}) { const c=await getConfig(); const response=await fetch(`${c.url}/rest/v1/${path}`,{...init,headers:{apikey:c.key,Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(init.headers||{})}}); const body=await response.json().catch(()=>({})); if(!response.ok) throw new Error(body?.message||body?.error||"Não foi possível concluir."); return body as T; }
async function rpc<T>(name:string, token:string, body:Record<string,unknown>={}) { return request<T>(`rpc/${name}`,token,{method:"POST",body:JSON.stringify(body)}); }
function pct(a:number,b:number){return b?Math.round(a/b*100):0}
function publicLink(code:string){return typeof window==="undefined"?`/rede?c=${code}`:`${window.location.origin}/rede?c=${code}`}
function formatDate(value:string){return new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}

export default function SocialQuizManagementPage(){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [token,setToken]=useState("");
  const [links,setLinks]=useState<LinkRow[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [channel,setChannel]=useState<Channel>("instagram");
  const [label,setLabel]=useState("");
  const [intro,setIntro]=useState("");
  const [thanks,setThanks]=useState("");
  const [generated,setGenerated]=useState<Array<{channel:string;code:string;label:string}>>([]);

  const refresh=async(show=true)=>{const session=readSession();if(!session?.access_token||!session.user?.id){setError("Entre primeiro no NorteP com um acesso autorizado.");setLoading(false);return;}if(show)setLoading(true);setError("");try{const [profiles,list,data]=await Promise.all([request<Profile[]>(`profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,name,role,observer_mode,active,access_removed_at`,session.access_token),rpc<LinkRow[]>("list_social_quiz_links",session.access_token),rpc<Summary>("social_quiz_summary",session.access_token)]);const current=profiles[0];if(!current?.active||current.access_removed_at)throw new Error("Este acesso não está ativo.");if(current.role!=="admin"&&!(current.role==="observador"&&current.observer_mode==="candidato"))throw new Error("Esta área é reservada à administração e ao candidato autorizado.");setProfile(current);setToken(session.access_token);setLinks(list);setSummary(data);}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível carregar o painel.");}finally{setLoading(false)}};
  useEffect(()=>{void refresh()},[]);
  const maxPriority=Math.max(...(summary?.priorities||[]).map(item=>Number(item.responses)),1);
  const maxFormat=Math.max(...(summary?.formats||[]).map(item=>Number(item.responses)),1);
  const totalVisits=Number(summary?.visits||0);const totalResponses=Number(summary?.total_responses||0);

  const createOne=async(selected:Channel=channel,customLabel=label)=>{if(!token)return null;const created=await rpc<{id:string;code:string;channel:string;label:string}>("create_social_quiz_link",token,{p_channel:selected,p_label:customLabel.trim(),p_intro_video_url:intro.trim()||null,p_thank_you_video_url:thanks.trim()||null});return created};
  const generateOne=async()=>{setBusy(true);setError("");try{const created=await createOne();if(created){setGenerated([created]);await navigator.clipboard.writeText(publicLink(created.code));setMessage("Link criado e copiado.");await refresh(false)}}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível gerar o link.")}finally{setBusy(false)}};
  const generatePackage=async()=>{setBusy(true);setError("");try{const created:Array<{channel:string;code:string;label:string}>=[];for(const item of channels.filter(value=>value!=="outro")){const row=await createOne(item,label?`${label} · ${labels[item]}`:labels[item]);if(row)created.push(row)}setGenerated(created);if(created.length)await navigator.clipboard.writeText(created.map(row=>`${labels[row.channel as Channel]}: ${publicLink(row.code)}`).join("\n"));setMessage(`${created.length} links criados e copiados, um para cada rede.`);await refresh(false)}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível gerar o pacote.")}finally{setBusy(false)}};
  const toggle=async(row:LinkRow)=>{setBusy(true);try{await rpc("set_social_quiz_link_active",token,{p_link_id:row.id,p_active:!row.active});setMessage(row.active?"Link pausado.":"Link reativado.");await refresh(false)}catch(reason){setError(reason instanceof Error?reason.message:"Não foi possível alterar o link.")}finally{setBusy(false)}};
  const copy=async(row:LinkRow)=>{await navigator.clipboard.writeText(publicLink(row.code));setMessage(`Link do ${labels[row.channel as Channel]||row.channel} copiado.`)};

  if(loading)return <main className="social-admin-shell social-admin-center"><div className="admin-loader"/><h1>Carregando o Quiz das Redes…</h1></main>;
  if(error&&!profile)return <main className="social-admin-shell social-admin-center"><h1>Acesso indisponível</h1><p>{error}</p><a href="/">Voltar ao NorteP</a></main>;

  return <main className="social-admin-shell">
    <header className="social-admin-top"><div><small>MOBILIZAÇÃO · QUIZ DAS REDES</small><h1>Escuta rápida nas redes sociais</h1><p>Gere links por canal, acompanhe visitas e respostas e mantenha os contatos separados no Cofre.</p></div><nav><a href="/inteligencia">Inteligência</a><a href="/">Voltar ao NorteP</a></nav></header>
    <section className="legal-note"><i>⚖</i><span><b>Módulo eleitoral não ativado</b><small>Este quiz mede prioridades comunitárias e interesse de participação. Perguntas sobre candidaturas, intenção de voto ou avaliação eleitoral exigem o enquadramento e registro aplicáveis antes do uso e da divulgação.</small></span></section>
    <section className="social-admin-metrics"><article><small>ACESSOS AOS LINKS</small><b>{totalVisits}</b><span>visitas únicas registradas</span></article><article><small>INICIARAM O QUIZ</small><b>{summary?.starts||0}</b><span>{pct(Number(summary?.starts||0),totalVisits)}% dos acessos</span></article><article><small>RESPOSTAS</small><b>{totalResponses}</b><span>{pct(totalResponses,totalVisits)}% dos acessos</span></article><article><small>CONTATOS AUTORIZADOS</small><b>{summary?.contacts||0}</b><span>armazenados separadamente</span></article></section>
    <div className="sample-note"><i>i</i><span><b>Leitura responsável</b><small>{summary?.sample_label||"Participação espontânea: não trate como amostra representativa da população."}</small></span></div>

    <div className="social-admin-grid">
      <section className="panel link-generator"><div className="panel-title"><small>GERADOR DE LINK</small><h2>Um link por rede mede melhor</h2><p>O participante não precisa criar conta.</p></div><label>Rede social<select value={channel} onChange={event=>setChannel(event.target.value as Channel)}>{channels.map(item=><option value={item} key={item}>{labels[item]}</option>)}</select></label><label>Nome interno da publicação<input value={label} onChange={event=>setLabel(event.target.value)} placeholder="Ex.: Stories agosto, Bio principal…"/></label><label>Vídeo de abertura <small>(YouTube, opcional)</small><input value={intro} onChange={event=>setIntro(event.target.value)} placeholder="https://youtu.be/..."/></label><label>Vídeo de agradecimento <small>(YouTube, opcional)</small><input value={thanks} onChange={event=>setThanks(event.target.value)} placeholder="https://youtu.be/..."/></label><div className="generator-actions"><button disabled={busy} onClick={()=>void generateOne()}>{busy?"Gerando…":"Gerar este link"}</button><button className="primary" disabled={busy} onClick={()=>void generatePackage()}>{busy?"Gerando…":"Gerar pacote Instagram + Facebook + TikTok + WhatsApp + YouTube"}</button></div>{generated.length>0&&<div className="generated-pack"><b>Links prontos</b>{generated.map(row=><div key={row.code}><span>{labels[row.channel as Channel]||row.channel}</span><input readOnly value={publicLink(row.code)}/><button onClick={()=>void navigator.clipboard.writeText(publicLink(row.code)).then(()=>setMessage("Link copiado."))}>Copiar</button></div>)}</div>}</section>

      <section className="panel channel-results"><div className="panel-title"><small>POR REDE</small><h2>De onde chegam as respostas</h2></div>{(summary?.by_channel||[]).length?(summary?.by_channel||[]).map(item=>{const ch=item.channel as Channel;return <article key={item.channel}><i>{icons[ch]||"+"}</i><span><b>{labels[ch]||item.channel}</b><small>{item.visits} acessos · {item.starts} iniciaram</small><em><u style={{width:`${pct(item.responses,Math.max(totalResponses,1))}%`}}/></em></span><strong>{item.responses}<small>respostas</small></strong></article>}):<p className="empty">Os resultados por rede aparecerão após os primeiros acessos.</p>}</section>
    </div>

    <div className="social-admin-grid insights">
      <section className="panel"><div className="panel-title"><small>PRIORIDADES</small><h2>Temas mais escolhidos</h2></div>{(summary?.priorities||[]).length?(summary?.priorities||[]).map(item=><div className="bar-row" key={item.label}><span>{item.label}</span><em><i style={{width:`${Number(item.responses)/maxPriority*100}%`}}/></em><b>{item.responses}</b></div>):<p className="empty">Aguardando respostas.</p>}</section>
      <section className="panel"><div className="panel-title"><small>FORMATOS</small><h2>Como as pessoas gostam de consumir conteúdo</h2></div>{(summary?.formats||[]).length?(summary?.formats||[]).map(item=><div className="bar-row format" key={item.label}><span>{item.label}</span><em><i style={{width:`${Number(item.responses)/maxFormat*100}%`}}/></em><b>{item.responses}</b></div>):<p className="empty">Aguardando respostas.</p>}</section>
    </div>

    <section className="panel participation-summary"><div className="panel-title"><small>PARTICIPAÇÃO</small><h2>Convites e voluntariado</h2></div><div><article><b>{summary?.meeting_interest||0}</b><span>demonstraram interesse em conversa/reunião</span></article><article><b>{summary?.volunteer_interest||0}</b><span>querem conhecer ações voluntárias</span></article><article><b>{summary?.contacts||0}</b><span>deixaram contato com autorização</span></article></div></section>

    <section className="panel link-list"><div className="panel-title"><small>LINKS CRIADOS</small><h2>Acompanhamento individual</h2><p>Use nomes internos para diferenciar bio, story, post fixado ou campanha.</p></div>{links.length?<div className="links-table">{links.map(row=><article key={row.id}><div className="link-main"><i>{icons[row.channel as Channel]||"+"}</i><span><b>{labels[row.channel as Channel]||row.channel}</b><small>{row.label||"Sem nome interno"} · {formatDate(row.created_at)}</small><em className={row.active?"active":"paused"}>● {row.active?"Ativo":"Pausado"}</em></span></div><div className="link-stats"><span><b>{row.visits}</b><small>acessos</small></span><span><b>{row.submissions}</b><small>respostas</small></span><span><b>{pct(row.submissions,row.visits)}</b><small>% concluiu</small></span></div><div className="link-actions"><button onClick={()=>void copy(row)}>Copiar</button><button disabled={busy} onClick={()=>void toggle(row)}>{row.active?"Pausar":"Reativar"}</button></div></article>)}</div>:<p className="empty">Nenhum link criado ainda.</p>}</section>
    {message&&<div className="admin-toast">✓ {message}</div>}{error&&<div className="admin-error">{error}</div>}
    <footer className="admin-footer"><span><b>NorteP Pesquisa</b> · Quiz das Redes</span><small>{profile?.name} · resultados agregados · contatos no Cofre</small></footer>
  </main>
}
