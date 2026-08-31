"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncNow } from "@/app/actions";
import { buttonCls } from "./ui";

export function SyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function sync() {
    startTransition(async () => {
      setMessage(null);
      const result = await syncNow();
      setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-[11px] ${message.startsWith("ok") ? "text-dim" : "text-alert"}`}>{message}</span>
      )}
      <button
        onClick={sync}
        disabled={pending}
        className={buttonCls}
      >
        {pending ? "syncing…" : "sync now"}
      </button>
    </div>
  );
}
