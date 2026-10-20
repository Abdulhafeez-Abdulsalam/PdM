/**
 * The interactive map. Loaded on demand (React.lazy) so MapLibre's ~800 KB isn't part of
 * the first page load. Site markers are real <button>s, so they work with the keyboard.
 */
import type { Site } from "@pdm/contracts";
import { HealthBadge } from "@pdm/ui";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { groupHealthLabel } from "../../shared/health";
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

  // One container element per site (React draws each marker into it with a portal),
  // kept as long as the set of sites doesn't change.
  const siteIds = sites.map((s) => s.id).join(",");
  const markerEls = useMemo(
    () =>
      new Map(
        siteIds
          .split(",")
          .filter(Boolean)
          .map((id) => [id, document.createElement("div")] as const),
      ),
    [siteIds],
  );
  const framed = useRef(false);

  // Attach the markers to the map (re-attached on each refresh — cheap for a dozen sites).
  // Frame all sites only the first time, so a refresh never moves the user's view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = sites.flatMap((site) => {
      const el = markerEls.get(site.id);
      return el ? [new Marker({ element: el }).setLngLat([site.location.lon, site.location.lat]).addTo(map)] : [];
    });
    if (!framed.current && sites.length > 0) {
      const bounds = new LngLatBounds();
      sites.forEach((s) => bounds.extend([s.location.lon, s.location.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 5, duration: 0 });
      framed.current = true;
    }
    return () => markers.forEach((m) => m.remove());
  }, [sites, markerEls]);

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
            title={`${site.name} — ${groupHealthLabel(t, site.health, site.healthCounts)}`}
            aria-label={t("commandCenter.siteMarker", { site: site.name, health: groupHealthLabel(t, site.health, site.healthCounts) })}
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
