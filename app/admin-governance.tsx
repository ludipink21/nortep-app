"use client";

import { useEffect, useMemo, useState } from "react";
import "./admin-governance.css";

type StoredSession = {
  access_token: string;
  user?: { id?: string; email?: string };
};

type AdminLevel = "founder" | "primary" | "secondary" | null;

type OwnProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  is_primary_admin?: boolean;
  admin_level?: AdminLevel;
  access_removed_at?: string | null;
};

type PresenceRow = {
  profile_id: string;
  name: string;
  email: string;
  role: string;
  admin_level: AdminLevel;
  active: boolean;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  session_started_at?: string | null;
  last_seen_at?: string | null;
  current_path?: string | null;
  online_now: boolean;
};

type InviteType = "primary" | "secondary" | "coordenador" | "pesquisador" | "observador";

type RuntimeConfig = { url: string; key: string };

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
  if (!response.ok) throw new Error("Configuração indisponível.");
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
  return apiRequest<T>(`rpc/${name}`, token, { method: "POST", body: JSON.stringify(body) });
}

function adminLabel(level: AdminLevel) {
  if (level === "founder") return "Administradora Fundadora";
  if (level === "primary") return "Administrador Primário";
  return "Administrador Secundário";
}

function roleLabel(row: Pick<PresenceRow, "role" | "admin_level">) {
  if (row.role === "admin") return adminLabel(row.admin_level);
  return ({
    coordenador: "Coordenador",
    supervisor: "Supervisor",
    pesquisador: "Pesquisador",
    observador: "Observador",
  } as Record<string, string>)[row.role] || row.role;
}

