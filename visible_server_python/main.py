"""Visible MCP server implemented with FastMCP + FastAPI.

The server mirrors the Node implementation by exposing the Visible plans and
devices widgets, serving the compiled assets from /assets, and wiring the MCP
SSE transport so ChatGPT can render the widgets in conversations."""

from __future__ import annotations

import mimetypes
import os
from copy import deepcopy
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import mcp.types as types
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, JSONResponse


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
MIME_TYPE = "text/html+skybridge"


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


widgets: List[VisibleWidget] = [
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


WIDGETS_BY_ID: Dict[str, VisibleWidget] = {
    widget.identifier: widget for widget in widgets
}
WIDGETS_BY_URI: Dict[str, VisibleWidget] = {
    widget.template_uri: widget for widget in widgets
}


class VisibleInput(BaseModel):
    """Schema for Visible widgets."""

    category: str = Field(
        ...,
        description="Category of items to display (plans or devices).",
    )

    model_config = ConfigDict(extra="forbid")


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


def _resource_description(widget: VisibleWidget) -> str:
    return f"{widget.title} widget markup"


def _widget_descriptor_meta(widget: VisibleWidget) -> Dict[str, Any]:
    return {
        "openai/outputTemplate": widget.template_uri,
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
        "openai/widgetAccessible": True,
        "openai/resultCanProduceWidget": True,
    }


def _widget_invocation_meta(widget: VisibleWidget) -> Dict[str, Any]:
    return {
        "openai/toolInvocation/invoking": widget.invoking,
        "openai/toolInvocation/invoked": widget.invoked,
    }


def _widget_iframe_url(widget: VisibleWidget) -> str:
    html_file = widget.template_uri.rsplit("/", 1)[-1]
    return f"{ASSET_BASE_URL}/{html_file}"


@mcp._mcp_server.list_tools()
async def _list_tools() -> List[types.Tool]:
    return [
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
        for widget in widgets
    ]


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
        for widget in widgets
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
        for widget in widgets
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
