"use client";

import { useEffect, useState } from "react";
import { configured, loadProfile, loadRuntimeConfig, readSession } from "./supabase";
import "./researcher-profile-shortcut.css";

export default function ResearcherProfileShortcut() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (window.location.pathname.startsWith("/perfil-pesquisador")) return;
    const boot = async () => {
      try {
        await loadRuntimeConfig();
        if (!configured()) return;
        const session = readSession();
        if (!session) return;
        const profile = await loadProfile(session);
        const principal = profile.role === "admin" && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary");
        setVisible(Boolean(profile.active && (profile.role === "pesquisador" || principal)));
      } catch { setVisible(false); }
    };
    void boot();
  }, []);
  if (!visible) return null;
  return <a className="researcher-profile-shortcut" href="/perfil-pesquisador" aria-label="Abrir apresentação do perfil Pesquisador"><i>NP</i><span><small>APRESENTAÇÃO</small><b>Perfil Pesquisador</b></span></a>;
}
