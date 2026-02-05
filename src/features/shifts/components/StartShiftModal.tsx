import { Modal } from "../../../components/ui/Modal";
import { StartShiftCard } from "../../../components/shifts/StartShiftCard";

interface StartShiftModalProps {
  open: boolean;
  openingCash: number;
  onOpeningCashChange: (value: number) => void;
  onStart: () => void;
  onClose: () => void;
}

export const StartShiftModal = ({ open, openingCash, onOpeningCashChange, onStart, onClose }: StartShiftModalProps) => (
  <Modal open={open} onClose={onClose} title="Start shift" description="Enter the opening cash amount.">
    <StartShiftCard openingCash={openingCash} onOpeningCashChange={onOpeningCashChange} onStart={onStart} />
  </Modal>
);
