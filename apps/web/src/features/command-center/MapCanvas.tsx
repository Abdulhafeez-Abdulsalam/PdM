/**
 * The interactive map. Loaded on demand (React.lazy) so MapLibre's ~800 KB isn't part of
 * the first page load. Site markers are real <button>s, so they work with the keyboard.
 */
import type { Site } from "@pdm/contracts";
import { HealthBadge } from "@pdm/ui";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { buildMapStyle } from "./map-style";

interface Props {
  sites: readonly Site[];
  onSelectSite: (siteId: string) => void;
}

export default function MapCanvas({ sites, onSelectSite }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const theme = usePreferences((p) => p.theme);
  // One DOM element per site; React draws the marker into it with a portal.
  const [markerEls, setMarkerEls] = useState<Map<string, HTMLElement>>(new Map());

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildMapStyle(),
      center: [20, 20],
      zoom: 1.2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Re-colour when the theme changes (tokens have new values).
  useEffect(() => {
    mapRef.current?.setStyle(buildMapStyle());
  }, [theme]);

  // Add a marker per site, and frame them all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || sites.length === 0) return;
    const els = new Map<string, HTMLElement>();
    const markers = sites.map((site) => {
      const el = document.createElement("div");
      els.set(site.id, el);
      return new Marker({ element: el }).setLngLat([site.location.lon, site.location.lat]).addTo(map);
    });
    setMarkerEls(els);
    const bounds = new LngLatBounds();
    sites.forEach((s) => bounds.extend([s.location.lon, s.location.lat]));
    map.fitBounds(bounds, { padding: 48, maxZoom: 5, duration: 0 });
    return () => markers.forEach((m) => m.remove());
    // Deliberately keyed on the list of site ids: re-run when sites are added or removed,
    // not on every health refresh (the portal below re-draws markers for those).
  }, [sites.map((s) => s.id).join(",")]);

  return (
    <div className="overflow-hidden rounded-md">
      {/* MapLibre's CSS sets position:relative on this element, so it needs its own fixed height. */}
      <div ref={containerRef} className="h-[360px] w-full" role="region" aria-label={t("commandCenter.mapLabel")} />
      {sites.map((site) => {
        const el = markerEls.get(site.id);
        if (!el) return null;
        return createPortal(
          // Icon-only so nearby sites don't overlap; the name is in the tooltip and read out by screen readers.
          <button
            type="button"
            onClick={() => onSelectSite(site.id)}
            title={`${site.name} — ${t(`health.${site.health}`)}`}
            aria-label={t("commandCenter.siteMarker", { site: site.name, health: t(`health.${site.health}`) })}
            className="grid size-7 place-items-center rounded-full border border-line bg-raised shadow-1 hover:scale-110 focus-visible:scale-110"
          >
            <HealthBadge compact state={site.health} label="" />
          </button>,
          el,
          site.id,
        );
      })}
    </div>
  );
}
