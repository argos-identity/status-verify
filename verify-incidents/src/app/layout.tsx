// This file only serves as the outermost layout root.
// The actual layout with internationalization is in [locale]/layout.tsx

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}