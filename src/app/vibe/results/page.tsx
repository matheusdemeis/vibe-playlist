import { Suspense } from "react";
import VibeResultsClient from "./VibeResultsClient";

export default function VibeResultsPage() {
  return (
    <Suspense fallback={null}>
      <VibeResultsClient />
    </Suspense>
  );
}
