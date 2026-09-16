export type Totals = { electorate: number; turnout: number; abstentions: number; valid: number; blank: number; nullVotes: number; annulled: number; pending: number; separate: number };
export type Candidate = { id: string; name: string; number: string; party: string; status: string; zones: Record<string, { valid: number; recorded: number }> };
export type Contest = { id: string; electionId: string; year: number; round: number; municipalityId: string; municipality: string; state: string; office: string; officeId: string; zones: Record<string, Totals>; candidates: Candidate[] };
export type Dataset = { schemaVersion: number; version: string; coverage: string; source: { name: string; url: string; generatedAt: string[]; files: string[]; sha256: Record<string, string>; license: string }; contests: Contest[] };
export type Query = { contestId: string; zone: string; candidateIds: string[]; search: string; party: string };
export type SavedQuery = { id: string; name: string; savedAt: string; datasetVersion: string; query: Query };
export const EMPTY_TOTALS: Totals = { electorate: 0, turnout: 0, abstentions: 0, valid: 0, blank: 0, nullVotes: 0, annulled: 0, pending: 0, separate: 0 };
export const INITIAL_QUERY: Query = { contestId: "619:41335", zone: "all", candidateIds: [], search: "", party: "all" };
export const number = (value: number) => new Intl.NumberFormat("pt-BR").format(value);
export const percent = (value: number | null) => value === null ? "—" : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
export const ratio = (value: number, base: number) => base > 0 ? value / base * 100 : null;
export const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function totalsFor(contest: Contest, zone: string): Totals {
  return Object.entries(contest.zones).filter(([key]) => zone === "all" || key === zone).reduce((sum, [, row]) => {
    for (const key of Object.keys(sum) as (keyof Totals)[]) sum[key] += row[key];
    return sum;
  }, { ...EMPTY_TOTALS });
}
export function candidatesFor(contest: Contest, zone: string) {
  const valid = totalsFor(contest, zone).valid;
  return contest.candidates.map(c => ({ ...c, votes: Object.entries(c.zones).filter(([key]) => zone === "all" || key === zone).reduce((sum, [, v]) => sum + v.valid, 0), recorded: Object.entries(c.zones).filter(([key]) => zone === "all" || key === zone).reduce((sum, [, v]) => sum + v.recorded, 0) }))
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"))
    .map((c, _, all) => ({ ...c, percentage: ratio(c.votes, valid), rank: all.filter(other => other.votes > c.votes).length + 1 }));
}
export function validateQuery(input: unknown, data: Dataset): Query | null {
  if (!input || typeof input !== "object") return null;
  const q = input as Partial<Query>;
  const contest = data.contests.find(c => c.id === q.contestId);
  if (!contest || typeof q.zone !== "string" || (q.zone !== "all" && !Object.hasOwn(contest.zones, q.zone))) return null;
  const ids = Array.isArray(q.candidateIds) ? [...new Set(q.candidateIds)].filter((id): id is string => typeof id === "string" && contest.candidates.some(c => c.id === id)).slice(0, 2) : [];
  return { contestId: contest.id, zone: q.zone, candidateIds: ids, search: typeof q.search === "string" ? q.search.slice(0, 120) : "", party: typeof q.party === "string" && contest.candidates.some(c => c.party === q.party) ? q.party : "all" };
}
export function readSaved(raw: string | null, data: Dataset): SavedQuery[] {
  try {
    const items: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(items)) return [];
    return items.slice(0, 50).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const x = item as Partial<SavedQuery>;
      const query = validateQuery(x.query, data);
      return query && typeof x.id === "string" && typeof x.name === "string" && typeof x.savedAt === "string" && Number.isFinite(Date.parse(x.savedAt)) && typeof x.datasetVersion === "string" ? [{ id: x.id.slice(0, 80), name: x.name.slice(0, 100), savedAt: x.savedAt, datasetVersion: x.datasetVersion, query }] : [];
    });
  } catch { return []; }
}
export function queryFromUrl(params: URLSearchParams, data: Dataset) {
  return validateQuery({ contestId: params.get("eleicao") || INITIAL_QUERY.contestId, zone: params.get("zona") || "all", candidateIds: params.getAll("candidato"), search: "", party: "all" }, data) || { ...INITIAL_QUERY, candidateIds: [] };
}
export function queryUrl(query: Query) {
  const params = new URLSearchParams({ eleicao: query.contestId });
  if (query.zone !== "all") params.set("zona", query.zone);
  query.candidateIds.filter(Boolean).forEach(id => params.append("candidato", id));
  return `/analise-eleitoral?${params}`;
}
export function csvCell(value: string | number) {
  const s = String(value);
  return `"${(/^(?:[\t\r\n]|\s*[=+@-])/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`;
}
export function canUseElectoral(role: string) { return ["admin", "coordenador", "supervisor", "observador"].includes(role); }
