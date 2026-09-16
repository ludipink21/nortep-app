import type { Metadata } from "next";
import ElectoralApp from "./electoral-app";
export const metadata: Metadata = { title: "Análise Eleitoral | NorteP", description: "Consulte os resultados eleitorais, compare candidatos e guarde suas análises no NorteP." };
export default function ElectoralPage() { return <ElectoralApp />; }
