import { redirect } from "next/navigation";

const CHANNEL_CODES: Record<string, string> = {
  instagram: "163DBB1CCC",
  facebook: "A26B3D639F",
  tiktok: "A6A715A8C4",
  whatsapp: "9E34D12864",
  youtube: "FD4DC7B577",
  outras: "240B9EE6B4",
  outro: "240B9EE6B4",
};

export default async function SocialChannelShortcut({ params }: { params: Promise<{ canal: string }> }) {
  const { canal } = await params;
  const normalized = canal.trim().toLowerCase();
  const code = CHANNEL_CODES[normalized];

  if (!code) redirect("/rede");
  redirect(`/rede?c=${code}`);
}
