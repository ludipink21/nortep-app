export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string; user_metadata?: Record<string, string> };
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "coordenador" | "pesquisador";
  active: boolean;
  region?: string | null;
  created_at?: string;
};

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  status: "draft" | "pilot" | "active" | "closed";
  estimated_minutes: number;
  consent_version: string;
};

export type SavedInterview = {
  id: string;
  code: string;
  survey_id: string;
  researcher_id: string;
  responses: Record<string, string>;
  completed_at: string;
  created_at: string;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const sessionKey = "nortep-sessao";

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || body?.error || "Não foi possível concluir a operação.");
  return body;
}

function withExpiry(data: Record<string, unknown>) {
  return { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) } as Session;
}

export function configured() {
  return Boolean(url && key);
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(sessionKey) || "null"); } catch { return null; }
}

export function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
  else localStorage.removeItem(sessionKey);
}

export async function signIn(email: string, password: string) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = withExpiry(await parseResponse(response));
  saveSession(session);
  return session;
}

export async function signUp(name: string, email: string, password: string) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { name } }),
  });
  const data = await parseResponse(response);
  if (data.access_token) {
    const session = withExpiry(data);
    saveSession(session);
    return { session, confirmationRequired: false };
  }
  return { session: null, confirmationRequired: true };
}

export async function refreshSession(session: Session) {
  if (session.expires_at > Math.floor(Date.now() / 1000) + 90) return session;
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const fresh = withExpiry(await parseResponse(response));
  saveSession(fresh);
  return fresh;
}

export async function rest<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const current = await refreshSession(session);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${current.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return undefined as T;
  return parseResponse(response) as Promise<T>;
}

export async function loadProfile(session: Session) {
  const rows = await rest<Profile[]>(session, `profiles?id=eq.${session.user.id}&select=*`);
  return rows[0] ?? null;
}

export async function loadSurveys(session: Session) {
  return rest<Survey[]>(session, "surveys?select=*&status=in.(pilot,active)&order=created_at.desc");
}

export async function loadProfiles(session: Session) {
  return rest<Profile[]>(session, "profiles?select=*&order=created_at.desc");
}

export async function setProfileActive(session: Session, profileId: string, active: boolean) {
  return rest<Profile[]>(session, `profiles?id=eq.${profileId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ active }),
  });
}

export async function loadInterviews(session: Session) {
  return rest<SavedInterview[]>(session, "interviews?select=id,code,survey_id,researcher_id,responses,completed_at,created_at&status=eq.completed&order=completed_at.desc");
}

export async function saveInterview(session: Session, survey: Survey, responses: Record<string, string>, deviceId: string) {
  const { nome, whatsapp, email, interesse, consentimentoContato, autorizaGeo, latitude, longitude, ...researchResponses } = responses;
  const rows = await rest<Array<{ id: string; code: string }>>(session, "interviews?select=id,code", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      survey_id: survey.id,
      researcher_id: session.user.id,
      status: "completed",
      responses: researchResponses,
      respondent_name: nome || null,
      contact_choice: interesse || null,
      contact_whatsapp: whatsapp || null,
      contact_email: email || null,
      contact_consent: consentimentoContato === "sim",
      geo_consent: autorizaGeo === "Sim, autoriza",
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      device_id: deviceId,
      completed_at: new Date().toISOString(),
    }),
  });
  const saved = rows[0];
  await rest(session, "consent_records", {
    method: "POST",
    body: JSON.stringify({
      interview_id: saved.id,
      researcher_id: session.user.id,
      consent_version: survey.consent_version,
      research_consent: responses.consentirPesquisa === "Sim, aceito participar",
      geo_consent: autorizaGeo === "Sim, autoriza",
      contact_consent: consentimentoContato === "sim",
    }),
  });
  return saved;
}

