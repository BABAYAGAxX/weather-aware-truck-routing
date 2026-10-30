// Text formats shared by the route cards and the map popups.
const DATE_AND_TIME = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function formatArrival(iso: string): string {
  return new Date(iso).toLocaleString([], DATE_AND_TIME)
}

export function formatEta(iso: string): string {
  return new Date(iso).toLocaleString([], { ...DATE_AND_TIME, timeZoneName: 'short' })
}

// Like "+6 h, Sat 8:00 PM PDT". Adding to the timestamp is UTC math; only the text is local.
export function formatForecastHour(departure: string, hour: number): string {
  const time = new Date(new Date(departure).getTime() + hour * 3_600_000)
  const day = time.toLocaleDateString([], { weekday: 'short' })
  const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  return `+${hour} h, ${day} ${clock}`
}
