import type { Metadata } from "next";
import StaffConsole from "../staff-console";

export const metadata: Metadata = { title: "Owner Control", robots: { index: false, follow: false } };

export default function OwnerPage() {
  return <StaffConsole mode="owner" />;
}
