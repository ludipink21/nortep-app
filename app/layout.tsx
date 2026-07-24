import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "mobiliza-dados.local";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const image = `${protocol}://${host}/og.png`;

  return {
    title: "NorteP Pesquisa",
    description: "Pesquisa de campo. Dados que aproximam.",
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title: "NorteP Pesquisa",
      description: "Pesquisa de campo. Dados que aproximam.",
      images: [{ url: image, width: 1536, height: 1024 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "NorteP Pesquisa",
      description: "Pesquisa de campo. Dados que aproximam.",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const serviceWorkerUpdate = `
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async function () {
        var reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (reloading || sessionStorage.getItem('nortep-reload-v26')) return;
          reloading = true;
          sessionStorage.setItem('nortep-reload-v26', '1');
          window.location.reload();
        });
        try {
          var registration = await navigator.serviceWorker.register('/sw.js?v=26', { updateViaCache: 'none' });
          await registration.update();
        } catch (_) {}
      });
    }
  `;
  return <html lang="pt-BR"><body>{children}<script dangerouslySetInnerHTML={{ __html: serviceWorkerUpdate }} /></body></html>;
}
