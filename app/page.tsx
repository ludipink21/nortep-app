"use client";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components */

import { useEffect, useState } from "react";

type View = "inicio" | "pesquisas" | "equipe" | "resultados" | "ecossistema" | "portal" | "entrevista" | "obrigado";

const pesquisas = [
  { nome: "Betim: território e escolhas 2026", status: "Piloto interno", feitas: 0, meta: 100, equipe: 5 },
  { nome: "Avaliação dos serviços públicos", status: "Em campo", feitas: 312, meta: 500, equipe: 12 },
  { nome: "Prioridades da comunidade", status: "Rascunho", feitas: 0, meta: 400, equipe: 0 },
];

const pessoas = [
  ["Marcos Lima", "Zona Norte", 42, "Sincronizado"],
  ["Juliana Alves", "Centro", 38, "Sincronizado"],
  ["Rafael Souza", "Jardim União", 27, "6 pendentes"],
  ["Camila Rocha", "Zona Sul", 35, "Sincronizado"],
];

export default function Home() {
  const [view, setView] = useState<View>("inicio");
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [passo, setPasso] = useState(1);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    const rascunho = localStorage.getItem("nortep-rascunho");
    const video = localStorage.getItem("nortep-video-agradecimento");
    if (rascunho) setRespostas(JSON.parse(rascunho));
    if (video) setVideoUrl(video);
  }, []);
  useEffect(() => localStorage.setItem("nortep-rascunho", JSON.stringify(respostas)), [respostas]);
  useEffect(() => localStorage.setItem("nortep-video-agradecimento", videoUrl), [videoUrl]);

  const aviso = (texto: string) => {
    setToast(texto);
    setTimeout(() => setToast(""), 2600);
  };
  const ir = (destino: View) => {
    setView(destino);
    setMenu(false);
  };
  const campo = view === "portal" || view === "entrevista" || view === "obrigado";
  const titulos: Record<View, string> = {
    inicio: "Visão geral",
    pesquisas: "Pesquisas",
    equipe: "Pesquisadores",
    resultados: "Resultados",
    ecossistema: "Ecossistema NorteP",
    portal: "Minhas pesquisas",
    entrevista: "Nova entrevista",
    obrigado: "Entrevista concluída",
  };

  return <div className={campo ? "app app-campo" : "app"}>
    {!campo && <aside className={menu ? "open" : ""}>
      <div className="logo"><i>NP</i><span>NorteP <b>Pesquisa</b></span></div>
      <nav>{[
        ["inicio", "⌂", "Visão geral"],
        ["pesquisas", "▤", "Pesquisas"],
        ["equipe", "♙", "Pesquisadores"],
        ["resultados", "◫", "Resultados"],
        ["ecossistema", "◇", "Ecossistema NorteP"],
      ].map(item => <button className={view === item[0] ? "active" : ""} onClick={() => ir(item[0] as View)} key={item[0]}><i>{item[1]}</i>{item[2]}</button>)}</nav>
      <div className="coleta"><b>● Coleta em andamento</b><small>798 de 1.200 entrevistas</small><div><i /></div></div>
      <div className="perfil"><i>AM</i><span><b>Ana Martins</b><small>Administradora</small></span><b>⋮</b></div>
    </aside>}

    <main>
      <header>
        {!campo && <button className="hamb" onClick={() => setMenu(!menu)}>☰</button>}
        <div className={campo ? "marca-campo" : ""}>
          <small>{campo ? "NORTEP PESQUISA · ÁREA DO PESQUISADOR" : "NORTEP · DADOS QUE APROXIMAM"}</small>
          <h1>{titulos[view]}</h1>
        </div>
        <section>
          {campo && <button className="sync" onClick={() => setOffline(!offline)}>● {offline ? "Modo offline" : "Sincronizado"}</button>}
          {!campo && <button className="preview-field" onClick={() => ir("portal")}>Ver área do pesquisador →</button>}
          {campo && <button className="sair-campo" onClick={() => ir("inicio")}>Sair da prévia</button>}
        </section>
      </header>

      <div className={campo ? "content campo-content" : "content"}>
        {view === "inicio" && <Inicio ir={ir} aviso={aviso} />}
        {view === "pesquisas" && <Pesquisas ir={ir} aviso={aviso} videoUrl={videoUrl} setVideoUrl={setVideoUrl} />}
        {view === "equipe" && <Equipe aviso={aviso} />}
        {view === "resultados" && <Resultados aviso={aviso} />}
        {view === "ecossistema" && <Ecossistema />}
        {view === "portal" && <Portal iniciar={() => { setPasso(1); ir("entrevista"); }} />}
        {view === "entrevista" && <Entrevista passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={() => ir("obrigado")} cancelar={() => {
          localStorage.removeItem("nortep-rascunho");
          setRespostas({});
          ir("portal");
          aviso("Entrevista encerrada sem registrar respostas");
        }} />}
        {view === "obrigado" && <Obrigado nome={respostas.nome} videoUrl={videoUrl} concluir={() => {
          localStorage.removeItem("nortep-rascunho");
          setRespostas({});
          ir("portal");
          aviso("Entrevista ENT-2026-000799 sincronizada");
        }} />}
      </div>
    </main>
    {menu && <div className="scrim" onClick={() => setMenu(false)} />}
    {toast && <div className="toast">✓ {toast}</div>}
  </div>;
}

