"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, startTransition } from "react";
import { useSubmit } from "@/lib/client-api";
import { Field, FormError, Input } from "@/components/ui/fields";
import { FormActions } from "@/components/ui/form-actions";

export interface DemoAccount {
  role: string;
  email: string;
}

export function LoginForm({ demo }: { demo: DemoAccount[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [show, setShow] = useState(false);
  const { submit, pending, error, fields } = useSubmit({ url: "/api/auth/login", refresh: false, onSuccess: () => startTransition(() => { router.replace("/"); router.refresh(); }) });

  return (
    <>
      <form
        method="post"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          void submit({ email: fd.get("email"), password: fd.get("password") });
        }}
        className="space-y-5"
      >
        <FormError message={error} />
        <Field label="Email" name="email" error={fields.email}>
          <Input name="email" type="email" autoComplete="username" placeholder="you@organisation.example" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!fields.email} required />
        </Field>
        <Field label="Password" name="password" error={fields.password}>
          <div className="relative">
            <Input name="password" type={show ? "text" : "password"} autoComplete="current-password" aria-invalid={!!fields.password} className="pr-10" required />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-ink-muted hover:text-ink">
              {show ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            </button>
          </div>
        </Field>
        <FormActions pending={pending} submitLabel="Sign in" pendingLabel="Signing in…" />
      </form>

      {demo.length > 0 && (
        <div className="mt-8 min-w-0 overflow-hidden rounded-lg border border-line bg-surface-2/60 p-4">
          <p className="text-sm font-medium text-ink">Demo accounts (synthetic, local only)</p>
          <p className="mt-0.5 text-xs text-ink-muted">Pick one to fill the email. The shared password is <code className="font-mono">DEMO_USER_PASSWORD</code> in your <code className="font-mono">.env</code>.</p>
          <ul className="mt-3 grid min-w-0 gap-1.5">
            {demo.map((d) => (
              <li key={d.email}>
                <button type="button" onClick={() => setEmail(d.email)} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left text-xs transition-colors hover:border-accent hover:bg-accent-soft">
                  <span className="shrink-0 font-semibold text-ink">{d.role}</span>
                  <span className="min-w-0 truncate font-mono text-ink-muted">{d.email}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
