import { useRef, useEffect } from "react";
import { Input } from "../ui/Input";

interface BarcodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export const BarcodeInput = ({ value, onChange, onSubmit }: BarcodeInputProps) => {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex items-center gap-3"
    >
      <Input ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Scan barcode" />
    </form>
  );
};
