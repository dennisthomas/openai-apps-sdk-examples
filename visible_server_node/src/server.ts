import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type VisibleWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
  let htmlContents: string | null = null;

  if (fs.existsSync(directPath)) {
    htmlContents = fs.readFileSync(directPath, "utf8");
  } else {
    const candidates = fs
      .readdirSync(ASSETS_DIR)
      .filter(
        (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
      )
      .sort();
    const fallback = candidates[candidates.length - 1];
    if (fallback) {
      htmlContents = fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
    }
  }

  if (!htmlContents) {
    throw new Error(
      `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
    );
  }

  return htmlContents;
}

function widgetDescriptorMeta(widget: VisibleWidget) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
  } as const;
}

function widgetInvocationMeta(widget: VisibleWidget) {
  return {
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
  } as const;
}

const widgets: VisibleWidget[] = [
  {
    id: "visible-plans",
    title: "Search Visible Mobile Plans",
    templateUri: "ui://widget/visible-plans.html",
    invoking: "Searching Visible plans",
    invoked: "Displayed Visible plans",
    html: readWidgetHtml("visible-plans"),
    responseText: "Found matching Visible mobile plans!",
  },
  {
    id: "visible-devices",
    title: "Search Visible Devices",
    templateUri: "ui://widget/visible-devices.html",
    invoking: "Searching devices catalog",
    invoked: "Displayed matching devices",
    html: readWidgetHtml("visible-devices"),
    responseText: "Found matching devices in the Visible catalog!",
  },
];

const widgetsById = new Map<string, VisibleWidget>();
const widgetsByUri = new Map<string, VisibleWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const DEVICES_DATA_PATH = path.resolve(
  ROOT_DIR,
  "src",
  "visible-devices",
  "devices.json"
);
const PLANS_DATA_PATH = path.resolve(
  ROOT_DIR,
  "src",
  "visible-plans",
  "plans.json"
);

type PriceField = {
  value?: number;
  currency?: string;
};

type DeviceRecord = {
  id: string;
  title: string;
  description?: string;
  brand?: string;
  product_category?: string;
  availability?: string;
  inventory_quantity?: number;
  sale_price?: PriceField;
  price?: PriceField;
  color?: string;
  size?: string;
  condition?: string;
  [key: string]: unknown;
};

type PlanRecord = {
  id: string;
  title: string;
  description?: string;
  product_category?: string;
  sale_price?: PriceField;
  price?: PriceField;
  [key: string]: unknown;
};

function loadJsonFile<T>(filePath: string): T[] {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T[];
  } catch (error) {
    console.error(`Failed to load JSON catalog ${filePath}`, error);
    return [];
  }
}

const devicesCatalog = loadJsonFile<DeviceRecord>(DEVICES_DATA_PATH);
const plansCatalog = loadJsonFile<PlanRecord>(PLANS_DATA_PATH);

const toolInputSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["plans", "devices"],
      description: "Category of items to display (plans or devices).",
    },
    query: {
      type: "string",
      description:
        "Specific product model or type ONLY (e.g. 'iPhone', 'Galaxy', 'Pixel', 'Apple Watch'). Use this for product names, NOT for colors, storage sizes, or conditions - those have their own parameters.",
    },
    brand: {
      type: "string",
      description: "Filter devices by brand name only if user explicitly mentions just the brand (e.g. 'Samsung', 'Apple'). Do not use for specific products like 'iPhone' - use query instead.",
    },
    productCategory: {
      type: "string",
      description: "Filter by the device product_category field.",
    },
    minPrice: {
      type: "number",
      description: "Minimum device price in USD.",
    },
    maxPrice: {
      type: "number",
      description: "Maximum device price in USD.",
    },
    availability: {
      type: "string",
      enum: ["in_stock", "out_of_stock"],
      description: "Filter by availability status.",
    },
    color: {
      type: "string",
      description: "Filter by device color. Extract color words from user query (e.g. 'red', 'black', 'blue', 'white', 'pink', 'yellow'). ALWAYS use this parameter when user mentions a color, not the query field.",
    },
    size: {
      type: "string",
      description: "Filter by storage size. Extract storage capacity from user query (e.g. '128 GB', '256 GB', '512 GB'). ALWAYS use this parameter when user mentions storage, not the query field.",
    },
    condition: {
      type: "string",
      description: "Filter by device condition. Extract condition from user query (e.g. 'new', 'refurbished', 'used'). ALWAYS use this parameter when user mentions condition, not the query field.",
    },
    billingTerm: {
      type: "string",
      enum: ["monthly", "annual", "multi-month"],
      description:
        "Plan billing term to highlight (monthly, multi-month bundles, or annual).",
    },
  },
  additionalProperties: false,
} as const;

// Update tool schema to accept search parameters
const toolInputParser = z.object({
  category: z.enum(["devices", "plans"]).optional(),
  query: z.string().optional(),
  brand: z.string().optional(),
  productCategory: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  availability: z.enum(["in_stock", "out_of_stock"]).optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  condition: z.string().optional(),
  billingTerm: z.enum(["monthly", "annual", "multi-month"]).optional(),
});

type ToolInput = z.infer<typeof toolInputParser>;

function devicePrice(device: DeviceRecord): number | null {
  return device.sale_price?.value ?? device.price?.value ?? null;
}

function planPrice(plan: PlanRecord): number | null {
  return plan.sale_price?.value ?? plan.price?.value ?? null;
}

function matchesAvailability(device: DeviceRecord, desired?: string): boolean {
  if (!desired) {
    return true;
  }

  const inStock =
    device.availability === "in_stock" &&
    (device.inventory_quantity ?? 0) > 0;

  return desired === "in_stock" ? inStock : !inStock;
}

type SearchableRecord = {
  title?: string;
  description?: string;
  brand?: string;
  product_category?: string;
};

function matchesQuery(record: SearchableRecord, query?: string): boolean {
  if (!query) {
    return true;
  }

  const queryLower = query.toLowerCase();
  const title = (record.title ?? "").toLowerCase();
  const description = (record.description ?? "").toLowerCase();
  const brand = (record.brand ?? "").toLowerCase();
  const productCategory = (record.product_category ?? "").toLowerCase();
  
  // Map specific product names to their categories to prevent cross-matching
  // e.g., "iphone" should only match Mobile Phones, not Wearables (Apple Watch)
  const productTypeMapping: Record<string, string[]> = {
    "iphone": ["mobile phones"],
    "ipad": ["mobile phones", "tablets"],
    "galaxy": ["mobile phones"],
    "pixel": ["mobile phones"],
    "watch": ["wearables"],
    "iwatch": ["wearables"],
  };
  
  // Check if query contains a specific product type
  for (const [productName, allowedCategories] of Object.entries(productTypeMapping)) {
    if (queryLower.includes(productName)) {
      // First check if product category matches
      const categoryMatches = allowedCategories.some(cat => productCategory.includes(cat));
      if (!categoryMatches) {
        return false; // Wrong category, exclude immediately
      }
      // Then check if title matches
      return title.includes(queryLower) || queryLower.split(/\s+/).every(word => title.includes(word));
    }
  }
  
  // For general queries, search across all fields
  const haystack = [title, description, brand, productCategory]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  
  // Split query into words for flexible matching
  const queryWords = queryLower.split(/\s+/);
  
  // Match if ALL query words are found (more restrictive for multi-word queries)
  // or if single word query matches
  if (queryWords.length === 1) {
    return haystack.includes(queryWords[0]);
  }
  
  return queryWords.every(word => haystack.includes(word));
}

function filterDevices(devices: DeviceRecord[], filters: ToolInput) {
  return devices.filter((device) => {
    // Special handling: if brand is Apple but no explicit query, filter out wearables by default
    // This prevents Apple Watch from showing when user asks for "iPhone"
    if (filters.brand && filters.brand.toLowerCase() === "apple" && !filters.query) {
      const productCategory = (device.product_category ?? "").toLowerCase();
      // Default to phones for Apple brand queries (exclude wearables)
      if (productCategory.includes("wearables")) {
        return false;
      }
    }
    
    if (filters.brand) {
      if ((device.brand ?? "").toLowerCase() !== filters.brand.toLowerCase()) {
        return false;
      }
    }

    if (
      filters.productCategory &&
      (device.product_category ?? "").toLowerCase() !==
        filters.productCategory.toLowerCase()
    ) {
      return false;
    }

    if (!matchesAvailability(device, filters.availability)) {
      return false;
    }

    if (!matchesQuery(device, filters.query)) {
      return false;
    }

    if (filters.color) {
      const deviceColor = (device.color ?? "").toLowerCase();
      const filterColor = filters.color.toLowerCase();
      if (!deviceColor.includes(filterColor)) {
        return false;
      }
    }

    if (filters.size) {
      const deviceSize = (device.size ?? "").toLowerCase();
      const filterSize = filters.size.toLowerCase();
      // Match both "128 GB" and "128GB" formats
      if (!deviceSize.includes(filterSize.replace(/\s+/g, '')) && !deviceSize.includes(filterSize)) {
        return false;
      }
    }

    if (filters.condition) {
      const deviceCondition = (device.condition ?? "").toLowerCase();
      let filterCondition = filters.condition.toLowerCase();
      
      // Map "refurbished" to "used" since they're the same in the catalog
      if (filterCondition === "refurbished") {
        filterCondition = "used";
      }
      
      if (!deviceCondition.includes(filterCondition)) {
        return false;
      }
    }

    const price = devicePrice(device);
    if (
      filters.minPrice !== undefined &&
      (price === null || price < filters.minPrice)
    ) {
      return false;
    }

    if (
      filters.maxPrice !== undefined &&
      (price === null || price > filters.maxPrice)
    ) {
      return false;
    }

    return true;
  });
}

function planBillingTerm(plan: PlanRecord): "monthly" | "annual" | "multi-month" {
  const title = plan.title?.toLowerCase() ?? "";
  if (title.includes("annual")) {
    return "annual";
  }

  if (title.includes("6m") || title.includes("6 m") || title.includes("6 ")) {
    return "multi-month";
  }

  return "monthly";
}

function filterPlans(plans: PlanRecord[], filters: ToolInput) {
  return plans.filter((plan) => {
    if (!matchesQuery(plan, filters.query)) {
      return false;
    }

    const price = planPrice(plan);
    if (
      filters.minPrice !== undefined &&
      (price === null || price < filters.minPrice)
    ) {
      return false;
    }

    if (
      filters.maxPrice !== undefined &&
      (price === null || price > filters.maxPrice)
    ) {
      return false;
    }

    if (
      filters.billingTerm &&
      planBillingTerm(plan) !== filters.billingTerm
    ) {
      return false;
    }

    return true;
  });
}

const tools: Tool[] = widgets.map((widget) => {
  const isPlans = widget.id === "visible-plans";
  const description = isPlans
    ? "Search and filter Visible mobile plans by price range, billing term, or text query. Returns matching plans with pricing and features."
    : "Search and filter Visible devices (phones, accessories) by brand, price range, availability, category, or text query. Returns matching devices with prices and details.";
  
  return {
    name: widget.id,
    description,
    inputSchema: toolInputSchema,
    title: widget.title,
    _meta: widgetDescriptorMeta(widget),
    // To disable the approval prompt for the widgets
    annotations: {
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true,
    },
  };
});

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

function createVisibleServer(): Server {
  const server = new Server(
    {
      name: "visible-node",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            _meta: widgetDescriptorMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({
      tools,
    })
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const widget = widgetsById.get(request.params.name);

      if (!widget) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = toolInputParser.parse(request.params.arguments ?? {});

      // Debug logging
      console.log("=== MCP Tool Called ===");
      console.log("Tool:", request.params.name);
      console.log("Arguments received:", JSON.stringify(args, null, 2));
      console.log("Total devices in catalog:", devicesCatalog.length);
      console.log("Total plans in catalog:", plansCatalog.length);

      const resolvedCategory =
        args.category ?? (widget.id === "visible-plans" ? "plans" : "devices");
      const filteredDevices =
        widget.id === "visible-devices"
          ? filterDevices(devicesCatalog, args)
          : null;
      const filteredPlans =
        widget.id === "visible-plans"
          ? filterPlans(plansCatalog, args)
          : null;
      
      // Log filtering results
      if (filteredDevices) {
        console.log("Filtered devices count:", filteredDevices.length);
        if (filteredDevices.length > 0) {
          console.log("Sample device:", JSON.stringify(filteredDevices[0], null, 2));
        }
      }
      if (filteredPlans) {
        console.log("Filtered plans count:", filteredPlans.length);
      }
      const appliedFilters = {
        query: args.query ?? null,
        brand: args.brand ?? null,
        productCategory: args.productCategory ?? null,
        minPrice: args.minPrice ?? null,
        maxPrice: args.maxPrice ?? null,
        availability: args.availability ?? null,
        billingTerm: args.billingTerm ?? null,
      };

      const structuredContent: Record<string, unknown> = {
        category: resolvedCategory,
        filters: appliedFilters,
      };

      if (filteredDevices) {
        structuredContent.items = filteredDevices;
        structuredContent.resultCount = filteredDevices.length;
        structuredContent.totalCount = devicesCatalog.length;
      }

      if (filteredPlans) {
        structuredContent.items = filteredPlans;
        structuredContent.resultCount = filteredPlans.length;
        structuredContent.totalCount = plansCatalog.length;
      }

      return {
        content: [
          {
            type: "text",
            text: widget.responseText,
          },
        ],
        structuredContent,
        _meta: widgetInvocationMeta(widget),
      };
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const server = createVisibleServer();
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;

  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 8001);
const port = Number.isFinite(portEnv) ? portEnv : 8001;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    // Health check endpoint
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "visible-mcp-server" }));
      return;
    }

    // Serve static assets from /assets directory
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const filePath = path.join(ROOT_DIR, url.pathname);

      // Security check: ensure the path is within ASSETS_DIR
      const normalizedPath = path.normalize(filePath);
      if (!normalizedPath.startsWith(ASSETS_DIR)) {
        res.writeHead(403).end("Forbidden");
        return;
      }

      if (!fs.existsSync(normalizedPath)) {
        res.writeHead(404).end("Not Found");
        return;
      }

      // Determine content type
      const ext = path.extname(normalizedPath).toLowerCase();
      const contentTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
      };
      const contentType = contentTypes[ext] || "application/octet-stream";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      });

      fs.createReadStream(normalizedPath).pipe(res);
      return;
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log(`Visible MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`
  );
});
