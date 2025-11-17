import React from "react";
import { Smartphone, Watch } from "lucide-react";

export default function FilterDeviceCard({ device }) {
  if (!device) return null;

  const priceValue =
    device?.sale_price?.value ??
    device?.price?.value ??
    device?.sale_price ??
    device?.price ??
    0;
  const price = Number(priceValue) || 0;
  const isWearable = device.product_category?.includes("Wearables");
  const inStock =
    device.availability === "in_stock" && (device.inventory_quantity ?? 0) > 0;

  const [imgError, setImgError] = React.useState(false);
  const fallbackSvg = React.useMemo(() => {
    const label = encodeURIComponent(device?.brand || "Device");
    return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300' fill='none'><rect width='300' height='300' rx='32' fill='%23f5f5f5'/><path d='M120 40h60c8.8 0 16 7.2 16 16v188c0 8.8-7.2 16-16 16h-60c-8.8 0-16-7.2-16-16V56c0-8.8 7.2-16 16-16z' stroke='%23000' stroke-opacity='0.08' stroke-width='8' fill='%23fff'/><circle cx='150' cy='250' r='10' fill='%23000' fill-opacity='0.08'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Inter, sans-serif' font-size='16' fill='%23707070'>${label}</text></svg>`;
  }, [device?.brand]);

  const imageSrc = !imgError && device.image_link ? device.image_link : fallbackSvg;

  return (
    <div className="min-w-[260px] select-none max-w-[260px] w-[70vw] sm:w-[260px] self-stretch flex flex-col bg-white rounded-2xl shadow-[0px_2px_12px_rgba(0,0,0,0.08)] ring ring-black/5 overflow-hidden">
      <div className="w-full bg-gradient-to-br from-gray-50 to-gray-100 p-6 relative">
        <div className="aspect-square w-full rounded-lg overflow-hidden mb-4 bg-white flex items-center justify-center">
          <img
            src={imageSrc}
            alt={device.title}
            className="w-full h-full object-contain p-4"
            loading="lazy"
            onError={(e) => {
              if (!imgError) {
                setImgError(true);
              }
              e.currentTarget.onerror = null;
            }}
          />
        </div>
        {!inStock && (
          <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-medium px-2 py-1 rounded">
            Low Stock
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="mb-3">
          <div className="text-lg font-semibold line-clamp-2 mb-1">{device.title}</div>
          <div className="text-sm text-black/60">{device.brand}</div>
        </div>

        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-2xl font-bold">${price.toFixed(0)}</span>
        </div>

        <div className="space-y-1.5 mb-4 text-sm text-black/70">
          {device.color && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Color:</span>
              <span>{device.color}</span>
            </div>
          )}
          {device.size && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Size:</span>
              <span>{device.size}</span>
            </div>
          )}
          {device.condition && (
            <div className="flex items-center gap-2">
              <span className="font-medium">Condition:</span>
              <span className="capitalize">{device.condition}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={() => window.open(device.link, '_blank')}
            className="cursor-pointer w-full inline-flex items-center justify-center gap-2 rounded-full bg-black text-white px-6 py-2.5 text-sm font-medium hover:bg-black/90 active:bg-black"
          >
            {isWearable ? <Watch className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            View Device
          </button>
        </div>
      </div>
    </div>
  );
}
