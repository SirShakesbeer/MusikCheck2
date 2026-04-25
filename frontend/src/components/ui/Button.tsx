import { forwardRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, PointerEvent } from 'react';

import { PAPER_BUTTON_ANIMATION_DEFAULTS } from '../../config/defaults';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  morphAnimationEnabled?: boolean;
  pauseMorphOnInteraction?: boolean;
};

const BASE_CLASS =
  'paper-button inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 font-semibold uppercase tracking-wide transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-700 disabled:text-slate-300';

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

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    morphAnimationEnabled = false,
    pauseMorphOnInteraction = true,
    className,
    type = 'button',
    disabled,
    onMouseEnter,
    onMouseLeave,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    ...props
  }: Props,
  ref,
) {
  const [interactionPaused, setInteractionPaused] = useState(false);
  const animationEnabled = morphAnimationEnabled && !disabled;

  const animationStyle: CSSProperties = {
    '--paper-morph-duration': `${PAPER_BUTTON_ANIMATION_DEFAULTS.shapeMorphIntervalMs}ms`,
    '--paper-morph-scale-min': String(PAPER_BUTTON_ANIMATION_DEFAULTS.shapeMorphScaleMin),
    '--paper-morph-scale-max': String(PAPER_BUTTON_ANIMATION_DEFAULTS.shapeMorphScaleMax),
    '--paper-morph-rotate': `${PAPER_BUTTON_ANIMATION_DEFAULTS.shapeMorphRotateDeg}deg`,
    '--paper-morph-skew': `${PAPER_BUTTON_ANIMATION_DEFAULTS.shapeMorphSkewDeg}deg`,
  } as CSSProperties;

  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>) => {
    if (pauseMorphOnInteraction) {
      setInteractionPaused(true);
    }
    onMouseEnter?.(event);
  };

  const handleMouseLeave = (event: MouseEvent<HTMLButtonElement>) => {
    if (pauseMorphOnInteraction) {
      setInteractionPaused(false);
    }
    onMouseLeave?.(event);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (pauseMorphOnInteraction) {
      setInteractionPaused(true);
    }
    onPointerDown?.(event);
  };

  const handlePointerResume = () => {
    if (pauseMorphOnInteraction) {
      setInteractionPaused(false);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    handlePointerResume();
    onPointerUp?.(event);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    handlePointerResume();
    onPointerCancel?.(event);
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={joinClasses(
        BASE_CLASS,
        animationEnabled ? 'paper-button-morphing' : undefined,
        interactionPaused ? 'paper-button-paused' : undefined,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      style={animationStyle}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      {...props}
    />
  );
});
