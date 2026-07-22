"use client";

import { useEffect, useState } from "react";

type View = "inicio" | "pesquisas" | "equipe" | "resultados" | "ecossistema" | "portal" | "entrevista" | "obrigado";

const pesquisas = [
  { nome: "Melhorias para o bairro", status: "Em campo", feitas: 486, meta: 700, equipe: 18 },
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
        {view === "entrevista" && <Entrevista passo={passo} setPasso={setPasso} r={respostas} setR={setRespostas} fim={() => ir("obrigado")} />}
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
    <div className="cards">{pesquisas.map((p, i) => <article key={p.nome}><div><label className={i === 2 ? "rascunho" : "status"}>{p.status}</label><button>•••</button></div><h3>{p.nome}</h3><p>{i === 0 ? "Percepção sobre serviços, prioridades e qualidade de vida na região." : i === 1 ? "Avaliação da saúde, educação, limpeza e transporte público." : "Mapeamento das principais demandas dos moradores."}</p>{i === 0 && <div className="video-status"><i>▶</i><span><b>Vídeo de agradecimento</b><small>{videoUrl ? "Link do YouTube configurado" : "Opcional · ainda não configurado"}</small></span></div>}<section><span><b>{p.feitas}</b> respostas</span><span><b>{p.equipe}</b> pesquisadores</span><span><b>{i === 2 ? 18 : 24}</b> perguntas</span></section><div className="progresso"><small>{p.feitas} de {p.meta}</small><em><i style={{ width: (p.feitas / p.meta * 100) + "%" }} /></em></div><footer>{i === 0 && <button onClick={configurarVideo}>▶ Vídeo</button>}<button onClick={() => aviso("Editor de perguntas aberto")}>Editar</button><button onClick={() => i === 2 ? aviso("Pesquisa liberada para a equipe") : ir("resultados")}>{i === 2 ? "Liberar" : "Acompanhar"}</button></footer></article>)}</div>
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
  return <div className="portal"><div className="portal-boas"><span><small>OLÁ, MARCOS</small><h2>Pronto para continuar o trabalho de campo?</h2><p>Você vê apenas as pesquisas liberadas para o seu acesso.</p></span><div className="campo-metricas"><i><b>42</b><small>hoje</small></i><i><b>168</b><small>no total</small></i><i><b>0</b><small>pendentes</small></i></div></div><article className="pesquisa-atribuida"><div className="pesquisa-capa"><span>EM CAMPO</span><i>NP</i></div><div className="pesquisa-info"><small>PESQUISA LIBERADA</small><h3>Melhorias para o bairro</h3><p>24 perguntas · duração aproximada de 8 minutos</p><div className="instrucoes"><span>✓ Apresente-se antes de começar</span><span>✓ Confirme o consentimento</span><span>✓ Funciona sem internet</span></div><button className="primary" onClick={iniciar}>＋ Iniciar nova entrevista</button></div></article><div className="painel ajuda-campo"><span><b>Precisa de ajuda?</b><small>Entre em contato com a coordenação antes de interromper uma entrevista.</small></span><button>Falar com a equipe</button></div></div>;
}

function Cabecalho({ titulo, sub, botao, acao }: { titulo: string; sub: string; botao: string; acao: () => void }) { return <div className="cabecalho"><div><h2>{titulo}</h2><p>{sub}</p></div><button className="primary" onClick={acao}>{botao}</button></div>; }
function Filtros({ busca }: { busca?: string }) { return <div className="filtros">{busca && <input placeholder={"⌕  " + busca} />}<button>Todos os status⌄</button><button>Mais recentes⌄</button></div>; }

