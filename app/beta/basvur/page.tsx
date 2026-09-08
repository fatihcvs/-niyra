import { BetaShell } from "../beta-shell";
import { BetaForm } from "../beta-form";
export const metadata = { title: "Web ve Android beta başvurusu · Kampira", description: "Kampira’yı web veya Android’de denemek için başvur ve test hesabını etkinleştir.", alternates: { canonical: "https://kampira.net/beta/basvur" } };
export default function ApplicationPage() { return <BetaShell><BetaForm kind="application"/></BetaShell>; }
