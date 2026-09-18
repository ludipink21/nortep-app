export type Election = { id: string; electionId: string; year: number; round: number; office: string; officeId: string; statewide: boolean; municipalityIds: string[] };
export type Catalog = { schemaVersion: number; version: string; coverage: string; candidateEntries: number; source: { name: string; url: string; urls: string[]; generatedAt: string[]; files: string[]; sha256: Record<string, string> }; municipalities: { id: string; name: string }[]; events: Election[] };
export type Counts = { electorate: number; turnout: number; abstentions: number; valid: number; nominalValid: number; partyValid: number; blank: number; nullVotes: number; annulled: number; pending: number; separate: number };
export type CandidateEntry = { id: string; name: string; fullName: string; number: string; party: string; municipalityId: string; eventId: string; votes: number };
export type BundleCandidate = Omit<CandidateEntry, 'eventId' | 'votes'> & { status: string; zones: Record<string, [number, number]> };
export type Bundle = { event: Election; municipalities: Record<string, string>; totals: Record<string, Counts>; candidates: BundleCandidate[] };
export type ElectoralQuery = { contestId: string; zone: string; candidateIds: string[]; search: string; party: string };
export type Profile = { ageAtElection: number | null; sourceYear: number; generatedAt: string; gender: string | null; education: string | null; race: string | null; occupation: string | null; birthState: string | null; coalition: string | null; coalitionParties: string | null; federation: string | null; registration: string | null };
export type CandidateResult = Omit<BundleCandidate, 'zones'> & { votes: number; recorded: number; percentage: number | null; rank: number; profile?: Profile };
export type AreaResult = { id: string; name: string; total: number; votes: number[] };
export type Electorate = { total: number; gender: Record<string, number>; age: Record<string, number>; education: Record<string, number>; year: number; generatedAt: string[]; source: string };
export type Territory = { ibgeId: string; name: string; population: number | null; area: number | null; density: number | null; year: number; source: string; retrievedAt: string };
export type Result = { event: Election; query: ElectoralQuery; municipalityId: string; municipality: string; zoneOptions: string[]; totals: Counts; candidates: CandidateResult[]; areas: AreaResult[]; version: string; electorate?: Electorate; territory?: Territory };
export type Saved = { id: string; name: string; savedAt: string; datasetVersion: string; query: ElectoralQuery };
export const EMPTY: Counts = { electorate: 0, turnout: 0, abstentions: 0, valid: 0, nominalValid: 0, partyValid: 0, blank: 0, nullVotes: 0, annulled: 0, pending: 0, separate: 0 };
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function contestId(event: Election, municipalityId: string) { return `${event.electionId}:${municipalityId}${event.officeId === '11' ? '' : ':' + event.officeId}`; }
export function contextFor(id: string, catalog: Catalog) {
 if (!/^\d{1,8}:(?:MG|\d{1,8})(?::\d{1,2})?$/.test(id)) return null;
 const [electionId, municipalityId, officeId = '11'] = id.split(':'); const event = catalog.events.find(e => e.electionId === electionId && e.officeId === officeId);
 if (!event || (!(event.statewide && municipalityId === 'MG') && !event.municipalityIds.includes(municipalityId))) return null; return { event, municipalityId };
}
export function readQuery(params: URLSearchParams): ElectoralQuery { return { contestId: (params.get('eleicao') || '').slice(0, 40), zone: (params.get('zona') || 'all').slice(0, 12), candidateIds: [...new Set(params.getAll('candidato'))].filter(id => /^\d{1,20}$/.test(id)).slice(0, 2), search: '', party: 'all' }; }
export function savedQueries(raw: string | null, catalog: Catalog): Saved[] {
 try { const items: unknown = JSON.parse(raw || '[]'); if (!Array.isArray(items)) return [];
 return items.slice(0, 50).flatMap((v: unknown) => { if (!v || typeof v !== 'object') return []; const x = v as Partial<Saved>, q = x.query;
 if (!q || typeof q.contestId !== 'string' || !contextFor(q.contestId, catalog) || typeof q.zone !== 'string' || !/^(all|\d{1,8})$/.test(q.zone) || !Array.isArray(q.candidateIds) || typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.savedAt !== 'string' || !Number.isFinite(Date.parse(x.savedAt)) || typeof x.datasetVersion !== 'string') return [];
 return [{ id: x.id.slice(0,80), name: x.name.slice(0,100), savedAt: x.savedAt, datasetVersion: x.datasetVersion, query: { contestId:q.contestId, zone:q.zone, candidateIds:[...new Set(q.candidateIds)].filter(id=>typeof id==='string'&&/^\d{1,20}$/.test(id)).slice(0,2), search:'', party:'all' } }]; }); } catch { return []; }
}
export function searchCandidates(entries: CandidateEntry[], catalog: Catalog, params: URLSearchParams) {
 const q=normal((params.get('q')||'').trim().slice(0,120)),year=params.get('ano')||'',office=params.get('cargo')||'',municipality=params.get('cidade')||'';
 const page=Math.max(1,Math.min(10000,Number.parseInt(params.get('pagina')||'1')||1)); if(q.length<2&&!year&&!office&&!municipality)return {items:[],total:0,page:1,pageSize:30};
 const events=new Set(catalog.events.filter(e=>(!year||String(e.year)===year)&&(!office||e.officeId===office)).map(e=>e.id));
 const found=entries.filter(c=>events.has(c.eventId)&&(!municipality||c.municipalityId===municipality||c.municipalityId==='MG')&&(!q||q.split(/\s+/).every(word=>normal(`${c.name} ${c.fullName} ${c.number} ${c.party}`).includes(word))));
 found.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')||a.eventId.localeCompare(b.eventId)||a.municipalityId.localeCompare(b.municipalityId));return {items:found.slice((page-1)*30,page*30),total:found.length,page,pageSize:30};
}
export function resultFor(bundle: Bundle,catalog: Catalog,input: ElectoralQuery): Result {
 const context=contextFor(input.contestId,catalog);if(!context||context.event.id!==bundle.event.id)throw Error('Eleição não encontrada.');const {event,municipalityId}=context;
 const zoneOptions=municipalityId==='MG'?[]:Object.keys(bundle.totals).filter(k=>k.startsWith(municipalityId+':')).map(k=>k.split(':')[1]).sort((a,b)=>+a-+b);
 if(input.zone!=='all'&&!zoneOptions.includes(input.zone))throw Error('Recorte indisponível.');
 const keys=new Set(Object.keys(bundle.totals).filter(k=>(municipalityId==='MG'||k.startsWith(municipalityId+':'))&&(input.zone==='all'||k.endsWith(':'+input.zone))));const totals={...EMPTY};
 for(const key of keys)for(const field of Object.keys(totals) as (keyof Counts)[])totals[field]+=bundle.totals[key][field];
 const candidates=bundle.candidates.filter(c=>event.statewide||c.municipalityId===municipalityId).map(({zones,...candidate})=>{let votes=0,recorded=0;for(const[key,values]of Object.entries(zones))if(keys.has(key)){votes+=values[0];recorded+=values[1];}return {...candidate,votes,recorded,percentage:totals.valid?votes/totals.valid*100:null,rank:0};}).sort((a,b)=>b.votes-a.votes||a.name.localeCompare(b.name,'pt-BR'));
 candidates.forEach((c,i)=>{c.rank=i&&c.votes===candidates[i-1].votes?candidates[i-1].rank:i+1;});
 const ids=[...new Set(input.candidateIds)].filter(id=>candidates.some(c=>c.id===id)).slice(0,2),query={...input,candidateIds:ids,search:'',party:'all'};const selected=ids.map(id=>bundle.candidates.find(c=>c.id===id)!);const areas=new Map<string,AreaResult>();
 if(selected.length&&input.zone==='all')for(const key of keys){const[mid,zone]=key.split(':'),id=municipalityId==='MG'?mid:zone;const area=areas.get(id)||{id,name:municipalityId==='MG'?bundle.municipalities[mid]:`Zona ${zone}`,total:0,votes:selected.map(()=>0)};area.total+=bundle.totals[key].valid;selected.forEach((c,i)=>{area.votes[i]+=c.zones[key]?.[0]||0;});areas.set(id,area);}
 return {event,query,municipalityId,municipality:municipalityId==='MG'?'Minas Gerais':bundle.municipalities[municipalityId],zoneOptions,totals,candidates,areas:[...areas.values()].sort((a,b)=>b.votes[0]-a.votes[0]||a.name.localeCompare(b.name,'pt-BR')),version:catalog.version};
}
