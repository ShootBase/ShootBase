import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = {
  lat: number;
  lng: number;
  city: string;
  country: string;
  users: number;
  activeUsers: number;
  revenuePence: number;
};

export default function GeoMap({ points }: { points: Point[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Initialise the map once. We use vanilla Leaflet to sidestep
  // react-leaflet's "Map container is already initialized" issue on React 19.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Reset any stale Leaflet id (defensive against React strict double-effects)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any)._leaflet_id = null;

    const center: [number, number] = points.length
      ? [
          points.reduce((s, p) => s + p.lat, 0) / points.length,
          points.reduce((s, p) => s + p.lng, 0) / points.length,
        ]
      : [54.5, -3];

    const map = L.map(el, {
      center,
      zoom: 5,
      scrollWheelZoom: false,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    // Ensure correct sizing after layout
    setTimeout(() => map.invalidateSize(), 50);

    return () => {
      map.remove();
      mapRef.current = null;
      if (el) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any)._leaflet_id = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when points change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const maxUsers = Math.max(1, ...points.map((p) => p.users));

    for (const p of points) {
      const ratio = p.users / maxUsers;
      const radius = 6 + Math.round(ratio * 22);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius,
        color: "hsl(220, 80%, 50%)",
        fillColor: "hsl(220, 90%, 55%)",
        fillOpacity: 0.35 + ratio * 0.4,
        weight: 1.5,
      }).addTo(layer);
      const revenue = p.revenuePence > 0 ? `<div>£${(p.revenuePence / 100).toFixed(0)} revenue</div>` : "";
      marker.bindTooltip(
        `<div style="font-size:12px">
           <div style="font-weight:600">${escapeHtml(p.city || "Unknown")}, ${escapeHtml(p.country)}</div>
           <div>${p.users} user${p.users === 1 ? "" : "s"} • ${p.activeUsers} active</div>
           ${revenue}
         </div>`,
        { direction: "top", offset: [0, -4], opacity: 1 },
      );
    }

    if (points.length) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.2), { maxZoom: 7, animate: false });
    }

    return () => {
      layer.remove();
    };
  }, [points]);

  return <div ref={containerRef} className="h-full w-full rounded-md overflow-hidden" />;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
