import React from "react";
import { Check } from "lucide-react";

export default function FilterPlanCard({ plan }) {
  if (!plan) return null;

  const normalizeImageLink = (link) => {
    if (!link || typeof link !== "string") return null;
    const trimmed = link.trim();
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (trimmed.startsWith("http://")) return trimmed.replace(/^http:\/\//i, "https://");
    return trimmed;
  };

  const priceValue =
    plan?.sale_price?.value ??
    plan?.price?.value ??
    plan?.sale_price ??
    plan?.price ??
    0;
  const price = Number(priceValue) || 0;
  const [imgError, setImgError] = React.useState(false);
  const imageSrc = normalizeImageLink(plan.image_link);
  const fallbackSvg = React.useMemo(() => {
    const label = encodeURIComponent(plan?.title || "Plan");
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300' fill='none'><rect width='300' height='300' rx='32' fill='%23f5f5f5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, sans-serif' font-size='16' fill='%23707070'>${label}</text></svg>`;
  }, [plan?.title]);

  const resolvedSrc = !imgError && imageSrc ? imageSrc : fallbackSvg;

  return (
    <div className="min-w-[280px] select-none max-w-[280px] w-[75vw] sm:w-[280px] self-stretch flex flex-col bg-white rounded-2xl shadow-[0px_2px_12px_rgba(0,0,0,0.08)] ring ring-black/5 overflow-hidden">
      <div className="w-full bg-gradient-to-br from-[#000000] to-[#333333] p-6 text-white">
        <div className="aspect-square w-full rounded-lg overflow-hidden mb-4 bg-white/10 flex items-center justify-center">
          <img
            src={resolvedSrc}
            alt={plan.title}
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={(e) => {
              if (!imgError) setImgError(true);
              e.currentTarget.onerror = null;
            }}
          />
        </div>
        <div className="text-2xl font-bold">{plan.title}</div>
        <div className="text-sm mt-1 text-white/80">{plan.brand}</div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">${price.toFixed(2)}</span>
            <span className="text-sm text-black/60">/plan</span>
          </div>
        </div>

        {plan.description && (
          <div className="text-sm text-black/80 mb-4 flex-auto">
            {plan.description}
          </div>
        )}

        <div className="space-y-2 mb-4">
          <div className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>Unlimited Talk & Text</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>Unlimited Data</span>
          </div>
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => window.open(plan.link, "_blank")}
            className="cursor-pointer w-full inline-flex items-center justify-center rounded-full bg-black text-white px-6 py-2.5 text-sm font-medium hover:bg-black/90 active:bg-black"
          >
            View Plan
          </button>
        </div>
      </div>
    </div>
  );
}
