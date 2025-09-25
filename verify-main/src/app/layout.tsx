import type { Metadata } from "next";
import "./globals.css";
import VisualEditsMessenger from "../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import { SocketProvider } from "../context/socket-context";
import { SWRProvider } from "../providers/swr-provider";
import { IncidentHistoryProvider } from "../context/IncidentHistoryContext";

export const metadata: Metadata = {
  title: "Argosidentity Verify - System Status",
  description: "Monitor the operational status of Argosidentity's verification services including ID Recognition, Face Liveness, ID Liveness, Face Compare, and Curp Verifier.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ErrorReporter />
        <Script
          src="https://slelguoygbfzlpylpxfs.supabase.co/storage/v1/object/public/scripts//route-messenger.js"
          strategy="afterInteractive"
          data-target-origin="*"
          data-message-type="ROUTE_CHANGE"
          data-include-search-params="true"
          data-only-in-iframe="true"
          data-debug="true"
          data-custom-data='{"appName": "YourApp", "version": "1.0.0", "greeting": "hi"}'
        />
        <SWRProvider>
          <IncidentHistoryProvider>
            <SocketProvider>
              {children}
            </SocketProvider>
          </IncidentHistoryProvider>
        </SWRProvider>
        <VisualEditsMessenger />
      </body>
    </html>
  );
}
