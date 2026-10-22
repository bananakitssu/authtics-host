import React, { useState, useEffect, useRef, MouseEvent } from 'react';
import { ShieldCheck, Shield, CircleX, ChevronDown, ChevronUp, Bug, AlertTriangle, Info, ArrowLeft, Wifi, Terminal, Route, Globe, ChevronRight, ChevronLeft, Server, Cog, /*Search,*/ TriangleAlert, Eye, Zap, Power, Check as Tick, CheckCircle2 } from 'lucide-react';
import {
  TraceMap,
  originalPositionFor,
  sourceContentFor,
} from "@jridgewell/trace-mapping";
//import { isMobile } from 'react-device-detect';
/*import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
(Prism.languages.javascript as any)['builtin'] = /\b(window|document|console|navigator|localStorage|sessionStorage|fetch|Promise|setTimeout|setInterval|clearTimeout|clearInterval|requestAnimationFrame|Math|JSON|Object|Array|String|Number|Boolean|Date|RegExp|Error|Map|Set|Symbol|Proxy|Reflect|performance|history|location|screen|crypto|indexedDB|alert|confirm|prompt)\b/;*/
//const isMobile = true;

export async function mapGeneratedLocation(
  location: ErrorLocation
): Promise<ErrorLocation> {
  try {
    if (!location.file || !location.line || !location.column) {
      return location;
    }

    const response = await fetch(location.file, {
      cache: "no-store",
    });

    if (!response.ok) {
      return location;
    }

    const generatedCode = await response.text();

    const sourceMapReference = generatedCode.match(
      /\/\/[#@]\s*sourceMappingURL=([^\s]+)/
    )?.[1];

    if (!sourceMapReference) {
      console.warn("[HostJS] No source map URL found in", location.file);
      return location;
    }

    let sourceMapJson: string;

    if (sourceMapReference.startsWith("data:")) {
      const commaIndex = sourceMapReference.indexOf(",");
      if (commaIndex === -1) return location;

      const metadata = sourceMapReference.slice(0, commaIndex);
      const encodedMap = sourceMapReference.slice(commaIndex + 1);

      if (metadata.includes(";base64")) {
        const binary = atob(encodedMap);
        const bytes = Uint8Array.from(binary, (character) =>
          character.charCodeAt(0)
        );
        sourceMapJson = new TextDecoder().decode(bytes);
      } else {
        sourceMapJson = decodeURIComponent(encodedMap);
      }
    } else {
      const mapUrl = new URL(
        sourceMapReference,
        response.url || new URL(location.file, window.location.href).href
      );
      const mapResponse = await fetch(mapUrl, {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!mapResponse.ok) {
        console.warn("[HostJS] Could not load source map:", mapUrl.href);
        return location;
      }

      sourceMapJson = await mapResponse.text();
    }

const sourceMap = JSON.parse(sourceMapJson);
const traceMap = new TraceMap(sourceMap);

    // Stack trace columns are 1-based.
    // Source-map generated columns are 0-based.
    const original = originalPositionFor(traceMap, {
      line: location.line,
      column: Math.max(0, location.column - 1),
    });

    if (!original.source || !original.line) {
      return location;
    }

    const sourceText = sourceContentFor(traceMap, original.source) ?? "";
    const originalLine = sourceText.split(/\r?\n/)[original.line - 1] ?? "";

    return {
      ...location,
      file: original.source,
      line: original.line,
      column: (original.column ?? 0) + 1,
      sourceText: originalLine,
      mapped: true,
      lines: getApproximateLines(sourceText, original.line),
    };
  } catch (error) {
    console.warn("[HostJS] Could not map source location:", error);
    return location;
  }
}

function getCallerSource(): string {
  const location = parseStackLocation(new Error().stack ?? "");

  if (!location) {
    return "";
  }

  return `${location.file}:${location.line}:${location.column}`;
}

function getApproximateLines(
  source: string,
  line: number
): string[] {
  const allLines = source.split(/\r?\n/);

  const start = Math.max(0, line - 2);
  const end = Math.min(allLines.length, line + 1);

  return allLines.slice(start, end).map((text, index) => {
    const lineNumber = start + index + 1;
    return `${lineNumber} | ${text}`;
  });
}

/*function getCaretLine(
  sourceLine: string,
  column: number,
  length = 1
): string {
  const safeColumn = Math.max(1, column);
  const spaces = " ".repeat(safeColumn - 1);
  const carets = "^".repeat(Math.max(1, length));

  return `   | ${spaces}${carets}`;
}*/

function getPreciseMarker(
  sourceLine: string,
  column: number,
  length = 1,
  lineNumber?: number
): string {
  const safeColumn = Math.min(
    Math.max(1, column),
    Math.max(1, sourceLine.length + 1)
  );

  const marker =
    length > 1
      ? "\u25B2" + "~".repeat(length - 1)
      : "\u25B2";

  return `${String(lineNumber).length ? " ".repeat(String(lineNumber).length) + " " : "   "}| ${" ".repeat(safeColumn - 1)}${marker}`;
}

function parseStackLocations(stack: string): ErrorLocation[] {
  const locations: ErrorLocation[] = [];

  for (const stackLine of stack.split(/\r?\n/)) {
    const match = stackLine.match(
      /(?:\(|\s|^)((?:https?:\/\/|file:\/\/|\/|\.\.?\/)[^)\s]+):(\d+):(\d+)\)?$/
    );

    if (!match) continue;

    const [, file, line, column] = match;

    locations.push({
      file: file.replace(/\?.*$/, ""),
      line: Number(line),
      column: Number(column),
      mapped: false,
    });
  }

  return locations;
}

function parseStackLocation(
  stack: string,
  skip = 0
): ErrorLocation | undefined {
  return parseStackLocations(stack)[skip];
}

const LOG_TYPES = ['Log', 'Info', 'Warn', 'Error', 'Debug'] as const;
//const LOG_TYPE_2 = ['Eval'] as const;
type LogType = typeof LOG_TYPES[number]/* | typeof LOG_TYPE_2[number]*/;

let fetchId = 0;

interface ErrorLocation {
  file: string;
  line: number;
  column: number;
  length?: number;
  sourceText?: string;
  lines?: string[];
  mapped?: boolean;
}

interface LogEntry {
  id: number;
  type: LogType;
  message: string;
  time: number;
  source: string;
  stack?: string;
  location?: ErrorLocation;
}

interface NetworkFetch {
  url: string;
  method: string;
  status: number | null;
  id: number;
  response: string | null;
  sent: string | null;
}

interface EventSourceConnection {
  url: string;
  status: 'Connected' | 'Disconnected' | 'Connecting...' | 'Connection Failed';
  id: number;
  type: string;
}

interface WebSocketConnection {
  url: string;
  status: 'Connected' | 'Disconnected' | 'Connecting...' | 'Connection Failed';
  id: number;
  type: string;
}

interface Resource {
  url: string;
  type: 'img' | 'script' | 'link';
  id: number;
}

const TYPE_STYLE: Record<LogType, { bg: string; color: string; textColor?: string; icon: React.ReactNode | null }> = {
  Error: { bg: '#fff0f0', color: '#e53e3e',                    icon: <CircleX       size={11} /> },
  Warn:  { bg: '#fffbea', color: '#d97706',                    icon: <AlertTriangle size={11} /> },
  Log:   { bg: '#ffffff', color: '#888',    textColor: '#333', icon: null },
  /*Eval:   { bg: '#ffffff', color: '#888',    textColor: '#333', icon: null },*/
  Info:  { bg: '#eff6ff', color: '#3b82f6',                    icon: <Info          size={11} /> },
  Debug: { bg: '#f0fdf4', color: '#16a34a',                    icon: <Bug           size={11} /> },
};

const FILTER_COLORS: Record<LogType, string> = {
  Error: '#e53e3e',
  Warn:  '#d97706',
  Log:   '#888',
  //Eval:   '#888',
  Info:  '#3b82f6',
  Debug: '#16a34a',
};

const TruncatedText = ({ content, id }: { content: string, id: string }) => {
  const maxLength = 100;
  const truncated = content.length > maxLength 
    ? content.slice(0, maxLength) + "..." 
    : content;

  return <div id={id}>{truncated}</div>;
};

// ── Sparkline chart (SVG, no dependencies) ──────────────────────────────────
function Sparkline({ data, color, label, unit }: {
  data: number[];
  color: string;
  label: string;
  unit: string;
}) {
  const W = 280, H = 48;
  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - (v / max) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const latest = data[data.length - 1] ?? 0;
  const id = `grad-${label.replace(' ', '').toLowerCase()}`

  return (
    <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #eee', padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: '10px', color: '#888' }}>{label}</span>
        <span style={{ fontSize: '11px', fontFamily: 'monospace', color }}>{latest}{unit}</span>
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        {/* Fill area under line */}
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {data.length > 1 && (
          <>
            <polygon
              points={`0,${H} ${points} ${W},${H}`}
              fill={`url(#${id})`}
            />
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Latest value dot */}
            {(() => {
              const last = points.split(' ').pop()!.split(',');
              return <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />;
            })()}
          </>
        )}
      </svg>
    </div>
  );
}

