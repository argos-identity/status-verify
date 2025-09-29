import Header from "@/components/sections/header";
import SystemStatus from "@/components/sections/system-status";
import PastIncidents from "@/components/sections/past-incidents";
import Footer from "@/components/sections/footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <SystemStatus />

        <div className="max-w-[850px] mx-auto px-4 sm:px-6 lg:px-8">
          <PastIncidents />
        </div>
      </main>

      <Footer />
    </div>
  );
}