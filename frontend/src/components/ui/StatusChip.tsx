import type { HTMLAttributes } from 'react';

type ChipTone = 'default' | 'ok' | 'warn';

type Props = HTMLAttributes<HTMLParagraphElement> & {
  tone?: ChipTone;
};

const TONE_CLASS: Record<ChipTone, string> = {
  default: 'border-white/30 bg-white/10 text-white',
  ok: 'border-mc-lime/55 bg-mc-lime/15 text-mc-lime',
  warn: 'border-rose-300/60 bg-rose-400/15 text-rose-100',
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function StatusChip({ tone = 'default', className, ...props }: Props) {
  return <p className={joinClasses('status-chip paper-chip', TONE_CLASS[tone], className)} {...props} />;
}
