import { useEffect, useState } from "react";
import { Input } from "../ui/Input";
import { normalizeAmountInput } from "../../lib/utils";

interface MoneyInputProps {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  /**
   * Optional fields (e.g. Cost Price) emit `undefined` when the editor is
   * empty; required fields emit `0` so downstream zod min(1) catches it.
   * Defaults to false (treat the field as required).
   */
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  onBlur?: () => void;
  disabled?: boolean;
}

/**
 * Controlled non-negative-integer money input.
 *
 * - `type="text"` + `inputMode="numeric"` — no browser spinner, numeric
 *   keypad on touch devices.
 * - Every keystroke and paste runs through `normalizeAmountInput`, so the
 *   field cannot display `02900`, letters, signs, or decimal points.
 * - Empty input is allowed while the field is focused. On blur, a required
 *   field resets to `"0"`; an optional field stays empty and emits
 *   `undefined`.
 */
export const MoneyInput = ({
  value,
  onChange,
  allowEmpty = false,
  placeholder = "0",
  className,
  id,
  name,
  onBlur,
  disabled,
}: MoneyInputProps) => {
  const externalDisplay = value === undefined ? "" : String(value);
  const [display, setDisplay] = useState(externalDisplay);

  // Re-sync when the parent value changes from outside (form.reset, edit
  // product, etc.) but only when the displayed digits would differ — this
  // avoids fighting the user mid-keystroke.
  useEffect(() => {
    if (normalizeAmountInput(display) !== normalizeAmountInput(externalDisplay)) {
      setDisplay(externalDisplay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalDisplay]);

  const emit = (next: string) => {
    if (next === "") {
      onChange(allowEmpty ? undefined : 0);
      return;
    }
    onChange(Number(next));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      id={id}
      name={name}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      value={display}
      onChange={(event) => {
        const next = normalizeAmountInput(event.target.value);
        setDisplay(next);
        emit(next);
      }}
      onBlur={() => {
        if (display === "" && !allowEmpty) {
          setDisplay("0");
          onChange(0);
        }
        onBlur?.();
      }}
    />
  );
};
