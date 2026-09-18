import {catalog,enrich,loadBundle,loadIndex} from '../../../analise-eleitoral/data-server';
import {contextFor,readQuery,resultFor,searchCandidates} from '../../../analise-eleitoral/elections';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){const p=new URL(request.url).searchParams;try{
 if(p.get('modo')==='busca')return Response.json(searchCandidates(await loadIndex(),catalog,p),{headers});
 if(!p.has('eleicao'))return Response.json(catalog,{headers});
 const query=readQuery(p),context=contextFor(query.contestId,catalog);if(!context)return Response.json({error:'Eleição não encontrada. Faça uma nova busca.'},{status:400,headers});
 const bundle=await loadBundle(context.event.id);let result;try{result=resultFor(bundle,catalog,query);}catch{return Response.json({error:'Esse recorte não está disponível. Escolha outro município ou zona.'},{status:400,headers});}
 return Response.json(await enrich(result),{headers});
 }catch(error){console.error('Electoral data unavailable',error instanceof Error?error.message:'read error');return Response.json({error:'Não foi possível carregar os dados. Tente novamente.'},{status:503,headers});}}
