import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Maria Vanuzia | Conteúdos e participação | NorteP",
  description: "Formulário voluntário para receber conteúdos e participar de atividades relacionadas à candidata Maria Vanuzia.",
  openGraph: {
    title: "Maria Vanuzia | Conteúdos e participação",
    description: "Formulário voluntário para receber conteúdos e participar de atividades relacionadas à candidata Maria Vanuzia.",
    url: "https://nortep.ia.br",
    siteName: "NorteP",
    images: [
      {
        url: "https://nortep.ia.br/maria-vanuzia-cover.jpg",
        width: 510,
        height: 700,
        alt: "Maria Vanuzia",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Maria Vanuzia | Conteúdos e participação",
    description: "Formulário voluntário para receber conteúdos e participar de atividades relacionadas à candidata Maria Vanuzia.",
    images: ["https://nortep.ia.br/maria-vanuzia-cover.jpg"],
  },
};

export default function SupporterInviteLayout({ children }: { children: ReactNode }) {
  return children;
}
