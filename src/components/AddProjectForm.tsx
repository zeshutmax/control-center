"use client";

import { useActionState, useState } from "react";
import { addProject, type FormState } from "@/app/actions";
import { buttonCls, inputCls, labelCls } from "./ui";

export function AddProjectForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addProject, null);
  // Controlled inputs: React 19 resets uncontrolled fields after a form
  // action, which would wipe everything the user typed on a validation error.
  const [values, setValues] = useState({ githubRepo: "", liveUrl: "", name: "", description: "" });
  const bind = (key: keyof typeof values) => ({
    id: key,
    name: key,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="githubRepo" className={labelCls}>
          GitHub repo <span className="normal-case text-mute">— owner/repo, optional</span>
        </label>
        <input {...bind("githubRepo")} placeholder="vercel/next.js" className={inputCls} />
      </div>
      <div>
        <label htmlFor="liveUrl" className={labelCls}>
          Live URL <span className="normal-case text-mute">— optional</span>
        </label>
        <input {...bind("liveUrl")} placeholder="https://example.com" className={inputCls} />
      </div>
      <div>
        <label htmlFor="name" className={labelCls}>
          Name <span className="normal-case text-mute">— optional, taken from the repo if empty</span>
        </label>
        <input {...bind("name")} placeholder="My project" className={inputCls} />
      </div>
      <div>
        <label htmlFor="description" className={labelCls}>
          Description <span className="normal-case text-mute">— optional</span>
        </label>
        <input {...bind("description")} placeholder="What it is" className={inputCls} />
      </div>
      <p className="text-[11px] text-mute">
        At least one of repo / URL is required. Manual projects are never removed by the sync;
        if a repo is given, its details refresh on every sync.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonCls}
        >
          {pending ? "adding…" : "add project"}
        </button>
        {state?.message && <span className="text-[12px] text-alert">{state.message}</span>}
      </div>
    </form>
  );
}