function Inicio({ ir, aviso }: { ir: (v: View) => void; aviso: (t: string) => void }) {
  return <>
    <div className="boas"><div><small>QUARTA-FEIRA, 22 DE JULHO</small><h2>Bom dia, Ana. <span>O campo está avançando.</span></h2><p>Acompanhe o ritmo das equipes e veja onde sua atenção é mais necessária.</p></div><button onClick={() => aviso("Dados atualizados agora")}>↻ Atualizar dados</button></div>
    <div className="metricas"><Metrica c="verde" i="✓" t="Entrevistas realizadas" v="798" s="+12% nesta semana" /><Metrica c="laranja" i="◎" t="Meta geral" v="66,5%" s="402 entrevistas restantes" /><Metrica c="roxo" i="♙" t="Pesquisadores ativos" v="27" s="de 32 cadastrados" /><Metrica c="azul" i="⌁" t="Pendentes de sincronização" v="14" s="em 6 dispositivos" /></div>
    <div className="duas"><div className="painel"><Topo sup="RITMO DE COLETA" titulo="Entrevistas nos últimos 7 dias" /><div className="grafico">{[58, 43, 72, 55, 84, 94, 68].map((h, i) => <div key={i}><b>{[78, 56, 96, 72, 108, 116, 88][i]}</b><i style={{ height: h + "%" }} /><small>{["QUI", "SEX", "SÁB", "DOM", "SEG", "TER", "HOJE"][i]}</small></div>)}</div></div><div className="painel"><Topo sup="PRECISA DE ATENÇÃO" titulo="Alertas do campo" />{[["5 entrevistas muito rápidas", "Duração abaixo de 3 minutos"], ["14 respostas não sincronizadas", "Há mais de 8 horas"], ["Meta baixa no Jardim União", "Apenas 31% concluída"]].map((a, i) => <div className="alerta" key={a[0]}><i className={"a" + i}>!</i><span><b>{a[0]}</b><small>{a[1]}</small></span><button>Revisar →</button></div>)}</div></div>
    <div className="painel lista"><div className="topo"><div><small>PESQUISAS ATIVAS</small><h3>Acompanhamento por pesquisa</h3></div><button onClick={() => ir("pesquisas")}>Ver todas →</button></div>{pesquisas.slice(0, 2).map(p => <LinhaPesquisa p={p} ir={ir} key={p.nome} />)}</div>
  </>;
}

function Metrica({ c, i, t, v, s }: { c: string; i: string; t: string; v: string; s: string }) { return <div className="metrica"><i className={c}>{i}</i><span><small>{t}</small><b>{v}</b><em>{s}</em></span></div>; }
function Topo({ sup, titulo }: { sup: string; titulo: string }) { return <div className="topo"><div><small>{sup}</small><h3>{titulo}</h3></div><button>•••</button></div>; }
function LinhaPesquisa({ p, ir }: { p: typeof pesquisas[0]; ir: (v: View) => void }) { return <div className="linha-pesquisa"><i>▤</i><span><b>{p.nome}</b><small>● {p.status} · {p.equipe} pesquisadores</small></span><div><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><strong>{Math.round(p.feitas / p.meta * 100)}%</strong><button onClick={() => ir("resultados")}>Ver detalhes</button></div>; }

