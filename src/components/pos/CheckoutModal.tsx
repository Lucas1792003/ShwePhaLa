import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { formatMmk } from "../../lib/utils";

interface CheckoutModalProps {
  open: boolean;
  total: number;
  onClose: () => void;
  onProceed: () => void;
}

export const CheckoutModal = ({ open, total, onClose, onProceed }: CheckoutModalProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title="Ready to checkout"
    description="Confirm the total before proceeding to payment."
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onProceed}>Proceed</Button>
      </>
    }
  >
    <div className="text-lg font-semibold">Total due: {formatMmk(total)}</div>
  </Modal>
);
