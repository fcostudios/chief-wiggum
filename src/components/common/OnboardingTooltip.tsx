// src/components/common/OnboardingTooltip.tsx
// One-time dismissable onboarding tooltip (CHI-241).

import type { Component } from 'solid-js';
import { X } from 'lucide-solid';
import { dismissTooltip } from '@/stores/onboardingStore';

interface OnboardingTooltipProps {
  id: string;
  message: string;
  placement?: 'top' | 'bottom' | 'right';
}

const OnboardingTooltip: Component<OnboardingTooltipProps> = (props) => {
  const placement = () => props.placement ?? 'top';

  const positionStyle = () => {
    switch (placement()) {
      case 'bottom':
        return { top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };
      case 'right':
        return { left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)' };
      default:
        return { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' };
    }
  };

  return (
    <div
      role="tooltip"
      class="absolute z-50 flex items-start gap-2 px-3 py-2 rounded-lg animate-fade-in"
      style={{
        ...positionStyle(),
        background: 'var(--color-bg-elevated)',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-accent-muted)',
        'font-size': '12px',
        'box-shadow': 'var(--shadow-md)',
        'max-width': '240px',
        'white-space': 'normal',
      }}
    >
      <span class="flex-1 leading-snug">{props.message}</span>
      <button
        aria-label="Dismiss"
        class="mt-0.5 flex-shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
        onClick={() => dismissTooltip(props.id)}
      >
        <X size={12} />
      </button>
    </div>
  );
};

export default OnboardingTooltip;
