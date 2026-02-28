export default function VibeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}
