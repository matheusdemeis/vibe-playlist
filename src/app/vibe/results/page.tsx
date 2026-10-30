import { Suspense } from "react";
import { GenerationProgress } from "@/components/vibe/GenerationProgress";
import VibeResultsClient from "./VibeResultsClient";

export default function VibeResultsPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="shell page">
          <GenerationProgress />
        </main>
      }
    >
      <VibeResultsClient />
    </Suspense>
  );
}
