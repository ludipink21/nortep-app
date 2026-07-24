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
  role: "admin" | "coordenador" | "pesquisador" | "observador";
  active: boolean;
  is_primary_admin?: boolean;
  access_removed_at?: string | null;
  region?: string | null;
  created_at?: string;
};

export type ObserverSummary = {
  total_interviews: number;
  interviews_today: number;
  active_researchers: number;
  active_surveys: number;
  updated_at: string | null;
  surveys: Array<{ id: string; title: string; status: string; interviews: number; researchers: number }>;
};

export type Survey = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  status: "draft" | "pilot" | "active" | "closed";
  survey_type: "quantitative" | "qualitative" | "directional" | "electoral" | "data_collection";
  estimated_minutes: number;
  consent_version: string;
  consent_text?: string;
  thank_you_video_url?: string | null;
  target_cities: string[];
  target_regions: string[];
  target_neighborhoods: string[];
  is_test: boolean;
  archived_at?: string | null;
  created_at?: string;
};

export type SurveyQuestion = {
  id?: string;
  survey_id?: string;
  code: string;
  section: string;
  sort_order?: number;
  type: "short_text" | "long_text" | "yes_no" | "single" | "multiple" | "scale" | "rating" | "region" | "internal_note";
  prompt: string;
  help_text?: string | null;
  required: boolean;
  options: string[];
  condition?: { field?: string; equals?: string } | null;
};

export type SurveyAssignment = {
  survey_id: string;
  researcher_id: string;
  active: boolean;
  team_name?: string | null;
  city?: string | null;
  region?: string | null;
  neighborhood?: string | null;
};

export type SavedInterview = {
  id: string;
  code: string;
  survey_id: string;
  researcher_id: string;
  responses: Record<string, string>;
  completed_at: string;
  created_at: string;
  latitude?: number | null;
  longitude?: number | null;
  duration_seconds?: number | null;
  quality_flags?: string[];
  is_test?: boolean;
  respondent_name?: string | null;
  contact_choice?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  contact_consent?: boolean;
};

export type FieldEvent = {
  id: string;
  survey_id: string;
  researcher_id: string;
  outcome: "refused" | "ineligible" | "interrupted" | "no_answer";
  reason?: string | null;
  city?: string | null;
  region?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_test?: boolean;
  is_safety_alert?: boolean;
  occurred_at: string;
};

let url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const sessionKey = "nortep-sessao";

export async function loadRuntimeConfig() {
  if (url && key) return true;
  if (typeof window === "undefined") return false;
  try {
    const response = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!response.ok) return false;
    const config = await response.json();
    url = typeof config?.url === "string" ? config.url.trim() : "";
    key = typeof config?.key === "string" ? config.key.trim() : "";
  } catch {
    return false;
  }
  return Boolean(url && key);
}

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

export async function readSessionFromUrl(): Promise<{ session: Session; type: string } | null> {
  if (typeof window === "undefined" || !window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  });
  const user = await parseResponse(response);
  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600),
    user,
  } as Session;
  saveSession(session);
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return { session, type: params.get("type") || "signin" };
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

