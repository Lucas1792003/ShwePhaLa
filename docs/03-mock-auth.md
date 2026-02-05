# Mock Authentication

Login is frontend-only and uses email suffix mapping:
- `@admin.com` -> ADMIN
- `@manager.com` -> MANAGER
- `@staff.com` -> CASHIER
- `@buyer.com` -> BUYER

Any non-empty password is accepted.

Session behavior:
- `useAuthStore` persists `currentUserId` to localStorage.
- Logging out clears the session and resets the selected shop.
- Manager/Cashier users are assigned a shop at login (first shop by default).
