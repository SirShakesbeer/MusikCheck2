import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const BASE_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-700 disabled:text-slate-300';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'border-mc-cyan/70 bg-gradient-to-r from-mc-cyan to-sky-300 text-mc-ink hover:brightness-110 focus:ring-mc-cyan/60',
  secondary: 'border-mc-lime/80 bg-gradient-to-r from-mc-lime to-yellow-300 text-mc-ink hover:brightness-110 focus:ring-mc-lime/60',
  ghost: 'border-white/25 bg-white/10 text-white hover:bg-white/20 focus:ring-white/40',
  danger: 'border-rose-300/70 bg-gradient-to-r from-rose-400 to-orange-300 text-mc-ink hover:brightness-110 focus:ring-rose-300/60',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 py-1 text-sm',
  md: 'text-base',
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={joinClasses(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className)}
      {...props}
    />
  );
}
