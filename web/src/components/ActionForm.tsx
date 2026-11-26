"use client";

import { useActionState } from "react";

export type FormState = { error?: string; ok?: string } | undefined;

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
  className?: string;
};

/** Form wrapper that shows server-action results and a pending state. */
export default function ActionForm({ action, submitLabel, children, className }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "form"}>
      {children}
      {state?.error && <p className="msg msg-error">{state.error}</p>}
      {state?.ok && <p className="msg msg-ok">{state.ok}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "처리 중..." : submitLabel}
      </button>
    </form>
  );
}
