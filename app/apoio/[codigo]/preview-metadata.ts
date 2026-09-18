import type { Metadata } from "next";

const CANDIDATE_NAME = "Maria Vanuzia";
const SITE_URL = "https://nortep.ia.br";
const COVER_URL = `${SITE_URL}/apoio-preview?v=20260918-4`;

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://anioubcfdpbqbhmgkbwf.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_U9Tv18zXwvHv9sasisVFIw_PAFVycjL";

type PreviewData = {
  display_name?: string | null;
  partner_name?: string | null;
};

async function getPreviewName(code: string, shareCode?: string | null) {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_public_mobilization_share_preview`,
      {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_code: code,
          p_share_code: shareCode || null,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(900),
      },
    );

    if (!response.ok) return null;
    const data = (await response.json()) as PreviewData | null;
    return data?.display_name?.trim() || null;
  } catch {
    return null;
  }
}

export async function buildSupportMetadata(
  code: string,
  shareCode?: string | null,
): Promise<Metadata> {
  const displayName = await getPreviewName(code, shareCode);

  const title = displayName
    ? `${displayName} · ${CANDIDATE_NAME} | NorteP`
    : `${CANDIDATE_NAME} | NorteP`;

  const description = displayName
    ? `Informações sobre ${CANDIDATE_NAME} compartilhadas por ${displayName}. Abra para conhecer a trajetória, os conteúdos e escolher se deseja receber informações.`
    : `Informações sobre ${CANDIDATE_NAME}. Abra para conhecer a trajetória, os conteúdos e escolher se deseja receber informações.`;

  const canonical = shareCode
    ? `${SITE_URL}/apoio/${encodeURIComponent(code)}/s/${encodeURIComponent(shareCode)}`
    : `${SITE_URL}/apoio/${encodeURIComponent(code)}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "NorteP",
      images: [
        {
          url: COVER_URL,
          width: 600,
          height: 315,
          alt: CANDIDATE_NAME,
          type: "image/jpeg",
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [COVER_URL],
    },
  };
}
