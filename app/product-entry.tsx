type PlannedProduct = "comunicacao" | "gestao" | "auditoria" | "financeiro";

const PRODUCTS: Record<PlannedProduct, { name: string; phase: string; description: string; purpose: string }> = {
  comunicacao: {
    name: "NorteP Comunicação",
    phase: "Em preparação",
    description: "Comunicação política, relacionamento e organização de conteúdo.",
    purpose: "Este endereço já está reservado para receber o produto quando suas funções forem desenvolvidas e validadas.",
  },
  gestao: {
    name: "NorteP Gestão",
    phase: "Em preparação",
    description: "Operação integrada para campanha, mandato, equipes e territórios.",
    purpose: "A estrutura profissional do subdomínio está pronta, mas o aplicativo de Gestão ainda não foi implementado.",
  },
  auditoria: {
    name: "NorteP Auditoria",
    phase: "Em preparação",
    description: "Controle, conferência, qualidade e acompanhamento da operação.",
    purpose: "O produto será ativado somente depois das regras de acesso, auditoria e proteção dos dados serem concluídas.",
  },
  financeiro: {
    name: "NorteP Financeiro",
    phase: "Planejado",
    description: "Gestão financeira em ambiente separado e protegido.",
    purpose: "Nenhuma função financeira foi simulada nesta versão; o subdomínio permanece reservado para o desenvolvimento futuro.",
  },
};

export function isPlannedProduct(value: string): value is PlannedProduct {
  return Object.hasOwn(PRODUCTS, value);
}

export default function ProductEntry({ product }: { product: PlannedProduct }) {
  const item = PRODUCTS[product];
  const rootDomain = process.env.NORTEP_ROOT_DOMAIN || "nortep.ia.br";

  return <main className="product-entry">
    <section className="product-entry-card">
      <div className="product-entry-brand"><i>NP</i><span>NorteP <b>Ecossistema</b></span></div>
      <small>{item.phase.toUpperCase()}</small>
      <h1>{item.name}</h1>
      <p>{item.description}</p>
      <div className="product-entry-notice"><b>Subdomínio preparado</b><span>{item.purpose}</span></div>
      <nav aria-label="Produtos NorteP disponíveis">
        <a href={`https://pesquisa.${rootDomain}`}>Abrir NorteP Pesquisa</a>
        <a href={`https://academia.${rootDomain}`}>Abrir Academia NorteP</a>
      </nav>
      <footer>NorteP — Dados que aproximam.</footer>
    </section>
  </main>;
}
