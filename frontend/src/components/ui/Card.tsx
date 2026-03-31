import type { HTMLAttributes, ReactNode } from 'react';

type CardTone = 'default' | 'panel';

type Props = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  tone?: CardTone;
  as?: 'section' | 'div';
};

const TONE_CLASS: Record<CardTone, string> = {
  default: 'rounded-2xl border border-white/10 bg-mc-surface/80 p-4 shadow-glow',
  panel: 'rounded-2xl border border-white/15 bg-mc-panel/70 p-4 shadow-glow',
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ title, subtitle, tone = 'default', className, as = 'section', children, ...props }: Props) {
  const Tag = as;
  return (
    <Tag className={joinClasses(TONE_CLASS[tone], className)} {...props}>
      {title && <h2 className="panel-title">{title}</h2>}
      {subtitle && <p className="muted-copy mb-3">{subtitle}</p>}
      {children}
    </Tag>
  );
}
