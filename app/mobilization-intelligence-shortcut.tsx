"use client";

import { useEffect, useState } from "react";
import "./mobilization-intelligence-shortcut.css";

type StoredSession = {
  access_token: string;
  user?: { id?: string };
};

type RuntimeConfig = { url: string; key: string };
let runtimeConfig: RuntimeConfig | null = null;

function readSession(): StoredSession | null {
  try {
    return JSON.parse(localStorage.getItem("nortep-sessao") || "null") as StoredSession | null;
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

export default function MobilizationIntelligenceShortcut() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (window.location.pathname.startsWith("/inteligencia")) {
        if (active) setVisible(false);
        return;
      }
      const session = readSession();
      if (!session?.access_token || !session.user?.id) {
        if (active) setVisible(false);
        return;
      }
      try {
        const config = await getRuntimeConfig();
        const response = await fetch(
          `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=role,observer_mode,active,access_removed_at`,
          {
            headers: {
              apikey: config.key,
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("Sessão indisponível.");
        const rows = await response.json() as Array<{
          role: string;
          observer_mode?: string;
          active: boolean;
          access_removed_at?: string | null;
        }>;
        const profile = rows[0];
        if (!active) return;
        setVisible(Boolean(
          profile?.active
          && !profile.access_removed_at
          && (profile.role === "admin" || (profile.role === "observador" && profile.observer_mode === "candidato")),
        ));
      } catch {
        if (active) setVisible(false);
      }
    };

    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
    };
  }, []);

  if (!visible) return null;

  return <a className="nortep-intelligence-shortcut" href="/inteligencia">
    <span aria-hidden="true">◆</span>
    <b>Inteligência de propostas</b>
    <small>Triagem da mobilização</small>
  </a>;
}
