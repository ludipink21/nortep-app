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
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
          var localRegistrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(localRegistrations.map(function (item) { return item.unregister(); }));
          if ('caches' in window) {
            var localCaches = await caches.keys();
            await Promise.all(localCaches.filter(function (key) { return key.indexOf('nortep-pesquisa-') === 0; }).map(function (key) { return caches.delete(key); }));
          }
          return;
        }
        var reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (reloading || sessionStorage.getItem('nortep-reload-v46')) return;
          reloading = true;
          sessionStorage.setItem('nortep-reload-v46', '1');
          window.location.reload();
        });
        try {
          var registration = await navigator.serviceWorker.register('/sw.js?v=46', { updateViaCache: 'none' });
          await registration.update();
        } catch (_) {}
      });
    }
  `;
  return <html lang="pt-BR"><body>{children}<script dangerouslySetInnerHTML={{ __html: serviceWorkerUpdate }} /></body></html>;
}
