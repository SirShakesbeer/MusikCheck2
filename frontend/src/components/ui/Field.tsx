import type { ReactNode } from 'react';

type Props = {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Field({ label, hint, className, children }: Props) {
  return (
    <label className={joinClasses('flex min-w-[180px] flex-col gap-1 text-sm font-semibold uppercase tracking-wide text-cyan-50', className)}>
      <span>{label}</span>
      {children}
      {hint && <span className="muted-copy text-xs normal-case tracking-normal">{hint}</span>}
    </label>
  );
}
