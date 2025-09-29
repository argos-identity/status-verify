import type { Metadata } from "next";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import VisualEditsMessenger from "../../visual-edits/VisualEditsMessenger";
import ErrorReporter from "@/components/ErrorReporter";
import Script from "next/script";
import { SocketProvider } from "../../context/socket-context";
import { SWRProvider } from "../../providers/swr-provider";
import { IncidentHistoryProvider } from "../../context/IncidentHistoryContext";

export const metadata: Metadata = {
  title: "Argosidentity Verify - System Status",
  description: "Monitor the operational status of Argosidentity's verification services including ID Recognition, Face Liveness, ID Liveness, Face Compare, and Curp Verifier.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}