import type { Metadata } from "next";
import StaffConsole from "../staff-console";

export const metadata: Metadata = { title: "Admin Desk", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <StaffConsole mode="admin" />;
}