function installNetworkInterceptor(
  onFetch: (f: NetworkFetch) => void,
  setFetch: (f: NetworkFetch) => void,
  onEventSource: (f: EventSourceConnection) => void,
  setEventSource: (f: EventSourceConnection) => void,
  onWebSocket: (f: WebSocketConnection) => void,
  setWebSocket: (f: WebSocketConnection) => void,
  onResource: (f: Resource) => void,
  setResource: (f: Resource) => void,
  rmvResource: (f: Resource) => void,
  onBytesClient: (sent: number) => void,
  onBytesServer: (received: number) => void
) {
  if ((window as any).__authtics_network_intercepted__) return;
  (window as any).__authtics_network_intercepted__ = true;
 
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    fetchId++;
    const savedFetchId = fetchId;
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const method = (args[1]?.method ?? 'GET').toUpperCase();
 
    // Filter out DevPanel's own internal pings so they don't show up in the network tab
    if (url.startsWith('/__authtics_host_apis__/') || url === "/__authtics_hmr__") {
      return originalFetch(...args);
    }

    // Estimate bytes sent: body size + rough header/URL overhead
    const body = args[1]?.body;
    const bodyBytes = body ? new Blob([body as BlobPart]).size : 0;
    // Headers + URL as a rough proxy for request overhead (like Chrome devtools does)
    const headerStr = JSON.stringify(args[1]?.headers ?? {});
    const sentBytes = bodyBytes + url.length + headerStr.length;

    onBytesClient(sentBytes);
    onFetch({ url, method, status: null, id: savedFetchId, response: null, sent: body ? JSON.stringify(body, null, 2)  .replace('"{', '{')
  .replace('}"', '}')
  .replaceAll('\\"', '"') : null });
    try {
      const resp = await originalFetch(...args);

      const clone = resp.clone();
 
      setFetch({ url, method, status: clone.status, id: savedFetchId, response: await clone.text(), sent: body ? JSON.stringify(body, null, 2)  .replace('"{', '{')
  .replace('}"', '}')
  .replaceAll('\\"', '"') : null });

      clone.arrayBuffer().then(buf => {
        onBytesServer(buf.byteLength);
      }).catch(() => {});
 
      return resp;
    } catch (e) {
      onFetch({ url, method, status: 0, id: savedFetchId, response: null, sent: body ? JSON.stringify(body, null, 2).replace(/[{}/"]/g, "") : null });
      throw e;
    }
  };

  const OriginalWebSocket = window.WebSocket;

  (window as any).WebSocket = function (url: string, protocols?: string | string[]) {
    fetchId++;
    const savedId = fetchId;
    const ws = new OriginalWebSocket(url, protocols);
    if (url.includes('__authtics')) return ws;

    onWebSocket({
      url,
      status: 'Connecting...',
      id: savedId,
      type: "WebSocket"
    })

    ws.addEventListener('open', () => {
      setWebSocket({
        url,
        status: 'Connected',
        id: savedId,
        type: "WebSocket"
      })
    })

    ws.addEventListener('close', () => {
      setWebSocket({
        url,
        status: 'Disconnected',
        id: savedId,
        type: "WebSocket"
      })
    })

    ws.addEventListener('message', (event) => {
      const bytes = new Blob([event.data]).size;
      onBytesServer(bytes);

      setWebSocket({
        url,
        status: 'Connected',
        id: savedId,
        type: "WebSocket"
      })
    })

    ws.addEventListener('error', () => {
      const status = ws.readyState === OriginalWebSocket.CLOSED
        ? 'Disconnected'
        : 'Connection Failed'

      setWebSocket({
        url,
        status,
        id: savedId,
        type: "WebSocket"
      })
    })

    const OriginalSend = ws.send;

    ws.send = function (data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      let bytes = 0;

  if (typeof data === 'string') {
    bytes = new Blob([data]).size;
  } else if (data instanceof Blob) {
    bytes = data.size;
  } else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
    bytes = data.byteLength;
  } else if (ArrayBuffer.isView(data)) {
    bytes = data.byteLength;
  }
      onBytesClient(bytes);
      OriginalSend.call(this, data);
    }

    return ws;
  }

  Object.defineProperty(window.WebSocket, 'prototype', {
  value: OriginalWebSocket.prototype,
  writable: false
});
Object.assign(window.WebSocket, OriginalWebSocket);

  const OriginalEventSource = window.EventSource;
  
  (window as any).EventSource = function (url: string, eventSourceInitDict?: EventSourceInit) {
    fetchId++;
    const savedId = fetchId;
    const es = new OriginalEventSource(url, eventSourceInitDict);
    if (url.includes('__authtics')) return es;

    // Initial state: connecting
    // This matches your EventSourceConnection interface
    onEventSource({
      url,
      status: 'Connecting...',
      id: savedId,
      type: "EventSource"
    });

    es.addEventListener('open', () => {
      setEventSource({
        url,
        status: 'Connected',
        id: savedId,
        type: "EventSource"
      });
    });

    es.addEventListener('message', (event) => {
      const bytes = new Blob([event.data]).size;
      onBytesServer(bytes);
      
      setEventSource({
        url,
        status: 'Connected',
        id: savedId,
        type: "EventSource"
      });
    });

    es.addEventListener('error', () => {
      // Check if it's a permanent failure or just a closed connection
      const status = es.readyState === OriginalEventSource.CLOSED 
        ? 'Disconnected' 
        : 'Connection Failed';

      setEventSource({
        url,
        status: status,
        id: savedId,
        type: "EventSource"
      });
    });

    return es;
  };

  // Vital for compatibility with other scripts/libraries
  (window.EventSource as any).prototype = OriginalEventSource.prototype;
  Object.assign(window.EventSource, OriginalEventSource);

  /* find resources */
  let usedResourcesSlots: Resource[] = [];
  let beforeResources: Resource[] = [];
  let currentResources: Resource[] = [];
  setInterval(() => {
    beforeResources = currentResources;
    currentResources = [];
  const queryImg = document.querySelectorAll('img');
  const queryScript = document.querySelectorAll('script');
  const queryLink = document.querySelectorAll('link');

  queryImg.forEach((img) => {
    if (img.src) {
      fetchId++;
      let savedFetchId = fetchId;
      if (!usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId })) onResource({ url: img.src, type: 'img', id: savedFetchId });
      currentResources.push({ url: img.src, type: 'img', id: savedFetchId });
      if (usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId })) setResource({ url: img.src, type: 'img', id: savedFetchId });
      if (!usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId })) usedResourcesSlots.push({ url: img.src, type: 'img', id: savedFetchId });
    }
  });

  queryScript.forEach((script) => {
    if (script.src) {
      fetchId++;
      let savedFetchId = fetchId;
      if (!usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId })) onResource({ url: script.src, type: 'script', id: savedFetchId })
      currentResources.push({ url: script.src, type: 'script', id: savedFetchId });
      if (usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId })) setResource({ url: script.src, type: 'script', id: savedFetchId });
      if (!usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId })) usedResourcesSlots.push({ url: script.src, type: 'script', id: savedFetchId });
    }
  })

  queryLink.forEach((link) => {
    if (link.href) {
      fetchId++;
      let savedFetchId = fetchId;
      if (!usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId })) onResource({ url: link.href, type: 'link', id: savedFetchId })
      currentResources.push({ url: link.href, type: 'link', id: savedFetchId });
      if (usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId })) setResource({ url: link.href, type: 'link', id: savedFetchId });
      if (!usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId })) usedResourcesSlots.push({ url: link.href, type: 'link', id: savedFetchId });
    }
  })

    beforeResources.forEach((resource) => {
      if (!currentResources.includes(resource)) {
        rmvResource(resource);
      }
    })
  }, 250)
}

function installConsoleInterceptor() {
  if ((window as any).__authtics_intercepted__) return;
  (window as any).__authtics_intercepted__ = true;
  window.addEventListener("error", event => {
  const error = event.error as Error | undefined;
  const stack = error?.stack ?? "";

  const location: ErrorLocation | undefined = stack
    ? parseStackLocation(stack)
    : event.filename
      ? {
          file: event.filename,
          line: event.lineno || 0,
          column: event.colno || 0,
          mapped: false,
        }
      : undefined;

  window.dispatchEvent(new CustomEvent("authtics:log", {
    detail: {
      type: "Error",
      message: error?.message || event.message,
      source: location?.file || "browser",
      stack,
      location,
      time: Date.now(),
    },
  }));
});
  window.addEventListener("unhandledrejection", event => {
  const reason = event.reason;
  const error = reason instanceof Error
    ? reason
    : new Error(String(reason));

  const stack = error.stack ?? "";

  window.dispatchEvent(new CustomEvent("authtics:log", {
    detail: {
      type: "Error",
      message: error.message,
      source: "unhandledrejection",
      stack,
      location: parseStackLocation(stack),
      time: Date.now(),
    },
  }));
});
  LOG_TYPES.forEach(type => {
  const t = type.toLowerCase() as
    | "log"
    | "info"
    | "warn"
    | "error"
    | "debug";

  const original = (console[t] as any).bind(console);

  (console as any)[t] = (...args: any[]) => {
    // Keep normal browser console output.
    original(...args);

    // Capture this immediately, while the console call is still on
    // the current call stack.
    const errorArgument = args.find(
  value => value instanceof Error
) as Error | undefined;

const stack = errorArgument?.stack || new Error().stack || "";

const generatedLocation = parseStackLocation(
  stack,
  errorArgument ? 0 : 1
);

    const message = args
      .map(value => {
        if (value instanceof Error) {
          return value.message;
        }

        if (typeof value === "object") {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        }

        return String(value);
      })
      .join(" ");

    void mapGeneratedLocation(generatedLocation ?? {
  file: "",
  line: 0,
  column: 0,
}).then(location => {
  window.dispatchEvent(new CustomEvent("authtics:log", {
    detail: {
      type,
      message,
      time: Date.now(),
      source: location.file || getCallerSource(),
      stack,
      location: location.file ? location : undefined,
    },
  }));
});
  };
});
}

function SecuredTab() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: '10px 10px', textAlign: 'center', gap: '8px' }}>
      <CircleX size={32} color='#ff7d7d' />
      <span style={{ color: '#ff7d7d', fontSize: 24}}>This tab is currently not accessible</span>
      <span style={{ color: '#ff7d7d', fontSize: 12 }}>To access this tab, you need to set "dat" to your current DAT in the Authtics Host config to set restriction and then restart.</span>
    </div>
  )
}

function ShutdownTab() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: '10px 10px', textAlign: 'center', gap: '8px' }}>
      <Power size={32} color='grey' />
      <span style={{ color: 'grey', fontSize: 24}}>The server was shutdown by you.</span>
    </div>
  )
}