function Pesquisas({ ir, aviso, videoUrl, setVideoUrl }: { ir: (v: View) => void; aviso: (t: string) => void; videoUrl: string; setVideoUrl: (v: string) => void }) {
  const configurarVideo = () => {
    const valor = window.prompt("Cole o link de um vídeo do YouTube. Deixe vazio para remover.", videoUrl);
    if (valor !== null) {
      setVideoUrl(valor.trim());
      aviso(valor.trim() ? "Vídeo de agradecimento configurado" : "Vídeo removido desta pesquisa");
    }
  };
  return <>
    <Cabecalho titulo="Pesquisas de campo" sub="Crie, edite e acompanhe todos os questionários." botao="＋ Criar pesquisa" acao={() => aviso("Novo questionário criado como rascunho")} />
    <Filtros busca="Buscar pesquisa..." />
    <div className="cards">{pesquisas.map((p, i) => <article key={p.nome}><div><label className={p.status === "Em campo" ? "status" : "rascunho"}>{p.status}</label><button>•••</button></div><h3>{p.nome}</h3><p>{i === 0 ? "Diagnóstico territorial, serviços públicos, lideranças e intenção de voto nas seis escolhas de 2026." : i === 1 ? "Avaliação da saúde, educação, limpeza e transporte público." : "Mapeamento das principais demandas dos moradores."}</p>{i === 0 && <><div className="aviso-piloto"><b>Rascunho técnico</b><small>Validar amostra, questionário e regras eleitorais antes de divulgar resultados.</small></div><div className="video-status"><i>▶</i><span><b>Vídeo de agradecimento</b><small>{videoUrl ? "Link do YouTube configurado" : "Opcional · ainda não configurado"}</small></span></div></>}<section><span><b>{p.feitas}</b> respostas</span><span><b>{p.equipe}</b> pesquisadores</span><span><b>{i === 0 ? 39 : i === 2 ? 18 : 24}</b> perguntas</span></section><div className="progresso"><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><footer>{i === 0 && <button onClick={configurarVideo}>▶ Vídeo</button>}<button onClick={() => aviso("Editor de perguntas aberto")}>Editar</button><button onClick={() => i === 0 ? ir("portal") : i === 2 ? aviso("Pesquisa liberada para a equipe") : ir("resultados")}>{i === 0 ? "Testar" : i === 2 ? "Liberar" : "Acompanhar"}</button></footer></article>)}</div>
  </>;
}

function Equipe({ aviso }: { aviso: (t: string) => void }) { return <><Cabecalho titulo="Equipe de pesquisadores" sub="32 cadastrados · 27 ativos hoje" botao="＋ Cadastrar pesquisador" acao={() => aviso("Convite de pesquisador preparado")} /><div className="painel tabela"><Filtros busca="Buscar por nome ou região..." /><div className="tr cab"><span>Pesquisador</span><span>Região</span><span>Hoje</span><span>Sincronização</span></div>{pessoas.map(p => <div className="tr" key={p[0] as string}><span className="pessoa"><i>{String(p[0]).split(" ").map(x => x[0]).join("")}</i><b>{p[0]}</b></span><span>{p[1]}</span><b>{p[2]}</b><span className={String(p[3]).includes("pendentes") ? "pendente" : "ok"}>● {p[3]}</span></div>)}</div></>; }

function Resultados({ aviso }: { aviso: (t: string) => void }) { return <><Cabecalho titulo="Resultados" sub="Melhorias para o bairro · 486 entrevistas" botao="⇩ Exportar CSV" acao={() => aviso("Arquivo CSV preparado")} /><Filtros /><div className="duas resultados"><div className="painel"><Topo sup="AVALIAÇÃO GERAL" titulo="Como você avalia os serviços públicos?" /><div className="donut"><div><b>7,4</b><small>média</small></div><section>{[["Ótimo", "22%"], ["Bom", "41%"], ["Regular", "25%"], ["Ruim/Péssimo", "12%"]].map((x, i) => <span key={x[0]}><i className={"l" + i} />{x[0]} <b>{x[1]}</b></span>)}</section></div></div><div className="painel"><Topo sup="PRINCIPAL PRIORIDADE" titulo="O que deveria melhorar primeiro?" />{[["Saúde", 78], ["Segurança", 64], ["Transporte", 48], ["Educação", 35]].map(x => <div className="barra" key={x[0] as string}><span>{x[0]}</span><em><i style={{ width: x[1] + "%" }} /></em><b>{x[1]}%</b></div>)}</div></div></>; }

