import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useAppStore } from "../../stores/appStore";
import { useDataStore } from "../../stores/dataStore";
import { cn } from "../../lib/utils";
import type { Permission } from "../../shared/utils/permissions";
import { hasPermission } from "../../shared/utils/permissions";
import { ShopSwitcher } from "./ShopSwitcher";
import { LanguageSwitcher } from "../../components/layout/LanguageSwitcher";
import { useTranslation } from "../../hooks/useTranslation";
import logo from "../../assets/logo.png";

interface NavItem {
  to: string;
  labelKey: string;
  permission: Permission;
  icon: string;
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
      { to: "/app/dashboard", labelKey: "dashboard", permission: "VIEW_REPORTS", icon: "dashboard" },
      { to: "/app/pos", labelKey: "pos", permission: "VIEW_POS", icon: "point_of_sale" },
    ],
  },
  {
    titleKey: "salesOperations",
    items: [
      { to: "/app/sales", labelKey: "salesHistory", permission: "VIEW_SALES", icon: "receipt_long" },
      { to: "/app/shifts", labelKey: "shifts", permission: "VIEW_SHIFTS", icon: "schedule" },
      { to: "/app/approvals", labelKey: "approvals", permission: "VIEW_APPROVALS", icon: "fact_check" },
    ],
  },
  {
    titleKey: "inventorySection",
    items: [
      { to: "/app/inventory", labelKey: "inventory", permission: "VIEW_INVENTORY", icon: "inventory_2" },
      { to: "/app/transfers", labelKey: "transfers", permission: "VIEW_TRANSFERS", icon: "swap_horiz" },
      { to: "/app/purchases", labelKey: "purchases", permission: "VIEW_PURCHASES", icon: "local_shipping" },
    ],
  },
  {
    titleKey: "settings",
    adminOnly: true,
    items: [
      { to: "/app/admin/shops", labelKey: "shops", permission: "MANAGE_SHOPS", icon: "store" },
      { to: "/app/admin/users", labelKey: "users", permission: "MANAGE_USERS", icon: "group" },
      { to: "/app/admin/products", labelKey: "products", permission: "MANAGE_PRODUCTS", icon: "inventory" },
      { to: "/app/admin/suppliers", labelKey: "suppliers", permission: "VIEW_SUPPLIERS", icon: "handshake" },
      { to: "/app/admin/pricing", labelKey: "pricing", permission: "MANAGE_PRICING", icon: "sell" },
      { to: "/app/admin/audit", labelKey: "auditLog", permission: "VIEW_AUDIT", icon: "policy" },
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
            // Filter items by permission
            const visibleItems = section.items.filter(
              (item) => currentUser && hasPermission(currentUser.role, item.permission)
            );

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
