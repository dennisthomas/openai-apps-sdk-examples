import React from "react";
import { Check } from "lucide-react";

export default function PlanCard({ plan }) {
  if (!plan) return null;

  const price = plan.sale_price?.value || plan.price?.value || 0;
  const isAnnual = plan.title.toLowerCase().includes("annual");
  const monthlyPrice = isAnnual ? (price / 12).toFixed(2) : price.toFixed(2);

  return (
    <div className="min-w-[280px] select-none max-w-[280px] w-[75vw] sm:w-[280px] self-stretch flex flex-col bg-white rounded-2xl shadow-[0px_2px_12px_rgba(0,0,0,0.08)] ring ring-black/5 overflow-hidden">
      <div className="w-full bg-gradient-to-br from-[#000000] to-[#333333] p-6 text-white">
        <div className="aspect-square w-full rounded-lg overflow-hidden mb-4 bg-white/10 flex items-center justify-center">
          <img
            src={plan.image_link}
            alt={plan.title}
            className="w-full h-full object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = '<div class="text-4xl font-bold text-white/80">📱</div>';
            }}
          />
        </div>
        <div className="text-2xl font-bold">{plan.title}</div>
        <div className="text-sm mt-1 text-white/80">{plan.brand}</div>
      </div>

      <div className="p-6 flex flex-col flex-1">
        <div className="mb-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">${monthlyPrice}</span>
            <span className="text-sm text-black/60">/month</span>
          </div>
          {isAnnual && (
            <div className="text-xs text-black/60 mt-1">
              ${price.toFixed(2)} billed annually
            </div>
          )}
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
          {plan.title.toLowerCase().includes("plus") && (
            <div className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>Premium Features</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => window.open(plan.link, '_blank')}
            className="cursor-pointer w-full inline-flex items-center justify-center rounded-full bg-black text-white px-6 py-2.5 text-sm font-medium hover:bg-black/90 active:bg-black"
          >
            View Plan
          </button>
        </div>
      </div>
    </div>
  );
}