function Ecossistema() {
  const produtos = [
    ["NorteP Pesquisa", "Ativo", "Pesquisa de campo, coleta e resultados."],
    ["NorteP Comunicação", "Em breve", "Comunicação política e relacionamento."],
    ["NorteP Gestão", "Em breve", "Operação de campanha e mandato."],
    ["NorteP Auditoria", "Em breve", "Controle, conferência e acompanhamento."],
    ["NorteP Financeiro", "Futuro", "Gestão financeira em ambiente separado."],
  ];
  return <><Cabecalho titulo="Ecossistema NorteP" sub="Política, povo e pesquisa em uma operação integrada." botao="Dados que aproximam" acao={() => undefined} /><div className="ecos-grid">{produtos.map((p, i) => <article className={i === 0 ? "eco ativo" : "eco"} key={p[0]}><i>{i === 0 ? "NP" : "◇"}</i><label>{p[1]}</label><h3>{p[0]}</h3><p>{p[2]}</p>{i === 0 ? <button>Produto atual</button> : <button disabled>Planejado</button>}</article>)}</div></>;
}

function Portal({ iniciar }: { iniciar: () => void }) {
  return <div className="portal"><div className="portal-boas"><span><small>OLÁ, MARCOS</small><h2>Pronto para testar o novo questionário?</h2><p>Você vê somente a pesquisa liberada pela coordenação.</p></span><div className="campo-metricas"><i><b>0</b><small>hoje</small></i><i><b>0</b><small>no piloto</small></i><i><b>0</b><small>pendentes</small></i></div></div><article className="pesquisa-atribuida"><div className="pesquisa-capa"><span>PILOTO INTERNO</span><i><b>N</b>P</i></div><div className="pesquisa-info"><small>RASCUNHO PROFISSIONAL · BETIM</small><h3>Território e escolhas 2026</h3><p>39 perguntas com desvios · duração estimada de 10 a 12 minutos</p><div className="instrucoes"><span>✓ Leia exatamente como está escrito</span><span>✓ Não sugira respostas</span><span>✓ Consentimento antes da coleta</span></div><div className="nota-eleitoral"><b>Uso de teste</b><span>A lista oficial de candidaturas e a metodologia amostral ainda precisam de validação antes do campo real.</span></div><button className="primary" onClick={iniciar}>＋ Iniciar entrevista de teste</button></div></article><div className="painel ajuda-campo"><span><b>Dúvida durante o teste?</b><small>Não improvise a pergunta. Anote a ocorrência e fale com a coordenação.</small></span><button>Falar com a equipe</button></div></div>;
}

function Cabecalho({ titulo, sub, botao, acao }: { titulo: string; sub: string; botao: string; acao: () => void }) { return <div className="cabecalho"><div><h2>{titulo}</h2><p>{sub}</p></div><button className="primary" onClick={acao}>{botao}</button></div>; }
function Filtros({ busca }: { busca?: string }) { return <div className="filtros">{busca && <input placeholder={"⌕  " + busca} />}<button>Todos os status⌄</button><button>Mais recentes⌄</button></div>; }

