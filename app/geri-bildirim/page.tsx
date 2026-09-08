import { BetaShell } from "../beta/beta-shell";
import { BetaForm } from "../beta/beta-form";
export const metadata = { title: "Geri bildirim ve destek · Kampira", alternates: { canonical: "https://kampira.net/geri-bildirim" } };
export default function FeedbackPage() { return <BetaShell><BetaForm kind="feedback"/></BetaShell>; }
