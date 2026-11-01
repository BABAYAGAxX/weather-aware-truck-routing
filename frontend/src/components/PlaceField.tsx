import { useEffect, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import { searchPlaces, type Place } from '../api'

interface Props {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
}

// A place counts only when picked from the list. Typed text that is not picked
// goes back to the last picked place when the field loses focus.
export default function PlaceField({ label, value, onChange }: Props) {
  const [text, setText] = useState('')
  const [options, setOptions] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const query = text.trim()
    if (query.length < 2 || query === value?.label) return
    let ignore = false // set when a newer keystroke makes this answer stale
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      setFailed(false)
      searchPlaces(query, controller.signal)
        .then((places) => {
          if (!ignore) setOptions(places)
        })
        .catch(() => {
          if (!ignore) {
            setOptions([])
            setFailed(true)
          }
        })
        .finally(() => {
          if (!ignore) setLoading(false)
        })
    }, 250)
    return () => {
      ignore = true
      controller.abort()
      clearTimeout(timer)
      setLoading(false)
    }
  }, [text, value])

  let noOptionsText = 'No places found'
  if (text.trim().length < 2) noOptionsText = 'Type at least 2 letters'
  else if (failed) noOptionsText = 'Address search is unavailable'

  return (
    <Autocomplete
      options={text.trim().length < 2 ? [] : options} // old answers never show for short text
      value={value}
      onChange={(_, place) => onChange(place)}
      inputValue={text}
      onInputChange={(_, next) => {
        setText(next)
        if (next.trim().length < 2) setFailed(false)
      }}
      getOptionLabel={(place) => place.label}
      getOptionKey={(place) => `${place.label} ${place.lat} ${place.lon}`} // TomTom can return the same label twice
      isOptionEqualToValue={(a, b) => a.label === b.label}
      filterOptions={(all) => all} // the server already matched the text
      loading={loading}
      loadingText="Searching..."
      noOptionsText={noOptionsText}
      renderInput={(params) => <TextField {...params} label={label} size="small" />}
    />
  )
}
