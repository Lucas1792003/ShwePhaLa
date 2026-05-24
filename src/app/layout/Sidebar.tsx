import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useDataStore } from "../../stores/dataStore";
import { cn } from "../../lib/utils";
import type { Permission, Role } from "../../types";
import { hasPermission, ROUTE_PERMISSIONS } from "../../lib/permissions";
import { ShopSwitcher } from "./ShopSwitcher";
import { LanguageSwitcher } from "../../components/layout/LanguageSwitcher";
import { useTranslation } from "../../hooks/useTranslation";
import logo from "../../assets/logo1.png";

interface NavItem {
  to: string;
  labelKey: string;
  permission: Permission;
  icon: string;
  /** Optional role gate layered on top of the permission. The route guard
   * checks this too — see AppRouter. */
  allowedRoles?: Role[];
}

interface NavSection {
  titleKey?: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const navSections: NavSection[] = [
  {
    // Main navigation - no title
    items: [
      { to: "/app/dashboard", labelKey: "dashboard", permission: ROUTE_PERMISSIONS.dashboard, icon: "dashboard" },
      { to: "/app/pos", labelKey: "pos", permission: ROUTE_PERMISSIONS.pos, icon: "point_of_sale" },
    ],
  },
  {
    titleKey: "salesOperations",
    items: [
      { to: "/app/sales", labelKey: "salesHistory", permission: ROUTE_PERMISSIONS.sales, icon: "receipt_long" },
      { to: "/app/shifts", labelKey: "shifts", permission: ROUTE_PERMISSIONS.shifts, icon: "schedule" },
      { to: "/app/approvals", labelKey: "approvals", permission: ROUTE_PERMISSIONS.approvals, icon: "fact_check" },
      { to: "/app/barcode-labels", labelKey: "barcodeLabels", permission: ROUTE_PERMISSIONS.barcodeLabels, icon: "qr_code_2", allowedRoles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    titleKey: "inventorySection",
    items: [
      { to: "/app/inventory", labelKey: "inventory", permission: ROUTE_PERMISSIONS.inventory, icon: "inventory_2" },
      { to: "/app/transfers", labelKey: "transfers", permission: ROUTE_PERMISSIONS.transfers, icon: "swap_horiz" },
      { to: "/app/purchases", labelKey: "purchases", permission: ROUTE_PERMISSIONS.purchases, icon: "local_shipping" },
      { to: "/app/suppliers", labelKey: "suppliers", permission: ROUTE_PERMISSIONS.suppliers, icon: "handshake" },
    ],
  },
  {
    titleKey: "settings",
    adminOnly: true,
    items: [
      { to: "/app/admin/shops", labelKey: "shops", permission: ROUTE_PERMISSIONS.adminShops, icon: "store" },
      { to: "/app/admin/users", labelKey: "users", permission: ROUTE_PERMISSIONS.adminUsers, icon: "group" },
      { to: "/app/admin/products", labelKey: "products", permission: ROUTE_PERMISSIONS.adminProducts, icon: "inventory" },
      { to: "/app/admin/unit-types", labelKey: "unitTypes", permission: ROUTE_PERMISSIONS.adminUnitTypes, icon: "straighten" },
      { to: "/app/admin/pricing", labelKey: "pricing", permission: ROUTE_PERMISSIONS.adminPricing, icon: "sell" },
      { to: "/app/admin/audit", labelKey: "auditLog", permission: ROUTE_PERMISSIONS.adminAudit, icon: "policy" },
    ],
  },
];

export const Sidebar = () => {
  const navigate = useNavigate();
  const { currentUserId, logout } = useAuthStore();
  const setShopId = useAppStore((state) => state.setShopId);
  const currentUser = useDataStore((state) => state.users.find((user) => user.id === currentUserId));
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const { t } = useTranslation();

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    setShopId(null);
    navigate("/login");
  };

  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <aside className="sidebar print-hidden">
      <div className="sidebar-header">
        <img src={logo} alt="Shwe Pha La logo" className="header-logo" />
        <div>
          <div className="shopName">Shwe Pha La</div>
          <div className="shop-meta">Multi-shop console</div>
        </div>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-shop">
          <ShopSwitcher />
        </div>

        <nav className="nav">
          {navSections.map((section, sectionIndex) => {
            // Filter items by permission AND optional role gate.
            const visibleItems = section.items.filter((item) => {
              if (!hasPermission(currentUser, item.permission)) return false;
              if (item.allowedRoles && currentUser && !item.allowedRoles.includes(currentUser.role)) return false;
              return true;
            });

            // Skip section if no visible items or admin-only section for non-admins
            if (visibleItems.length === 0) return null;
            if (section.adminOnly && !isAdmin) return null;

            const sectionTitle = section.titleKey ? t("sidebar", section.titleKey) : undefined;
            const isCollapsed = sectionTitle ? collapsedSections.has(sectionTitle) : false;

            return (
              <div key={section.titleKey || `section-${sectionIndex}`} className="nav-section">
                {sectionTitle && (
                  <button
                    type="button"
                    className="section-header"
                    onClick={() => toggleSection(sectionTitle)}
                  >
                    <span className="section-title">{sectionTitle}</span>
                    <span className={cn("material-symbols-rounded section-arrow", isCollapsed && "collapsed")}>
                      expand_more
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul className="menu-list">
                    {visibleItems.map((item) => (
                      <li key={item.to} className="menu-item">
                        <NavLink
                          to={item.to}
                          className={({ isActive }) => cn("menu-link", isActive && "active")}
                        >
                          <span className="material-symbols-rounded">{item.icon}</span>
                          <span className="menu-label">{t("sidebar", item.labelKey)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-footer">
        <LanguageSwitcher className="mb-3" />
        <div className="sidebar-user">
          <div className="user-name">{currentUser?.name ?? "User"}</div>
          <div className="user-role">{currentUser?.role ?? ""}</div>
        </div>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <span className="material-symbols-rounded">logout</span>
          <span>{t("common", "logout")}</span>
        </button>
      </div>
    </aside>
  );
};
