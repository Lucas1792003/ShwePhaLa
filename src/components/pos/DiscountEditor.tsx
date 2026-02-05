import { Input } from "../ui/Input";
import { toNumber } from "../../lib/utils";

interface DiscountEditorProps {
  value: number;
  onChange: (value: number) => void;
}

export const DiscountEditor = ({ value, onChange }: DiscountEditorProps) => (
  <Input
    type="number"
    min={0}
    max={100}
    value={value}
    onChange={(event) => onChange(toNumber(event.target.value))}
  />
);
