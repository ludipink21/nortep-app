"""Reproducible MG public electoral data (2022/2024) and IBGE context.
Input: official TSE ZIP files detalhe-, votacao-, candidatos-, eleitorado-ANO.zip;
IBGE API responses ibge-municipios.json, ibge-contexto.json, ibge-estado.json.
Run: python scripts/import-minas-elections.py --archives /path/to/sources
"""
import argparse,csv,gzip,hashlib,io,json,zipfile,unicodedata
from pathlib import Path
from collections import defaultdict
from datetime import datetime,timezone
OFFICES={'1':'Presidente','3':'Governador','5':'Senador','6':'Deputado federal','7':'Deputado estadual','11':'Prefeito','13':'Vereador'}
FIELDS={'electorate':'QT_APTOS','turnout':'QT_COMPARECIMENTO','abstentions':'QT_ABSTENCOES','valid':'QT_TOTAL_VOTOS_VALIDOS','nominalValid':'QT_VOTOS_NOMINAIS_VALIDOS','partyValid':'QT_TOTAL_VOTOS_LEG_VALIDOS','blank':'QT_VOTOS_BRANCOS','nullVotes':'QT_TOTAL_VOTOS_NULOS','annulled':'QT_TOTAL_VOTOS_ANULADOS','pending':'QT_TOTAL_VOTOS_ANUL_SUBJUD','separate':'QT_VOTOS_ANULADOS_APU_SEP'}
BASE='https://cdn.tse.jus.br/estatistica/sead/odsele/'
def rows(path,prefix,year):
 with zipfile.ZipFile(path) as z:
  for region in (['MG','BR'] if year==2022 else ['MG']):
   with io.TextIOWrapper(z.open(f'{prefix}_{year}_{region}.csv'),encoding='latin1') as f:
    for r in csv.DictReader(f,delimiter=';'):
     if r['SG_UF'] in ['MG','BR'] and r['CD_TIPO_ELEICAO']=='2' and r['CD_CARGO'] in OFFICES:yield r

