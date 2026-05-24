import { Modal } from "../../../components/ui/Modal";
import { EndShiftCard } from "../../../components/shifts/EndShiftCard";

interface EndShiftModalProps {
  open: boolean;
  closingCash: number | undefined;
  onClosingCashChange: (value: number | undefined) => void;
  onEnd: () => void;
  onClose: () => void;
}

export const EndShiftModal = ({ open, closingCash, onClosingCashChange, onEnd, onClose }: EndShiftModalProps) => (
  <Modal open={open} onClose={onClose} title="End shift" description="Count the cash drawer and confirm.">
    <EndShiftCard closingCash={closingCash} onClosingCashChange={onClosingCashChange} onEnd={onEnd} />
  </Modal>
);
