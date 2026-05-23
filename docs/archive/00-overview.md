# Shwe Phala POS Overview

Shwe Phala POS is a multi-shop POS and inventory system. It is a
React/TypeScript frontend backed by Supabase Auth and PostgreSQL.

## Current Backend Status

- Supabase Auth handles login.
- `public.users.auth_id` links app staff profiles to Supabase Auth users.
- Business data is persisted in Supabase PostgreSQL.
- localStorage stores only UI preferences and the Supabase Auth session.
- Critical operational writes are transactional Supabase RPCs.
- RLS is enabled: operational writes are RPC-only, operational reads are
  shop-scoped, and audit direct writes are locked down.

## Core Features

- Role-aware routing, sidebar navigation, and shop scoping.
- POS checkout with barcode scan, stock checks, receipt numbering, and reprints.
- Shift open/close accountability with server-side expected cash calculation.
- Inventory adjustment, purchase receiving, transfer completion, refund/void,
  and sale checkout through atomic RPCs.
- Dynamic category, product, supplier, shop, user, and pricing management.
- Dashboard reports with sales, profit, stock health, and low-stock signals.

## Product Codes

Products have a required SKU in the admin UI. `product_barcodes` also exists
and POS scan lookup uses `product_barcodes.value`. SKU is the catalog code;
barcode rows are optional scan-code mappings.

## Tech Stack

- React 19 + TypeScript + Vite
- Supabase Auth + PostgreSQL
- Zustand for in-memory UI state
- React Router for navigation
- Recharts for analytics
- Tailwind CSS for styling