def encoded(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode()
def compressed(path,obj):path.write_bytes(gzip.compress(encoded(obj),compresslevel=9,mtime=0))
def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def main(root,out):
 out.mkdir(parents=True,exist_ok=True);events={};municipalities={};generated=set();hashes={};search=[];files=[]
 for year in [2022,2024]:
  bundles={};seen=set();profiles={}
  for typ,prefix in [('detalhe','detalhe_votacao_munzona'),('votacao','votacao_candidato_munzona'),('candidatos','consulta_cand'),('eleitorado','perfil_eleitorado')]:
   hashes[f'{typ}-{year}']=digest(root/f'{typ}-{year}.zip');files.append(BASE+prefix+f'/{prefix}_{year}.zip')
  for r in rows(root/f'candidatos-{year}.zip','consulta_cand',year):
   fields={'gender':'DS_GENERO','education':'DS_GRAU_INSTRUCAO','race':'DS_COR_RACA','occupation':'DS_OCUPACAO','birthState':'SG_UF_NASCIMENTO','coalition':'NM_COLIGACAO','coalitionParties':'DS_COMPOSICAO_COLIGACAO','federation':'NM_FEDERACAO','registration':'DS_SITUACAO_CANDIDATURA'}
   p={k:(r[v] if r[v] and not r[v].startswith('#') else None) for k,v in fields.items()};p.update(sourceYear=year,generatedAt=r['DT_GERACAO'],ageAtElection=None)
   try:
    born=datetime.strptime(r['DT_NASCIMENTO'],'%d/%m/%Y');day=datetime.strptime(r['DT_ELEICAO'],'%d/%m/%Y');p['ageAtElection']=day.year-born.year-((day.month,day.day)<(born.month,born.day))
   except ValueError:pass
   if p['ageAtElection'] is not None and not 16<=p['ageAtElection']<120:p['ageAtElection']=None;p['ageQuality']='Data de nascimento inconsistente na origem'
   profiles[r['CD_ELEICAO']+':'+r['SQ_CANDIDATO']]=p
  compressed(out/f'profiles-{year}.json.gz',profiles)
  for r in rows(root/f'detalhe-{year}.zip','detalhe_votacao_munzona',year):
   if r['SG_UF']!='MG':continue
   eid=r['CD_ELEICAO']+':'+r['CD_CARGO'];mid=r['CD_MUNICIPIO'];key=mid+':'+r['NR_ZONA'];unique=(eid,key,r['ST_VOTO_EM_TRANSITO']);assert unique not in seen,unique;seen.add(unique)
   municipalities[mid]=r['NM_MUNICIPIO'];generated.add(f"{r['DT_GERACAO']} {r['HH_GERACAO']}")
   event={'id':eid,'electionId':r['CD_ELEICAO'],'year':year,'round':int(r['NR_TURNO']),'office':OFFICES[r['CD_CARGO']],'officeId':r['CD_CARGO'],'statewide':year==2022}
   b=bundles.setdefault(eid,{'event':event,'municipalities':{},'totals':{},'candidates':{}});b['municipalities'][mid]=r['NM_MUNICIPIO'];counts={k:int(r[v]) for k,v in FIELDS.items()}
   assert min(counts.values())>=0;assert counts['electorate']==counts['turnout']+counts['abstentions'];assert counts['valid']==counts['nominalValid']+counts['partyValid'];assert counts['turnout']==sum(counts[k] for k in ['valid','blank','nullVotes','annulled','pending','separate'])
   target=b['totals'].setdefault(key,{k:0 for k in FIELDS})
   for k,v in counts.items():target[k]+=v
  seen=set()
  for r in rows(root/f'votacao-{year}.zip','votacao_candidato_munzona',year):
   if r['SG_UF']!='MG':continue
   eid=r['CD_ELEICAO']+':'+r['CD_CARGO'];mid=r['CD_MUNICIPIO'];zone=mid+':'+r['NR_ZONA'];cid=r['SQ_CANDIDATO'];b=bundles[eid];unique=(eid,zone,cid,r['NM_TIPO_DESTINACAO_VOTOS'],r['ST_VOTO_EM_TRANSITO']);assert unique not in seen,unique;seen.add(unique)
   c=b['candidates'].setdefault(cid,{'id':cid,'name':r['NM_URNA_CANDIDATO'],'fullName':r['NM_CANDIDATO'],'number':r['NR_CANDIDATO'],'party':r['SG_PARTIDO'],'status':r['DS_SIT_TOT_TURNO'],'municipalityId':'MG' if year==2022 else mid,'zones':{}})
   valid=int(r['QT_VOTOS_NOMINAIS_VALIDOS']);recorded=int(r['QT_VOTOS_NOMINAIS']);assert 0<=valid<=recorded
   if valid or recorded:z=c['zones'].setdefault(zone,[0,0]);z[0]+=valid;z[1]+=recorded
  for eid,b in bundles.items():
   check=defaultdict(int)
   for c in b['candidates'].values():
    for z,v in c['zones'].items():check[z]+=v[0]
   for z,t in b['totals'].items():assert check[z]==t['nominalValid'],(eid,z,check[z],t['nominalValid'])
   b['candidates']=list(b['candidates'].values())
   for c in b['candidates']:search.append({**{k:v for k,v in c.items() if k not in ['zones','status']},'eventId':eid,'votes':sum(v[0] for v in c['zones'].values())})
   events[eid]={**b['event'],'municipalityIds':sorted(b['municipalities'])};path=out/(eid.replace(':','-')+'.json.gz');compressed(path,b);print(eid,len(b['candidates']),path.stat().st_size,flush=True)
  zones={};dates=set()
  with zipfile.ZipFile(root/f'eleitorado-{year}.zip') as z:
   with io.TextIOWrapper(z.open(f'perfil_eleitorado_{year}_MG.csv'),encoding='latin1') as f:
    for r in csv.DictReader(f,delimiter=';'):
     assert r['SG_UF']=='MG' and r['AA_ELEICAO']==str(year)
     key=r['CD_MUNICIPIO']+':'+r['NR_ZONA'];t=zones.setdefault(key,{'total':0,'gender':{},'age':{},'education':{}});n=int(r['QT_ELEITORES']);assert n>=0;t['total']+=n;dates.add(r['DT_GERACAO'])
     for dim,col in [('gender','DS_GENERO'),('age','DS_FAIXA_ETARIA'),('education','DS_GRAU_ESCOLARIDADE')]:
      label=r[col] if not r[col].startswith('#') else 'Não informado';t[dim][label]=t[dim].get(label,0)+n
  for t in zones.values():
   for dim in ['gender','age','education']:assert sum(t[dim].values())==t['total']
  compressed(out/f'electorate-{year}.json.gz',{'year':year,'generatedAt':sorted(dates),'source':f'https://dadosabertos.tse.jus.br/dataset/eleitorado-{year}','zones':zones});print('electorate',year,len(zones),flush=True)
 # Match exact normalized MG names; documented orthographic differences only.
 norm=lambda s:''.join(c for c in unicodedata.normalize('NFD',s.upper()) if c.isalnum())
 alias={'41092':'Barão do Monte Alto','44571':'Dona Euzébia','53031':'São Tomé das Letras'}
 names={norm(x['nome']):x for x in json.loads((root/'ibge-municipios.json').read_text())};cross={};indicators={};territories={}
 for filename in ['ibge-municipios.json','ibge-contexto.json','ibge-estado.json']:hashes[filename]=digest(root/filename)
 for filename in ['ibge-contexto.json','ibge-estado.json']:
  for v in json.loads((root/filename).read_text()):
   for series in v['resultados'][0]['series']:
    record=indicators.setdefault(series['localidade']['id'],{'name':series['localidade']['nome']});raw=series['serie']['2022'];record[v['id']]=float(raw) if raw not in ['-','..','...','X'] else None
 for mid,name in municipalities.items():
  match=names.get(norm(alias.get(mid,name)));assert match,(mid,name);cross[mid]=str(match['id'])
 assert len(cross)==853 and len(set(cross.values()))==853
 for tse,ibge in {**cross,'MG':'31'}.items():
  r=indicators[ibge];territories[tse]={'ibgeId':ibge,'name':r['name'],'population':r['93'],'area':r['6318'],'density':r['614'],'year':2022,'source':'https://sidra.ibge.gov.br/tabela/4714','retrievedAt':datetime.now(timezone.utc).isoformat()}
 compressed(out/'territories.json.gz',territories);(out/'municipality-crosswalk.json').write_bytes(encoded({'source':'https://servicodados.ibge.gov.br/api/v1/localidades/estados/31/municipios','aliases':alias,'tseToIbge':cross}))
 catalog={'schemaVersion':2,'version':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16],'coverage':'Minas Gerais · eleições ordinárias de 2022 e 2024 · 7 cargos','source':{'name':'Tribunal Superior Eleitoral','url':'https://dadosabertos.tse.jus.br/dataset/resultados-2022','urls':['https://dadosabertos.tse.jus.br/dataset/resultados-2022','https://dadosabertos.tse.jus.br/dataset/resultados-2024'],'generatedAt':sorted(generated),'files':files,'sha256':hashes},'municipalities':[{'id':k,'name':v} for k,v in sorted(municipalities.items(),key=lambda kv:kv[1])],'events':list(events.values()),'candidateEntries':len(search)}
 (out/'catalog.json').write_bytes(encoded(catalog)+b'\n');compressed(out/'search.json.gz',search);print('Catalog:',len(municipalities),len(search),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--archives',type=Path,required=True);p.add_argument('--output',type=Path,default=Path('app/analise-eleitoral/data/minas'));a=p.parse_args();main(a.archives,a.output)
