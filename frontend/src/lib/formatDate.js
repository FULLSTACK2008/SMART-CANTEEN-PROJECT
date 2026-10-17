const weekdays = ['Ku Cyumweru', 'Kuwa mbere', 'Kuwa kabiri', 'Kuwa gatatu', 'Kuwa kane', 'Kuwa gatanu', 'Kuwa gatandatu']
const months = ['Mutarama', 'Gashyantare', 'Werurwe', 'Mata', 'Gicurasi', 'Kamena', 'Nyakanga', 'Kanama', 'Nzeri', 'Ukwakira', 'Ugushyingo', 'Ukuboza']

export function formatDate(value, locale = 'en', options = {}) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  if (locale !== 'rw') return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en', options).format(date)

  const parts = []
  if (options.weekday) parts.push(weekdays[date.getDay()])

  let datePart = ''
  if (options.day) datePart = String(date.getDate())
  if (options.month) datePart += `${datePart ? ' ' : ''}${months[date.getMonth()]}`
  if (options.year) datePart += `${datePart ? ' ' : ''}${date.getFullYear()}`
  if (datePart) parts.push(datePart)

  if (options.hour) {
    parts.push(new Intl.DateTimeFormat('en-GB', {
      hour: options.hour,
      minute: options.minute,
      hourCycle: 'h23',
    }).format(date))
  }

  return parts.join(', ')
}