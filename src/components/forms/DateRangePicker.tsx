import { Input } from "../ui/Input";

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
}

export const DateRangePicker = ({ start, end, onChange }: DateRangePickerProps) => (
  <div className="flex min-w-0 flex-wrap gap-2">
    <Input className="min-w-40 flex-1 md:w-auto md:flex-none" type="date" value={start} onChange={(event) => onChange({ start: event.target.value, end })} />
    <Input className="min-w-40 flex-1 md:w-auto md:flex-none" type="date" value={end} onChange={(event) => onChange({ start, end: event.target.value })} />
  </div>
);
