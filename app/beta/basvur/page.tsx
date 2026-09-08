import { BetaShell } from "../beta-shell";
import { BetaForm } from "../beta-form";
export const metadata = { title: "Android test başvurusu · Kampira", alternates: { canonical: "https://kampira.net/beta/basvur" } };
export default function ApplicationPage() { return <BetaShell><BetaForm kind="application"/></BetaShell>; }
