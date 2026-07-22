import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "mobiliza-dados.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;

  return {
    title: "Mobiliza Dados",
    description: "Pesquisa de campo simples, segura e inteligente.",
    openGraph: {
      title: "Mobiliza Dados",
      description: "Pesquisa de campo simples, segura e inteligente.",
      images: [{ url: image, width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Mobiliza Dados",
      description: "Pesquisa de campo simples, segura e inteligente.",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
