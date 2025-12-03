import React from "react";
import { Check } from "lucide-react";

export default function PlanCard({ plan }) {
  if (!plan) return null;

  const price = plan.sale_price?.value || plan.price?.value || 0;
  const isAnnual = plan.title.toLowerCase().includes("annual");
  const monthlyPrice = isAnnual ? (price / 12).toFixed(2) : price.toFixed(2);

  return (
    <div className="min-w-[220px] select-none max-w-[220px] w-[65vw] sm:w-[220px] self-stretch flex flex-col">
      <div className="w-full">
        <img
          src={plan.image_link}
          alt={plan.title}
          className="w-full aspect-square rounded-2xl object-cover ring ring-black/5 shadow-[0px_2px_6px_rgba(0,0,0,0.06)]"
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="60"%3E📱%3C/text%3E%3C/svg%3E';
          }}
        />
      </div>
      <div className="mt-3 flex flex-col flex-1">
        <div className="text-base font-medium truncate line-clamp-1 text-gray-900 dark:text-white" style={{color: 'light-dark(#111827, #ffffff)'}}>{plan.title}</div>
        <div className="text-xs mt-1 text-gray-600 dark:text-gray-300 flex items-center gap-1" style={{color: 'light-dark(#4b5563, #d1d5db)'}}>
          <span className="font-semibold">${monthlyPrice}/mo</span>
          {isAnnual && <span>· Annual</span>}
        </div>
        {plan.description && (
          <div className="text-sm mt-2 text-gray-700 dark:text-gray-300 flex-auto line-clamp-2" style={{color: 'light-dark(#374151, #d1d5db)'}}>
            {plan.description}
          </div>
        )}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => window.open(plan.link, '_blank')}
            className="cursor-pointer inline-flex items-center rounded-full bg-[#1800ff] text-white px-4 py-1.5 text-sm font-medium hover:opacity-90 active:opacity-100"
          >
            View on Visible.com
          </button>
        </div>
      </div>
    </div>
  );
}
