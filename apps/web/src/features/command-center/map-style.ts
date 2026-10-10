/**
 * A deliberately quiet base map, coloured from our design tokens so it follows the theme
 * (ADR-0003). Only land, water and country borders — the sites are what matter.
 *
 * Tiles: OpenFreeMap (free, no API key). The map shows required OpenStreetMap attribution.
 * Note: tile requests go to tiles.openfreemap.org, so that service sees which map area is
 * viewed. A production deployment would use the company's own tile server.
 */
import type { StyleSpecification } from "maplibre-gl";

export const TILE_SOURCE_URL = "https://tiles.openfreemap.org/planet";

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function buildMapStyle(): StyleSpecification {
  const land = token("--pdm-bg-surface", "#ffffff");
  const water = token("--pdm-bg-sunken", "#eef0f3");
  const border = token("--pdm-border", "#d1d5db");
  return {
    version: 8,
    sources: {
      base: { type: "vector", url: TILE_SOURCE_URL },
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": land } },
      { id: "water", type: "fill", source: "base", "source-layer": "water", paint: { "fill-color": water } },
      {
        id: "countries",
        type: "line",
        source: "base",
        "source-layer": "boundary",
        filter: ["==", ["get", "admin_level"], 2],
        paint: { "line-color": border, "line-width": 0.8 },
      },
    ],
  };
}

/** WebGL is required by MapLibre. Without it (old devices, some VMs, test runners) we show the list instead. */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
