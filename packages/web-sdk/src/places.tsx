'use client';

import { type ReactNode, createContext, useContext } from 'react';

/** A place the signed-in user may pick (site, building, line …); modules store only its id. */
export interface PlaceOption {
  readonly id: string;
  readonly label: string;
}

export interface PlacesState {
  readonly places: readonly PlaceOption[];
  readonly placeName: (placeRef: string | null) => string;
}

/**
 * The place-picker slot (WI-OI-083b). A module never imports the Geospatial module; the shell mounts a provider
 * whose hook reads the places the user can see. Without a provider (Geospatial not installed, or no Maps access)
 * the picker is empty and names fall back to a short id, as before.
 */
export interface PlacesImplementation {
  readonly usePlaces: () => PlacesState;
}

const PlacesContext = createContext<PlacesImplementation | null>(null);

export function PlacesProvider({
  implementation,
  children,
}: { implementation: PlacesImplementation; children: ReactNode }) {
  return <PlacesContext.Provider value={implementation}>{children}</PlacesContext.Provider>;
}

function useNoPlaces(): PlacesState {
  return {
    places: [],
    placeName: (placeRef) => (placeRef ? `Place ${placeRef.slice(0, 8)}` : 'No site'),
  };
}

export function usePlaces(): PlacesState {
  const implementation = useContext(PlacesContext);
  // The provider is mounted once for the app, so the same hook runs on every render.
  return (implementation?.usePlaces ?? useNoPlaces)();
}

// Native selects keep FormData and empty options; this matches the Medusa Input field style.
const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export function PlaceSelect({
  id,
  name,
  defaultValue,
  places,
  label,
}: {
  id: string;
  name: string;
  defaultValue?: string | null;
  places: readonly PlaceOption[];
  label?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue ?? ''}
      className={selectClass}
      aria-label={label}
    >
      <option value="">No site</option>
      {places.map((place) => (
        <option key={place.id} value={place.id}>
          {place.label}
        </option>
      ))}
    </select>
  );
}
