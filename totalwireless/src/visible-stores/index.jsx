import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createRoot } from "react-dom/client";
import stores from "./stores.json";
import { useWidgetProps } from "../use-widget-props";
import { useOpenAiGlobal } from "../use-openai-global";
import { useMaxHeight } from "../use-max-height";
import "./map.css";
import { MapPin, Phone, Clock, Star, Maximize2 } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { AnimatePresence, motion } from "framer-motion";

mapboxgl.accessToken =
  "pk.eyJ1IjoiZXJpY25pbmciLCJhIjoiY21icXlubWM1MDRiczJvb2xwM2p0amNyayJ9.n-3O6JI5nOp_Lw96ZO5vJQ";

function fitMapToMarkers(map, coords) {
  if (!map || !coords.length) return;
  if (coords.length === 1) {
    map.flyTo({ center: coords[0], zoom: 13 });
    return;
  }
  const bounds = coords.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coords[0], coords[0])
  );
  map.fitBounds(bounds, { 
    padding: { top: 100, bottom: 100, left: 100, right: 100 },
    maxZoom: 15,
    animate: true 
  });
}

function StoreCard({ store, isSelected, onClick }) {
  return (
    <div
      className={
        "rounded-2xl px-3 select-none hover:bg-black/5 cursor-pointer" +
        (isSelected ? " bg-black/5" : "")
      }
    >
      <div
        className={`border-b ${
          isSelected ? "border-black/0" : "border-black/5"
        } hover:border-black/0`}
      >
        <button
          className="w-full text-left py-3 transition flex gap-3 items-start"
          onClick={onClick}
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{store.name}</div>
            <div className="text-xs text-black/50 mt-1 flex items-start gap-1">
              <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{store.address}, {store.city}, {store.state} {store.zip}</span>
            </div>
            <div className="text-xs text-black/50 mt-1 flex items-center gap-1">
              <Phone className="h-3 w-3 flex-shrink-0" />
              {store.phone}
            </div>
            <div className="text-xs text-black/50 mt-1 flex items-start gap-1">
              <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
              {store.hours}
            </div>
          </div>
        </button>
      </div>
    </div>
  );
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
  const displayMode = useOpenAiGlobal("displayMode");
  const maxHeight = useMaxHeight() ?? undefined;
  const forceMobile = displayMode !== "fullscreen";
  const [emblaRef] = useEmblaCarousel({ dragFree: true, loop: false });
  const scrollRef = useRef(null);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const hasInitiallyFit = useRef(false);
  const [isDataReady, setIsDataReady] = useState(false);
  
  const allStores = stores?.stores || [];
  
  // Filter stores based on widget data (location from MCP tool)
  const filteredStores = React.useMemo(() => {
    // Only return stores after widgetData has been checked
    if (widgetData === null) return []; // Still loading
    
    if (!widgetData?.location) {
      // No location filter, use all stores
      setIsDataReady(true);
      return allStores;
    }
    
    const { city, state, zip } = widgetData.location;
    
    const filtered = allStores.filter((store) => {
      if (city && store.city.toLowerCase() !== city.toLowerCase()) return false;
      if (state && store.state.toLowerCase() !== state.toLowerCase()) return false;
      if (zip && store.zip !== zip) return false;
      return true;
    });
    
    setIsDataReady(true);
    return filtered;
  }, [widgetData, allStores]);

  const storeCoords = filteredStores.map((s) => s.coords);
  const [selectedStore, setSelectedStore] = useState(null);

  const updateBottomFadeVisibility = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom =
      Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight;
    setShowBottomFade(!atBottom);
  }, []);

  React.useEffect(() => {
    updateBottomFadeVisibility();
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => updateBottomFadeVisibility();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateBottomFadeVisibility);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateBottomFadeVisibility);
    };
  }, [filteredStores, updateBottomFadeVisibility]);

  // Create map only once
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [-96.7970, 32.7767], // Default center - will be updated by markers
      zoom: 4,
    });

    mapObj.current = map;

    // Ensure map resizes properly
    requestAnimationFrame(() => map.resize());
    window.addEventListener("resize", map.resize);

    return () => {
      window.removeEventListener("resize", map.resize);
      if (mapObj.current) {
        mapObj.current.remove();
        mapObj.current = null;
      }
    };
  }, []);

  // Update markers when filtered stores change
  useEffect(() => {
    const map = mapObj.current;
    // Don't add markers until data is ready and we have stores
    if (!map || !isDataReady || !filteredStores.length) return;

    // Remove old markers
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];

    // Add new markers
    filteredStores.forEach((store) => {
      const marker = new mapboxgl.Marker({
        color: "#ee2000", // Red color
      })
        .setLngLat(store.coords)
        .addTo(map);

      const el = marker.getElement();
      if (el) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => {
          setSelectedStore(store);
          map.flyTo({ center: store.coords, zoom: 14, speed: 1.2, curve: 1.6 });
        });
      }

      markerObjs.current.push(marker);
    });

    // Fit map to markers only on first load or when stores change significantly
    if (!hasInitiallyFit.current || markerObjs.current.length > 0) {
      fitMapToMarkers(map, storeCoords);
      hasInitiallyFit.current = true;
    }
  }, [filteredStores, isDataReady]);

  // Ensure Mapbox resizes when container maxHeight/display mode changes
  useEffect(() => {
    if (!mapObj.current) return;
    mapObj.current.resize();
  }, [maxHeight, displayMode]);

  function panTo(store) {
    if (!mapObj.current) return;
    mapObj.current.flyTo({
      center: store.coords,
      zoom: 14,
      speed: 1.2,
      curve: 1.6,
    });
  }

  return (
    <div
      style={{
        maxHeight,
        height: displayMode === "fullscreen" ? maxHeight - 40 : 480,
      }}
      className={
        "relative antialiased w-full min-h-[480px] overflow-hidden " +
        (displayMode === "fullscreen"
          ? "rounded-none border-0"
          : "border border-black/10 dark:border-white/10 rounded-2xl sm:rounded-3xl")
      }
    >
      {displayMode !== "fullscreen" && (
        <button
          aria-label="Enter fullscreen"
          className="absolute top-4 right-4 z-30 rounded-full bg-white text-black shadow-lg ring ring-black/5 p-2.5 pointer-events-auto"
          onClick={() => {
            if (window?.webplus?.requestDisplayMode) {
              window.webplus.requestDisplayMode({ mode: "fullscreen" });
            }
          }}
        >
          <Maximize2
            strokeWidth={1.5}
            className="h-4.5 w-4.5"
            aria-hidden="true"
          />
        </button>
      )}

      {/* Desktop/Tablet sidebar */}
      <div
        className={`${
          forceMobile ? "hidden" : ""
        } absolute inset-y-0 bottom-4 left-0 z-20 w-[340px] max-w-[75%] pointer-events-auto`}
      >
        <div
          ref={scrollRef}
          className="relative px-2 h-full overflow-y-auto bg-white text-black"
        >
          <div className="flex justify-between flex-row items-center px-3 sticky bg-white top-0 py-4 text-md font-medium">
            {filteredStores.length} {filteredStores.length === 1 ? "store" : "stores"}
          </div>
          <div>
            {filteredStores.map((store) => (
              <StoreCard
                key={store.id}
                store={store}
                isSelected={selectedStore?.id === store.id}
                onClick={() => {
                  setSelectedStore(store);
                  panTo(store);
                }}
              />
            ))}
          </div>
        </div>
        <AnimatePresence>
          {showBottomFade && (
            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-9 z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div
                className="w-full h-full bg-gradient-to-t border-b border-black/50 from-black/15 to-black/0"
                style={{
                  WebkitMaskImage:
                    "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0) 100%)",
                  maskImage:
                    "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0) 100%)",
                }}
                aria-hidden
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile bottom carousel */}
      <div
        className={`${
          forceMobile ? "" : "hidden"
        } absolute inset-x-0 bottom-0 z-20 pointer-events-auto`}
      >
        <div className="pt-2 text-black">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="px-3 py-3 flex gap-3">
              {filteredStores.map((store) => (
                <div 
                  key={store.id}
                  className="ring ring-black/10 max-w-[330px] w-full shadow-xl rounded-2xl bg-white"
                >
                  <StoreCard
                    store={store}
                    isSelected={selectedStore?.id === store.id}
                    onClick={() => {
                      setSelectedStore(store);
                      panTo(store);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div
        className={
          "absolute inset-0 overflow-hidden" +
          (displayMode === "fullscreen"
            ? " left-[340px] right-2 top-2 bottom-4 border border-black/10 rounded-3xl"
            : "")
        }
      >
        <div
          ref={mapRef}
          className="w-full h-full absolute bottom-0 left-0 right-0"
          style={{
            maxHeight,
            height: displayMode === "fullscreen" ? maxHeight : undefined,
          }}
        />
      </div>
    </div>
  );
}

const container = document.getElementById("visible-stores-root");
if (!container) throw new Error("Root element not found");
const root = createRoot(container);
root.render(<App />);
