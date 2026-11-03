// Supplier costs are returned only by the authenticated administrator endpoint.
import { cocktailFrom } from './_cocktail.js';

const VENDOR_SUPPLY = { 100: 800000, 200: 1100000, 300: 1500000, 400: 1800000 };

export function cocktailPricing() {
  return Object.entries(VENDOR_SUPPLY).map(([cups, vendor_supply]) => {
    const q = cocktailFrom({ cups: Number(cups) });
    const margin = q.price - vendor_supply;
    return { cups: q.cups, vendor_supply, sale_price: q.price, vat: q.vat,
      total: q.total, margin, margin_rate: margin / q.price };
  });
}
