import { useEffect, useRef, useState } from 'react';
import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget, useDebounceCallback } from '@golemui/react';
import { searchPlaces } from '../services/geocoding';
import type { Place } from '../form/types';

interface AddressAutocompleteProps {
  placeholder?: string;
  lang?: string;
}

/**
 * Custom INPUT widget: an address field with type-as-you-search autocomplete.
 *
 * It owns its async geocoding (debounced Photon calls) and writes the picked
 * Place — label + coordinates — to its bound path via onValueChanged. Because
 * it's a real input widget, the engine resolves the per-row path inside the
 * Repeater for us (`trip.stops.items.place` -> `trip.stops.0.place`, ...).
 */
export function AddressAutocomplete(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<Place | null>;
  const { uid, value, templateData, onValueChanged, onBlur } =
    useInputWidget<Place | null, AddressAutocompleteProps>(widget);

  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the value changes from the outside
  // (e.g. initial data or a programmatic reset).
  useEffect(() => {
    setQuery(value?.label ?? '');
  }, [value?.label]);

  const runSearch = useDebounceCallback((q: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    searchPlaces(q, { lang: templateData.lang ?? 'en', signal: controller.signal })
      .then((places) => {
        setResults(places);
        setOpen(true);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setResults([]);
      })
      .finally(() => setLoading(false));
  }, 350);

  // Close the suggestion list on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function handleInput(next: string) {
    setQuery(next);
    if (next.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    runSearch(next);
  }

  function pick(place: Place) {
    onValueChanged(place);
    setQuery(place.label);
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="addr" ref={containerRef} style={{ flex: templateData.size }}>
      <div className="addr__field" id={uid}>
        <span className="addr__icon material-icons">place</span>
        <input
          className="addr__input"
          type="text"
          autoComplete="off"
          placeholder={templateData.placeholder ?? 'Type an address…'}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={onBlur}
        />
        {loading && <span className="addr__spinner" aria-hidden />}
      </div>

      {open && results.length > 0 && (
        <ul className="addr__list" role="listbox">
          {results.map((place, i) => (
            <li
              key={`${place.lat},${place.lng},${i}`}
              role="option"
              aria-selected={value?.label === place.label}
              className="addr__item"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
            >
              <span className="material-icons addr__item-icon">near_me</span>
              <span className="addr__item-label">{place.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
