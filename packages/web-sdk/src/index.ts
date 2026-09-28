// @gigalibs/web-sdk (ADR-0013 core, WI-OI-083b): shell services module web packages may use, instead of importing
// the shell or another module.
export {
  PlaceSelect,
  PlacesProvider,
  usePlaces,
  type PlaceOption,
  type PlacesImplementation,
  type PlacesState,
} from './places';
export { useCurrentUserId } from './session';
export { RecordsWorkspace, type RecordsWorkspaceProps } from './records-workspace';
