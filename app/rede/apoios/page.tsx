"use client";

import { useEffect, useMemo, useState } from "react";
import "./apoios.css";

type RuntimeConfig = { url: string; key: string };
type StoredSession = { access_token: string; user?: { id?: string } };
type Supporter = {
  id: string;
  name: string;
  kind: "apoiador" | "lideranca";
  code: string;
  active: boolean;
  city?: string | null;
  region?: string | null;
  neighborhood?: string | null;
  responses: number;
  content_opt_ins: number;
  shares_tracked: number;
  cities: number;
};
type NodeRow = {
  id: string;
  partner_id: string;
  parent_response_id?: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
  region?: string | null;
  neighborhood?: string | null;
  content_opt_in: boolean;
  meetings_opt_in: boolean;
  volunteer_opt_in: boolean;
  depth: number;
  children: number;
  created_at: string;
};
type Territory = { state: string; city: string; responses: number };
type Network = { supporters: Supporter[]; nodes: NodeRow[]; territories: Territory[] };

let runtimeConfig: RuntimeConfig | null = null;

function session() {
  try {
    return JSON.parse(localStorage.getItem("nortep-sessao") || "null") as StoredSession | null;
  } catch {
    return null;
  }
}

async function config() {
  if (runtimeConfig?.url && runtimeConfig.key) return runtimeConfig;
  const response = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Configuração indisponível.");
  const value = (await response.json()) as RuntimeConfig;
  runtimeConfig = { url: value.url.trim(), key: value.key.trim() };
  return runtimeConfig;
}

