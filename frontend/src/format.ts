// Text formats shared by the route cards and the map popups.

// Like "14h 49m", or "45m" under an hour.
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function formatMiles(miles: number, digits = 0): string {
  return miles.toLocaleString([], { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatEta(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

// Like "Wed 7:39 am", in the browser's time zone.
export function formatDayTime(time: Date): string {
  const day = time.toLocaleDateString([], { weekday: 'short' })
  const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  return `${day} ${clock}`
}

// Like "Departure +6h · Sat 8:00 pm". Adding to the timestamp is UTC math; only the text is local.
export function formatForecastHour(departure: string, hour: number): string {
  const time = new Date(new Date(departure).getTime() + hour * 3_600_000)
  if (isNaN(time.getTime())) return '' // the departure field is empty
  return `Departure +${hour}h · ${formatDayTime(time)}`
}
