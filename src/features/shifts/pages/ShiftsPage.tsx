import { useAuthStore } from "../../../stores/authStore";
import { useDataStore } from "../../../stores/dataStore";
import { ShiftPage } from "../../../pages/ShiftPage";
import { ShiftsPage as ManagerShiftsPage } from "../../../pages/ShiftsPage";

export const ShiftsPage = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));

  if (currentUser?.role === "CASHIER") {
    return <ShiftPage />;
  }

  return <ManagerShiftsPage />;
};
