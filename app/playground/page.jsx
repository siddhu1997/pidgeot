import { notFound } from "next/navigation";

import { DevelopmentLabShell } from "@/components/playground/development-lab-shell";
import { getServerAppConfig } from "@/lib/config";
import { getDevLabPublicStatus } from "@/lib/dev-lab/config";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  const app = getServerAppConfig();

  if (app.isProduction) {
    return {
      title: "Not Found",
    };
  }

  return {
    title: "Development Lab | Pidgeot",
    description: "Development-only laboratory for controlled Gmail test data and visual Pidgeot experiments.",
  };
}

export default function PlaygroundPage() {
  const app = getServerAppConfig();

  if (app.isProduction) {
    notFound();
  }

  return (
    <DevelopmentLabShell initialStatus={getDevLabPublicStatus()} />
  );
}
