import { NavLink } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useDataStore } from "../../stores/dataStore";
import { cn } from "../../lib/utils";

const navItems = [
  { to: "/pos", label: "POS", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { to: "/products", label: "Products", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { to: "/shift", label: "Shift", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { to: "/inventory", label: "Inventory", roles: ["ADMIN", "MANAGER"] },
  { to: "/sales", label: "Sales", roles: ["ADMIN", "MANAGER"] },
  { to: "/reports", label: "Reports", roles: ["ADMIN", "MANAGER"] },
  { to: "/shifts", label: "Shifts", roles: ["ADMIN", "MANAGER"] },
  { to: "/audit", label: "Audit", roles: ["ADMIN", "MANAGER"] },
  { to: "/shops", label: "Shops", roles: ["ADMIN"] },
  { to: "/users", label: "Users", roles: ["ADMIN"] },
  { to: "/products/manage", label: "Product Admin", roles: ["ADMIN"] },
  { to: "/settings", label: "Settings", roles: ["ADMIN"] },
];

export const Sidebar = () => {
  const currentUserId = useAuthStore((state) => state.currentUserId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));

  return (
    <aside className="print-hidden sticky top-0 h-screen w-72 border-r border-slate-800/60 bg-slate-950 p-6 text-slate-100 shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30">
          SP
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight">Shwe Phala POS</div>
          <div className="text-xs text-slate-400">Multi-shop console</div>
        </div>
      </div>
      <div className="mt-8 space-y-2">
        {navItems
          .filter((item) => currentUser && item.roles.includes(currentUser.role))
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-inset ring-indigo-400/40"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
      </div>
    </aside>
  );
};
