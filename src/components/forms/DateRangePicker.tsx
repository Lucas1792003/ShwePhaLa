import { Input } from "../ui/Input";

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
}

export const DateRangePicker = ({ start, end, onChange }: DateRangePickerProps) => (
  <div className="flex flex-wrap gap-2">
    <Input type="date" value={start} onChange={(event) => onChange({ start: event.target.value, end })} />
    <Input type="date" value={end} onChange={(event) => onChange({ start, end: event.target.value })} />
  </div>
);
