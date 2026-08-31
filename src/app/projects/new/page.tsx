import Link from "next/link";
import { AddProjectForm } from "@/components/AddProjectForm";

export const dynamic = "force-dynamic";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/" className="text-[11px] uppercase tracking-wider text-mute hover:text-accent">
          ← registry
        </Link>
        <h1 className="font-display mt-2 text-4xl font-bold uppercase tracking-wide text-ink">
          Add project
        </h1>
        <p className="mt-2 text-dim">
          For anything the autoscan can&apos;t see: a repo you don&apos;t own, a site hosted
          elsewhere, or a project that isn&apos;t on GitHub at all.
        </p>
      </div>
      <div className="bracket border border-line bg-panel p-5">
        <AddProjectForm />
      </div>
    </div>
  );
}
