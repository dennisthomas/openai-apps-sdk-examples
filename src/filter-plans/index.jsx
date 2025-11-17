import React from "react";
import { createRoot } from "react-dom/client";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import FilterPlanCard from "./FilterPlanCard";
import plansFallback from "../visible-plans/plans.json";

const log = (...args) => {
  console.log("[filter-plans-ui]", ...args);
};

const MAX_RESULTS = 6;

const normalizePlanTerm = (value) => {
  if (!value) return null;
  const text = String(value).toLowerCase();
  if (text.includes("annual") || text.includes("year")) return "annual";
  if (text.includes("6") && text.includes("month")) return "6-month";
  if (text.includes("monthly") || text.includes("month")) return "monthly";
  return null;
};

const getInitialPlans = () => {
  const injected = window.__VISIBLE_FILTER_RESULTS__;
  const fromToolOutput =
    window?.openai?.toolOutput?.structuredContent?.results ||
    window?.openai?.toolOutput?.results;
  const initial = Array.isArray(injected)
    ? injected
    : Array.isArray(fromToolOutput)
    ? fromToolOutput
    : plansFallback || [];
  log("Initial injected plans", {
    count: initial.length,
    source: Array.isArray(injected)
      ? "injected_global"
      : Array.isArray(fromToolOutput)
      ? "toolOutput"
      : "fallback",
    invocationId: window?.openai?.invocation?.id,
  });
  return initial;
};

const areFiltersActive = (filters) =>
  Boolean(filters?.term || filters?.query);

function PlanCarousel({ plans }) {
  const hasPlans = Array.isArray(plans) && plans.length > 0;
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
  }, [emblaApi, plans?.length]);

  if (!hasPlans) return null;

  return (
    <div className="relative antialiased w-full text-black py-5 bg-white">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4 max-sm:mx-5 items-stretch">
          {plans.map((plan) => (
            <FilterPlanCard key={plan.id || plan.title} plan={plan} />
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

export function FilteredPlansApp() {
  const [plans, setPlans] = React.useState(() => getInitialPlans() || []);
  const [filters, setFilters] = React.useState({});

  const filtersActive = areFiltersActive(filters);
  const effectiveTerm =
    normalizePlanTerm(filters?.term) || normalizePlanTerm(filters?.query);

  const plansToRender = React.useMemo(() => {
    if (!Array.isArray(plans)) return [];
    if (!effectiveTerm) return plans;
    return plans.filter((plan) => {
      const term = normalizePlanTerm(plan?.title) || normalizePlanTerm(plan?.description);
      return term === effectiveTerm;
    });
  }, [plans, effectiveTerm]);

  const hasPlans = plansToRender.length > 0;

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

      if (Array.isArray(resultsArray)) {
        setPlans(resultsArray);
        setFilters(nextFilters || {});
      } else {
        log("No valid results array found in payload");
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  React.useEffect(() => {
    // Pick up injected toolOutput if present
    let attempts = 0;
    const maxAttempts = 25; // ~5s at 200ms
    const maybeInject = () => {
      const injected = window.__VISIBLE_FILTER_RESULTS__;
      const fromToolOutput =
        window?.openai?.toolOutput?.structuredContent?.results ||
        window?.openai?.toolOutput?.results;
      const candidate = Array.isArray(injected) ? injected : fromToolOutput;
      if (Array.isArray(candidate) && candidate.length > 0) {
        log("Detected injected plans post-mount", { count: candidate.length });
        setPlans(candidate);
        return true;
      }
      return false;
    };

    if (maybeInject()) return;

    const timer = setInterval(() => {
      attempts += 1;
      if (maybeInject() || attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, []);

  const summaryText = hasPlans
    ? `Showing ${plansToRender.length} filtered plans`
    : "No matching plans found";

  return (
    <div className="min-h-screen w-full bg-white text-black">
      <section className="px-6 py-6 border-b border-black/5">
        <h1 className="text-2xl font-semibold mb-3">Filtered Plans</h1>
        <p className="text-sm text-black/70">{summaryText}</p>
      </section>

      <section className="px-6 py-8 space-y-6">
        {!hasPlans ? (
          <p className="text-center text-black/60">No matching plans found</p>
        ) : (
          <PlanCarousel plans={plansToRender.slice(0, MAX_RESULTS)} />
        )}
      </section>
    </div>
  );
}

const mountApp = () => {
  let container =
    document.getElementById("visible-filter-plans-root") ||
    document.getElementById("filter-plans-root");

  if (!container) {
    log("Root element not found; creating fallback container");
    container = document.createElement("div");
    container.id = "visible-filter-plans-root";
    document.body.appendChild(container);
  }

  log("Mounting FilteredPlansApp", {
    rootId: container?.id,
    hasVisibleRoot: Boolean(document.getElementById("visible-filter-plans-root")),
    hasFallbackRoot: Boolean(document.getElementById("filter-plans-root")),
    readyState: document.readyState,
  });

  const root = createRoot(container);
  root.render(<FilteredPlansApp />);
};

if (document.readyState === "loading") {
  log("DOM not ready; deferring mount");
  document.addEventListener("DOMContentLoaded", mountApp, { once: true });
} else {
  mountApp();
}
