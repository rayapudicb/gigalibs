'use client';

import { useSites } from '@/components/geospatial/SitePicker';
import { type PlacesImplementation, PlacesProvider, type PlacesState } from '@gigalibs/web-sdk';
import type { ReactNode } from 'react';

function useGeospatialPlaces(): PlacesState {
  const { sites, siteName } = useSites();
  return { places: sites, placeName: siteName };
}

const implementation: PlacesImplementation = { usePlaces: useGeospatialPlaces };

/** Fills the core place-picker slot (WI-OI-083b) with the Geospatial places the signed-in user can see. */
export function GeospatialPlacesProvider({ children }: { children: ReactNode }) {
  return <PlacesProvider implementation={implementation}>{children}</PlacesProvider>;
}
