"use client";
/**
 * Rydr Alert — the small inline banner used for errors and hints.
 *
 * Every page that renders an error today writes its own copy of
 * `border border-accent-red/30 bg-accent-red/5 …`. This is that copy,
 * with a variant knob for info / success / warning as a bonus.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

const alertVariants = cva(
  "relative w-full rounded-[var(--radius-card)] border px-4 py-3 text-sm flex gap-3 items-start",
  {
    variants: {
      variant: {
        default: "bg-surface-elevated border-hairline-strong text-body",
        info: "bg-accent-blue/5 border-accent-blue/25 text-accent-blue",
        success: "bg-accent-green/5 border-accent-green/25 text-accent-green",
        warning: "bg-accent-orange/5 border-accent-orange/30 text-accent-orange",
        destructive: "bg-accent-red/5 border-accent-red/30 text-accent-red",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const iconFor: Record<NonNullable<VariantProps<typeof alertVariants>["variant"]>, LucideIcon> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  destructive: AlertCircle,
};

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  icon?: boolean;
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", icon = true, children, ...props }, ref) => {
    const Icon = iconFor[variant ?? "default"];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant, className }))}
        {...props}
      >
        {icon && <Icon className="h-4 w-4 shrink-0 mt-0.5" />}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    );
  },
);
Alert.displayName = "Alert";

const AlertTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("font-semibold text-sm leading-none tracking-tight mb-1", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("text-sm opacity-90", className)} {...props} />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
