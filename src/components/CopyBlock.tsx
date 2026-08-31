"use client";

import { useState } from "react";

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap border border-line bg-bg px-3 py-2 text-[11px] text-dim">
        {text}
      </code>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="border border-line2 bg-panel2 px-3 text-[11px] uppercase tracking-wider text-ink hover:border-accent hover:text-accent"
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