export async function signUp(name: string, email: string, password: string, redirectTo?: string) {
  const endpoint = redirectTo
    ? `${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`
    : `${url}/auth/v1/signup`;
  const response = await fetch(endpoint, {
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

export async function requestPasswordReset(email: string, redirectTo: string) {
  const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await parseResponse(response);
}

export async function updatePassword(session: Session, password: string) {
  const current = await refreshSession(session);
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${current.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  await parseResponse(response);
}

export async function redeemAccessInvite(session: Session, code: string) {
  return rest<string>(session, "rpc/redeem_access_invite", {
    method: "POST",
    body: JSON.stringify({ p_code: code }),
  });
}

export async function createAccessInvite(session: Session, email: string, role: "admin" | "coordenador" | "observador" | "pesquisador") {
  return rest<string>(session, "rpc/create_access_invite", {
    method: "POST",
    body: JSON.stringify({ p_email: email, p_role: role }),
  });
}

export async function loadObserverSummary(session: Session) {
  return rest<ObserverSummary>(session, "rpc/observer_summary", {
    method: "POST",
    body: "{}",
  });
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
  if (rows[0]) return rows[0];
  return rest<Profile>(session, "rpc/ensure_own_profile", {
    method: "POST",
    body: "{}",
  });
}

export async function loadSurveys(session: Session) {
  return rest<Survey[]>(session, "surveys?select=*&status=in.(pilot,active)&archived_at=is.null&order=created_at.desc");
}

export async function loadAllSurveys(session: Session) {
  return rest<Survey[]>(session, "surveys?select=*&order=created_at.desc");
}

export async function loadSurveyQuestions(session: Session, surveyId: string) {
  return rest<SurveyQuestion[]>(session, `survey_questions?survey_id=eq.${surveyId}&select=*&order=sort_order.asc`);
}

export async function loadSurveyAssignments(session: Session, surveyId: string) {
  return rest<SurveyAssignment[]>(session, `survey_assignments?survey_id=eq.${surveyId}&select=*&order=created_at.asc`);
}

export async function loadProfiles(session: Session) {
  return rest<Profile[]>(session, "profiles?select=*&access_removed_at=is.null&order=created_at.desc");
}

export async function setProfileActive(session: Session, profileId: string, active: boolean) {
  return rest<Profile>(session, "rpc/manage_profile_access", {
    method: "POST",
    body: JSON.stringify({ p_profile_id: profileId, p_active: active }),
  });
}

export async function removeProfileAccess(session: Session, profileId: string) {
  return rest<Profile>(session, "rpc/remove_profile_access", {
    method: "POST",
    body: JSON.stringify({ p_profile_id: profileId }),
  });
}

export async function loadInterviews(session: Session) {
  return rest<SavedInterview[]>(session, "interviews?select=id,code,survey_id,researcher_id,responses,completed_at,created_at,latitude,longitude,duration_seconds,quality_flags,is_test,respondent_name,contact_choice,contact_whatsapp,contact_email,contact_consent&status=eq.completed&order=completed_at.desc");
}

export async function loadFieldEvents(session: Session) {
  return rest<FieldEvent[]>(session, "field_events?select=*&order=occurred_at.desc");
}

export async function saveInterview(session: Session, survey: Survey, responses: Record<string, string>, deviceId: string, durationSeconds?: number) {
  const { nome, whatsapp, email, interesse, consentimentoContato, autorizaGeo, latitude, longitude, codigo, ...researchResponses } = responses;
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
      duration_seconds: durationSeconds || null,
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

export async function saveFieldEvent(session: Session, survey: Survey, event: Omit<FieldEvent, "id" | "survey_id" | "researcher_id" | "occurred_at">, deviceId: string) {
  const rows = await rest<FieldEvent[]>(session, "field_events?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      survey_id: survey.id,
      researcher_id: session.user.id,
      outcome: event.outcome,
      reason: event.reason || null,
      city: event.city || null,
      region: event.region || null,
      neighborhood: event.neighborhood || null,
      geo_consent: false,
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      device_id: deviceId,
      is_safety_alert: event.is_safety_alert === true,
    }),
  });
  return rows[0];
}

export async function saveSurveyAdmin(session: Session, survey: Partial<Survey> & { title: string }, questions: SurveyQuestion[]) {
  return rest<string>(session, "rpc/upsert_survey_admin", {
    method: "POST",
    body: JSON.stringify({
      p_id: survey.id || null,
      p_title: survey.title,
      p_description: survey.description || "",
      p_status: survey.status || "draft",
      p_survey_type: survey.survey_type || "quantitative",
      p_estimated_minutes: survey.estimated_minutes || 10,
      p_consent_text: survey.consent_text || "A participação é voluntária. Você pode deixar de responder ou encerrar quando quiser.",
      p_is_test: Boolean(survey.is_test),
      p_target_cities: survey.target_cities || [],
      p_target_regions: survey.target_regions || [],
      p_target_neighborhoods: survey.target_neighborhoods || [],
      p_questions: questions,
    }),
  });
}

export async function setSurveyAssignments(session: Session, surveyId: string, researcherIds: string[], territory: { team?: string; city?: string; region?: string; neighborhood?: string }) {
  return rest<number>(session, "rpc/set_survey_assignments_admin", {
    method: "POST",
    body: JSON.stringify({
      p_survey_id: surveyId,
      p_researcher_ids: researcherIds,
      p_team_name: territory.team || "",
      p_city: territory.city || "",
      p_region: territory.region || "",
      p_neighborhood: territory.neighborhood || "",
    }),
  });
}

export async function deleteOrArchiveSurvey(session: Session, surveyId: string) {
  return rest<{ action: "deleted" | "archived"; title: string; interviews?: number; field_events?: number }>(session, "rpc/delete_or_archive_survey_admin", {
    method: "POST",
    body: JSON.stringify({ p_survey_id: surveyId }),
  });
}

export async function clearSurveyTestData(session: Session, surveyId: string) {
  return rest<{ interviews_removed: number; field_events_removed: number }>(session, "rpc/clear_test_data_admin", {
    method: "POST",
    body: JSON.stringify({ p_survey_id: surveyId }),
  });
}
