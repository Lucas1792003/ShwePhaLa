import { Input } from "../ui/Input";

interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
}

export const MoneyInput = ({ value, onChange, placeholder }: MoneyInputProps) => (
  <Input
    type="number"
    value={Number.isFinite(value) ? value : 0}
    onChange={(event) => onChange(Number(event.target.value))}
    placeholder={placeholder ?? "MMK"}
  />
);
