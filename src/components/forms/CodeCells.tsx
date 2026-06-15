import { useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";

export const CODE_LENGTH = 6;

// Segmented OTP input: one box per digit. Keeps the joined code in the parent's
// `value` so callers treat it like a plain string. Auto-advances on entry,
// backspaces to the previous box, supports arrow keys, and accepts a pasted code.
export function CodeCells({
  value,
  invalid,
  onChange,
  autoFocus = true,
}: {
  value: string;
  invalid?: boolean;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? "");

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const digit = event.target.value.replace(/\D/g, "").slice(-1);
    if (!digit) return;
    onChange((value.slice(0, index) + digit + value.slice(index + 1)).slice(0, CODE_LENGTH));
    if (index < CODE_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" onPaste={handlePaste}>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && index === 0}
          value={digit}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className={`h-12 w-12 rounded-lg border text-center text-xl font-bold outline-none transition-colors focus:ring-2 ${
            invalid
              ? "border-rose-300 text-rose-700 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-200 text-slate-800 focus:border-emerald-400 focus:ring-emerald-100"
          }`}
        />
      ))}
    </div>
  );
}
