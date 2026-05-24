import { Button } from "../ui/Button";
import { MoneyInput } from "../forms/MoneyInput";

interface StartShiftCardProps {
  openingCash: number;
  onOpeningCashChange: (value: number) => void;
  onStart: () => void | Promise<void>;
}

export const StartShiftCard = ({ openingCash, onOpeningCashChange, onStart }: StartShiftCardProps) => (
  <div className="space-y-3">
    <div className="space-y-1">
      <label htmlFor="opening-cash" className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Opening cash
      </label>
      <MoneyInput
        id="opening-cash"
        value={openingCash}
        onChange={(next) => onOpeningCashChange(next ?? 0)}
        placeholder="e.g. 50000"
      />
      <p className="text-xs text-slate-500">MMK amount in the drawer at shift start.</p>
    </div>
    <Button onClick={onStart}>Start shift</Button>
  </div>
);
