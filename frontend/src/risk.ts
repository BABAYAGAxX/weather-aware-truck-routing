// Every color in the app lives here. Risk runs green to dark red; routes use blue, violet and magenta so they never look like a risk level.
export const RISK_LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']

export const CAUSE_LABELS = {
  wind: 'Wind',
  'wind+load': 'Wind with this load',
  rain: 'Rain',
  snow: 'Snow',
}

export const RISK_COLORS = ['#2f9e5b', '#e3c21f', '#f08c2b', '#d9372b', '#7a1020']

// Shared by the heatmap squares and the legend, so the two always match. Low is faint but never zero, so calm weather
// still shows, and No Travel is strongest because its dark color looks washed out at the others' strength.
export const HEAT_OPACITY = [0.18, 0.5, 0.5, 0.5, 0.75]

export const ROUTE_COLORS: Record<string, string> = {
  A: '#2563eb',
  B: '#8b5cf6',
  C: '#c026d3',
}

// Colors for the page itself (panel, borders, page background).
export const UI_COLORS = {
  page: '#eef1f4',
  panel: '#ffffff',
  border: '#d5dbe2',
  mapBackground: '#f4f4f2',
  checkpointEdge: '#ffffff',
}