function Entrevista({ passo, setPasso, r, setR, fim, cancelar }: { passo: number; setPasso: (n: number) => void; r: Record<string, string>; setR: (v: Record<string, string>) => void; fim: () => void; cancelar: () => void }) {
  const set = (k: string, v: string) => setR({ ...r, [k]: v });
  const [geoStatus, setGeoStatus] = useState("");
  const Opcoes = ({ itens, campo, compacta = false }: { itens: string[]; campo: string; compacta?: boolean }) => <div className={compacta ? "opcoes compactas" : "opcoes"}>{itens.map(x => <button type="button" aria-pressed={r[campo] === x} className={r[campo] === x ? "selecionado" : ""} onClick={() => set(campo, x)} key={x}>{x}</button>)}</div>;
  const Multiplas = ({ itens, campo, max = 3 }: { itens: string[]; campo: string; max?: number }) => {
    const atuais = (r[campo] || "").split("||").filter(Boolean);
    const alternar = (item: string) => {
      const novas = atuais.includes(item) ? atuais.filter(x => x !== item) : atuais.length < max ? [...atuais, item] : atuais;
      set(campo, novas.join("||"));
    };
    return <div className="opcoes multipla">{itens.map(x => <button type="button" aria-pressed={atuais.includes(x)} className={atuais.includes(x) ? "selecionado" : ""} onClick={() => alternar(x)} key={x}><i>{atuais.includes(x) ? "✓" : "+"}</i>{x}</button>)}</div>;
  };
  const Intencao = ({ campo, titulo, ajuda }: { campo: string; titulo: string; ajuda?: string }) => <div className="intencao"><label>{titulo} *</label>{ajuda && <small>{ajuda}</small>}<input value={r[campo] || ""} onChange={e => set(campo, e.target.value)} placeholder="Registre a resposta espontânea" /><Opcoes campo={campo} compacta itens={["Não sabe", "Branco/nulo", "Não pretende votar"]} /></div>;
  const capturarLocalizacao = () => {
    if (!navigator.geolocation) return setGeoStatus("Localização indisponível neste aparelho.");
    setGeoStatus("Aguardando autorização do aparelho…");
    navigator.geolocation.getCurrentPosition(pos => {
      setR({ ...r, latitude: pos.coords.latitude.toFixed(3), longitude: pos.coords.longitude.toFixed(3), geoHorario: new Date().toISOString() });
      setGeoStatus("Ponto aproximado registrado com sucesso.");
    }, () => setGeoStatus("Não foi possível registrar. Continue pelo bairro informado."), { enableHighAccuracy: false, timeout: 10000 });
  };
  const recebeContato = r.interesse && r.interesse !== "Não desejo receber contato";
  const inelegivel = r.consentirPesquisa === "Não aceito participar" || r.eleitorBetim === "Não" || r.idadeMinima === "Não";
  const obrigatorios: Record<number, boolean> = {
    1: r.consentirPesquisa === "Sim, aceito participar" && r.idadeMinima === "Sim" && r.eleitorBetim === "Sim",
    2: Boolean(r.bairro && r.tempoMoradia && r.prioridadesBairro),
    3: Boolean(r.direcaoCidade && r.avaliacaoPrefeitura && r.prioridadeCidade),
    4: Boolean(r.reconhecimentoVinicius && r.reconhecimentoOlavo),
    5: ["votoFederal", "votoEstadual", "votoSenador1", "votoSenador2", "votoGovernador", "votoPresidente"].every(k => Boolean(r[k])),
    6: Boolean(r.idade && r.genero && r.escolaridade && r.renda),
    7: Boolean(r.interesse) && (!recebeContato || Boolean(r.canal && r.consentimentoContato === "sim" && (r.whatsapp || r.email))),
  };
  const nomes = Number((r.codigo || "ENT-2026-000799").slice(-1)) % 2 === 0 ? ["Dr. Vinícius", "Olavo Keesen"] : ["Olavo Keesen", "Dr. Vinícius"];
  const blocoNome = (nome: string) => {
    const vinicius = nome === "Dr. Vinícius";
    const chave = vinicius ? "Vinicius" : "Olavo";
    const reconhece = r[`reconhecimento${chave}`] && r[`reconhecimento${chave}`] !== "Nunca ouviu falar";
    const atendido = r.atendimentoVinicius?.startsWith("Sim");
    return <section className="bloco-nome" key={nome}><span className="nome-publico">NOME PÚBLICO · ORDEM ALTERNADA</span><h4>{nome}</h4><label>Antes desta entrevista, você já tinha ouvido falar em {nome}? *</label><Opcoes campo={`reconhecimento${chave}`} itens={["Nunca ouviu falar", "Conhece só de nome", "Conhece um pouco o trabalho", "Conhece bem o trabalho"]} />{reconhece && <><label>De modo geral, qual é a sua opinião sobre {nome}?</label><Opcoes campo={`opiniao${chave}`} itens={["Muito positiva", "Positiva", "Nem positiva nem negativa", "Negativa", "Muito negativa", "Não sabe avaliar"]} /></>}{vinicius && reconhece && <><label>Você já foi atendido pessoalmente pelo Dr. Vinícius?</label><p className="instrucao">Não pergunte diagnóstico, doença ou tratamento.</p><Opcoes campo="atendimentoVinicius" itens={["Sim, em UBS/posto público de Betim", "Sim, em outro atendimento", "Não", "Não se lembra / prefere não informar"]} />{atendido && <><label>Como você avalia somente aquele atendimento?</label><Opcoes campo="avaliacaoAtendimentoVinicius" itens={["Ótimo", "Bom", "Regular", "Ruim", "Péssimo", "Não se lembra"]} /></>}</>}</section>;
  };
  return <div className="entrevista"><div className="entrevista-topo"><div><small>BETIM · TERRITÓRIO E ESCOLHAS 2026</small><h2>Entrevista <span>ENT-2026-000799</span></h2></div><label>✓ Rascunho salvo neste dispositivo</label></div><div className="passos">{["Consentimento", "Território", "Gestão", "Lideranças", "6 escolhas", "Perfil", "Contato"].map((x, i) => <div className={i + 1 <= passo ? "feito" : ""} key={x}><i>{i + 1 < passo ? "✓" : i + 1}</i><span>{x}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE 7 · PILOTO INTERNO</small>
    {passo === 1 && <><h3>Convite e autorização</h3><div className="leitura"><b>LEIA AO ENTREVISTADO</b><p>“Olá. Somos da NorteP Pesquisa. Estamos realizando um estudo sobre Betim, serviços públicos e escolhas eleitorais. A participação é voluntária, dura cerca de 10 minutos e você pode parar a qualquer momento. Suas opiniões políticas são dados sensíveis e serão analisadas de forma agrupada. Nome e contato não são necessários para responder.”</p></div><label>A pessoa tem 16 anos ou mais? *</label><Opcoes campo="idadeMinima" itens={["Sim", "Não"]} /><label>Mora em Betim e está apta a votar no município? *</label><Opcoes campo="eleitorBetim" itens={["Sim", "Não", "Não sabe informar"]} /><label>Após ouvir a explicação, aceita participar? *</label><Opcoes campo="consentirPesquisa" itens={["Sim, aceito participar", "Não aceito participar"]} />{inelegivel && <div className="encerrar"><b>Não prossiga com o questionário.</b><span>Agradeça e encerre sem salvar respostas.</span><button onClick={cancelar}>Encerrar sem registrar</button></div>}</>}
    {passo === 2 && <><h3>Relação com o território</h3><p className="instrucao">Comece pelo cotidiano. Ainda não mencione políticos ou eleições.</p><label>Bairro onde a pessoa mora *</label><input value={r.bairro || ""} onChange={e => set("bairro", e.target.value)} placeholder="Digite e selecione o bairro na versão final" /><label>Há quanto tempo mora em Betim? *</label><Opcoes campo="tempoMoradia" itens={["Menos de 1 ano", "1 a 5 anos", "6 a 10 anos", "11 a 20 anos", "Mais de 20 anos", "Desde que nasceu"]} /><label>Na sua opinião, qual é hoje o principal problema do seu bairro?</label><textarea value={r.problemaBairro || ""} onChange={e => set("problemaBairro", e.target.value)} placeholder="Registre sem resumir ou interpretar" /><label>Quais três áreas deveriam receber mais atenção no seu bairro? * <small>Selecione até 3</small></label><Multiplas campo="prioridadesBairro" itens={["Saúde", "Educação", "Segurança", "Transporte e trânsito", "Limpeza urbana", "Iluminação", "Asfalto e vias", "Moradia", "Emprego e renda", "Lazer e cultura", "Assistência social", "Outra"]} /><label>Autoriza registrar a localização aproximada do ponto desta entrevista?</label><Opcoes campo="autorizaGeo" itens={["Sim, autoriza", "Não autoriza"]} />{r.autorizaGeo === "Sim, autoriza" && <div className="geo"><button type="button" onClick={capturarLocalizacao}>◎ Registrar ponto aproximado</button><span>{geoStatus || "O aparelho solicitará permissão. O mapa deve usar acesso restrito."}</span>{r.latitude && <b>{r.latitude}, {r.longitude}</b>}</div>}</>}
    {passo === 3 && <><h3>Cidade, prefeitura e prioridades</h3><label>De modo geral, Betim está indo na direção certa ou errada? *</label><Opcoes campo="direcaoCidade" itens={["Direção certa", "Direção errada", "Nem certa nem errada", "Não sabe"]} /><label>Como você avalia a administração da Prefeitura de Betim? *</label><Opcoes campo="avaliacaoPrefeitura" itens={["Ótima", "Boa", "Regular", "Ruim", "Péssima", "Não sabe avaliar"]} /><label>Qual serviço municipal mais precisa melhorar?</label><Opcoes campo="servicoMelhorar" itens={["Saúde", "Educação", "Transporte", "Segurança e prevenção", "Limpeza urbana", "Obras e vias", "Assistência social", "Outro", "Não sabe"]} /><label>Se a prefeitura pudesse priorizar apenas uma área agora, qual deveria vir primeiro? *</label><Opcoes campo="prioridadeCidade" itens={["Saúde", "Educação", "Segurança", "Emprego e renda", "Transporte", "Obras e infraestrutura", "Habitação", "Assistência social", "Meio ambiente", "Outra"]} />{r.prioridadeCidade === "Saúde" ? <><label>Por que a saúde deveria vir primeiro?</label><textarea value={r.motivoSaude || ""} onChange={e => set("motivoSaude", e.target.value)} placeholder="Registre a resposta com as palavras da pessoa" /></> : r.prioridadeCidade && <><label>E qual deveria ser o nível de prioridade da saúde?</label><Opcoes campo="nivelSaude" itens={["Também muito alta", "Alta", "Média", "Baixa", "Não sabe"]} /><label>Por quê?</label><textarea value={r.motivoNivelSaude || ""} onChange={e => set("motivoNivelSaude", e.target.value)} placeholder="Resposta aberta" /></>}<label>O que você mais espera que mude em Betim nos próximos quatro anos?</label><textarea value={r.esperaCidade || ""} onChange={e => set("esperaCidade", e.target.value)} placeholder="Resposta espontânea" /></>}
    {passo === 4 && <><h3>Conhecimento de lideranças públicas</h3><p className="instrucao"><b>Primeiro, lembrança espontânea.</b> Não leia nomes na pergunta abaixo.</p><label>Quando pensa em pessoas da política ligadas a Betim, qual nome vem primeiro à sua cabeça?</label><input value={r.politicoEspontaneo || ""} onChange={e => set("politicoEspontaneo", e.target.value)} placeholder="Nome citado ou “nenhum”" /><label>O que você pensa dessa pessoa?</label><textarea value={r.opiniaoEspontanea || ""} onChange={e => set("opiniaoEspontanea", e.target.value)} placeholder="Registre sem concordar ou discordar" /><label>Você conhece algum nome de Betim que pretende disputar deputado federal em 2026? Qual?</label><input value={r.conheceFederalBetim || ""} onChange={e => set("conheceFederalBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><label>E para deputado estadual?</label><input value={r.conheceEstadualBetim || ""} onChange={e => set("conheceEstadualBetim", e.target.value)} placeholder="Nome citado, não conhece ou não sabe" /><div className="separador"><span>AGORA LEIA CADA NOME</span></div>{nomes.map(blocoNome)}</>}
    {passo === 5 && <><h3>Intenção de voto — seis escolhas</h3><div className="leitura discreta"><b>INSTRUÇÃO AO PESQUISADOR</b><p>Faça todas de forma espontânea e na ordem abaixo. Não mostre nomes nesta versão. Para senador, são duas escolhas diferentes.</p></div><Intencao campo="votoFederal" titulo="1. Se a eleição fosse hoje, em quem votaria para deputado federal?" /><Intencao campo="votoEstadual" titulo="2. E para deputado estadual?" /><Intencao campo="votoSenador1" titulo="3. Qual seria seu primeiro voto para senador?" /><Intencao campo="votoSenador2" titulo="4. E qual seria seu segundo voto para senador?" ajuda="Não repita automaticamente o primeiro nome." /><Intencao campo="votoGovernador" titulo="5. Em quem votaria para governador de Minas Gerais?" /><Intencao campo="votoPresidente" titulo="6. E para presidente da República?" /><label>Hoje, sua decisão de voto está:</label><Opcoes campo="certezaVoto" itens={["Totalmente decidida", "Pode mudar", "Ainda não decidiu", "Prefere não responder"]} /></>}
    {passo === 6 && <><h3>Perfil para análise estatística</h3><p className="instrucao">Estas respostas permitem verificar se a amostra representa o eleitorado. Não use para identificar a pessoa.</p><label>Faixa etária *</label><Opcoes campo="idade" itens={["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"]} /><label>Gênero *</label><Opcoes campo="genero" itens={["Feminino", "Masculino", "Outra identidade", "Prefere não informar"]} /><label>Escolaridade *</label><Opcoes campo="escolaridade" itens={["Até fundamental", "Ensino médio", "Superior incompleto", "Superior completo ou mais", "Prefere não informar"]} /><label>Renda familiar mensal *</label><Opcoes campo="renda" itens={["Até 2 salários mínimos", "Mais de 2 a 5", "Mais de 5 a 10", "Mais de 10", "Não sabe", "Prefere não informar"]} /><label>Raça ou cor, conforme autodeclaração do IBGE</label><Opcoes campo="racaCor" itens={["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefere não informar"]} /></>}
    {passo === 7 && <div className="contato-opcional"><h3>Identificação e contato opcional</h3><div className="privacidade"><i>◉</i><span><b>A pesquisa já está respondida</b><small>Nome e contato ficam em cadastro separado e só aparecem se a pessoa quiser receber a finalidade escolhida.</small></span></div><label>Deseja se identificar?</label><Opcoes campo="identificacao" itens={["Permanecer anônimo", "Quero me identificar"]} />{r.identificacao === "Quero me identificar" && <><label>Nome do entrevistado (opcional)</label><input value={r.nome || ""} onChange={e => set("nome", e.target.value)} placeholder="Como gostaria de ser chamado?" /></>}<label>Deseja receber algo da NorteP? *</label><Opcoes campo="interesse" itens={["Não desejo receber contato", "Resultado desta pesquisa", "Conteúdos e atualizações", "Resultado e conteúdos"]} />{recebeContato && <div className="dados-contato"><label>Como prefere receber?</label><Opcoes campo="canal" itens={["WhatsApp", "E-mail", "WhatsApp e e-mail"]} />{r.canal?.includes("WhatsApp") && <><label>WhatsApp</label><input value={r.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></>}{r.canal?.toLowerCase().includes("mail") && <><label>E-mail</label><input value={r.email || ""} onChange={e => set("email", e.target.value)} placeholder="nome@exemplo.com" /></>}<button type="button" className={r.consentimentoContato === "sim" ? "consentimento marcado" : "consentimento"} onClick={() => set("consentimentoContato", r.consentimentoContato === "sim" ? "" : "sim")}>{r.consentimentoContato === "sim" ? "✓" : "□"} Autorizo o contato exclusivamente para a finalidade escolhida.</button></div>}<label>Observação interna do pesquisador</label><textarea value={r.observacaoInterna || ""} onChange={e => set("observacaoInterna", e.target.value)} placeholder="Não registre opinião política do pesquisador nem informação médica." /></div>}
    <footer><button disabled={passo === 1} onClick={() => setPasso(passo - 1)}>← Voltar</button>{passo < 7 ? <button className="primary" disabled={!obrigatorios[passo] || inelegivel} onClick={() => setPasso(passo + 1)}>Continuar →</button> : <button className="primary" disabled={!obrigatorios[7]} onClick={fim}>✓ Finalizar entrevista</button>}</footer>{!obrigatorios[passo] && !inelegivel && <div className="faltam">Preencha os campos marcados com * para continuar.</div>}
  </div></div>;
}

function getYoutubeId(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] ?? "";
}

function Obrigado({ nome, videoUrl, concluir }: { nome?: string; videoUrl: string; concluir: () => void }) {
  const videoId = getYoutubeId(videoUrl);
  return <div className="obrigado"><div className="check-final">✓</div><small>ENTREVISTA CONCLUÍDA</small><h2>Obrigado{nome ? `, ${nome}` : ""} por participar.</h2><p>Sua opinião ajuda a compreender as prioridades do bairro e a aproximar pessoas das decisões.</p>{videoId ? <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoId}`} title="Vídeo de agradecimento" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : <div className="video-vazio"><i>▶</i><span><b>Vídeo de agradecimento</b><small>A coordenação pode adicionar um único link do YouTube nesta pesquisa.</small></span></div>}<div className="codigo-final"><small>CÓDIGO DA ENTREVISTA</small><b>ENT-2026-000799</b><span>✓ Resposta salva e pronta para sincronização</span></div><button className="primary" onClick={concluir}>Concluir e voltar às pesquisas</button></div>;
}
