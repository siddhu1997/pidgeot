"use client";

import { useEffect, useState } from "react";

import { DevelopmentLab } from "@/components/playground/development-lab";
import { PlaygroundLab } from "@/components/playground/playground-lab";
import { UnsubscribeDlqLab } from "@/components/playground/unsubscribe-dlq-lab";

const TABS = [
  { id: "mail", label: "Development Mail" },
  { id: "playground", label: "Playground" },
  { id: "dlq", label: "Unsubscribe DLQ" },
];

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

export function DevelopmentLabShell({ initialStatus }) {
  const [activeTab, setActiveTab] = useState("mail");
  const [dlqCount, setDlqCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function refreshCount() {
      try {
        const response = await fetch("/api/dev-lab/unsubscribe-dlq");
        const payload = await response.json();

        if (!response.ok || cancelled) {
          return;
        }

        setDlqCount(Number(payload?.dlq?.count) || 0);
      } catch {
        return;
      }
    }

    refreshCount();
    const timer = window.setInterval(refreshCount, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div>
      <div className="border-b border-white/8 px-4 py-3 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1540px] flex-wrap gap-2">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const count = tab.id === "dlq" && dlqCount > 0 ? dlqCount : null;

            return (
              <button
                key={tab.id}
                aria-pressed={active}
                className={classNames(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors duration-200",
                  active
                    ? "border-cyan-300/40 bg-cyan-300/12 text-cyan-50"
                    : "border-white/10 bg-white/4 text-slate-300 hover:border-white/24 hover:bg-white/6",
                )}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
                {count ? <span className="ml-2 font-mono text-xs text-cyan-100">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === "mail" ? <DevelopmentLab initialStatus={initialStatus} /> : null}
      {activeTab === "playground" ? <PlaygroundLab /> : null}
      {activeTab === "dlq" ? <UnsubscribeDlqLab /> : null}
    </div>
  );
}
