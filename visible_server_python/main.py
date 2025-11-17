"""Visible MCP server implemented with FastMCP + FastAPI.

The server mirrors the Node implementation by exposing the Visible plans and
devices widgets, serving the compiled assets from /assets, and wiring the MCP
SSE transport so ChatGPT can render the widgets in conversations."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, JSONResponse

logging.basicConfig(level=logging.DEBUG)

@dataclass(frozen=True)
class VisibleWidget:
    identifier: str
    title: str
    template_uri: str
    invoking: str
    invoked: str
    html: str
    response_text: str


ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"
SRC_DIR = Path(__file__).resolve().parent.parent / "src"
MIME_TYPE = "text/html+skybridge"
FILTER_DEVICES_TOOL_NAME = "filter-devices"
FILTER_DEVICES_WIDGET_ID = "filter-devices-widget"
FILTER_DEVICES_DESCRIPTION = """Use this when the user wants to find, search, view, sort, or compare mobile devices available from Visible, including smartphones, wearables, tablets, and accessories. The user can filter devices based on brand, price range, condition (new, used, refurbished), storage size, color, category, or availability, and refine results using natural language queries such as:
“Show me used iPhones under $300”
“Find refurbished Pixels in black”
“Compare Samsung phones with 128GB storage”
This tool helps customers browse Visible’s catalog and narrow down options quickly by applying intelligent filtering to the device inventory and returning an interactive results carousel showing matching devices, along with key details such as price, condition, storage size, and purchase links.
Use this tool anytime a user expresses interest in shopping for devices, finding deals, comparing models, or bundling a device with a Visible plan."""


def _default_asset_base_url() -> str:
    port = os.environ.get("PORT", "8081")
    return f"http://127.0.0.1:{port}/assets"


def _resolve_asset_base_url() -> str:
    env_candidates = [
        os.environ.get("VISIBLE_WIDGET_BASE_URL"),
        os.environ.get("VISIBLE_ASSET_BASE_URL"),
        os.environ.get("WIDGET_BASE_URL"),
        os.environ.get("ASSET_BASE_URL"),
        os.environ.get("BASE_URL"),
    ]
    for candidate in env_candidates:
        value = (candidate or "").strip()
        if value:
            return value.rstrip("/")
    return _default_asset_base_url()


ASSET_BASE_URL = _resolve_asset_base_url()
MAX_FILTER_RESULTS = 6
ALLOWED_FILTER_KEYS = {
    "brand",
    "max_price",
    "condition",
    "color",
    "size",
    "category",
    "in_stock",
}
WIDGET_CSP_CONFIG = {
    "connect_domains": [
        "https://www.visible.com",
        "https://*.a.run.app",
        "https://*.googleusercontent.com",
        "https://visible-mcp-server-python-*.a.run.app",
    ],
    "resource_domains": [
        "https://visible.com",
        "https://*.visible.com",
        "https://visible.scene7.com",
        "https://*.scene7.com",
        "https://*.oaiusercontent.com",
        "https://*.oaistatic.com",
        "https://cdn.tailwindcss.com",
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://threejs.org",
        "https://*.a.run.app",
        "https://*.googleusercontent.com",
    ],
}
BRAND_SYNONYMS = {
    "iphone": "apple",
    "iphones": "apple",
    "pixel": "google",
    "google": "google",
    "galaxy": "samsung",
    "samsung": "samsung",
    "moto": "motorola",
    "motorola": "motorola",
    "oneplus": "oneplus",
}
BRAND_KEYWORDS = {
    "iphone": "Apple",
    "iphones": "Apple",
    "apple": "Apple",
    "pixel": "Google",
    "google": "Google",
    "galaxy": "Samsung",
    "samsung": "Samsung",
    "motorola": "Motorola",
    "moto": "Motorola",
    "oneplus": "OnePlus",
    "nokia": "Nokia",
    "sony": "Sony",
    "xperia": "Sony",
}
CONDITION_KEYWORDS = {
    "pre-owned": "used",
    "preowned": "used",
    "refurb": "used",
    "refurbished": "used",
    "used": "used",
    "new": "new",
}
SIZE_REGEX = re.compile(r"(\d+)\s*(gb|g|gig|gigabyte|gigabytes)", re.IGNORECASE)


def _device_dataset_candidates() -> List[Path]:
    candidates: List[Path] = []
    env_path = os.environ.get("VISIBLE_DEVICES_DATA_PATH")
    if env_path:
        candidates.append(Path(env_path))
    candidates.extend(
        [
            SRC_DIR / "filter-devices" / "filter_devices.json",
            SRC_DIR / "visible-devices" / "devices.json",
            ASSETS_DIR / "visible-devices-data.json",
            Path(__file__).resolve().parent / "filter_devices.json",
        ]
    )
    return candidates


@lru_cache(maxsize=1)
def _resolve_devices_dataset_path() -> Path:
    for path in _device_dataset_candidates():
        if path.exists():
            return path
    locations = ", ".join(str(p) for p in _device_dataset_candidates())
    raise FileNotFoundError(f"Devices dataset not found. Checked: {locations}")


@lru_cache(maxsize=1)
def _load_devices_dataset() -> List[Dict[str, Any]]:
    dataset_path = _resolve_devices_dataset_path()
    return json.loads(dataset_path.read_text(encoding="utf8"))


@lru_cache(maxsize=1)
def _known_device_colors() -> Dict[str, str]:
    colors: Dict[str, str] = {}
    for device in _load_devices_dataset():
        color = str(device.get("color") or "").strip()
        if not color:
            continue
        lowered = color.lower()
        if lowered not in colors:
            colors[lowered] = color
    return colors


def _coerce_filter_values(filters: Dict[str, Any]) -> Dict[str, Any]:
    logging.debug(f"Coerce filters input: {filters}")
    coerced: Dict[str, Any] = {}
    if not filters:
        logging.debug("Coerce filters skipped: empty input")
        return coerced

    for key, raw_value in filters.items():
        if key not in ALLOWED_FILTER_KEYS:
            logging.debug(f"Coerce filters skipping unsupported key: {key}")
            continue

        value = raw_value
        if isinstance(value, str):
            value = value.strip()
            if value.lower() in {"", "none", "null"}:
                logging.debug(f"Coerce filters dropping {key}: normalized string '{raw_value}'")
                continue
        elif value is None:
            logging.debug(f"Coerce filters dropping {key}: value is None")
            continue

        if key == "max_price":
            try:
                coerced[key] = float(value)
                logging.debug(f"Coerce filters max_price parsed: {value} -> {coerced[key]}")
            except (TypeError, ValueError):
                logging.debug(f"Coerce filters invalid max_price '{value}'")
        elif key == "in_stock":
            if isinstance(value, bool):
                coerced[key] = value
            else:
                coerced[key] = str(value).strip().lower() in {"true", "1", "yes"}
            logging.debug(f"Coerce filters in_stock parsed: {value} -> {coerced[key]}")
        else:
            string_value = str(value).strip()
            if not string_value:
                logging.debug(f"Coerce filters dropping {key}: empty after strip")
                continue
            coerced[key] = string_value
            logging.debug(f"Coerce filters accepted {key}: {string_value}")

    logging.debug(f"Coerce filters output: {coerced}")
    return coerced


def _infer_filters_from_query(query: Optional[str]) -> Dict[str, Any]:
    logging.debug(f"Infer filters from query: {query}")
    if not query:
        logging.debug("Infer filters skipped: empty query")
        return {}

    normalized = query.lower()
    inferred: Dict[str, Any] = {}

    for lowered, original in _known_device_colors().items():
        if lowered and lowered in normalized:
            inferred["color"] = original
            logging.debug(f"Inferred color '{original}' from query")
            break

    size_match = SIZE_REGEX.search(normalized)
    if size_match:
        size_value = f"{size_match.group(1)} GB"
        inferred["size"] = size_value
        logging.debug(f"Inferred size '{size_value}' from query")

    for keyword, condition in CONDITION_KEYWORDS.items():
        if keyword in normalized:
            inferred["condition"] = condition
            logging.debug(f"Inferred condition '{condition}' from query keyword '{keyword}'")
            break

    for keyword, brand in BRAND_KEYWORDS.items():
        if keyword in normalized:
            inferred["brand"] = brand
            logging.debug(f"Inferred brand '{brand}' from query keyword '{keyword}'")
            break

    cleaned = {
        key: value
        for key, value in inferred.items()
        if key in ALLOWED_FILTER_KEYS and value not in (None, "", [])
    }
    logging.debug(f"Inferred filters result: {cleaned}")
    return cleaned


def _extract_price_value(device: Dict[str, Any]) -> Optional[float]:
    sale_price = device.get("sale_price") or {}
    price = device.get("price") or {}
    value = sale_price.get("value") or price.get("value")
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _apply_device_filters(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    logging.debug(f"Merged filter payload: {filters}")
    logging.debug(f"Applying filters: {filters}")
    dataset = _load_devices_dataset()
    if not filters:
        logging.debug("Apply device filters skipped: no filters provided")
        return []

    def _normalize(term: Optional[str]) -> str:
        return str(term or "").strip().lower()

    brand_filter = _normalize(filters.get("brand"))
    brand_terms = set()
    if brand_filter:
        brand_terms.add(brand_filter)
        synonym = BRAND_SYNONYMS.get(brand_filter)
        if synonym:
            brand_terms.add(synonym)

    max_price = filters.get("max_price")
    condition = _normalize(filters.get("condition"))
    color = _normalize(filters.get("color"))
    size = _normalize(filters.get("size"))
    category = _normalize(filters.get("category"))
    in_stock_required = filters.get("in_stock", True)

    filtered: List[Dict[str, Any]] = []
    for device in dataset:
        device_title = device.get("title", "")
        normalized_title = _normalize(device_title)

        if in_stock_required and device.get("availability") != "in_stock":
            continue

        device_brand = _normalize(device.get("brand"))
        device_condition = _normalize(device.get("condition"))
        device_color = _normalize(device.get("color"))
        device_size = _normalize(device.get("size"))
        category_blob = " ".join(
            filter(
                None,
                [
                    str(device.get("product_category") or ""),
                    str(device.get("category") or ""),
                ],
            )
        ).lower()

        if brand_terms:
            if not any(
                term in device_brand or term in normalized_title for term in brand_terms
            ):
                continue

        if condition and device_condition != condition:
            continue

        if color and device_color != color:
            continue

        if size and device_size != size:
            continue

        if category and category not in category_blob:
            continue

        if max_price is not None:
            price_value = _extract_price_value(device)
            if price_value is None or price_value > max_price:
                continue

        logging.debug(f"Device matched: {device_title}")
        filtered.append(device)

    def price_key(device: Dict[str, Any]) -> tuple[bool, float]:
        price = _extract_price_value(device)
        return (price is None, price if price is not None else float("inf"))

    filtered.sort(key=price_key)
    filtered_devices = filtered[:MAX_FILTER_RESULTS]
    logging.debug(f"Filtered device count: {len(filtered_devices)}")
    logging.debug(f"Filtered devices: {[d.get('title') for d in filtered_devices]}")
    return filtered_devices


async def filter_devices(
    brand: Optional[str] = None,
    max_price: Optional[float] = None,
    condition: Optional[str] = None,
    color: Optional[str] = None,
    size: Optional[str] = None,
    query: Optional[str] = None,
) -> types.CallToolResult:
    base_filters = _coerce_filter_values(
        {
            "brand": brand,
            "max_price": max_price,
            "condition": condition,
            "color": color,
            "size": size,
        }
    )
    logging.debug(f"Raw args: {base_filters}")

    inferred_filters = _infer_filters_from_query(query)
    logging.debug(f"Inferred from query: {inferred_filters}")

    merged_filters: Dict[str, Any] = dict(inferred_filters)
    merged_filters.update(base_filters)
    if query:
        merged_filters["query"] = query

    if "in_stock" not in merged_filters:
        merged_filters["in_stock"] = True
    logging.debug(f"Merged filters: {merged_filters}")

    filtered_devices = _apply_device_filters(merged_filters)
    logging.debug(f"Filtered count: {len(filtered_devices)}")
    logging.debug(f"Filtered titles: {[d.get('title') for d in filtered_devices]}")

    widget = WIDGETS_BY_ID[FILTER_DEVICES_WIDGET_ID]
    iframe_url = _widget_iframe_url(widget)

    text_summary = f"Found {len(filtered_devices)} matching devices."
    response_filters = dict(merged_filters)
    response_filters["sorted_by"] = "price_asc"
    response_filters["limit"] = MAX_FILTER_RESULTS
    logging.debug(f"Outgoing filters: {response_filters}")
    logging.debug(f"Outgoing count: {len(filtered_devices)}")
    logging.debug(f"Outgoing results titles: {[d.get('title') for d in filtered_devices]}")
    logging.debug(f"TOOL OUTGOING structuredContent.filters: {response_filters}")
    logging.debug(f"TOOL OUTGOING structuredContent.count: {len(filtered_devices)}")
    logging.debug(
        "TOOL OUTGOING structuredContent.results: %s",
        [device.get("title") for device in filtered_devices],
    )

    return types.CallToolResult(
        content=[
            types.TextContent(
                type="text",
                text=text_summary,
            )
        ],
        structuredContent={
            "filters": response_filters,
            "count": len(filtered_devices),
            "results": filtered_devices,
        },
        _meta=_widget_invocation_meta(widget),
        ui={
            "type": "iframe",
            "url": iframe_url,
            "title": widget.title,
            "height": 500,
        },
    )


@lru_cache(maxsize=None)
def _load_widget_html(component_name: str) -> str:
    html_path = ASSETS_DIR / f"{component_name}.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf8")

    fallback_candidates = sorted(ASSETS_DIR.glob(f"{component_name}-*.html"))
    if fallback_candidates:
        return fallback_candidates[-1].read_text(encoding="utf8")

    raise FileNotFoundError(
        f'Widget HTML for "{component_name}" not found in {ASSETS_DIR}. '
        'Run "pnpm run build" before starting the server.'
    )


DISPLAY_WIDGETS: List[VisibleWidget] = [
    VisibleWidget(
        identifier="visible-plans",
        title="Show Visible Plans",
        template_uri="ui://widget/visible-plans.html",
        invoking="Loading Visible plans",
        invoked="Displayed Visible plans",
        html=_load_widget_html("visible-plans"),
        response_text="Displayed Visible mobile plans in a carousel!",
    ),
    VisibleWidget(
        identifier="visible-devices",
        title="Show Visible Devices",
        template_uri="ui://widget/visible-devices.html",
        invoking="Loading Visible devices",
        invoked="Displayed Visible devices",
        html=_load_widget_html("visible-devices"),
        response_text="Displayed Visible devices in a carousel!",
    ),
]
FILTER_DEVICES_WIDGET = VisibleWidget(
    identifier=FILTER_DEVICES_WIDGET_ID,
    title="Filtered Devices",
    template_uri="ui://widget/visible-filter-devices.html",
    invoking="Filtering Visible devices...",
    invoked="Displayed filtered device results",
    html=_load_widget_html("visible-filter-devices"),
    response_text="Here are your filtered devices!",
)
ALL_WIDGETS: List[VisibleWidget] = [*DISPLAY_WIDGETS, FILTER_DEVICES_WIDGET]


WIDGETS_BY_ID: Dict[str, VisibleWidget] = {
    widget.identifier: widget for widget in ALL_WIDGETS
}
WIDGETS_BY_URI: Dict[str, VisibleWidget] = {
    widget.template_uri: widget for widget in ALL_WIDGETS
}


class VisibleInput(BaseModel):
    """Schema for Visible widgets."""

    category: str = Field(
        ...,
        description="Category of items to display (plans or devices).",
    )

    model_config = ConfigDict(extra="forbid")


class FilterDevicesInput(BaseModel):
    brand: Optional[str] = None
    max_price: Optional[float] = Field(default=None, alias="max_price")
    condition: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    query: Optional[str] = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


mcp = FastMCP(
    name="visible-python",
    stateless_http=True,
)


TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "description": "Category of items to display (plans or devices).",
        }
    },
    "required": ["category"],
    "additionalProperties": False,
}

FILTER_DEVICES_INPUT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "brand": {"type": "string"},
        "max_price": {"type": "number"},
        "condition": {"type": "string"},
        "color": {"type": "string"},
        "size": {"type": "string"},
        "query": {"type": "string"},
    },
    "additionalProperties": False,
}


def _resource_description(widget: VisibleWidget) -> str:
    return f"{widget.title} widget markup"


def _widget_descriptor_meta(widget: VisibleWidget) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
        "openai/widgetCSP": WIDGET_CSP_CONFIG,
    }


def _widget_invocation_meta(widget: VisibleWidget) -> Dict[str, Any]:
    return dict(_widget_descriptor_meta(widget))


def _widget_iframe_url(widget: VisibleWidget) -> str:
    html_file = widget.template_uri.rsplit("/", 1)[-1]
    return f"{ASSET_BASE_URL}/{html_file}"


@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    tool_entries = [
        types.Tool(
            name=widget.identifier,
            title=widget.title,
            description=widget.title,
            inputSchema=deepcopy(TOOL_INPUT_SCHEMA),
            _meta=_widget_descriptor_meta(widget),
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        )
        for widget in DISPLAY_WIDGETS
    ]
    tool_entries.append(
        types.Tool(
            name=FILTER_DEVICES_TOOL_NAME,
            title="Filter Visible Devices",
            description=FILTER_DEVICES_DESCRIPTION,
            inputSchema=deepcopy(FILTER_DEVICES_INPUT_SCHEMA),
            _meta=_widget_descriptor_meta(FILTER_DEVICES_WIDGET),
            annotations={
                "destructiveHint": False,
                "openWorldHint": False,
                "readOnlyHint": True,
            },
        )
    )
    return tool_entries


@mcp._mcp_server.list_resources()
async def _list_resources() -> List[types.Resource]:
    return [
        types.Resource(
            name=widget.title,
            title=widget.title,
            uri=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_widget_descriptor_meta(widget),
        )
        for widget in ALL_WIDGETS
    ]


@mcp._mcp_server.list_resource_templates()
async def _list_resource_templates() -> List[types.ResourceTemplate]:
    return [
        types.ResourceTemplate(
            name=widget.title,
            title=widget.title,
            uriTemplate=widget.template_uri,
            description=_resource_description(widget),
            mimeType=MIME_TYPE,
            _meta=_widget_descriptor_meta(widget),
        )
        for widget in ALL_WIDGETS
    ]


async def _handle_read_resource(req: types.ReadResourceRequest) -> types.ServerResult:
    widget = WIDGETS_BY_URI.get(str(req.params.uri))
    if widget is None:
        return types.ServerResult(
            types.ReadResourceResult(
                contents=[],
                _meta={"error": f"Unknown resource: {req.params.uri}"},
            )
        )

    contents = [
        types.TextResourceContents(
            uri=widget.template_uri,
            mimeType=MIME_TYPE,
            text=widget.html,
            _meta=_widget_descriptor_meta(widget),
        )
    ]

    return types.ServerResult(types.ReadResourceResult(contents=contents))


async def _call_tool_request(req: types.CallToolRequest) -> types.ServerResult:
    logging.debug(
        "call_tool request received: name=%s, arguments=%s, toolInvocationId=%s",
        req.params.name,
        req.params.arguments,
        getattr(req, "id", None),
    )
    if req.params.name == FILTER_DEVICES_TOOL_NAME:
        arguments = req.params.arguments or {}
        logging.debug(f"filter_devices raw request arguments: {arguments}")
        try:
            payload = FilterDevicesInput.model_validate(arguments)
        except ValidationError as exc:
            return types.ServerResult(
                types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text=f"Input validation error: {exc.errors()}",
                        )
                    ],
                    isError=True,
                )
            )

        result = await filter_devices(
            brand=payload.brand,
            max_price=payload.max_price,
            condition=payload.condition,
            color=payload.color,
            size=payload.size,
            query=payload.query,
        )
        return types.ServerResult(result)

    widget = WIDGETS_BY_ID.get(req.params.name)
    if widget is None:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Unknown tool: {req.params.name}",
                    )
                ],
                isError=True,
            )
        )

    arguments = req.params.arguments or {}
    try:
        payload = VisibleInput.model_validate(arguments)
    except ValidationError as exc:
        return types.ServerResult(
            types.CallToolResult(
                content=[
                    types.TextContent(
                        type="text",
                        text=f"Input validation error: {exc.errors()}",
                    )
                ],
                isError=True,
            )
        )

    meta = _widget_invocation_meta(widget)
    structured = {"category": payload.category}
    iframe_url = _widget_iframe_url(widget)
    ui_block = {
        "type": "iframe",
        "url": iframe_url,
        "title": widget.title,
        "height": 480,
    }

    return types.ServerResult(
        types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=widget.response_text,
                )
            ],
            structuredContent=structured,
            _meta=meta,
            ui=ui_block,
        )
    )


mcp._mcp_server.request_handlers[types.CallToolRequest] = _call_tool_request
mcp._mcp_server.request_handlers[types.ReadResourceRequest] = _handle_read_resource

app = mcp.streamable_http_app()

try:
    from starlette.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )
except Exception:  # pragma: no cover - middleware is optional
    pass


async def health_endpoint(request) -> JSONResponse:  # type: ignore[override]
    return JSONResponse({"status": "ok", "service": "visible-mcp-server-python"})


async def serve_asset_endpoint(request):  # type: ignore[override]
    asset_path = request.path_params.get("asset_path", "")
    normalized_path = (ASSETS_DIR / asset_path).resolve()
    try:
        normalized_path.relative_to(ASSETS_DIR)
    except ValueError as exc:
        raise HTTPException(status_code=403, detail="Forbidden") from exc

    if not normalized_path.is_file():
        raise HTTPException(status_code=404, detail="Not Found")

    media_type, _ = mimetypes.guess_type(normalized_path.name)
    response = FileResponse(
        normalized_path,
        media_type=media_type or "application/octet-stream",
    )
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cache-Control"] = "public, max-age=3600"
    return response


app.add_route("/health", health_endpoint, methods=["GET"])
app.add_route("/assets/{asset_path:path}", serve_asset_endpoint, methods=["GET"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "visible_server_python.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8081")),
    )
