/**
 * Currency formatting utilities
 * Centralized location for all currency-related formatting
 */

/**
 * Format a number as INR currency
 * @param amount - The amount to format
 * @returns Formatted currency string (e.g., "₹1,234.56")
 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

/**
 * Extract just the numeric value from a formatted currency string
 * @param currencyString - Formatted currency string (e.g., "₹1,234.56")
 * @returns Numeric value (e.g., 1234.56)
 */
export function parseCurrency(currencyString: string): number {
  // Remove all non-numeric characters except decimal point
  const numericString = currencyString.replace(/[^0-9.-]+/g, '');
  return parseFloat(numericString) || 0;
}

/**
 * Get the currency symbol
 * @returns The currency symbol (₹ for INR)
 */
export function getCurrencySymbol(): string {
  return '₹';
}
