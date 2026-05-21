# Tier-Based Pricing

## Overview

Tier-based pricing allows quantity-based price breaks, encouraging bulk purchases. Prices automatically adjust based on the quantity in the cart.

## Price Tier Structure

```typescript
interface PriceTier {
  id: string;
  productId: string;
  shopId?: string;      // null = applies to all shops
  minQty: number;       // Minimum quantity for this tier
  maxQty?: number;      // Maximum quantity (null = unlimited)
  priceMmk: number;     // Price per unit at this tier
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}
```

## How Tiers Work

### Example: Beer Pricing

| Tier | Quantity Range | Price per Unit |
|------|----------------|----------------|
| Base | 1-9 units | 2,500 MMK |
| Tier 1 | 10-49 units | 2,300 MMK |
| Tier 2 | 50-99 units | 2,100 MMK |
| Tier 3 | 100+ units | 2,000 MMK |

### Price Calculation

When calculating the price for a quantity:

```typescript
function getProductPrice(productId: string, qty: number, shopId?: string): number {
  // 1. Find applicable tiers for this product
  const tiers = priceTiers.filter(t =>
    t.productId === productId &&
    t.isActive &&
    (t.shopId === null || t.shopId === shopId)
  );

  // 2. Find the tier that matches the quantity
  const matchingTier = tiers.find(t =>
    qty >= t.minQty &&
    (t.maxQty === null || qty <= t.maxQty)
  );

  // 3. Return tier price or fall back to base product price
  if (matchingTier) {
    return matchingTier.priceMmk;
  }
  return product.priceMmk;
}
```

## Shop-Specific Pricing

Tiers can be configured per shop or globally:

- **Global Tier** (`shopId: null`): Applies to all shops
- **Shop-Specific Tier** (`shopId: "shop-1"`): Only applies to that shop

Priority: Shop-specific tiers override global tiers for the same quantity range.

## POS Integration

### Automatic Price Updates

When quantity changes in the cart:

1. System recalculates applicable tier
2. Unit price updates automatically
3. Line total reflects new price
4. Receipt shows final tier price

### Visual Indicators

- Current tier highlighted in cart
- "Bulk discount applied" indicator when tier price active
- Next tier threshold shown (e.g., "Add 3 more for better price")

## Managing Price Tiers

### Pricing Page (`/pricing`)

- List all products with their tier configurations
- Add/Edit tiers per product
- Toggle tiers active/inactive
- Filter by shop (for shop-specific tiers)

### Creating a Tier

1. Select product
2. Choose scope (Global or specific shop)
3. Set quantity range (minQty, maxQty)
4. Set tier price
5. Save and activate

### Tier Validation

- Tiers cannot overlap for the same product/shop
- minQty must be >= 1
- maxQty must be > minQty (or null for unlimited)
- Price must be > 0

## Permissions

| Action | Required Permission |
|--------|---------------------|
| View pricing tiers | `product:read` |
| Create/Edit tiers | `product:edit_price` |
| Delete tiers | `product:edit_price` |

## Reports

Pricing data available in:
- **Sales by Tier**: Which tiers are most used
- **Discount Analysis**: Revenue impact of tier pricing
- **Product Profitability**: Margin at each tier level

## Best Practices

1. **Margin Protection**: Ensure lowest tier still maintains acceptable margin
2. **Clear Breaks**: Use round quantity breaks (10, 25, 50, 100)
3. **Meaningful Discounts**: Each tier should offer noticeable savings
4. **Regular Review**: Adjust tiers based on sales patterns and costs
5. **Cost Updates**: Recalculate tiers when purchase costs change

## Examples

### Beverage Wholesale Pricing

```
Product: Myanmar Beer (330ml can)
Base Price: 2,500 MMK

Tiers:
- 1-11 units: 2,500 MMK (retail)
- 12-47 units: 2,300 MMK (case discount)
- 48-119 units: 2,100 MMK (bulk)
- 120+ units: 2,000 MMK (wholesale)
```

### Shop-Specific Pricing

```
Product: Premium Whisky
Global Price: 45,000 MMK

Shop A (Downtown - higher costs):
- All quantities: 47,000 MMK

Shop B (Wholesale outlet):
- 1-5 units: 45,000 MMK
- 6+ units: 42,000 MMK
```

