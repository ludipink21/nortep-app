import { notFound } from "next/navigation";
import ProductEntry, { isPlannedProduct } from "../../product-entry";

export default async function PlannedProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isPlannedProduct(slug)) notFound();
  return <ProductEntry product={slug} />;
}
