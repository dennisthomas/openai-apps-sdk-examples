import React from "react";
import { Star } from "lucide-react";

export default function DeviceCard({ device }) {
  if (!device) return null;

  const price = device.sale_price?.value || device.price?.value || 0;
  const inStock = device.availability === "in_stock" && device.inventory_quantity > 0;

  return (
    <div className="min-w-[220px] select-none max-w-[220px] w-[65vw] sm:w-[220px] self-stretch flex flex-col">
      <div className="w-full">
        <img
          src={device.image_link}
          alt={device.title}
          className="w-full aspect-square rounded-2xl object-cover ring ring-black/5 shadow-[0px_2px_6px_rgba(0,0,0,0.06)]"
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23f3f4f6"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="60"%3E📱%3C/text%3E%3C/svg%3E';
          }}
        />
      </div>
      <div className="mt-3 flex flex-col flex-1">
        <div className="text-base font-medium truncate line-clamp-1 text-gray-900 dark:text-white" style={{color: 'light-dark(#111827, #ffffff)'}}>{device.title}</div>
        <div className="text-xs mt-1 text-gray-600 dark:text-gray-300 flex items-center gap-1" style={{color: 'light-dark(#4b5563, #d1d5db)'}}>
          <span className="font-semibold">${price}</span>
          {device.condition && <span>· {device.condition === "used" ? "Refurbished" : device.condition}</span>}
          {!inStock && <span>· Low Stock</span>}
        </div>
        {(device.color || device.size) && (
          <div className="text-sm mt-2 text-gray-700 dark:text-gray-300 flex-auto" style={{color: 'light-dark(#374151, #d1d5db)'}}>
            {device.color && <span>{device.color}</span>}
            {device.color && device.size && <span> · </span>}
            {device.size && <span>{device.size}</span>}
          </div>
        )}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => window.open(device.link, '_blank')}
            className="cursor-pointer inline-flex items-center rounded-full bg-[#1800ff] text-white px-4 py-1.5 text-sm font-medium hover:opacity-90 active:opacity-100"
          >
            View on Visible.com
          </button>
        </div>
      </div>
    </div>
  );
}
