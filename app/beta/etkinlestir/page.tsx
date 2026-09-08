import { BetaShell } from "../beta-shell";
import { TestActivation } from "./test-activation";

export const metadata = { title: "Test hesabını etkinleştir · Kampira", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ActivationPage() { return <BetaShell><TestActivation/></BetaShell>; }
