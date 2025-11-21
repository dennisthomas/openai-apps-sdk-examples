import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createRoot } from "react-dom/client";
import stores from "./stores.json";
import { useWidgetProps } from "../use-widget-props";
import "./map.css";
import { MapPin, Phone, Clock } from "lucide-react";

mapboxgl.accessToken =
  "pk.eyJ1IjoiZXJpY25pbmciLCJhIjoiY21icXlubWM1MDRiczJvb2xwM2p0amNyayJ9.n-3O6JI5nOp_Lw96ZO5vJQ";

function fitMapToMarkers(map, coords) {
  if (!map || !coords.length) return;
  if (coords.length === 1) {
    map.flyTo({ center: coords[0], zoom: 12 });
    return;
  }
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { padding: 80, animate: true });
}

function StorePopup({ store }) {
  return (
    <div className="store-popup">
      <h3 className="font-semibold text-base mb-2">{store.name}</h3>
      <div className="space-y-1 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <span>{store.address}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-red-600 flex-shrink-0" />
          <span>{store.phone}</span>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
          <span>{store.hours}</span>
        </div>
      </div>
      <a
        href={`https://www.google.com/maps/dir/?api=1&destination=${store.coords[1]},${store.coords[0]}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mt-3 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
      >
        Get Directions
      </a>
    </div>
  );
}

export default function App() {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markerObjs = useRef([]);
  const widgetData = useWidgetProps();
  const allStores = stores?.stores || [];
  
  // Filter stores based on widget data (location from MCP tool)
  const filteredStores = React.useMemo(() => {
    if (!widgetData?.location) return allStores;
    
    const { city, state, zip } = widgetData.location;
    
    return allStores.filter((store) => {
      if (city && store.city.toLowerCase() !== city.toLowerCase()) return false;
      if (state && store.state.toLowerCase() !== state.toLowerCase()) return false;
      if (zip && store.zip !== zip) return false;
      return true;
    });
  }, [widgetData, allStores]);

  const storeCoords = filteredStores.map((s) => s.coords);
  const [selectedStore, setSelectedStore] = useState(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: storeCoords[0] || [-96.7970, 32.7767],
      zoom: 10,
    });

    mapObj.current = map;

    map.on("load", () => {
      fitMapToMarkers(map, storeCoords);
    });

    return () => {
      markerObjs.current.forEach((m) => m.remove());
      markerObjs.current = [];
      map.remove();
      mapObj.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;

    // Remove old markers
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];

    // Add new markers
    filteredStores.forEach((store) => {
      const el = document.createElement("div");
      el.className = "custom-marker";
      el.innerHTML = `
        <div class="marker-pin">
          <svg width="30" height="40" viewBox="0 0 30 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.716 0 0 6.716 0 15c0 11.25 15 25 15 25s15-13.75 15-25c0-8.284-6.716-15-15-15z" fill="#EF0000"/>
            <circle cx="15" cy="15" r="8" fill="white"/>
          </svg>
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(store.coords)
        .addTo(map);

      // Create popup
      const popupContainer = document.createElement("div");
      const root = createRoot(popupContainer);
      root.render(<StorePopup store={store} />);

      const popup = new mapboxgl.Popup({ offset: 25, maxWidth: "300px" })
        .setDOMContent(popupContainer);

      marker.setPopup(popup);

      el.addEventListener("click", () => {
        setSelectedStore(store);
      });

      markerObjs.current.push(marker);
    });

    fitMapToMarkers(map, storeCoords);
  }, [filteredStores]);

  return (
    <div className="store-locator-container">
      <div className="store-sidebar">
        <div className="sidebar-header">
          <h2 className="text-lg font-bold">
            {filteredStores.length} {filteredStores.length === 1 ? "Store" : "Stores"} Found
          </h2>
          {widgetData?.location && (
            <p className="text-sm text-gray-600 mt-1">
              {widgetData.location.city && `${widgetData.location.city}, `}
              {widgetData.location.state}
            </p>
          )}
        </div>
        <div className="store-list">
          {filteredStores.map((store) => (
            <div
              key={store.id}
              className={`store-item ${selectedStore?.id === store.id ? "selected" : ""}`}
              onClick={() => {
                setSelectedStore(store);
                mapObj.current?.flyTo({ center: store.coords, zoom: 14 });
              }}
            >
              <h3 className="font-semibold text-sm mb-1">{store.name}</h3>
              <p className="text-xs text-gray-600 mb-1">{store.address}</p>
              <p className="text-xs text-gray-500">{store.phone}</p>
              <p className="text-xs text-gray-500 mt-1">{store.hours}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="map-container" ref={mapRef} />
    </div>
  );
}