async function authenticatedRpc<T>(name: string, body: Record<string, unknown> = {}) {
  const stored = session();
  if (!stored?.access_token) throw new Error("Entre no NorteP com um acesso autorizado.");
  const current = await config();
  const response = await fetch(`${current.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: current.key,
      Authorization: `Bearer ${stored.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value?.message || value?.error || "Não foi possível carregar a rede.");
  return value as T;
}

function officialLink(code: string) {
  return typeof window === "undefined" ? `/apoio/${code}` : `${window.location.origin}/apoio/${code}`;
}

function NodeBranch({ node, all, level = 0 }: { node: NodeRow; all: NodeRow[]; level?: number }) {
  const children = all.filter(item => item.parent_response_id === node.id);
  return <div className="chain-branch" style={{ marginLeft: Math.min(level, 8) * 18 }}>
    <article className="chain-node">
      <span className="chain-dot">{level + 1}</span>
      <span className="chain-person">
        <b>{node.name}</b>
        <small>{[node.city, node.state, node.neighborhood].filter(Boolean).join(" · ") || "Território não informado"}</small>
      </span>
      <span className="chain-tags">
        {node.content_opt_in && <i>conteúdo</i>}
        {node.meetings_opt_in && <i>reunião</i>}
        {node.volunteer_opt_in && <i>participação</i>}
      </span>
      <strong>{node.children}<small>repasses diretos</small></strong>
    </article>
    {children.map(child => <NodeBranch key={child.id} node={child} all={all} level={level + 1} />)}
  </div>;
}

export default function SupportNetworkPage() {
  const [data, setData] = useState<Network | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await authenticatedRpc<Network>("list_mobilization_share_network");
      setData(result);
      if (!selected && result.supporters?.[0]?.id) setSelected(result.supporters[0].id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeSupporter = useMemo(() => data?.supporters.find(item => item.id === selected) || data?.supporters[0] || null, [data?.supporters, selected]);
  const supporterNodes = useMemo(() => activeSupporter ? (data?.nodes || []).filter(item => item.partner_id === activeSupporter.id) : [], [activeSupporter, data?.nodes]);
  const roots = useMemo(() => supporterNodes.filter(item => !item.parent_response_id || !supporterNodes.some(parent => parent.id === item.parent_response_id)), [supporterNodes]);
  const total = data?.supporters.reduce((sum, item) => sum + Number(item.responses || 0), 0) || 0;
  const optIns = data?.supporters.reduce((sum, item) => sum + Number(item.content_opt_ins || 0), 0) || 0;
  const trackedShares = data?.supporters.reduce((sum, item) => sum + Number(item.shares_tracked || 0), 0) || 0;

  const copy = async (supporter: Supporter) => {
    await navigator.clipboard.writeText(officialLink(supporter.code));
    setMessage(`Link de ${supporter.name} copiado.`);
  };

  if (loading) return <main className="support-admin support-admin-center"><div className="network-loader" /><h1>Carregando a rede de alcance…</h1></main>;
  if (error && !data) return <main className="support-admin support-admin-center"><h1>Acesso indisponível</h1><p>{error}</p><a href="/">Voltar ao NorteP</a></main>;

  return <main className="support-admin">
    <header className="support-admin-top">
      <div><small>MOBILIZAÇÃO · REDE DE ALCANCE</small><h1>Cadeia de compartilhamentos</h1><p>Links oficiais ficam com os apoiadores iniciais. Os repasses seguintes são ligados automaticamente quando a pessoa usa o botão “Compartilhar”.</p></div>
      <nav><button onClick={() => void load()}>Atualizar</button><a href="/">Voltar ao NorteP</a></nav>
    </header>

    <section className="privacy-banner"><i>i</i><span><b>Uso interno e consentido</b><small>Esta tela contém dados de relacionamento e participação. Mantenha o acesso restrito e use os contatos somente para as autorizações marcadas por cada pessoa.</small></span></section>

    <section className="network-metrics">
      <article><small>APOIADORES OFICIAIS</small><b>{data?.supporters.length || 0}</b><span>links iniciais ativos</span></article>
      <article><small>CADASTROS</small><b>{total}</b><span>na rede acompanhada</span></article>
      <article><small>ACEITARAM CONTEÚDO</small><b>{optIns}</b><span>opt-ins registrados</span></article>
      <article><small>REPASSES RASTREADOS</small><b>{trackedShares}</b><span>cadeia automática</span></article>
    </section>

    <section className="official-links">
      <div className="section-title"><small>LINKS OFICIAIS</small><h2>Primeiros apoiadores</h2><p>Não precisam de e-mail. O nome identifica o link dentro do painel.</p></div>
      <div className="official-grid">
        {(data?.supporters || []).map(item => <article className={activeSupporter?.id === item.id ? "active" : ""} key={item.id} onClick={() => setSelected(item.id)}>
          <span><b>{item.name}</b><small>{item.responses} cadastros · {item.shares_tracked} repasses · {item.cities} cidades</small></span>
          <button onClick={event => { event.stopPropagation(); void copy(item); }}>Copiar link</button>
        </article>)}
      </div>
    </section>

    {activeSupporter && <section className="network-panel">
      <div className="section-title"><small>CADEIA SELECIONADA</small><h2>{activeSupporter.name}</h2><p>{activeSupporter.responses} cadastros originados do link oficial. A árvore abaixo mostra quem encaminhou para quem quando o botão rastreável foi usado.</p></div>
      <div className="chain-box">
        <div className="chain-root">
          <span className="root-badge">A</span>
          <span><b>{activeSupporter.name}</b><small>apoiador oficial · origem da cadeia</small></span>
          <strong>{activeSupporter.responses}<small>alcance cadastrado</small></strong>
        </div>
        {roots.length ? roots.map(node => <NodeBranch key={node.id} node={node} all={supporterNodes} />) : <p className="network-empty">Ainda não há cadastros neste link.</p>}
      </div>
    </section>}

    <section className="territory-panel">
      <div className="section-title"><small>TERRITÓRIO DECLARADO</small><h2>Cidades alcançadas</h2><p>O mapa territorial é baseado na cidade e UF informadas pela própria pessoa, não em localização física do aparelho.</p></div>
      <div className="territory-grid">
        {(data?.territories || []).slice(0, 20).map(item => <article key={`${item.state}-${item.city}`}><b>{item.city}</b><span>{item.state}</span><strong>{item.responses}</strong></article>)}
        {!data?.territories?.length && <p className="network-empty">Os territórios aparecerão após os primeiros cadastros.</p>}
      </div>
    </section>

    {message && <div className="network-toast">✓ {message}</div>}
    {error && <div className="network-error">{error}</div>}
  </main>;
}
