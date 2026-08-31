"use client";
/**
 * Rydr AlertDialog — a Dialog whose purpose is a decision, not information.
 *
 * The API mirrors Dialog. Use this for irreversibles (sign out, cancel a
 * ride, delete a post) so the user gets a real focus trap and can't
 * accidentally dismiss with a stray click.
 */
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Button, buttonVariants } from "./Button";
import type { VariantProps } from "class-variance-authority";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "anim-fade fixed inset-0 z-50 bg-black/80 backdrop-blur-sm",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

const AlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "anim-fade-scale fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "w-[min(calc(100vw-2rem),28rem)] max-h-[calc(100dvh-4rem)] overflow-y-auto",
        "bg-surface-elevated border border-hairline-strong",
        "rounded-[var(--radius-modal)] p-6",
        "shadow-2xl shadow-black/60",
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = "AlertDialogContent";

const AlertDialogHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 mb-4", className)} {...props} />
);

const AlertDialogFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6", className)} {...props} />
);

const AlertDialogTitle = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-xl font-semibold text-ink tracking-tight", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-mute leading-relaxed", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

// Action buttons use Button under the hood so they share the same shape
// and motion tokens as every other button in the app.
type ActionProps = ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> &
  VariantProps<typeof buttonVariants>;

const AlertDialogAction = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Action>,
  ActionProps
>(({ variant = "default", size = "default", className, ...props }, ref) => (
  <AlertDialogPrimitive.Action asChild>
    <Button ref={ref} variant={variant} size={size} className={className} {...props} />
  </AlertDialogPrimitive.Action>
));
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Cancel>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel asChild>
    <Button ref={ref} variant="outline" size="default" className={className} {...props} />
  </AlertDialogPrimitive.Cancel>
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
