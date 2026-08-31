"use client";

import { useState, useTransition } from "react";
import { removeProject } from "@/app/actions";

export function RemoveProjectButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-3">
      {message && <span className="text-[11px] text-alert">{message}</span>}
      <button
        onClick={() => {
          if (
            !confirm(
              `Remove "${slug}" from the registry? Its pixel events are kept for 30 days and re-attach if you add it back.`,
            )
          )
            return;
          startTransition(async () => {
            const result = await removeProject(slug);
            if (result) setMessage(result.message);
          });
        }}
        disabled={pending}
        className="border border-line2 px-3 py-1 text-[10px] uppercase tracking-wider text-mute hover:border-alert hover:text-alert disabled:opacity-50"
      >
        {pending ? "removing…" : "remove"}
      </button>
    </span>
  );
}
