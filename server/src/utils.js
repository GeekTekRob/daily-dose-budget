import dayjs from 'dayjs'

export function nextOccurrence(startDate, recurringType) {
  const d = dayjs(startDate)
  const rt = String(recurringType || '').toLowerCase()
  if (rt === 'weekly') return d.add(1, 'week').format('YYYY-MM-DD')
  if (rt === 'bi-weekly' || rt === 'biweekly') return d.add(2, 'week').format('YYYY-MM-DD')
  if (rt === 'semi-monthly' || rt === 'semimonthly') {
    const day = d.date()
    if (day < 15) return d.date(15).format('YYYY-MM-DD')
    const firstNext = d.add(1, 'month').date(1)
    return firstNext.format('YYYY-MM-DD')
  }
  if (rt === 'annually' || rt === 'yearly') return d.add(1, 'year').format('YYYY-MM-DD')
  return d.add(1, 'month').format('YYYY-MM-DD')
}
