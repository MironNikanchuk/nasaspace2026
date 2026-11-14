export type Horizon = "geometric" | "terrain";
export type Coordinates = { latitude_deg: number; longitude_east_deg: number };
export type Scenario = {
  site_id?: string;
  coordinates?: Coordinates;
  start_utc: string;
  end_utc: string;
  horizon?: Horizon;
};
export type ScenarioPair = [Scenario, Scenario];
export type Site = Coordinates & {
  id: string;
  name: string;
  observer_altitude_km: number;
  source_site_id: string | null;
};
export type CatalogSite = {
  site: Site;
  start_utc: string;
  end_utc: string;
  supported_horizons: Horizon[];
};
export type Dataset = {
  version: string;
  ephemeris: string;
  step_minutes: number;
  coordinate_frame: string;
  ephemeris_source_url: string;
  site_source_url: string;
};
export type Catalog = {
  sites: CatalogSite[];
  dataset: Dataset;
  max_duration_days: number;
  custom_coordinates_supported: boolean;
  demo_only?: boolean;
};
export type Position = {
  azimuth_deg: number;
  elevation_deg: number;
  horizon_elevation_deg: number;
  above_horizon: boolean;
};
export type Sample = { time_utc: string; sun: Position; earth: Position };
export type Window = { start_utc: string; end_utc: string };
export type Result = {
  site: Site;
  start_utc: string;
  end_utc: string;
  ephemeris: string;
  model: {
    horizon: Horizon;
    visibility: string;
    resolution_m?: number;
    range_m?: number;
    observer_height_m?: number;
  };
  summary: {
    sun_visible_percent: number;
    earth_visible_percent: number;
    both_visible_percent: number;
    longest_sun_outage_hours: number;
    longest_earth_outage_hours: number;
  };
  windows: Record<"sun" | "earth" | "both", Window[]>;
  samples: Sample[];
};
export type Comparison = { dataset: Dataset; scenarios: [Result, Result]; demo_only?: boolean };
export type SavedScenario = {
  id: string;
  title: string;
  scenarios: ScenarioPair;
  created_at: string;
};
