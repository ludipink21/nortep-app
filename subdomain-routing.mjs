/** @typedef {"pesquisa" | "academia" | "comunicacao" | "gestao" | "auditoria" | "financeiro"} NortePProduct */

export const NORTEP_PRODUCTS = Object.freeze({
  pesquisa: "pesquisa",
  academia: "academia",
  comunicacao: "comunicacao",
  gestao: "gestao",
  auditoria: "auditoria",
  financeiro: "financeiro",
});

export const ACTIVE_NORTEP_PRODUCTS = Object.freeze(["pesquisa", "academia"]);
export const PLANNED_NORTEP_PRODUCTS = Object.freeze(["comunicacao", "gestao", "auditoria", "financeiro"]);

export function normalizeHostname(hostHeader = "") {
  return String(hostHeader)
    .split(",", 1)[0]
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/:\d+$/, "");
}

/**
 * Resolve o produto pelo cabeçalho Host. Também aceita academia.localhost para testes locais.
 * @returns {NortePProduct | null}
 */
export function resolveNortePProduct(hostHeader, rootDomain = "nortep.ia.br") {
  const hostname = normalizeHostname(hostHeader);
  const root = normalizeHostname(rootDomain);

  if (!hostname || hostname === root || hostname === `www.${root}` || hostname === "localhost" || hostname === "127.0.0.1") {
    return null;
  }

  const suffix = hostname.endsWith(".localhost")
    ? ".localhost"
    : hostname.endsWith(`.${root}`)
      ? `.${root}`
      : null;

  if (!suffix) return null;
  const subdomain = hostname.slice(0, -suffix.length).split(".").at(-1) || "";
  return Object.hasOwn(NORTEP_PRODUCTS, subdomain) ? NORTEP_PRODUCTS[subdomain] : null;
}

export function isActiveNortePProduct(product) {
  return ACTIVE_NORTEP_PRODUCTS.includes(product);
}
