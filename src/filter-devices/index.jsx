import React from "react";
import { createRoot } from "react-dom/client";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import FilterDeviceCard from "./FilterDeviceCard";

const log = (...args) => {
  // Surface UI diagnostics to the console / Cloud Run logs.
  console.log("[filter-devices-ui]", ...args);
};

const MAX_RESULTS = 6;

const getInitialFilteredDevices = () => {
  const injected = window.__VISIBLE_FILTER_RESULTS__;
  const fromToolOutput =
    window?.openai?.toolOutput?.structuredContent?.results ||
    window?.openai?.toolOutput?.results;
  const initial = Array.isArray(injected)
    ? injected
    : Array.isArray(fromToolOutput)
    ? fromToolOutput
    : [];
  log("Initial injected devices", {
    count: initial.length,
    source: Array.isArray(injected)
      ? "injected_global"
      : Array.isArray(fromToolOutput)
      ? "toolOutput"
      : "none",
    invocationId: window?.openai?.invocation?.id,
  });
  return initial;
};

const areFiltersActive = (filters) =>
  Boolean(
    filters?.brand ||
      filters?.max_price ||
      filters?.condition ||
      filters?.color ||
      filters?.size ||
      filters?.query ||
      filters?.in_stock
  );

function DeviceCarousel({ devices }) {
  const hasDevices = Array.isArray(devices) && devices.length > 0;
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    loop: false,
    containScroll: "trimSnaps",
    slidesToScroll: "auto",
    dragFree: false,
  });
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);

  React.useEffect(() => {
    if (!emblaApi) return;
    const updateButtons = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };

    emblaApi.on("select", updateButtons);
    emblaApi.on("reInit", updateButtons);
    updateButtons();

    return () => {
      emblaApi.off("select", updateButtons);
      emblaApi.off("reInit", updateButtons);
    };
  }, [emblaApi]);

  React.useEffect(() => {
    if (emblaApi) emblaApi.reInit();
  }, [emblaApi, devices?.length]);

  if (!hasDevices) return null;

  return (
    <div className="relative antialiased w-full text-black py-5 bg-white">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4 max-sm:mx-5 items-stretch">
          {devices.map((device) => (
            <FilterDeviceCard key={device.id || device.title} device={device} />
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className={
          "pointer-events-none absolute inset-y-0 left-0 w-3 z-[5] transition-opacity duration-200 " +
          (canPrev ? "opacity-100" : "opacity-0")
        }
      >
        <div
          className="h-full w-full border-l border-black/15 bg-gradient-to-r from-black/10 to-transparent"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, white 30%, white 70%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, white 30%, white 70%, transparent 100%)",
          }}
        />
      </div>
      <div
        aria-hidden
        className={
          "pointer-events-none absolute inset-y-0 right-0 w-3 z-[5] transition-opacity duration-200 " +
          (canNext ? "opacity-100" : "opacity-0")
        }
      >
        <div
          className="h-full w-full border-r border-black/15 bg-gradient-to-l from-black/10 to-transparent"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent 0%, white 30%, white 70%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, transparent 0%, white 30%, white 70%, transparent 100%)",
          }}
        />
      </div>
      {canPrev && (
        <button
          aria-label="Previous"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center h-8 w-8 rounded-full bg-white text-black shadow-lg ring ring-black/5 hover:bg-white"
          onClick={() => emblaApi && emblaApi.scrollPrev()}
          type="button"
        >
          <ArrowLeft strokeWidth={1.5} className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
      )}
      {canNext && (
        <button
          aria-label="Next"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center h-8 w-8 rounded-full bg-white text-black shadow-lg ring ring-black/5 hover:bg-white"
          onClick={() => emblaApi && emblaApi.scrollNext()}
          type="button"
        >
          <ArrowRight strokeWidth={1.5} className="h-4.5 w-4.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function FilteredDevicesApp() {
  const [allDevices, setAllDevices] = React.useState([]);
  const [filteredDevices, setFilteredDevices] = React.useState(
    () => getInitialFilteredDevices() || []
  );
  const [filters, setFilters] = React.useState({});

  const filtersActive = areFiltersActive(filters);
  const hasFiltered = Array.isArray(filteredDevices) && filteredDevices.length > 0;
  const devicesToRender = React.useMemo(() => {
    const source = hasFiltered ? filteredDevices : allDevices;
    return Array.isArray(source) ? source : [];
  }, [hasFiltered, filteredDevices, allDevices]);

  const showEmptyFiltered = filtersActive && !hasFiltered;

  React.useEffect(() => {
    log("Effect: message listener attached");

    const safeParse = (value) => {
      if (typeof value !== "string") return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    };

    const extractStructuredContent = (raw) => {
      if (!raw || typeof raw !== "object") return undefined;
      const queue = [raw];
      const visited = new Set();
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || visited.has(current)) {
          continue;
        }
        visited.add(current);
        if (
          current.structuredContent &&
          typeof current.structuredContent === "object"
        ) {
          return current.structuredContent;
        }
        const candidates = [
          current.data,
          current.result,
          current.toolResult,
          current.toolInvocation,
          current.toolInvocationResult,
          current.payload,
        ];
        candidates.forEach((candidate) => {
          if (candidate && typeof candidate === "object") queue.push(candidate);
        });
      }
      return undefined;
    };

    const handler = (event) => {
      log("Message event received", {
        hasData: Boolean(event?.data),
        dataType: typeof event?.data,
      });
      const parsed = safeParse(event?.data);
      const structured =
        extractStructuredContent(parsed) || extractStructuredContent({ data: parsed });
      log("Resolved structured content", structured);

      const nextFilters =
        structured?.filters ??
        parsed?.filters ??
        parsed?.data?.filters ??
        parsed?.payload?.filters ??
        {};
      log("Next filters", nextFilters);

      const resultsArray = Array.isArray(structured?.results)
        ? structured.results
        : Array.isArray(structured)
        ? structured
        : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.data)
        ? parsed.data
        : undefined;
      log("Results array length", Array.isArray(resultsArray) ? resultsArray.length : "none");

      const unfiltered =
        structured?.allDevices ||
        structured?.all_devices ||
        structured?.all ||
        parsed?.allDevices;

      if (Array.isArray(unfiltered)) {
        log("Updating allDevices from payload", { count: unfiltered.length });
        setAllDevices(unfiltered);
      }

      if (Array.isArray(resultsArray)) {
        log("Updating filteredDevices from payload", { count: resultsArray.length });
        setFilteredDevices(resultsArray);
        setFilters(nextFilters || {});
      } else {
        log("No valid results array found in payload");
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  React.useEffect(() => {
    // Fallback in case the host injects window.__VISIBLE_FILTER_RESULTS__ later without postMessage
    let attempts = 0;
    const maxAttempts = 25; // ~5s at 200ms
    const timer = setInterval(() => {
      attempts += 1;
      const injected = window.__VISIBLE_FILTER_RESULTS__;
      const toolOutput =
        window?.openai?.toolOutput?.structuredContent?.results ||
        window?.openai?.toolOutput?.results;
      const candidate = Array.isArray(injected) ? injected : toolOutput;
      if (Array.isArray(injected) && injected.length > 0) {
        log("Detected injected global results", { count: injected.length });
        setFilteredDevices(injected);
        clearInterval(timer);
      } else if (Array.isArray(candidate) && candidate.length > 0) {
        log("Detected toolOutput results", { count: candidate.length });
        setFilteredDevices(candidate);
        clearInterval(timer);
      }
      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const summaryText = hasFiltered
    ? `Showing ${filteredDevices.length} filtered devices`
    : `Showing ${allDevices.length} available devices`;

  React.useEffect(() => {
    log("Render state", {
      allDevices: allDevices.length,
      filteredDevices: filteredDevices.length,
      filtersActive,
      devicesToRender: devicesToRender.length,
      showEmptyFiltered,
    });
  }, [allDevices.length, filteredDevices.length, filtersActive, devicesToRender.length, showEmptyFiltered]);

  return (
    <div className="min-h-screen w-full bg-white text-black">
      <section className="px-6 py-6 border-b border-black/5">
        <h1 className="text-2xl font-semibold mb-3">Filtered Devices</h1>
        <p className="text-sm text-black/70">{summaryText}</p>
      </section>

      <section className="px-6 py-8 space-y-6">
        {showEmptyFiltered ? (
          <p className="text-center text-black/60">No matching devices found</p>
        ) : (
          <>
            <DeviceCarousel devices={devicesToRender.slice(0, MAX_RESULTS)} />
          </>
        )}
      </section>
    </div>
  );
}

const mountApp = () => {
  let container =
    document.getElementById("visible-filter-devices-root") ||
    document.getElementById("filter-devices-root");

  if (!container) {
    log("Root element not found; creating fallback container");
    container = document.createElement("div");
    container.id = "visible-filter-devices-root";
    document.body.appendChild(container);
  }

  log("Mounting FilteredDevicesApp", {
    rootId: container?.id,
    hasVisibleRoot: Boolean(document.getElementById("visible-filter-devices-root")),
    hasFallbackRoot: Boolean(document.getElementById("filter-devices-root")),
    readyState: document.readyState,
  });

  const root = createRoot(container);
  root.render(<FilteredDevicesApp />);
};

if (document.readyState === "loading") {
  log("DOM not ready; deferring mount");
  document.addEventListener("DOMContentLoaded", mountApp, { once: true });
} else {
  mountApp();
}
