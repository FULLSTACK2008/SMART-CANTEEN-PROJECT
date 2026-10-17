const currencyCode = import.meta.env.VITE_CURRENCY || 'RWF'
const formatter = new Intl.NumberFormat('en-RW', {
  style: 'currency',
  currency: currencyCode,
  maximumFractionDigits: 0,
})

export function formatCurrency(value) {
  return formatter.format(Number(value || 0))
}

export { currencyCode }