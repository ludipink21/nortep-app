"use client";

import { useEffect, useState } from "react";
import { configured, loadProfile, loadRuntimeConfig, readSession } from "./supabase";
import "./founder-pilot-shortcut.css";

export default function FounderPilotShortcut() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.location.pathname.startsWith("/qualidade")) return;
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        if (!configured()) return;
        const session = readSession();
        if (!session) return;
        const profile = await loadProfile(session);
        setVisible(Boolean(profile.active && profile.role === "admin" && profile.is_primary_admin));
      } catch { setVisible(false); }
    };
    void boot();
  }, []);
  if (!visible) return null;
  return <a className="founder-pilot-shortcut" href="/qualidade" aria-label="Abrir qualidade do piloto"><i>✓</i><span><small>PILOTO</small><b>Qualidade e perfis</b></span></a>;
}
