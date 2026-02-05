import { Input } from "../ui/Input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchInput = ({ value, onChange, placeholder }: SearchInputProps) => (
  <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder ?? "Search"} />
);
