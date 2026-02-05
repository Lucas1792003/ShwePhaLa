# POS Flow

## Barcode scan
1. Focus is on the barcode input.
2. On Enter, lookup by `ProductBarcode.value`.
3. If found, add to cart; if not, show error toast.

## Cart rules
- Quantity increments per scan or button.
- Item discount (%) per line.
- Cart discount (%) applied after item discounts.
- Price override allowed only for Manager/Admin.
- Out-of-stock is blocked unless Manager/Admin overrides.

## Checkout
- Cashier must have an open shift.
- Payment modal captures method + paid amount.
- Sale creation writes `Sale`, `SaleItem`, updates inventory, and logs audit entries.

## Printing
- Receipt preview uses 80mm print CSS.
- Reprint writes a `ReprintLog` entry.

## Edge cases
- Attempting to sell without stock ? blocked unless override.
- Voided/refunded sales restock base units.
