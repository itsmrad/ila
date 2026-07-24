import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './lib/utils';

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }
>(({ className, label, children, ...props }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={cn(
      'w-8 h-8 md:w-[33px] md:h-[33px] grid place-items-center rounded-[10px] bg-transparent text-[#707070] hover:bg-[#f0f0f0] hover:text-[#303030] transition-colors focus-visible:outline-2 focus-visible:outline-[#a9baf6] cursor-pointer disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';
