import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import rawCatalog from './data/minas/catalog.json';
import type { Bundle, CandidateEntry, Catalog, Electorate, Profile, Result, Territory } from './elections';
export const catalog=rawCatalog as Catalog;
const bundles=new Map<string,Promise<Bundle>>(),shared=new Map<string,Promise<unknown>>();
const folder=path.join(process.cwd(),'app/analise-eleitoral/data/minas');
async function read<T>(name:string):Promise<T>{return JSON.parse(gunzipSync(await readFile(path.join(folder,name+'.json.gz'))).toString()) as T;}
function cached<T>(name:string){let p=shared.get(name);if(!p){p=read<T>(name);shared.set(name,p);p.catch(()=>shared.delete(name));}return p as Promise<T>;}
export function loadBundle(id:string){if(!catalog.events.some(e=>e.id===id))throw Error('Eleição indisponível.');let p=bundles.get(id);if(!p){p=read<Bundle>(id.replace(':','-'));bundles.set(id,p);p.catch(()=>bundles.delete(id));if(bundles.size>2)bundles.delete(bundles.keys().next().value!);}return p;}
export const loadIndex=()=>cached<CandidateEntry[]>('search');
type ElectorateFile=Omit<Electorate,'total'|'gender'|'age'|'education'>&{zones:Record<string,Pick<Electorate,'total'|'gender'|'age'|'education'>>};
export async function enrich(result:Result){
 const[profiles,electorate,territories]=await Promise.all([cached<Record<string,Profile>>(`profiles-${result.event.year}`),cached<ElectorateFile>(`electorate-${result.event.year}`),cached<Record<string,Territory>>('territories')]);
 for(const c of result.candidates)if(result.query.candidateIds.includes(c.id))c.profile=profiles[result.event.electionId+':'+c.id];
 const combined:Electorate={total:0,gender:{},age:{},education:{},year:electorate.year,generatedAt:electorate.generatedAt,source:electorate.source};
 for(const[key,row]of Object.entries(electorate.zones)){const[mid,zone]=key.split(':');if((result.municipalityId!=='MG'&&mid!==result.municipalityId)||(result.query.zone!=='all'&&zone!==result.query.zone))continue;combined.total+=row.total;for(const dim of ['gender','age','education'] as const)for(const[label,n]of Object.entries(row[dim]))combined[dim][label]=(combined[dim][label]||0)+n;}
 result.electorate=combined;result.territory=territories[result.municipalityId];return result;
}
