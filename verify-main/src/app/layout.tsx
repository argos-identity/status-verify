import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Argosidentity Verify - System Status",
  description: "Monitor the operational status of Argosidentity's verification services including ID Recognition, Face Liveness, ID Liveness, Face Compare, and Curp Verifier.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}