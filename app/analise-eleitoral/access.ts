import { loadRuntimeConfig, readSession, refreshSession, type Profile } from "../supabase";
import { canUseElectoral } from "./model";

export type Access = { profile: Profile; preview: boolean; previewLabel: string; allowed: boolean };
export async function electoralAccess(): Promise<Access> {
  if (!await loadRuntimeConfig()) throw new Error("Não foi possível conectar ao NorteP. Tente novamente.");
  const stored = readSession();
  if (!stored?.access_token || !stored.user?.id) throw new Error("Entre na sua conta NorteP para continuar.");
  const session = await refreshSession(stored);
  const configResponse = await fetch("/api/runtime-config", { cache: "no-store" });
  if (!configResponse.ok) throw new Error("Não foi possível conectar ao NorteP. Tente novamente.");
  const config = await configResponse.json() as { url: string; key: string };
  const headers = { apikey: config.key, Authorization: `Bearer ${session.access_token}` };
  const userResponse = await fetch(`${config.url}/auth/v1/user`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!userResponse.ok) throw new Error("Sua sessão terminou. Entre novamente para continuar.");
  const user = await userResponse.json() as { id: string };
  const profileResponse = await fetch(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,name,role,active,admin_level,is_primary_admin,access_removed_at`, { headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!profileResponse.ok) throw new Error("Não foi possível conferir seu acesso. Tente novamente.");
  const profiles = await profileResponse.json() as Profile[];
  const profile = profiles[0];
  if (!profile || profile.id !== user.id || !profile.active || profile.access_removed_at) throw new Error("Seu acesso precisa ser liberado pela administração do NorteP.");
  const principal = profile.role === "admin" && (profile.is_primary_admin || profile.admin_level === "founder" || profile.admin_level === "primary");
  const previewRole = new URLSearchParams(window.location.search).get("previa");
  const roles: Record<string, string> = { admin: "Administração", coordenador: "Coordenação", supervisor: "Supervisão", pesquisador: "Pesquisador", observador: "Observador", candidato: "Painel do candidato", publico: "Visitante" };
  const preview = Boolean(principal && previewRole && Object.hasOwn(roles, previewRole));
  const role = preview && previewRole ? (previewRole === "candidato" ? "observador" : previewRole) : profile.role;
  return { profile, preview, previewLabel: previewRole ? roles[previewRole] || "" : "", allowed: canUseElectoral(role) };
}