function PanelButton({ onClick, onClick2, children, style, fullWidth, disabled, background }: {
  onClick?: () => void;
  onClick2?: (e: MouseEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  fullWidth?: boolean;
  disabled?: boolean;
  background?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return (
    <div
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        if (onClick && !disabled) {
          onClick();
        } else if (onClick2 && !disabled) {
          onClick2(e);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        cursor: 'pointer',
        borderRadius: '10px',
        padding: '6px 10px',
        fontSize: '11px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        width: fullWidth ? '100%' : undefined,
        boxSizing: 'border-box',
        userSelect: 'none',
        /*background: disabled ? '#bdbdbd' : /*pressed ? 'rgba(0,0,0,0.12)' : hovered ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)'*//*background,*/
        background: disabled 
    ? '#bdbdbd' 
    : pressed 
    ? `color-mix(in srgb, ${background} 12%, transparent)`
    : hovered 
    ? `color-mix(in srgb, ${background} 6%, transparent)`
    : background ?? '#fff',
        transition: 'background 0.15s ease',
        ...style,
      }}>
      {children}
    </div>
  );
}

const MAX_POINTS = 20; // number of data points shown in charts

const generateToken = (): string => {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}

export default function DevPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [errorBoxOpen, setErrorBoxOpen] = useState(false);
  const [errors, setErrors] = useState<LogEntry[]>([]);
const [selectedError, setSelectedError] = useState<number>(1);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [webpageInfoOpen, setWebpageInfoOpen] = useState(false);
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [aboutHostOpen, setAboutHostOpen] = useState(false);
  const [serverInfoOpen, setServerInfoOpen] = useState(false);
  const [panelCustomOpen, setPanelCustomOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shutdown, setShutdown] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [packageSecurityOpen, setPackageSecurityOpen] = useState(false);
  const [highRiskDeps, setHighRiskDeps] = useState<{
    suggestion: 'uninstall' | 'upgrade' | 'downgrade';
    package: string;
    ver: string;
    recommendedVer: string
  }[]>([]);
  const [mediumRiskDeps, setMediumRiskDeps] = useState<{
    suggestion: 'uninstall' | 'upgrade' | 'downgrade';
    package: string;
    ver: string;
    recommendedVer: string
  }[]>([]);
  const [lowRiskDeps, setLowRiskDeps] = useState<{
    suggestion: 'uninstall' | 'upgrade' | 'downgrade';
    package: string;
    ver: string;
    recommendedVer: string
  }[]>([]);
  const [panelColor, setPanelColor] = useState<{
    background: string;
    border: string;
  }>({
    background: '#111',
    border: '#333'
  });
  //const [siteInspectOpen, setSiteInspectOpen] = useState(false);
  const [hasIssue, setHasIssue] = useState(false);
  const [ping__, setPing__] = useState(0);
  const [networkFetches, setNetworkFetches] = useState<NetworkFetch[]>([]);
  const [eventSources, setEventSources] = useState<EventSourceConnection[]>([]);
  //const [usersPaused, setUsersPaused] = useState<boolean>(false);
  const [usersPausedRealInfo, setUsersPausedRealInfo] = useState<boolean>(false);
  const [webSockets, setWebSockets] = useState<WebSocketConnection[]>([]);
  const [resourcesFound, setResourcesFound] = useState<Resource[]>([]);
  const [status, setStatus] = useState<number | undefined | null>(200);
  //const [code, setCode] = useState('');
  const [pathName, setPathName] = useState<string | undefined>(undefined);
  const [hostName, setHostName] = useState<string | undefined>(undefined);
  const [protocol, setProtocol] = useState<string | undefined>(undefined);
  const [path, setPath] = useState<string | undefined>(undefined);
  //const contextMenuTimeoutMobile = useRef<any>(undefined);
  //const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  //const [contextMenuShown, setContextMenuShown] = useState<boolean>(false);
  const [renderType, setRenderType] = useState<string>("???");
  const datRestrictionMissingRef = useRef<boolean>(true);
  const cpuUsage = useRef<number>(0);
  const heapUsage = useRef<number>(0);
  const heapTotal = useRef<number>(0);
  const [datMatch, setDatMatch] = useState<boolean>(false);
  const [compilerType, setCompilerType] = useState<string>("?");
  //const [errorDetail, setErrorDetail] = useState<string | undefined>(undefined);
  const [httpVersion, setHttpVersion] = useState<string>("v?.?");
  const [errorBoxOpenable, setErrorBoxOpenable] = useState<boolean>(true);
  const [uptime, setUptime] = useState<string>("00:00:00:00");
  const [requests, setRequests] = useState<number>(0);
  const [hostVersion, setHostVersion] = useState<string>("Loading...");
  const [users, setUsers] = useState<number>(0);
  const [token, setToken] = useState<string | null>(null);
  const [tokenLength, setTokenLength] = useState<number>(0);
  const [tokenHidden, setTokenHidden] = useState<boolean>(true);
  const [locationMode, setLocationMode] =
  useState<"approximate" | "precise">("approximate");
  const NOTIFICATION_SLEEP_MS = 10 * 60 * 1000; // 10 minutes

const notificationSleepingUntilRef = useRef<number>(0);
const [notificationSleepingUntil, setNotificationSleepingUntil] =
  useState<number>(0);

  const sleepErrorNotifications = () => {
  const until = Date.now() + NOTIFICATION_SLEEP_MS;

  notificationSleepingUntilRef.current = until;
  setNotificationSleepingUntil(until);
  setErrorBoxOpen(false);
  setHasIssue(false);
};
  //const [consoleInputFocused, setConsoleInputFocused] = useState(false);
  //const consoleInputRef = useRef<HTMLTextAreaElement>(null);
  //const overlayRef = useRef<HTMLDivElement>(null);
  const fpsSpanRef = useRef<HTMLSpanElement>(null);
  const frameCount = useRef(0);
  const frames = useRef(0);
  const consoleScrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [datRestrictionMissing, setDatRestrictionMissing] = useState(true);
  const [heapResult, setHeapResult] = useState<string>("0 Bytes / 0 Bytes");
/*const [pos, setPos] = React.useState({ x: 20, y: 20 });
const [dragging, setDragging] = React.useState(false);
const offset = React.useRef({ x: 0, y: 0 });
  const [selected, setSelected] = React.useState<Element | null>(null);
const [rootEl, setRootEl] = useState<Element | null>(null);*/
  const cookie = {
    set: (k: string, v: string, sS: string = "Lax", s: boolean = true, mA: number | null = null) => {
      const cookieParts = [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`, "path=/"];

      if (mA !== null)  {
        cookieParts.push(`max-age=${mA}`);
        const d = new Date();
        d.setTime(d.getTime() + (mA * 1000));
        cookieParts.push(`expires=${d.toUTCString()}`);
      }
      if (s) cookieParts.push("secure");
      if (sS) cookieParts.push(`samesite=${sS}`);
      
      document.cookie = cookieParts.join("; ");
    },
    get: (k: string) => {
      const cookies = document.cookie.split(";").filter(Boolean);
      for (const c of cookies) {
        const [key, ...valParts] = c.trim().split("=");
        if (decodeURIComponent(key) === k) {
          return decodeURIComponent(valParts.join("="));
        }
      }
      return undefined;
    },
    del: (k: string) => {
      document.cookie = `${encodeURIComponent(k)}=; path=/; max-age=0; samesite=Lax; secure`;
    }
  }
  const [doc, setDoc] = useState<Document | null>(null);

  const [filters, setFilters] = useState<Record<LogType, boolean>>({
    Log: true, Info: true, Warn: true, Error: true, Debug: false/*, Eval: true*/
  });

  const errorCount = logs.filter(l => l.type === 'Error').length;
  const warnCount  = logs.filter(l => l.type === 'Warn').length;
  const filteredLogs = logs.filter(l => filters[l.type]);

  const handleScroll = () => {
    if (consoleScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = consoleScrollRef.current;
      // Buffer of 5px to handle zoom or rounding issues
      const reachedBottom = scrollHeight - scrollTop - clientHeight < 5;
      setIsAtBottom(reachedBottom);
    }
  };

  useEffect(() => {
    if (isAtBottom && consoleScrollRef.current) {
      consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
    }
  }, [filteredLogs, isAtBottom]);

/*useEffect(() => {
  setRootEl(doc?.documentElement as HTMLElement);
}, []);
const [picking, setPicking] = React.useState(false);*/

  /*const onMouseDown = (e: React.MouseEvent) => {
  dragging || setDragging(true);
  offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  e.preventDefault();
};

  const onTouchStart = (e: React.TouchEvent) => {
  const t = e.touches[0];
  offset.current = { x: t.clientX - pos.x, y: t.clientY - pos.y };
};

  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
const [domVersion, setDomVersion] = useState(0);

  const [currentNode, setCurrentNode] = useState<Element>(doc?.documentElement as HTMLElement);
const [history, setHistory] = useState<Element[]>([]);

const goInto = (el: Element) => {
  setHistory(prev => [...prev, currentNode]);
  setCurrentNode(el);
};

const goBack = () => {
  setHistory(prev => {
    const next = [...prev];
    setCurrentNode(next.pop()!);
    return next;
  });
};

useEffect(() => {
  const observer = new MutationObserver(() => setDomVersion(v => v + 1));
  observer.observe(doc?.documentElement as HTMLElement, { childList: true, subtree: true, attributes: true });
  return () => observer.disconnect();
}, []);

const getPath = (el: Element, depth: number) => el.tagName + depth + el.className + el.id;

const toggle = (path: string) => {
  setExpandedPaths(prev => {
    const next = new Set(prev);
    next.has(path) ? next.delete(path) : next.add(path);
    return next;
  });
};

  const colorizeJS = (code: string): string => {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/(\/\/[^\n]*)/g, '<span style="color:#888">$1</span>')
    .replace(/(".*?"|'.*?')/g, '<span style="color:#0a0">$1</span>')
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|default|class|new)\b/g, '<span style="color:#e05">$1</span>')
    .replace(/\b(\d+)\b/g, '<span style="color:#f90">$1</span>');
};

const colorizeCSS = (code: string): string => {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/([\w-]+)(\s*:)/g, '<span style="color:#f90">$1</span>$2')
    .replace(/([.#]?[\w-]+)\s*\{/g, '<span style="color:#e05">$1</span> {');
};

  const colorizeHtml = (code: string): React.ReactElement => {
  const tokens: React.ReactElement[] = [];
  let rest = code;
  let i = 0;

  const tagRegex = /(<\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)(>)/g;
  let last = 0;
  let match;

  while ((match = tagRegex.exec(code)) !== null) {
    if (match.index > last)
      tokens.push(<span key={i++} style={{ color: '#555' }}>{code.slice(last, match.index)}</span>);
    tokens.push(<span key={i++} style={{ color: '#666' }}>{match[1]}</span>);
    tokens.push(<span key={i++} style={{ color: '#e05' }}>{match[2]}</span>);
    // colorize attributes
    const attrStr = match[3];
    const attrRegex = /(\s[a-zA-Z-]+)(="([^"]*)")?/g;
    let am;
    while ((am = attrRegex.exec(attrStr)) !== null) {
      tokens.push(<span key={i++} style={{ color: '#f90' }}>{am[1]}</span>);
      if (am[2]) {
        tokens.push(<span key={i++} style={{ color: '#999' }}>="</span>);
        tokens.push(<span key={i++} style={{ color: '#0a0' }}>{am[3]}</span>);
        tokens.push(<span key={i++} style={{ color: '#999' }}>"</span>);
      }
    }
    tokens.push(<span key={i++} style={{ color: '#666' }}>{match[4]}</span>);
    last = match.index + match[0].length;
  }

  if (last < code.length)
    tokens.push(<span key={i++} style={{ color: '#555' }}>{code.slice(last)}</span>);

  return <>{tokens}</>;
};

const renderNode = (el: Element, depth = 0, path = el.tagName): React.ReactElement => {
  const isSelected = selected === el;
  const tag = el.tagName.toLowerCase();
  ;const idAttr = el.id ? el.id : null;
const classAttr = el.className ? String(el.className).slice(0, 15) : null;
const otherAttrs = Array.from(el.attributes)
  .filter(a => a.name !== 'id' && a.name !== 'class')
  .slice(0, 2);
  const text = Array.from(el.childNodes)
  .filter(n => n.nodeType === Node.TEXT_NODE)
  .map(n => n.textContent?.trim())
  .filter(Boolean)
  .join(' ');

const hasChildren = el.children.length > 0;
const hasText = text.length > 0;
const expandable = hasChildren || hasText;
const isExpanded = expandedPaths.has(path);*/

  /*return (
  <div key={path}>
    {*//* opening tag *//*}
    <div
  onClick={() => { setSelected(el); setRect(el.getBoundingClientRect()); if (expandable) toggle(path); }}
  style={{ paddingLeft: depth * 10 + 4, cursor: 'pointer', background: isSelected ? '#e0edff' : 'transparent', borderRadius: 4, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'nowrap' }}
>
  <span style={{ color: '#999' }}>{expandable ? (isExpanded ? '▾' : '▸') : '·'} </span>
<span style={{ color: '#666' }}>&lt;</span>
<span style={{ color: '#e05' }}>{tag}</span>
{idAttr && <><span style={{ color: '#f90' }}> id</span><span style={{ color: '#999' }}>="</span><span style={{ color: '#0a0' }}>{idAttr}</span><span style={{ color: '#999' }}>"</span></>}
{classAttr && <><span style={{ color: '#f90' }}> class</span><span style={{ color: '#999' }}>="</span><span style={{ color: '#0a0' }}>{classAttr}</span><span style={{ color: '#999' }}>"</span></>}
{otherAttrs.map(a => (
  <span key={a.name}>
    <span style={{ color: '#f90' }}> {a.name}</span>
    <span style={{ color: '#999' }}>="</span>
    <span style={{ color: '#0a0' }}>{a.value.slice(0, 20)}</span>
    <span style={{ color: '#999' }}>"</span>
  </span>
))}
<span style={{ color: '#666' }}>&gt;</span>
  {!isExpanded && hasText && <span style={{ color: '#333' }}>{text.slice(0, 30)}{text.length > 30 ? '...' : ''}</span>}
  {!isExpanded && <span style={{ color: '#e05' }}>&lt;/{tag}&gt;</span>}
</div>

{/* expanded content *//*}
{isExpanded && (
  <>
    {hasText && (
  <div
    style={{ paddingLeft: (depth + 2) * 10 + 4, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
    dangerouslySetInnerHTML={{
      __html: tag === 'script'
        ? colorizeJS(text)
        : tag === 'style'
        ? colorizeCSS(text)
        : `"${text}"`
    }}
  />
)}
    {hasChildren && Array.from(el.children).map((child, i) =>
      renderNode(child, depth + 1, path + '>' + child.tagName + i)
    )}
    {/* closing tag only shows separately when expanded *//*}
    <div style={{ paddingLeft: depth * 10 + 4, fontSize: 11, fontFamily: 'monospace', color: '#e05' }}>
    <span style={{ color: '#666' }}>&lt;/</span>
<span style={{ color: '#e05' }}>{tag}</span>
<span style={{ color: '#666' }}>&gt;</span>
    </div>
  </>
)}
  </div>
);
};
  
useEffect(() => {
  if (!picking) return;
  const onOver = (e: MouseEvent) => (e.target as HTMLElement).style.outline = '2px solid #e05';
  const onOut = (e: MouseEvent) => (e.target as HTMLElement).style.outline = '';
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.target as HTMLElement;
    el.style.outline = '';
    setSelected(el);
    setRect(el.getBoundingClientRect());
    setPicking(false);
  };
  document.addEventListener('mouseover', onOver);
  document.addEventListener('mouseout', onOut);
  document.addEventListener('click', onClick, true);
  return () => {
    document.removeEventListener('mouseover', onOver);
    document.removeEventListener('mouseout', onOut);
    document.removeEventListener('click', onClick, true);
  };
}, [picking]);

const styles = selected ? window.getComputedStyle(selected) : null;
const isFlex = styles?.display === 'flex';
const isGrid = styles?.display === 'grid';
const rotation = styles?.transform !== 'none' ? styles?.transform : null;
const styleKeys = ['color','background','fontSize','margin','padding','display','width','height','position','borderRadius'];

useEffect(() => {
  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    const point = 'touches' in e ? e.touches[0] : e;
    setPos({ x: point.clientX - offset.current.x, y: point.clientY - offset.current.y });
  };
  const onUp = () => setDragging(false);
  window.addEventListener('mousemove', onMove as any);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove as any);
  window.addEventListener('touchend', onUp);
  return () => {
    window.removeEventListener('mousemove', onMove as any);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove as any);
    window.removeEventListener('touchend', onUp);
  };
}, [dragging]);*/

  const loop = () => {
    frameCount.current++;
    requestAnimationFrame(loop);
  };

  useEffect(() => {
    const getPath = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-file-by-pathname', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pathname: window.location.pathname, /*dat: cookie.get('dat') as string | null*/ })
        });
      
      if (resp.status === 200) {
        const data = await resp.json();
        setPath(data.filePath);
      }
    }

    const getDatMatching = async () : Promise<string> => {
      const resp = await fetch('/__authtics_host_apis__/get-dat-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setDatMatch(data.isMatching as boolean);
        const resp3 = await fetch('/__authtics_host_apis__/is-users-paused', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
        let paused = false;
        if (resp3.status === 200) {
          const data = await resp3.json();
          paused = data.paused as boolean;
          //setUsersPaused(paused);
          setUsersPausedRealInfo(data.realInfo as boolean);
        }
        if (!data.isMatching && !paused) {
          doc?.getElementById('authtics-dev-panel-root')?.remove();
        }
        const resp2 = await fetch('/__authtics_host_apis__/get-dat-restriction-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp2.status === 200) {
        const data = await resp2.json();
        setDatRestrictionMissing(!data.enabled as boolean);
        datRestrictionMissingRef.current = !data.enabled as boolean;
        return "";
      }
      }

      return "";
    }

    const getRenderType = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-render-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setRenderType(data.renderType as string);
      }
    }

    const getUsage = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-cpu_memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        cpuUsage.current = (data.cpuUsage as number);
        heapUsage.current = (data.heapUsed as number);
        heapTotal.current = (data.heapTotal as number);
      }
    }

    const getHostVersion = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-host-ver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();

        setHostVersion(data.version as string);
      }
    }

    const getCompilerType = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-compiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setCompilerType(data.compiler as string);
      }
    }

    const getHttpVersion = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setHttpVersion(data.httpVersion as string);
      }
    }

    const formatSeconds = (totalSeconds: number): string => {
      const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, '0');

  return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

    const userSettings = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setErrorBoxOpenable(data.showError as boolean);
      }
    }

    const update = async () => {
      const resp = await fetch('/__authtics_host_apis__/get-server-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
      });
      if (resp.status === 200) {
        const data = await resp.json();
        setUptime(formatSeconds(data.uptime as number));
        setRequests(data.totalRequests as number);
        setUsers(data.users as number);
      }
    }

    setTimeout(async () => {
      await getDatMatching();
      setTimeout(() => {
      if (datRestrictionMissingRef.current === false) {
        getPath();
        getCompilerType();
        getHttpVersion();
        getRenderType();
        userSettings();
        getHostVersion();
        setInterval(() => {
          update();
          getUsage();
        }, 500);
      }
      }, 250);
    }, 250);

    /*setInterval(() => {
      //setFps(Math.round(1000 / (performance.now() - (window as any).lastFrameTime)));
      const now = performance.now();
      const last = (window as any).lastFrameTime;
      if (typeof last === 'number') {
        const _ = now - last;
        if (fpsSpanRef.current) {
          fpsSpanRef.current.textContent = _ > 0 ? Math.round(1000 / _).toString() : '0';
        }
      }
      (window as any).lastFrameTime = now; 
    }, 1000)*/
  }, []);

  /*const datTouchStart = (e: any) => {
    e.preventDefault();
    setCursorPosition({ x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY });
    contextMenuTimeoutMobile.current = setTimeout(() => {
      setContextMenuShown(true);
      clearTimeout(contextMenuTimeoutMobile.current);
    }, 1000);
  }

  const datTouchEnd = (e: any) => {
    e.preventDefault();
    clearTimeout(contextMenuTimeoutMobile.current);
  }*/

  const restart = async () => {
    await fetch('/__authtics_host_apis__/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
    })
  }

  const shutDown = async () => {
    setShuttingDown(true);
    await fetch('/__authtics_host_apis__/shutdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ /*dat: cookie.get('dat') as string | null*/ })
    })
    setShutdown(true);
  }

  useEffect(() => {
    const animationId = requestAnimationFrame(loop);
    
    const intervalId = setInterval(() => {
      if (fpsSpanRef.current) {
        fpsSpanRef.current.textContent = frameCount.current.toString();
      }
      frames.current = frameCount.current;
      frameCount.current = 0;
    }, 1000);

    return () => {
      cancelAnimationFrame(animationId);
      clearInterval(intervalId);
    };
  }, []);

  // Accumulated bytes per 2s tick
  const pendingSent = useRef(0);
  const pendingReceived = useRef(0);
  const [sentHistory, setSentHistory] = useState<number[]>(Array(MAX_POINTS).fill(0));
  const [receivedHistory, setReceivedHistory] = useState<number[]>(Array(MAX_POINTS).fill(0));
  const [cpuUsageHistory, setCpuUsageHistory] = useState<number[]>(Array(MAX_POINTS).fill(0));
  const [heapUsageHistory, setHeapUsageHistory] = useState<number[]>(Array(MAX_POINTS).fill(0));
  const [fpsHistory, setFpsHistory] = useState<number[]>(Array(MAX_POINTS).fill(0));

  const drawerHeight = !open
    ? '0px'
    : consoleOpen || networkOpen || routeOpen || webpageInfoOpen || clientInfoOpen || aboutHostOpen
      ? '320px'
      : '320px';

  // Ping every second
  useEffect(() => {
    //const dat = cookie.get('dat') as string | null;
    const interval = setInterval(async () => {
      try {
        const timeStart = Date.now();
        const resp = await fetch('/__authtics_host_apis__/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ /*dat*/ })
        });
        if (resp.status === 200) {
          const data = await resp.json();
          if (data.status === 'ok') setPing__(Date.now() - timeStart);
        }
      } catch { /* server not reachable */ }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (b: number, d: number = 2, r: boolean = false): string => {
    if (b === 0) return r ? 'Bytes' : '0 Bytes';
    const k = 1024;
    const dm = d < 0 ? 0 : d;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return r ? sizes[i] : parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Chart tick every 2 seconds — snapshot pending bytes then reset
  useEffect(() => {
    const interval = setInterval(() => {
      const s = pendingSent.current;
      const r = pendingReceived.current;
      const c = cpuUsage.current;
      const h = formatBytes(heapUsage.current);
      const t = ` ${formatBytes(heapUsage.current, 0, true)} / ` + formatBytes(heapTotal.current);
      setHeapResult(t);
      const h_num = Number(h.split(" ")[0]);
      const f = frames.current;
      pendingSent.current = 0;
      pendingReceived.current = 0;
      cpuUsage.current = 0;
      heapUsage.current = 0;
      setCpuUsageHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), c]);
      setHeapUsageHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), h_num]);
      setSentHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), s]);
      setReceivedHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), r]);
      setFpsHistory(prev => [...prev.slice(-(MAX_POINTS - 1)), f]);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
  if (!notificationSleepingUntil) return;

  const remaining = notificationSleepingUntil - Date.now();

  const timer = window.setTimeout(() => {
    notificationSleepingUntilRef.current = 0;
    setNotificationSleepingUntil(0);
  }, Math.max(remaining, 0));

  return () => window.clearTimeout(timer);
}, [notificationSleepingUntil]);

  // Console + network interceptors
  useEffect(() => {
    installConsoleInterceptor();
    installNetworkInterceptor(
      (f) => setNetworkFetches(prev => [...prev.slice(-499), f]),
      (f) => setNetworkFetches(prev => prev.map(p => p.id === f.id ? f : p)),
      (f) => setEventSources(prev => [...prev.slice(-499), f]),
      (f) => setEventSources(prev => prev.map(p => p.id === f.id ? f : p)),
      (f) => setWebSockets(prev => [...prev.slice(-499), f]),
      (f) => setWebSockets(prev => prev.map(p => p.id === f.id ? f : p)),
      (f) => setResourcesFound(prev => [...prev.slice(-499), f]),
      (f) => setResourcesFound(prev => prev.map(p => p.id === f.id ? f : p)),
      (f) => setResourcesFound(prev => prev.filter(p => p.id !== f.id)),
      (sent) => {
        pendingSent.current += sent;
      },
      (received) => {
        pendingReceived.current += received;
      }
    );

    const handler = (event: Event) => {
  const detail = (event as CustomEvent).detail as Omit<LogEntry, "id">;

  const entry: LogEntry = {
    ...detail,
    id: Date.now() + Math.random(),
  };

  setLogs(prev => [...prev.slice(-99), entry]);

      const isNotificationSleeping =
  notificationSleepingUntilRef.current > Date.now();

  if (detail.type === "Error") {
    setErrors(prev => [...prev, entry]);

    if (!isNotificationSleeping) {
      setHasIssue(true);
      setErrorBoxOpen(true);
    }
  }
};

    //const es = new EventSource('/__authtics_hmr__');

    try {
      const existingToken = cookie.get('dat') as string | null;
      const panelColor = cookie.get('panelColor') as string | null;

      if (panelColor) {
        setPanelColor({
          background: panelColor.split('|')[0],
          border: panelColor.split('|')[1]
        });
      } else {
        const cfg = (window as any).__authtics_config__;
        const serverDevMode = cfg?.devMode !== false;
        const serverDatRestricted = cfg?.datRestricted === true;
        if (serverDevMode && !serverDatRestricted) {
          cookie.set('panelColor', '#111|#333', "Lax", true, 365 * 24 * 60 * 60); // 1 year
        }
      }

      if (existingToken) {
        setToken(existingToken);
        let length_ = existingToken?.split('');
          let length;
          length = length_?.length;
          setTokenLength(length as number);
     } else {
        // Do NOT auto-generate a DAT if:
        //  - devMode is off (panel shouldn't be here, but guard defensively)
        //  - The server has a dat restriction configured; only pre-authorised tokens are valid,
        //    so silently minting a new one would never pass the server check anyway.
        const cfg = (window as any).__authtics_config__;
        const serverDevMode = cfg?.devMode !== false;
        const serverDatRestricted = cfg?.datRestricted === true;
        if (serverDevMode && !serverDatRestricted) {
          const newToken = generateToken();
          cookie.set('dat', newToken, "Lax", true, 5 * 365 * 24 * 60 * 60);
            setToken(newToken);
            let length_ = newToken?.split('');
            let length;
            length = length_?.length;
            setTokenLength(length as number);
          /*try {
            let localStorageToken;
            try {
              localStorageToken = localStorage.getItem('dat');
            } catch (e) {}
            cookie.set('dat', localStorageToken || newToken);
            setToken(newToken);
            let length_ = newToken?.split('');
            let length;
            length = length_?.length;
            setTokenLength(length as number);
          } catch (error) {
            console.error('[Authtics Host] Error storing token in localStorage:', error);
          }*/
        }
        // else: no cookie, restricted env — leave token null, panel will show the DAT-required message
      }
    } catch (error) {
      
    }
    window.addEventListener('authtics:log', handler);
    setInterval(() => setStatus((window as any).__status_code__ || 200), 1000);
    setPathName(window.location.pathname);
setHostName(window.location.hostname);
    setDoc(document);
    setProtocol(window.location.protocol.replace(':', '').toUpperCase());
    // Test logs
    //setTimeout(() => console.error('DevPanel rendered.'), 2000);
    //setTimeout(() => console.error('DevPanel rendered. 2'), 2000);
    /*setTimeout(() => console.debug('DevPanel rendered.'), 2000);
    setTimeout(() => console.info('DevPanel rendered.'),  2000);
    setTimeout(() => console.log('DevPanel rendered.'),   2000);
    setTimeout(() => console.warn('DevPanel rendered.'),  2000);*/

    return () => window.removeEventListener('authtics:log', handler);
  }, []);

  const getOS = (): string => {
    const ua = window.navigator.userAgent;
  
    if (/Android/i.test(ua)) return "Android";
  
    if (/Linux/i.test(ua)) {
      return (navigator.maxTouchPoints > 0) ? "Android (Desktop Mode)" : "Linux";
    }
  
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Mac/i.test(ua)) return "MacOS";
    if (/Win/i.test(ua)) return "Windows";
  
    return "Unknown";
  };

  useEffect(() => {
    setHasIssue(errorCount > 0);
  }, [errorCount, warnCount]);

  const toggleFilter = (type: LogType) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const errorBoxRef = useRef<HTMLDivElement>(null);
  setInterval(() => {
    if (errorBoxRef.current) {
      if (errorBoxOpen && errorBoxRef.current.style.opacity == '0') {
        errorBoxRef.current.style.opacity = '1';
      } else if (!errorBoxOpen && errorBoxRef.current.style.opacity == '1') {
        errorBoxRef.current.style.opacity = '0';
      }
    }
  }, 500)

  useEffect(() => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-okaidia.min.css';
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.textContent = `.token.punctuation  { color: #333333 !important; }
.token.operator     { color: #d73a49 !important; }
.token.variable     { color: #001080 !important; }
.token.entity       { color: #d73a49 !important; }
.token.url          { color: #0070c1 !important; }
.token.string       { color: #a31515 !important; }
.token.function     { color: #795e26 !important; }
.token.keyword      { color: #af00db !important; }
.token.number       { color: #098658 !important; }
.token.boolean      { color: #0000ff !important; }
.token.comment      { color: #6a9955 !important; }
.token.class-name   { color: #267f99 !important; }
.token.property     { color: #001080 !important; }
.token.builtin      { color: #0070c1 !important; }
.token.template-string        { color: #a31515 !important; }
.token.template-punctuation   { color: #d73a49 !important; }
.token.interpolation          { color: #333333 !important; }
.token.interpolation-punctuation { color: #d73a49 !important; }`;
  document.head.appendChild(style);
}, []);

  useEffect(() => {
    const __ = async () => {
      await fetch(window.location.pathname, {
        method: 'GET'
      });
    }
    __()
  }, []);

  /*const showSelfConsoleLog = (message: string) => {
    const event = window.dispatchEvent(new CustomEvent('authtics:log', {
      detail: {
        type: "Eval",
        message: message,
        time: Date.now(),
        source: "console.js"
      }
    }));
  }*/

  const pause_Resume_Users = async () => {
    if (usersPausedRealInfo) {
      const resp = await fetch('/__authtics_host_apis__/set-users-paused', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /*dat: cookie.get('dat') as string | null,*/
          paused: false
        })
      })
      if (resp.status === 200) {
        setUsersPausedRealInfo(false);
      }
    } else {
      const resp = await fetch('/__authtics_host_apis__/set-users-paused', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /*dat: cookie.get('dat') as string | null,*/
          paused: true
        })
      })
      if (resp.status === 200) {
        setUsersPausedRealInfo(true);
      }
    }
  }

  return (
    <>
      {/*<div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute',
        zIndex: 999999,
        visibility: contextMenuShown ? 'visible' : 'hidden',
        top: cursorPosition.y || 0,
        left: cursorPosition.x || 0,
        transition: contextMenuShown ? 'opacity 0.25s ease' : '',
      }}>
        {contextMenuShown ? (
      <div style={{
        position: 'absolute',
        background: '#f7f7f7',
        border: '1px solid #e6e3e3',
        borderRadius: '10px',
        padding: '5px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999999,
        width: '320px'
      }}></div>): (<></>)}
      </div>
      </div>*/}
      <div style={{
        position: 'absolute',
        zIndex: 999999,
        background: 'rgba(0,0,0,0.5)',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: errorBoxOpen && errorBoxOpenable && errors.length > 0 ? 'flex' : 'none',
        justifyContent: 'center',
        alignItems: 'center',
        transition: errorBoxOpen && errorBoxOpenable && errors.length > 0 ? 'opacity 0.25s ease' : '',
      }} ref={errorBoxRef}>
        {errorBoxOpen && errorBoxOpenable && errors.length > 0 ? (
      <div style={{
        background: '#f7f7f7',
        border: '1px solid #e6e3e3',
        borderRadius: '10px',
        padding: '5px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999999,
        width: '320px',
        maxHeight: '320px',
        overflow: 'auto'
      }}>
        <div style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.15)',
            borderRadius: '100px',
            padding: '4px 8px',
            fontSize: '12px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            gap: '4px'
          }}>
            <ShieldCheck size={16} color="#f472b6" style={{ flexShrink: 0 }} /> Authtics Host
          </div>
          <p style={{ color: 'red', fontSize: '12px' }}>Error found ({selectedError}/{errors.length})</p>
          <PanelButton onClick={() => { setErrorBoxOpen(false); sleepErrorNotifications(); setErrors([]); setSelectedError(1) }} style={{ marginLeft: 'auto', }}>Close</PanelButton>
        </div>
        <div style={{
          padding: '6px 2px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'system-ui, sans-serif',
          flexDirection: 'column'
        }}>
          <p style={{ color: 'red', fontSize: '24px', gap: '6px', display: 'flex', justifyContent: 'left', alignItems: 'left', textAlign: 'left', marginLeft: '10px', whiteSpace: 'normal', wordBreak: 'break-word', width: '100%' }}><CircleX size={24} color='red' />{errors[selectedError - 1]?.message}</p>
          <div style={{
  display: "flex",
  gap: "6px",
  marginTop: "10px",
  marginBottom: "6px",
        flexDirection: 'row'
}}>
  <PanelButton
    onClick={() => setLocationMode("approximate")}
    style={{
      background: locationMode === "approximate"
        ? "#34a8eb"
        : undefined,
    }}
  >
    Approximate
  </PanelButton>

  <PanelButton
    onClick={() => setLocationMode("precise")}
    style={{
      background: locationMode === "precise"
        ? "#34a8eb"
        : undefined,
    }}
  >
    Precise
  </PanelButton>
</div>
          {(() => {
        const selected = errors[selectedError - 1];
  const location = selected?.location;
        if (!location) {
          return <p style={{ textAlign: "left" }}>At an unknown location</p>
        }
  const line = location.line || 0;
  const column = location.column || 1;
        
        return <p style={{ textAlign: "left" }}>At {location ? `${location.file.replace(window?.location.host, "")}:${line}:${column}` : `an unknown location`}</p>
      })()}
          {(() => {
  const selected = errors[selectedError - 1];
  const location = selected?.location;

  if (!location) {
    return (
      <pre style={{ color: "#777", fontSize: "12px" }}>
        No source location available.
      </pre>
    );
  }

  const sourceLine = location.sourceText || "";
  const line = location.line || 0;
  const column = location.column || 1;
  const length = location.length || 1;

  if (locationMode === "precise") {
    return (
      <pre style={{
        background: "#1e1e1e",
        color: "#ddd",
        padding: "8px",
        overflowX: "auto",
        fontSize: "12px",
        width: "310px",
        maxWidth: "90%",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        overflowWrap: "break-word",
        borderRadius: "10px"
      }}>
        {line} | {sourceLine}
        {"\n"}
        <div style={{
          color: "#f472b6"
        }}>
          {getPreciseMarker(sourceLine, column, length, line)}
        </div>
      </pre>
    );
  }

  return (
    <pre style={{
      background: "#1e1e1e",
      color: "#ddd",
      padding: "8px",
      overflowX: "auto",
      fontSize: "12px",
      width: "310px",
      maxWidth: "90%",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      overflowWrap: "break-word",
      borderRadius: "10px"
    }}>
      {location.lines?.join("\n") || ``}
    </pre>
  );
})()}
          {/*<p>{errorDetail}</p>*/}
        </div>
        <div style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <PanelButton onClick={() => { setSelectedError(selectedError  - 1 < 1 ? selectedError : selectedError - 1)}} style={{ marginLeft: 'auto', width: '50%', justifyContent: 'space-between', display: 'flex' }}><ChevronLeft size={12} /> Previous</PanelButton>
          <PanelButton onClick={() => { setSelectedError(selectedError  + 1 > errors.length ? selectedError : selectedError + 1)}} style={{ marginLeft: 'auto', width: '50%', justifyContent: 'space-between', display: 'flex', background: '#34a8eb' }}>Next <ChevronRight size={12} /></PanelButton>
        </div>
      </div>
    ) : (<></>)}
      </div>
    <div style={{
      position: 'fixed',
      bottom: '15px',
      right: '15px',
      zIndex: 999999,
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {/*siteInspectOpen ? (
      <div
  style={{
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    width: 320,
    background: '#f7f7f7',
    color: '#333',
    borderRadius: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    zIndex: 99999,
    userSelect: 'none',
  }}
>
  {/* drag handle *//*}
  <div
    onMouseDown={onMouseDown}
    onTouchStart={onTouchStart}
    style={{ padding: '8px 12px', cursor: 'grab', borderBottom: '1px solid #fafafa', fontWeight: 600 }}
  >
    Inspect Site
  </div>
        {/*<div style={{ background: '#eee', borderRadius: 6, padding: 6, marginBottom: 8, maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace' }}>
  {renderNode(document.documentElement)}
</div>*//*}
        <div style={{ fontFamily: 'monospace', fontSize: 11, maxHeight: 200, overflowY: 'auto' }}>
  {rootEl ? renderNode(rootEl) : <span style={{ fontSize: 11, color: '#888' }}>Loading...</span>}
</div>

    {selected && rect && (
  <div style={{
    position: 'fixed',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    border: '2px solid #e05',
    pointerEvents: 'none',
    zIndex: 99998,
    boxSizing: 'border-box',
  }}>
    {/* size label *//*}
    <div style={{ position: 'absolute', top: -18, left: 0, background: '#e05', color: '#fff', fontSize: 10, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap' }}>
      {Math.round(rect.width)}×{Math.round(rect.height)}px
      {rotation && ` · ${rotation}`}
    </div>
    {/* flex/grid lines *//*}
    {(isFlex || isGrid) && (
      <>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px dashed #e05', opacity: 0.6 }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeft: '1px dashed #e05', opacity: 0.6 }} />
        <div style={{ position: 'absolute', bottom: -18, right: 0, background: '#0070f3', color: '#fff', fontSize: 10, padding: '1px 4px', borderRadius: 3 }}>
          {isFlex ? 'flex' : 'grid'}
        </div>
      </>
    )}
  </div>
)}

  {/* content *//*}
  <div style={{ padding: 12, maxHeight: 400, overflowY: 'auto' }}>
  <button
  onClick={() => setPicking(true)}
  style={{ marginBottom: 8, padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: picking ? '#e05' : '#fff', color: picking ? '#fff' : '#333', display: 'flex', alignItems: 'center', gap: 4 }}
>
  <Search size={12} /> {picking ? 'Picking...' : 'Pick Element'}
</button>

{selected && (
  <div>
    {/* tag + class *//*}
    <div style={{ fontWeight: 600, fontSize: 13 }}>&lt;{selected.tagName.toLowerCase()}&gt;</div>
    {selected.className && <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>.{Array.from((selected as HTMLElement).classList).join(' .')}</div>}

    {/* innerHTML preview *//*}
    <div style={{ background: '#eee', borderRadius: 6, padding: 6, fontSize: 11, marginBottom: 8, maxHeight: 80, overflowY: 'auto', wordBreak: 'break-all' }}>
      {(selected as HTMLElement).innerHTML.slice(0, 200)}{(selected as HTMLElement).innerHTML.length > 200 ? '...' : ''}
    </div>

    {/* computed styles *//*}
    {styleKeys.map(k => (
      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, borderBottom: '1px solid #eee', padding: '2px 0' }}>
        <span style={{ color: '#888' }}>{k}</span>
        <span style={{ color: '#0070f3' }}>{(styles as any)?.[k]}</span>
      </div>
    ))}
  </div>
)}
  </div>
</div>
      ) : (<></>)*/}

      {/* ── Drawer ── */}
      <div style={{
        maxHeight: drawerHeight,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        overflow: (!consoleOpen && !networkOpen && !aboutHostOpen && !webpageInfoOpen && !clientInfoOpen ? 'hidden auto' : 'hidden'),
        borderRadius: '10px',
        transition: 'max-height 0.35s ease, opacity 0.25s ease',
        border: '1px solid #e6e3e3',
      }}>
        <div style={{
          background: '#f7f7f7',
          //border: '1px solid #e6e3e3',
          borderRadius: '10px',
          width: '320px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}>
          {shutdown ? (<ShutdownTab />) : (<></>)}

          {consoleOpen && !shutdown ? (
            <>
              <div style={{
                padding: '6px 8px',
                borderBottom: '1px solid #ddd',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <PanelButton onClick={() => setConsoleOpen(false)} style={{ color: '#555' }}>
                  <ArrowLeft size={12} /> Back
                </PanelButton>
                <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
                  <Terminal size={12} color="#16a34a" /> Console
                </span>
                <span style={{ fontSize: '10px', color: '#aaa', marginLeft: '2px' }}>
                  {filteredLogs.length} message{filteredLogs.length !== 1 ? 's' : ''} shown, {logs.length} in total
                </span>
                <PanelButton onClick={() => setLogs([])} style={{ color: '#aaa', marginLeft: 'auto' }}>
                  Clear
                </PanelButton>
              </div>

              <div style={{
                display: 'flex',
                gap: '4px',
                padding: '5px 8px',
                borderBottom: '1px solid #eee',
                background: '#fafafa',
                flexWrap: 'wrap',
              }}>
                {[...LOG_TYPES].map(type => (
                  <label key={type} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '10px',
                    color: filters[type] ? FILTER_COLORS[type] : '#bbb',
                    cursor: 'pointer',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    background: filters[type] ? `${FILTER_COLORS[type]}18` : 'transparent',
                    border: `1px solid ${filters[type] ? FILTER_COLORS[type] + '44' : '#e0e0e0'}`,
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                  }}>
                    <input
                      type="checkbox"
                      checked={filters[type]}
                      onChange={() => toggleFilter(type)}
                      style={{ display: 'none' }}
                    />
                    {type}
                  </label>
                ))}
              </div>

              <div style={{ overflowY: 'auto', maxHeight: '220px' }} ref={consoleScrollRef} onScroll={handleScroll}>
                {filteredLogs.length === 0
                  ? <div style={{ padding: '16px 12px', color: '#aaa', fontSize: '12px' }}>No logs yet.</div>
                  : [...filteredLogs]/*.reverse()*/.map(log => {
                      const s = TYPE_STYLE[log.type];
                      return (
                        <div key={log.id} style={{
                          display: 'flex',
                          gap: '8px',
                          padding: '5px 10px',
                          background: s.bg,
                          borderBottom: '1px solid #f0f0f0',
                          alignItems: 'flex-start',
                        }}>
                          {s.icon && (
                            <span style={{ color: s.color, marginTop: '1px', flexShrink: 0, display: 'flex' }}>
                              {s.icon}
                            </span>
                          )}
                          <span style={{
                            color: s.textColor ?? '#555',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                          }}>
                            {/*log.type === "Eval" ? (<div style={{ display: 'flex', flexDirection: 'row', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>(You): <div
    style={{
      fontFamily: 'monospace',
      fontSize: '12px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}
    dangerouslySetInnerHTML={{ __html: Prism.highlight(log.message, Prism.languages.javascript, 'javascript') }}
  /></div>) : */log.message}
                          </span>
                        </div>
                      );
                    })}
              </div>

              {/*<div style={{
                display: 'flex',
                gap: '4px',
                padding: '5px 8px',
                borderTop: '1px solid #eee',
                background: '#fafafa',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'row'
              }}>
                <span style={{ fontSize: '17px', color: 'green', fontFamily: 'arial', textAlign: 'center', marginRight: '5px' }}>{">"}</span>
                <div style={{ position: 'relative', display: 'inline-flex' }}><textarea value={code} onChange={(e) => {setCode(e.target.value);e.target.style.height = '0px';
    e.target.style.height = e.target.scrollHeight + 'px';if (overlayRef.current) {
    overlayRef.current.style.height = e.target.scrollHeight + 'px';
    }}} onFocus={() => setConsoleInputFocused(true)}
      onBlur={() => setConsoleInputFocused(false)} autoCapitalize="none"
  autoCorrect="off"
  autoComplete="off"
  spellCheck={false} style={{ width: (consoleInputRef.current?.value != "" ? '230px' : '265px'), lineHeight: 1.5, padding: '6px 10px', borderRadius: '10px', border: '1px solid #eee', fontSize: '12px', outline: consoleInputFocused ? '1px solid #34a8eb' : 'none', color: '#333', caretColor: 'black', background: 'white', fontFamily: 'monospace', resize: 'none', overflow: 'hidden', boxSizing: 'border-box', height: '32px' }} ref={consoleInputRef} onKeyDown={(e) => {
  if (e.key === "Enter") { e.preventDefault();const errors: any[] = [];const logs: any[] = []
const original = console.log;
const original2 = console.error;
const original3 = console.debug;
const original4 = console.info;
const original5 = console.warn;
console.log = (...args) => logs.push({"data": args, "type": "log"});console.error = (...args) => logs.push({"data": args, "type": "error"});console.debug = (...args) => logs.push({"data": args, "type": "debug"});console.info = (...args) => logs.push({"data": args, "type": "info"});console.warn = (...args) => logs.push({"data": args, "type": "warn"});const evalError = (e: any) => {errors.push(e.error);logs.push({"data": e.error, "type": "error"})};const evalUnhandledRejection = (e: any) => {errors.push(e.reason);logs.push({"data": e.reason, "type": "error"});};window.addEventListener("error", evalError);

window.addEventListener("unhandledrejection", evalUnhandledRejection);const savedValue = e.currentTarget.value;if (consoleInputRef.current) {consoleInputRef.current.value = "";}setCode('');e.currentTarget.style.height = '32px';
    if (consoleInputRef.current) {
    consoleInputRef.current.style.height = '32px';
    };showSelfConsoleLog(savedValue);try {
  console.log = original;
  console.error = original2;
  console.debug = original3;
  console.info = original4;
  console.warn = original5;
  window.removeEventListener("error", evalError);
  window.removeEventListener("unhandledrejection", evalUnhandledRejection);
  logs.forEach(log => {
    if (log.type === "error")
      console.error(...log.data);
    else if (log.type === "debug")
      console.debug(...log.data);
    else if (log.type === "info")
      console.info(...log.data);
    else if (log.type === "warn")
      console.warn(...log.data);
    else
      console.log(...log.data);
  });
  if (logs.length === 0) {
    console.log("undefined");
  }
} catch (e: any) {
  console.log = original;
  console.error = original2;
  console.debug = original3;
  console.info = original4;
  console.warn = original5;
    window.removeEventListener("error", evalError);
  window.removeEventListener("unhandledrejection", evalUnhandledRejection);
  logs.forEach(log => {
    if (log.type === "error")
      console.error(...log.data);
    else if (log.type === "debug")
      console.debug(...log.data);
    else if (log.type === "info")
      console.info(...log.data);
    else if (log.type === "warn")
      console.warn(...log.data);
    else
      console.log(...log.data);
  });
  console.error(e.message);
      }; } }} />{/*code && (<div
    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'monospace', fontSize: '12px', top: 0, left: 0,
      padding: '6px 10px',whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      lineHeight: '1.5', border: '1px solid transparent', }} ref={overlayRef}
    dangerouslySetInnerHTML={{ __html: Prism.highlight(code, Prism.languages.javascript, 'javascript') }}
  />)*//*}</div>
                {consoleInputRef.current?.value != "" ? <PanelButton style={{ padding: '8px 10px', borderRadius: '10px', background: '#34a8eb', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'system-ui, sans-serif' }} onClick={() => { const errors: any[] = [];const logs: any[] = []
const original = console.log;
const original2 = console.error;
const original3 = console.debug;
const original4 = console.info;
const original5 = console.warn;
console.log = (...args) => logs.push({"data": args, "type": "log"});console.error = (...args) => logs.push({"data": args, "type": "error"});console.debug = (...args) => logs.push({"data": args, "type": "debug"});console.info = (...args) => logs.push({"data": args, "type": "info"});console.warn = (...args) => logs.push({"data": args, "type": "warn"});const evalError = (e: any) => {errors.push(e.error);logs.push({"data": e.error, "type": "error"})};const evalUnhandledRejection = (e: any) => {errors.push(e.reason);logs.push({"data": e.reason, "type": "error"});};window.addEventListener("error", evalError);

window.addEventListener("unhandledrejection", evalUnhandledRejection);const savedValue = consoleInputRef.current ? consoleInputRef.current.value : '';if (consoleInputRef.current) {consoleInputRef.current.value = "";}setCode('');
    if (consoleInputRef.current) {
    consoleInputRef.current.style.height = '32px';
    };showSelfConsoleLog(savedValue);try {
  console.log = original;
  console.error = original2;
  console.debug = original3;
  console.info = original4;
  console.warn = original5;
  window.removeEventListener("error", evalError);
  window.removeEventListener("unhandledrejection", evalUnhandledRejection);
  logs.forEach(log => {
    if (log.type === "error")
      console.error(...log.data);
    else if (log.type === "debug")
      console.debug(...log.data);
    else if (log.type === "info")
      console.info(...log.data);
    else if (log.type === "warn")
      console.warn(...log.data);
    else
      console.log(...log.data);
  });
      if (logs.length === 0) {
    console.log("undefined");
      }
} catch (e: any) {
  console.log = original;
  console.error = original2;
  console.debug = original3;
  console.info = original4;
  console.warn = original5;
    window.removeEventListener("error", evalError);
  window.removeEventListener("unhandledrejection", evalUnhandledRejection);
  logs.forEach(log => {
    if (log.type === "error")
      console.error(...log.data);
    else if (log.type === "debug")
      console.debug(...log.data);
    else if (log.type === "info")
      console.info(...log.data);
    else if (log.type === "warn")
      console.warn(...log.data);
    else
      console.log(...log.data);
  });
  console.error(e.message);
      };  }}><Send size={12} /></PanelButton> : (<></>)}
              </div>
              <div>{code && (
  <div
    style={{
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '4px 10px',
      marginTop: '4px',
      background: '#f5f5f5',
      borderRadius: '6px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
    }}
    dangerouslySetInnerHTML={{ __html: Prism.highlight(code, Prism.languages.javascript, 'javascript') }}
  />
)}</div>*/}
            </>

          ) : networkOpen && !shutdown ? (
            <>
              <div style={{
                padding: '6px 8px',
                borderBottom: '1px solid #ddd',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <PanelButton onClick={() => setNetworkOpen(false)} style={{ color: '#555' }}>
                  <ArrowLeft size={12} /> Back
                </PanelButton>
                <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
                  <Wifi size={12} color="#3b82f6" /> Network
                </span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Ping row */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: '#fff',
                  borderRadius: '10px',
                  border: '1px solid #eee',
                  fontSize: '12px',
                  color: '#333',
                }}>
                  <span>Ping</span>
                  <span style={{ color: ping__ < 100 ? '#16a34a' : ping__ < 300 ? '#d97706' : '#e53e3e', fontFamily: 'monospace' }}>
                    {ping__ > 0 ? `${ping__}ms` : '??ms'}
                  </span>
                </div>
                {datRestrictionMissing ? (<span style={{ display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Info size={30} />This analytic is unavaliable. Set "dat" to your current DAT in the Authtics Host config to set restriction and then restart.</span>) : (<></>)}

                {/* Charts — update every 2s */}
                <Sparkline data={receivedHistory} color="#3b82f6" label="Received" unit=" bytes" />
                <Sparkline data={sentHistory}     color="#16a34a" label="Sent"     unit=" bytes" />
                <span style={{fontSize: '15px', color: '#333', fontWeight: 'bold' }}>Fetches — {networkFetches.length} total fetches</span>

                {/* Request log */}
                {networkFetches.length === 0
                  ? <div style={{ color: '#aaa', fontSize: '12px', padding: '4px 2px' }}>No network requests yet.</div>
                  : [...networkFetches].reverse().map((f, i) => (
                    <div key={i} style={{
                      background: '#fff',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: '10px',
                      border: '1px solid #eee',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                    }}>
                      <div style={{display: 'flex',
                      justifyContent: 'space-between', gap: '8px', padding: '6px 10px', borderBottom: '1px solid #eee'}}>
                      <span style={{ color: '#3b82f6' }}>{f.method}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>{f.url}</span>
                      <span style={{ color: f.status ? (f.status < 400 ? '#16a34a' : '#e53e3e') : 'orange' }}>{f.status || "Awaiting for response..."}</span>
                    </div>
                      {f.method === "POST" && f.sent?.trim() ? (<div style={{padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '8px'}}><p style={{color: 'orange', fontFamily: 'system-ui, sans-serif', margin: 0}}>Sent: </p><div>{f.sent}</div></div>) : (<></>)}
                      <div style={{padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '8px'}}><p style={{color: 'green', fontFamily: 'system-ui, sans-serif', margin: 0}}>Received: </p><TruncatedText content={f.response || "..."} id={`${f.id}_fetch`} /></div>
                      {f.response ? (f.response.split('').length > 100 ? (<PanelButton onClick2={(e: MouseEvent<HTMLDivElement>) => { const obj___ = document.getElementById(`${f.id}_fetch`);if (obj___ && !obj___.hasAttribute('expanded')) { obj___.innerText = f.response as string; obj___.setAttribute('expanded', ''); e.currentTarget.innerText = 'View less'; } else if (obj___ && obj___.hasAttribute('expanded')) { obj___.innerText = f.response?.slice(0, 100) + "..."; obj___.removeAttribute('expanded'); e.currentTarget.innerText = `View more (${f.response ? (f.response.split('').length - 100) : 0} bytes hidden)`; } }} style={{ padding: '8px 10px', borderRadius: '10px', background: '#34a8eb', color: '#fff', border: 'none', cursor: 'pointer', margin: '10px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>View more ({f.response ? (f.response.split('').length - 100) : 0} bytes hidden)</PanelButton>) : (<></>)) : (<></>)}
                    </div>
                  ))}
                <span style={{ fontSize: '15px', color: '#333', fontWeight: 'bold' }}>Active connections</span>
                {eventSources.length === 0 ? (<div style={{ color: '#aaa', fontSize: '12px', padding: '4px 2px' }}>No active connections.</div>) : 
                [...eventSources, ...webSockets].reverse().map((es, i) => (
                  <div key={i} style={{
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '10px',
                    border: '1px solid #eee',
                    fontSize: '11px',
                    fontFamily: 'monospace'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px' }}>
                      <span style={{ color: '#3b82f6', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>{es.type === "EventSource" ? <Zap color="green" size={12} /> : es.type === "WebSocket" ? <Globe color="green" size={12} /> : <></>}{es.type === "EventSource" ? "Event Source" : es.type === "WebSocket" ? "Web Socket" : "???"}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>{es.url}</span>
                      <span style={{ color: es.status === 'Connected' ? '#16a34a' : es.status === 'Disconnected' ? '#e53e3e' : 'orange' }}>{es.status === 'Connected' ? 'Active' : es.status === 'Disconnected' ? 'Disconnected' : es.status === 'Connecting...' ? '...' : es.status === 'Connection Failed' ? 'Failed' : 'Unknown'}</span>{/*<ChevronRight size={12} />*/}
                    </div>
                  </div>
                ))}
                <span style={{ fontSize: '15px', color: '#333', fontWeight: 'bold' }}>Resources Found — {resourcesFound.length} total resources</span>
                {resourcesFound.length === 0 ? (<div style={{ color: '#aaa', fontSize: '12px', padding: '4px 2px' }}>No resources found.</div>) : 
              [...resourcesFound].reverse().map((r, i) => (
                <div key={i} style={{
                    background: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '10px',
                    border: '1px solid #eee',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px' }}>
                      <span style={{ color: '#3b82f6', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>{r.type}</span>
                      <span style={{ flex: 1, /*overflow: 'hidden',*/ /*textOverflow: 'ellipsis', whiteSpace: 'nowrap',*/ color: '#333' }}>{r.url}</span>
                    </div>
                  </div>
              ))
                }
              </div>
            </>

          ) : routeOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setRouteOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Route size={12} color="#3b82f6" /> Route
          </span>
          <span style={{ fontSize: '10px', color: '#aaa', marginLeft: '2px' }}>
            {pathName}
          </span>
        </div>
        {datRestrictionMissing ? (<SecuredTab />) : (<></>)}
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px', color: '#333', fontWeight: 'bold' }}>
            {pathName}
          </span>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Load Status Code
            </span>
            <span style={{ color: status === 200 ? '#16a34a' : '#e53e3e', fontFamily: 'monospace' }}>
              {status}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              File Path
            </span>
            <span style={{ color: 'blue', fontFamily: 'monospace' }}>
              {path}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              File Name
            </span>
            <span style={{ color: 'blue', fontFamily: 'monospace' }}>
              {path?.split('/').pop()}
            </span>
          </div>
        </div>
      </>
    ) : webpageInfoOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setWebpageInfoOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Globe size={12} color="#3b82f6" /> Webpage Info
          </span>
        </div>
        {datRestrictionMissing ? (<SecuredTab />) : (<></>)}
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }}>
          <span style={{fontSize: '12px', color: '#333' }}><span style={{ fontSize: '24px', color: '#333', fontWeight: 'bold' }}>
            {pathName}
          </span> on <span style={{fontSize: '12px', color: '#333', fontWeight: 'bold' }}>{hostName}</span></span>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Protocol
            </span>
            <span style={{ fontSize: '12px', color: 'orange' }}>
              {protocol}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              SSL
            </span>
            <span style={{ fontSize: '12px', color: (protocol === 'HTTPS' ? '#16a34a' : '#e53e3e') }}>
              {protocol === 'HTTPS' ? 'Yes' : 'No'}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Renderer Type
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {renderType === "ssr" ? 'SSR (Server-Side Rendering)' : renderType === "csr" ? 'CSR (Client-Side Rendering)' : renderType === "ssg" ? 'SSG (Static Site Generation)' : renderType === "srtws" ? "SRTWS (Site Rendering Through WebSockets)" : '???'}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Compiler Type
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {compilerType}
            </span>
          </div>
        </div>
      </>
    ) : clientInfoOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setClientInfoOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Info size={12} color="#3b82f6" /> Client Info
          </span>
        </div>
        {datRestrictionMissing ? (<SecuredTab />) : (<></>)}
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              HTTP Version
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {"v" + httpVersion}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              User Agent
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {navigator.userAgent}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              OS
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {getOS()}
            </span>
          </div>
          {/*<div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Device Type
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {isMobile ? 'Mobile' : 'PC'}
            </span>
          </div>*/}
          {/*<div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              FPS
            </span>
            <span style={{ fontSize: '12px', color: (frames.current < 30 ? '#e53e3e' : frames.current < 60 ? '#d97706' : '#16a34a') }} ref={fpsSpanRef}>
              —
            </span>
          </div>*/}
          <Sparkline data={fpsHistory} color={frames.current < 30 ? '#e53e3e' : frames.current < 60 ? '#d97706' : '#16a34a'} label="FPS" unit=" frames" />
        </div>
      </>
    ) : panelCustomOpen && !shutdown ? (
      <>
           <div style={{
             padding: '6px 8px',
            borderBottom: '1px solid #ddd',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <PanelButton onClick={() => setPanelCustomOpen(false)} style={{ color: '#555' }}>
              <ArrowLeft size={12} /> Back
            </PanelButton>
            <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
              <Cog size={12} color="#3b82f6" /> Panel Configuration
            </span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display:  'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#333' }}>Colors</span>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: '#fff',
              borderRadius: '10px',
              border: '1px solid #eee',
              alignItems: 'center'
            }}>
              <div style={{ background: '#16a34a', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #15803d', gap: '8px' }} onClick={() => {
        setPanelColor({
          background: '#16a34a',
          border: '#15803d'
        });
        cookie.set('panelColor', '#16a34a|#15803d', "Lax", true, 365 * 24 * 60 * 60);
              }}>
                {panelColor.background === '#16a34a' ? <Tick color="white" size={12}/> : <></>} <span style={{ fontSize: '12px', color: '#fff' }}>Green</span>
              </div>
              <div style={{ background: '#111', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #333', gap: '8px' }} onClick={() => {
        setPanelColor({
          background: '#111',
          border: '#333'
        });
        cookie.set('panelColor', '#111|#333', "Lax", true, 365 * 24 * 60 * 60);
              }}>
                {panelColor.background === '#111' ? <Tick color="white" size={12}/> : <></>} <span style={{ fontSize: '12px', color: '#fff' }}>Black</span>
              </div>
              <div style={{ background: '#f7c623', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #d9ad1e', gap: '8px' }} onClick={() => {
        setPanelColor({
          background: '#f7c623',
          border: '#d9ad1e'
        });
        cookie.set('panelColor', '#f7c623|#d9ad1e', "Lax", true, 365 * 24 * 60 * 60);
              }}>
                {panelColor.background === '#f7c623' ? <Tick color="white" size={12}/> : <></>} <span style={{ fontSize: '12px', color: '#fff' }}>Yellow</span>
              </div>
              <div style={{ background: '#3bb0ff', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #3290cf', gap: '8px' }} onClick={() => {
        setPanelColor({
          background: '#3bb0ff',
          border: '#3290cf'
        });
        cookie.set('panelColor', '#3bb0ff|#3290cf', "Lax", true, 365 * 24 * 60 * 60);
              }}>
                {panelColor.background === '#3bb0ff' ? <Tick color="white" size={12}/> : <></>} <span style={{ fontSize: '12px', color: '#fff' }}>Blue</span>
              </div>
            </div>
          </div>
      </>
    ) : aboutHostOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setAboutHostOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <ShieldCheck size={12} color="#f472b6" /> About Host
          </span>
        </div>
        {datRestrictionMissing ? (<SecuredTab />) : (<></>)}
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '24px', color: '#333', fontWeight: 'bold', textAlign: 'center', display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '6px' }}>
            <ShieldCheck size={36} color="#f472b6" />
            Authtics Host
          </span>
          <span style={{ fontSize: '12px', color: '#333', textAlign: 'center' }}>
            A lightweight, fast, and secure web framework for modern web applications.
          </span>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Version
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              v{hostVersion}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Made By
            </span>
            <span style={{ fontSize: '12px', color: 'orange' }}>
              bananakitssu
            </span>
          </div>
          <a style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
            cursor: 'pointer',
            textDecoration: 'none'
          }} href="https://www.npmjs.com/package/@bananacool467/authtics-host">
            <span style={{ fontSize: '12px', color: '#333' }}>
              Documentation
            </span>
            <span style={{ fontSize: '12px', color: '#333' }}>
              <ChevronRight size={12} />
            </span>
          </a>
        </div>
      </>
    ) : serverInfoOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setServerInfoOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Server size={12} color="#f472b6" /> Server Info
          </span>
        </div>
        {datRestrictionMissing ? (<SecuredTab />) : (<></>)}
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Server uptime
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {uptime}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Total requests
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {requests}
            </span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 10px',
            background: '#fff',
            borderRadius: '10px',
            border: '1px solid #eee',
            fontSize: '12px',
            color: '#333',
          }}>
            <span style={{ fontSize: '12px', color: '#333' }}>
              Total current users
            </span>
            <span style={{ fontSize: '12px', color: 'blue' }}>
              {users}
            </span>
          </div>
          <Sparkline data={cpuUsageHistory} color="#3b82f6" label="CPU Usage" unit="" />
          <Sparkline data={heapUsageHistory} color="#3b82f6" label="Heap Used" unit={heapResult} />
        </div>
      </>
    ) : packageSecurityOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setPackageSecurityOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Shield size={12} color="#f472b6" /> Package Security
          </span>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: /*(datRestrictionMissing ? 'none' : 'flex')*/'flex', flexDirection: 'column', gap: '8px' }}>
            <ShieldCheck size={36} color="#f472b6" style={{ flexShrink: 0, marginTop: '20px' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#333', fontSize: 26, fontWeight: 'bold' }}>
              This feature is currently in BETA.
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#333', fontSize: 13 }}>
              The newest version of Authtics Host may have this feature completely implemented.
            </span>
        </div>
      </>
    ) : settingsOpen && !shutdown ? (
      <>
        <div style={{
          padding: '6px 8px',
          borderBottom: '1px solid #ddd',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <PanelButton onClick={() => setSettingsOpen(false)} style={{ color: '#555' }}>
            <ArrowLeft size={12} /> Back
          </PanelButton>
          <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
            <Cog size={12} color="#f472b6" /> Settings
          </span>
        </div>
        <div style={{ overflowY: 'auto', maxHeight: '260px', padding: '10px', display: /*(datRestrictionMissing ? 'none' : 'flex')*/'flex', flexDirection: 'column', gap: '8px' }}>
          <PanelButton onClick={() => setPanelCustomOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cog size={12} color="#3b82f6" /> Panel Customization
                </span>
                <ChevronRight size={12} />
              </PanelButton>
        </div>
      </>
    ) : !shutdown ? (
      <>
            <div style={{ padding: '8px', gap: '4px', display: 'flex', flexDirection: 'column' }}>
              <PanelButton onClick={() => setConsoleOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={12} color="#16a34a" /> Console
                </span>
                {logs.length > 0 && (
                  <span style={{ color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }}>
                    {logs.length}
                  </span>
                )}
              </PanelButton>
              <PanelButton onClick={() => setRouteOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Route size={12} color="#3b82f6" /> Route
                </span>
                {
                  <span style={{ color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    {datRestrictionMissing && <TriangleAlert size={12} color="orange" />}
                    {pathName}
                  </span>
                }
              </PanelButton>
              <PanelButton onClick={() => setWebpageInfoOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Globe size={12} color="#3b82f6" /> Webpage Info
                </span>
                                {datRestrictionMissing && <TriangleAlert size={12} color="orange" />}
              </PanelButton>
              <PanelButton onClick={() => setSettingsOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cog size={12} color="#f472b6" /> Settings
                </span>
              </PanelButton>
              <PanelButton onClick={() => setPackageSecurityOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={12} color="#f472b6" /> Package Security
                </span>
                {
                  highRiskDeps.length > 0 ?
                  (
                    <div style={{ gap: '4px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
                      <TriangleAlert size={12} color="red" />
                      <span style={{ color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }}>
                        {highRiskDeps.length}
                      </span>
                    </div>
                  ) : mediumRiskDeps.length > 0 ?
                  (
                    <div style={{ gap: '8px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
                      <TriangleAlert size={12} color="#f7c623" />
                      <span style={{ color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }}>
                        {mediumRiskDeps.length}
                      </span>
                    </div>
                  ) : lowRiskDeps.length > 0 ?
                  (
                    <div style={{ gap: '8px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
                      <Info size={12} color="#3bb0ff" />
                      <span style={{ color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }}>
                        {lowRiskDeps.length}
                      </span>
                    </div>
                  ) : <CheckCircle2 size={12} color="#16a34a" />
                }
              </PanelButton>
              <PanelButton onClick={() => setNetworkOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wifi size={12} color="#3b82f6" /> Network
                </span>
                {/*ping__ > 0 && (
                  <span style={{ color: ping__ < 100 ? '#16a34a' : ping__ < 300 ? '#d97706' : '#e53e3e', fontSize: '10px', fontFamily: 'monospace' }}>
                    {ping__}ms
                  </span>
                )*/}
              </PanelButton>
              <PanelButton onClick={() => setClientInfoOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Info size={12} color="#3b82f6" /> Client Info
                </span>
                                {datRestrictionMissing && <TriangleAlert size={12} color="orange" />}
              </PanelButton>
              <PanelButton onClick={() => setAboutHostOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={12} color="#f472b6" /> About HostJS
                </span>
                                {datRestrictionMissing && <TriangleAlert size={12} color="orange" />}
              </PanelButton>
              <PanelButton onClick={() => setServerInfoOpen(true)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Server size={12} color="#f472b6" /> Server Info
                </span>
                {datRestrictionMissing && <TriangleAlert size={12} color="orange" />}
              </PanelButton>
              {/*<PanelButton onClick={() => setSiteInspectOpen(!siteInspectOpen)} fullWidth style={{ color: '#333', justifyContent: 'space-between', height: '32px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={12} color="#f472b6" /> Site Inspect
                </span>
              </PanelButton>*/}
            </div>
            <div style={{
              padding: '6px 8px',
              borderTop: '1px solid #ddd',
              background: '#fff',
              display: 'flex',
              gap: '6px',
              overflowY: 'auto',
              maxHeight: '260px',
              flexDirection: 'column',
            }}>
              <div style={{
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: '#fff',
                borderRadius: '10px',
                border: '1px solid #eee',
                fontSize: '12px',
                color: '#333',
                display: 'flex'
              }}/*onContextMenu={() => setContextMenuShown(true)} onTouchStart={datTouchStart} onTouchEnd={datTouchEnd}*/>
                <span style={{ fontSize: '12px', color: '#333', position: 'relative' }}>
                  DAT (Developer Access Token)
                </span>
                <div style={{ position: 'relative', 
                display: 'inline-flex' }}>
                  <span style={{ fontSize: '12px', color: 'blue' }}>
                    {token}
                  </span>
                {tokenHidden && (
    <div style={{
      position: 'absolute',
      top: 0, left: 0,
      marginTop: '-2.5px',
      width: '100%', height: '100%',
      backdropFilter: 'blur(10px)',
      backgroundColor: 'rgba(255,255,255,0.3)',
      cursor: 'pointer',
      padding: '2.5px 2.5px',
      borderRadius: '8px',
      textAlign: 'center',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '4px'
    }} onClick={() => setTokenHidden(false)}>
      <Eye size={12}/>Click to reveal
    </div>
  )}
                </div>
              </div>
              {tokenLength !== 16 ? (<>
                  <div style={{
                    display: 'flex',
                    background: '#ba4e4e',
                    borderRadius: '10px',
                    padding: '6px 10px',
                    justifyContent: 'left',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#fff',
                    flexDirection: 'row',
                  }}>
                    <CircleX size={12} />
                    Invalid Developer Access Token (DAT)
                  </div>
                </>) : (<></>)}
              {hostVersion === "0.0.1-beta.9" ? (
        <>
        <div style={{
                    display: 'flex',
                    background: 'orange',
                    borderRadius: '10px',
                    padding: '6px 10px',
                    justifyContent: 'left',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#fff',
                    flexDirection: 'row',
                  }}>
                    Updates to security. Apps with version 0.0.1-beta.9 and over will now require DAT restriction to access remote features like restarting and shutting down the app.
                  </div>
                </>
              ) : (<></>)}
                <PanelButton onClick={() => { restart() }} fullWidth style={{ color: '#fff', justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd': '#ba4e4e') }} disabled={datRestrictionMissing}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
                    Restart App
                  </span>
                </PanelButton>
              {datRestrictionMissing ? (<span style={{ display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Info size={30} />Restarting the app is unavaliable. Set "dat" to your current DAT in the Authtics Host config to set restriction and then restart.</span>) : (<></>)}
                <PanelButton onClick={() => { shutDown() }} fullWidth style={{ color: '#fff', justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd': '#ba4e4e') }} disabled={datRestrictionMissing}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
                    {shuttingDown ? "Shutting Down App" : "Shut Down App"}
                  </span>
                </PanelButton>
              {datRestrictionMissing ? (<span style={{ display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Info size={30} />Shutting down the app is unavaliable. Set "dat" to your current DAT in the Authtics Host config to set restriction and then restart.</span>) : (<></>)}
              <PanelButton onClick={() => { pause_Resume_Users() }} fullWidth style={{ color: (datRestrictionMissing ? '#fff' : '#333'), justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd' : '#f2f2f2') }} disabled={datRestrictionMissing}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
                    {usersPausedRealInfo ? "Resume Users" : "Pause Users"}
                  </span>
                </PanelButton>
              {datRestrictionMissing ? (<span style={{ display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }}><Info size={30} />Pausing users from accessing the app is unavaliable. Set "dat" to your current DAT in the Authtics Host config to set restriction and then restart.</span>) : (<></>)}
            </div>
          </>
          ) : (<></>)}

        </div>
      </div>

      {/* ── Pill button ── */}
      {datMatch ? (<div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '8px 12px',
          borderRadius: hasIssue ? '100px' : '10px',
          background: hasIssue ? '#ba4e4e' : /*'#111'*/panelColor.background,
          border: hasIssue ? '1px solid #991b1b' : `1px solid ${panelColor.border ?? '#333'}`,
          boxShadow: hasIssue
            ? '0 4px 20px rgba(220,38,38,0.2)'
            : '0 4px 20px rgba(0,0,0,0.4)',
          color: '#fff',
          cursor: 'pointer',
          transition: 'all 0.4s ease',
          width: 'fit-content',
          boxSizing: 'border-box',
          lineHeight: '1',
          pointerEvents: 'auto',
        }}>

        <ShieldCheck size={16} color="#f472b6" style={{ flexShrink: 0 }} />

        <div style={{
          maxWidth: hasIssue ? '160px' : '0px',
          opacity: hasIssue ? 1 : 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          marginLeft: hasIssue ? '8px' : '0px',
          transition: 'max-width 0.4s ease, opacity 0.4s ease, margin-left 0.4s ease',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255,255,255,0.15)',
            padding: '3px 8px',
            borderRadius: '100px',
            fontSize: '12px',
          }}>
            <CircleX size={11} />
            {errorCount > 0 && <span>{errorCount} error{errorCount > 1 ? 's' : ''}.</span>}
          </span>
        </div>

        <div style={{ marginLeft: hasIssue ? '6px' : '4px', opacity: 0.4, display: 'flex' }}>
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </div>

      </div>) : (<></>)}
    </div>
    </>
  );
}