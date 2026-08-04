// src/components/validation/FieldValidationMessage.tsx
//
// Pure presentational component: renders one inline validation message
// below a form field. Never decides validity itself — the caller supplies
// the status/message, sourced from validateRoom()/validateProject()
// (src/validations.ts/projectValidator.ts), the single source of truth.
import React from "react";

export type FieldMessageStatus = "incomplete" | "invalid" | "warning";

interface FieldValidationMessageProps {
  /** Element id — pair with the input's `aria-describedby`. */
  id: string;
  status: FieldMessageStatus;
  message: string;
}

// Icon + text label together, never color alone, per the accessibility
// requirement — a colorblind or screen-reader user gets the same
// information as someone relying on the red/amber/blue styling.
const META: Record<
  FieldMessageStatus,
  { icon: string; label: string; textClass: string }
> = {
  invalid: { icon: "⚠", label: "Invalid", textClass: "text-red-700" },
  incomplete: { icon: "○", label: "Incomplete", textClass: "text-amber-700" },
  warning: { icon: "ℹ", label: "Warning", textClass: "text-sky-700" },
};

export const FieldValidationMessage: React.FC<FieldValidationMessageProps> = ({
  id,
  status,
  message,
}) => {
  const { icon, label, textClass } = META[status];
  return (
    <p
      id={id}
      // Only "invalid" interrupts — incomplete/warning are informational
      // and are still reachable via aria-describedby without a live
      // announcement every time a field is merely left blank.
      role={status === "invalid" ? "alert" : undefined}
      className={`mt-1 flex items-start gap-1 text-xs ${textClass}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">{label}:</span>
      <span>{message}</span>
    </p>
  );
};
