import { Button } from "../ui/Button";
import { MoneyInput } from "../forms/MoneyInput";

interface EndShiftCardProps {
  closingCash: number;
  onClosingCashChange: (value: number) => void;
  onEnd: () => void | Promise<void>;
}

export const EndShiftCard = ({ closingCash, onClosingCashChange, onEnd }: EndShiftCardProps) => (
  <div className="space-y-3">
    <MoneyInput value={closingCash} onChange={(next) => onClosingCashChange(next ?? 0)} placeholder="Closing cash counted" />
    <Button onClick={onEnd}>End shift</Button>
  </div>
);
