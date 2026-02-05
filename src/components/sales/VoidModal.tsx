import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

interface VoidModalProps {
  open: boolean;
  reason: string;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const VoidModal = ({ open, reason, onChangeReason, onClose, onConfirm }: VoidModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Void sale"
    description="Provide a reason before voiding."
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          Confirm
        </Button>
      </>
    }
  >
    <Input value={reason} onChange={(event) => onChangeReason(event.target.value)} placeholder="Reason" />
  </Modal>
);
