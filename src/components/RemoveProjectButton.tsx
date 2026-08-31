"use client";

import { useState, useTransition } from "react";
import { removeProject } from "@/app/actions";
import { dangerButtonCls } from "./ui";

export function RemoveProjectButton({ slug, isManual }: { slug: string; isManual: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const warning = isManual
    ? `Remove "${slug}" from the registry? Its pixel events are kept for 30 days and re-attach if you add it back.`
    : `Remove "${slug}"? It's a synced project, so it will be hidden — the sync keeps tracking it quietly and you can restore it from the bottom of the dashboard.`;

  return (
    <span className="flex items-center gap-3">
      {message && <span className="text-[11px] text-alert">{message}</span>}
      <button
        onClick={() => {
          if (!confirm(warning)) return;
          startTransition(async () => {
            const result = await removeProject(slug);
            if (result) setMessage(result.message);
          });
        }}
        disabled={pending}
        className={dangerButtonCls}
      >
        {pending ? "removing…" : "remove"}
      </button>
    </span>
  );
}
