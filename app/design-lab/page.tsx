import { notFound } from "next/navigation";
import { DesignLab, DesignLabCanvas } from "./design-lab";

export const metadata = { title: "Geliştirme galerisi", robots: { index: false, follow: false } };

export default async function DesignLabPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Deny test, production and missing/unknown environments before rendering any fixture.
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  return params.canvas === "1" ? <DesignLabCanvas initialScreen={typeof params.screen === "string" ? params.screen : "feed"} theme={params.theme === "light" ? "light" : "dark"} reducedMotion={params.motion === "reduced"}/> : <DesignLab/>;
}