function Entrevista({ passo, setPasso, r, setR, fim }: { passo: number; setPasso: (n: number) => void; r: Record<string, string>; setR: (v: Record<string, string>) => void; fim: () => void }) {
  const set = (k: string, v: string) => setR({ ...r, [k]: v });
  const Opcoes = ({ itens, campo }: { itens: string[]; campo: string }) => <div className="opcoes">{itens.map(x => <button className={r[campo] === x ? "selecionado" : ""} onClick={() => set(campo, x)} key={x}>{x}</button>)}</div>;
  const recebeContato = r.interesse && r.interesse !== "Não desejo receber contato";
  return <div className="entrevista"><div className="entrevista-topo"><div><small>MELHORIAS PARA O BAIRRO</small><h2>Entrevista <span>ENT-2026-000799</span></h2></div><label>✓ Rascunho salvo neste dispositivo</label></div><div className="passos">{["Localização", "Perfil", "Avaliação", "Contato opcional"].map((x, i) => <div className={i + 1 <= passo ? "feito" : ""} key={x}><i>{i + 1 < passo ? "✓" : i + 1}</i><span>{x}</span></div>)}</div><div className="questao"><small>ETAPA {passo} DE 4</small>
    {passo === 1 && <><h3>Onde esta entrevista está sendo realizada?</h3><label>Bairro ou região *</label><select value={r.bairro || ""} onChange={e => set("bairro", e.target.value)}><option value="">Selecione o bairro</option><option>Jardim União</option><option>Vila Nova</option><option>Centro</option></select><label>Ponto de referência</label><input value={r.ref || ""} onChange={e => set("ref", e.target.value)} placeholder="Ex.: próximo à praça central" /></>}
    {passo === 2 && <><h3>Qual é o perfil do entrevistado?</h3><label>Faixa etária *</label><Opcoes campo="idade" itens={["16 a 24 anos", "25 a 34 anos", "35 a 44 anos", "45 a 59 anos", "60 anos ou mais"]} /><label>Como a pessoa se identifica?</label><select value={r.genero || ""} onChange={e => set("genero", e.target.value)}><option>Prefere não informar</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select></>}
    {passo === 3 && <><h3>De 0 a 10, como você avalia os serviços públicos?</h3><div className="escala">{Array.from({ length: 11 }, (_, i) => <button className={r.nota === String(i) ? "selecionado" : ""} onClick={() => set("nota", String(i))} key={i}>{i}</button>)}</div><label>Qual deveria ser a principal prioridade?</label><Opcoes campo="prioridade" itens={["Saúde", "Segurança", "Transporte", "Educação", "Limpeza urbana", "Outro"]} /></>}
    {passo === 4 && <div className="contato-opcional"><h3>Deseja se identificar ou receber informações?</h3><div className="privacidade"><i>◉</i><span><b>Sua identificação é opcional</b><small>As respostas da pesquisa podem continuar anônimas. Nome e contato serão usados somente com sua autorização.</small></span></div><label>Identificação</label><Opcoes campo="identificacao" itens={["Permanecer anônimo", "Quero me identificar"]} />{r.identificacao === "Quero me identificar" && <><label>Nome do entrevistado (opcional)</label><input value={r.nome || ""} onChange={e => set("nome", e.target.value)} placeholder="Como gostaria de ser chamado?" /></>}<label>Deseja receber algo da NorteP?</label><Opcoes campo="interesse" itens={["Não desejo receber contato", "Resultado desta pesquisa", "Conteúdos e atualizações", "Resultado e conteúdos"]} />{recebeContato && <div className="dados-contato"><label>Como prefere receber?</label><Opcoes campo="canal" itens={["WhatsApp", "E-mail", "WhatsApp e e-mail"]} />{r.canal?.includes("WhatsApp") && <><label>WhatsApp</label><input value={r.whatsapp || ""} onChange={e => set("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></>}{r.canal?.toLowerCase().includes("mail") && <><label>E-mail</label><input value={r.email || ""} onChange={e => set("email", e.target.value)} placeholder="nome@exemplo.com" /></>}<button className={r.consentimento === "sim" ? "consentimento marcado" : "consentimento"} onClick={() => set("consentimento", r.consentimento === "sim" ? "" : "sim")}>{r.consentimento === "sim" ? "✓" : "□"} Autorizo o contato para a finalidade escolhida.</button></div>}</div>}
    <footer><button disabled={passo === 1} onClick={() => setPasso(passo - 1)}>← Voltar</button>{passo < 4 ? <button className="primary" onClick={() => setPasso(passo + 1)}>Continuar →</button> : <button className="primary" onClick={fim}>✓ Finalizar entrevista</button>}</footer>
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
