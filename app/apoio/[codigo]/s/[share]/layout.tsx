import type { Metadata } from "next";
import type { ReactNode } from "react";
import { buildSupportMetadata } from "../../preview-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string; share: string }>;
}): Promise<Metadata> {
  const { codigo, share } = await params;
  return buildSupportMetadata(
    decodeURIComponent(codigo || "").trim(),
    decodeURIComponent(share || "").trim().toUpperCase(),
  );
}

export default function SharedSupportLayout({ children }: { children: ReactNode }) {
  return children;
}