function timeLabel(value?: string | null) {
  if (!value) return "Nunca entrou";
  const date = new Date(value);
  const difference = Date.now() - date.getTime();
  if (difference < 60_000) return "agora";
  if (difference < 3_600_000) return `há ${Math.max(1, Math.floor(difference / 60_000))} min`;
  if (difference < 86_400_000) return `há ${Math.max(1, Math.floor(difference / 3_600_000))} h`;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function openApplication(label: string) {
  const elements = Array.from(document.querySelectorAll<HTMLElement>("button, a"));
  const normalized = label.toLocaleLowerCase("pt-BR");
  const target = elements.find(element => {
    if (element.closest(".nortep-admin-governance")) return false;
    return (element.textContent || "").trim().toLocaleLowerCase("pt-BR").includes(normalized);
  });
  if (target) {
    target.click();
    return true;
  }
  return false;
}

export default function AdminGovernance() {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [coordinators, setCoordinators] = useState<OwnProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [inviteType, setInviteType] = useState<InviteType>("coordenador");
  const [inviteEmail, setInviteEmail] = useState("");
  const [coordinatorId, setCoordinatorId] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const canSeePresence = profile?.role === "admin" && ["founder", "primary"].includes(profile.admin_level || "");
  const onlineCount = useMemo(() => presence.filter(item => item.online_now && item.active).length, [presence]);

  const allowedInviteTypes = useMemo<InviteType[]>(() => {
    if (profile?.admin_level === "founder") return ["primary", "secondary", "coordenador", "pesquisador", "observador"];
    if (profile?.admin_level === "primary") return ["secondary", "coordenador", "pesquisador", "observador"];
    return ["coordenador", "pesquisador", "observador"];
  }, [profile?.admin_level]);

  useEffect(() => {
    if (!allowedInviteTypes.includes(inviteType)) setInviteType(allowedInviteTypes[0] || "coordenador");
  }, [allowedInviteTypes, inviteType]);

  useEffect(() => {
    let active = true;

    const heartbeat = async (loadDetails = false) => {
      const stored = readStoredSession();
      const token = stored?.access_token;
      const userId = stored?.user?.id;
      if (!token || !userId) {
        if (active) {
          setProfile(null);
          setPresence([]);
          setCoordinators([]);
          setOpen(false);
        }
        return;
      }

      try {
        await rpc<void>("touch_profile_presence", token, {
          p_path: `${window.location.pathname}${window.location.search}`,
          p_device: navigator.userAgent.slice(0, 170),
        });

        if (!loadDetails && profile) {
          if (profile.role === "admin" && ["founder", "primary"].includes(profile.admin_level || "")) {
            const rows = await rpc<PresenceRow[]>("list_profile_presence", token);
            if (active) setPresence(rows);
          }
          return;
        }

        const ownRows = await apiRequest<OwnProfile[]>(
          `profiles?id=eq.${encodeURIComponent(userId)}&select=id,name,email,role,active,is_primary_admin,admin_level,access_removed_at`,
          token,
        );
        const own = ownRows[0] || null;
        if (!active) return;
        setProfile(own);

        if (own?.role === "admin") {
          const coordinatorRows = await apiRequest<OwnProfile[]>(
            "profiles?role=eq.coordenador&active=eq.true&access_removed_at=is.null&select=id,name,email,role,active,is_primary_admin,admin_level,access_removed_at&order=name.asc",
            token,
          );
          if (active) {
            setCoordinators(coordinatorRows);
            if (!coordinatorId && coordinatorRows[0]) setCoordinatorId(coordinatorRows[0].id);
          }
          if (["founder", "primary"].includes(own.admin_level || "")) {
            const rows = await rpc<PresenceRow[]>("list_profile_presence", token);
            if (active) setPresence(rows);
          } else if (active) {
            setPresence([]);
          }
        }
      } catch {
        // A tela principal continua responsável pela renovação da sessão.
      }
    };

    void heartbeat(true);
    const pulse = window.setInterval(() => void heartbeat(false), 20_000);
    const details = window.setInterval(() => void heartbeat(true), 60_000);
    const onFocus = () => void heartbeat(true);
    const onVisibility = () => { if (document.visibilityState === "visible") void heartbeat(true); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(pulse);
      window.clearInterval(details);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [profile?.id, profile?.admin_level, coordinatorId]);

  if (!profile || profile.role !== "admin" || !profile.active || profile.access_removed_at) return null;

  const createInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setMessage("Informe um e-mail válido.");
      return;
    }
    if (inviteType === "pesquisador" && !coordinatorId) {
      setMessage("Escolha a Coordenadora Geral responsável pelo pesquisador.");
      return;
    }

    const stored = readStoredSession();
    if (!stored?.access_token) {
      setMessage("Entre novamente para gerar o convite.");
      return;
    }

    setBusy(true);
    setMessage("");
    setGeneratedLink("");
    try {
      let code = "";
      if (inviteType === "primary") {
        code = await rpc<string>("create_primary_admin_invite", stored.access_token, { p_email: email });
      } else {
        const role = inviteType === "secondary" ? "admin" : inviteType;
        code = await rpc<string>("create_managed_access_invite", stored.access_token, {
          p_email: email,
          p_role: role,
          p_coordinator_id: inviteType === "pesquisador" ? coordinatorId : null,
          p_cities: [],
          p_regions: [],
          p_neighborhoods: [],
        });
      }

      const access = inviteType === "primary" || inviteType === "secondary"
        ? "administracao"
        : inviteType === "coordenador"
          ? "coordenacao"
          : inviteType === "observador"
            ? "observador"
            : "pesquisador";
      const link = `${window.location.origin}/convite?acesso=${access}&codigo=${encodeURIComponent(String(code))}`;
      setGeneratedLink(link);
      setMessage("Convite criado. Envie apenas para o e-mail informado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível criar o convite.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setMessage("Link copiado.");
  };

  const inviteLabel = (type: InviteType) => ({
    primary: "Administrador Primário",
    secondary: "Administrador Secundário",
    coordenador: "Coordenador Geral",
    pesquisador: "Pesquisador",
    observador: "Observador",
  } as const)[type];

  return <div className="nortep-admin-governance">
    <button className="nortep-admin-trigger" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="nortep-admin-trigger-icon">◆</span>
      <span><b>{adminLabel(profile.admin_level || "secondary")}</b><small>{canSeePresence ? `${onlineCount} online agora` : "gestão administrativa"}</small></span>
    </button>

    {open && <aside className="nortep-admin-panel" aria-label="Gestão administrativa NorteP">
      <header>
        <div><small>GESTÃO PROTEGIDA</small><h2>{adminLabel(profile.admin_level || "secondary")}</h2><p>{profile.name}</p></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
      </header>

      <section className="nortep-admin-apps">
        <h3>Aplicativos e áreas</h3>
        <div>
          {["Pesquisas", "Resultados", "Mobilização", "Ecossistema", "Cofre"].map(label => <button key={label} type="button" onClick={() => {
            const opened = openApplication(label);
            setMessage(opened ? `${label} aberto.` : `${label} está no menu principal.`);
            if (opened) setOpen(false);
          }}>{label}</button>)}
        </div>
        <p><b>Mobilizadores não recebem login.</b> O cadastro de apoiadores e lideranças fica na área Mobilização e pode ser usado pela Fundadora, pelo Primário e pelo Secundário.</p>
      </section>

      {canSeePresence && <section className="nortep-presence-section">
        <div className="nortep-section-title"><span><h3>Perfis ativos em tempo real</h3><small>Atualização automática</small></span><b>{onlineCount} online</b></div>
        <div className="nortep-presence-list">
          {presence.length ? presence.map(item => <article key={item.profile_id} className={item.online_now ? "online" : "offline"}>
            <i aria-hidden="true" />
            <span><b>{item.name}</b><small>{roleLabel(item)} · {item.email_confirmed_at ? "e-mail confirmado" : "aguardando confirmação"}</small></span>
            <em>{item.online_now ? "Online agora" : timeLabel(item.last_seen_at || item.last_sign_in_at)}</em>
          </article>) : <p>Nenhuma presença registrada ainda. A lista aparecerá quando as pessoas abrirem a versão atualizada.</p>}
        </div>
      </section>}

      <section className="nortep-invite-section">
        <h3>Criar acesso</h3>
        <label>Tipo de perfil
          <select value={inviteType} onChange={event => setInviteType(event.target.value as InviteType)}>
            {allowedInviteTypes.map(type => <option value={type} key={type}>{inviteLabel(type)}</option>)}
          </select>
        </label>
        <label>E-mail da pessoa
          <input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="nome@email.com" />
        </label>
        {inviteType === "pesquisador" && <label>Responsável direto
          <select value={coordinatorId} onChange={event => setCoordinatorId(event.target.value)}>
            <option value="">Escolha a Coordenadora Geral</option>
            {coordinators.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>}
        <button className="nortep-create-invite" type="button" disabled={busy} onClick={() => void createInvite()}>{busy ? "Criando…" : `Criar convite de ${inviteLabel(inviteType)}`}</button>
        {generatedLink && <div className="nortep-generated-link"><input readOnly value={generatedLink} /><button type="button" onClick={() => void copyLink()}>Copiar</button></div>}
        {message && <p className="nortep-admin-message">{message}</p>}
        <small>Não há perfil de Supervisor nesta etapa. Pesquisadores são vinculados diretamente à Coordenadora Geral.</small>
      </section>
    </aside>}
  </div>;
}
