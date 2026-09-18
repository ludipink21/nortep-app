import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildSupportMetadata } from "./preview-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}): Promise<Metadata> {
  const { codigo } = await params;
  return buildSupportMetadata(decodeURIComponent(codigo || "").trim());
}

export default function SupporterInviteLayout({ children }: { children: ReactNode }) {
  return children;
}
