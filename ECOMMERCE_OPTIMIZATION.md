# Ecommerce Optimization

Implementation status: complete (September 11, 2026).

## Checkout and payment

- Login-required and automatic customer-account settings are enforced.
- Checkout uses a unique request ID so retries return the same order.
- Midtrans is the default payment option; manual payments support proof upload,
  admin approval/rejection, and the normal payment fulfillment pipeline.
- Guest orders retain customer name, email, and phone snapshots.

## Shipping, tax, and documents

- Automatic Komerce/RajaOngkir rates are verified again on the server.
- Flat rate, minimum-order free shipping, coupon free shipping, and store pickup
  are supported and configurable in Ecommerce Settings.
- Tax supports inclusive or exclusive pricing and stores the tax amount per order.
- Every order receives an invoice number. Admin and customer invoice views are
  printable; admins also have a packing-slip view.
- Shipping status can be updated through `POST /api/webhooks/shipping` using
  `SHIPPING_WEBHOOK_SECRET`.

## Catalog and merchandising

- Product variants support SKU, price override, stock, weight, image, and active state.
- Cart, checkout, stock reservation, cancellation, and return flows preserve variant data.
- Catalog supports search, category, sorting, price range, and pagination.
- Product pages include Product JSON-LD, verified reviews, moderation, wishlist,
  related products, and recently viewed products.
- Coupons support start dates, minimum purchase, per-customer limits, first-order
  rules, free shipping, product scope, customer scope, and global limits.

## Operations and analytics

- Orders support combined search/status/payment/date filters, bulk status updates,
  CSV export, invoice, and packing slip.
- Member accounts include order history, secure order links, and wishlist.
- Ecommerce analytics include net revenue, AOV, COGS/HPP, estimated gross profit,
  conversion, and repeat-customer rate. Customer LTV excludes unpaid/cancelled orders.

## Verification

- Prisma migration: `20260911100000_ecommerce_upgrade`.
- TypeScript: passed.
- Vitest: 198 tests passed.
- Next.js production build: passed.
