"use client";

import { useActionState } from "react";
import { updateProject, type FormState } from "@/app/actions";
import { buttonCls, inputCls, labelCls } from "./ui";

type Props = {
  slug: string;
  /** Current override values (empty string when unset). */
  defaults: { name: string; description: string; liveUrl: string };
  /** Synced values, shown as placeholders — what an empty field falls back to. */
  synced: { name: string; description: string; liveUrl: string };
};

export function EditProjectForm({ slug, defaults, synced }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProject.bind(null, slug),
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelCls}>
            Name
          </label>
          <input
            id="name"
            name="name"
            defaultValue={defaults.name}
            placeholder={synced.name}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="liveUrl" className={labelCls}>
            Live URL
          </label>
          <input
            id="liveUrl"
            name="liveUrl"
            defaultValue={defaults.liveUrl}
            placeholder={synced.liveUrl || "https://…"}
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label htmlFor="description" className={labelCls}>
          Description
        </label>
        <input
          id="description"
          name="description"
          defaultValue={defaults.description}
          placeholder={synced.description || "What it is"}
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonCls}>
          {pending ? "saving…" : "save"}
        </button>
        {state?.message && (
          <span className={`text-[12px] ${state.ok ? "text-dim" : "text-alert"}`}>
            {state.message}
          </span>
        )}
        <span className="ml-auto text-[11px] text-mute">
          empty fields fall back to synced values · slug &amp; pixel id never change
        </span>
      </div>
    </form>
  );
}
