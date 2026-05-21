import { Button } from "../ui/Button";
import { MoneyInput } from "../forms/MoneyInput";

interface StartShiftCardProps {
  openingCash: number;
  onOpeningCashChange: (value: number) => void;
  onStart: () => void | Promise<void>;
}

export const StartShiftCard = ({ openingCash, onOpeningCashChange, onStart }: StartShiftCardProps) => (
  <div className="space-y-3">
    <MoneyInput value={openingCash} onChange={onOpeningCashChange} placeholder="Opening cash" />
    <Button onClick={onStart}>Start shift</Button>
  </div>
);
