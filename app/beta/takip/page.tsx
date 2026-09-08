import { BetaShell } from "../beta-shell";
import { BetaTracking } from "../beta-tracking";
export const metadata = { title: "Başvuru ve destek takibi · Kampira", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function TrackingPage() { return <BetaShell><BetaTracking/></BetaShell>; }
