import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Shield, CircleX, ChevronDown, ChevronUp, Bug, AlertTriangle, Info, ArrowLeft, Wifi, Terminal, Route, Globe, ChevronRight, ChevronLeft, Server, Cog, TriangleAlert, Eye, Zap, Power, Check as Tick, CheckCircle2 } from 'lucide-react';
import { TraceMap, originalPositionFor, sourceContentFor, } from "@jridgewell/trace-mapping";
async function mapGeneratedLocation(location) {
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
        const sourceMapMarker = "sourceMappingURL=data:application/json";
        const markerIndex = generatedCode.lastIndexOf(sourceMapMarker);
        if (markerIndex === -1) {
            console.warn("[HostJS] No inline source map found in", location.file);
            return location;
        }
        const sourceMapStart = generatedCode.indexOf(",", markerIndex);
        if (sourceMapStart === -1) {
            return location;
        }
        const encodedMap = generatedCode
            .slice(sourceMapStart + 1)
            .trim()
            .split(/\s+/)[0];
        let sourceMapJson;
        if (generatedCode.slice(markerIndex, sourceMapStart).includes(";base64")) {
            sourceMapJson = atob(encodedMap);
        }
        else {
            sourceMapJson = decodeURIComponent(encodedMap);
        }
        const sourceMap = JSON.parse(sourceMapJson);
        const traceMap = new TraceMap(sourceMap);
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
    }
    catch (error) {
        console.warn("[HostJS] Could not map source location:", error);
        return location;
    }
}
function getCallerSource() {
    const location = parseStackLocation(new Error().stack ?? "");
    if (!location) {
        return "";
    }
    return `${location.file}:${location.line}:${location.column}`;
}
function getApproximateLines(source, line) {
    const allLines = source.split(/\r?\n/);
    const start = Math.max(0, line - 2);
    const end = Math.min(allLines.length, line + 1);
    return allLines.slice(start, end).map((text, index) => {
        const lineNumber = start + index + 1;
        return `${lineNumber} | ${text}`;
    });
}
function getPreciseMarker(sourceLine, column, length = 1, lineNumber) {
    const safeColumn = Math.min(Math.max(1, column), Math.max(1, sourceLine.length + 1));
    const marker = length > 1
        ? "\u25B2" + "~".repeat(length - 1)
        : "\u25B2";
    return `${String(lineNumber).length ? " ".repeat(String(lineNumber).length) + " " : "   "}| ${" ".repeat(safeColumn - 1)}${marker}`;
}
function parseStackLocations(stack) {
    const locations = [];
    for (const stackLine of stack.split(/\r?\n/)) {
        const match = stackLine.match(/(?:\(|\s|^)((?:https?:\/\/|file:\/\/|\/|\.\.?\/)[^)\s]+):(\d+):(\d+)\)?$/);
        if (!match)
            continue;
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
function parseStackLocation(stack, skip = 0) {
    return parseStackLocations(stack)[skip];
}
const LOG_TYPES = ['Log', 'Info', 'Warn', 'Error', 'Debug'];
let fetchId = 0;
const TYPE_STYLE = {
    Error: { bg: '#fff0f0', color: '#e53e3e', icon: _jsx(CircleX, { size: 11 }) },
    Warn: { bg: '#fffbea', color: '#d97706', icon: _jsx(AlertTriangle, { size: 11 }) },
    Log: { bg: '#ffffff', color: '#888', textColor: '#333', icon: null },
    Info: { bg: '#eff6ff', color: '#3b82f6', icon: _jsx(Info, { size: 11 }) },
    Debug: { bg: '#f0fdf4', color: '#16a34a', icon: _jsx(Bug, { size: 11 }) },
};
const FILTER_COLORS = {
    Error: '#e53e3e',
    Warn: '#d97706',
    Log: '#888',
    Info: '#3b82f6',
    Debug: '#16a34a',
};
const TruncatedText = ({ content, id }) => {
    const maxLength = 100;
    const truncated = content.length > maxLength
        ? content.slice(0, maxLength) + "..."
        : content;
    return _jsx("div", { id: id, children: truncated });
};
function Sparkline({ data, color, label, unit }) {
    const W = 280, H = 48;
    const max = Math.max(...data, 1);
    const points = data.map((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - (v / max) * (H - 4) - 2;
        return `${x},${y}`;
    }).join(' ');
    const latest = data[data.length - 1] ?? 0;
    const id = `grad-${label.replace(' ', '').toLowerCase()}`;
    return (_jsxs("div", { style: { background: '#fff', borderRadius: '8px', border: '1px solid #eee', padding: '8px 10px' }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }, children: [_jsx("span", { style: { fontSize: '10px', color: '#888' }, children: label }), _jsxs("span", { style: { fontSize: '11px', fontFamily: 'monospace', color }, children: [latest, unit] })] }), _jsxs("svg", { width: W, height: H, style: { display: 'block', overflow: 'visible' }, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: id, x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "0%", stopColor: color, stopOpacity: "0.18" }), _jsx("stop", { offset: "100%", stopColor: color, stopOpacity: "0.01" })] }) }), data.length > 1 && (_jsxs(_Fragment, { children: [_jsx("polygon", { points: `0,${H} ${points} ${W},${H}`, fill: `url(#${id})` }), _jsx("polyline", { points: points, fill: "none", stroke: color, strokeWidth: "1.5", strokeLinejoin: "round", strokeLinecap: "round" }), (() => {
                                const last = points.split(' ').pop().split(',');
                                return _jsx("circle", { cx: last[0], cy: last[1], r: "2.5", fill: color });
                            })()] }))] })] }));
}
function installNetworkInterceptor(onFetch, setFetch, onEventSource, setEventSource, onWebSocket, setWebSocket, onResource, setResource, rmvResource, onBytesClient, onBytesServer) {
    if (window.__authtics_network_intercepted__)
        return;
    window.__authtics_network_intercepted__ = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        fetchId++;
        const savedFetchId = fetchId;
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        const method = (args[1]?.method ?? 'GET').toUpperCase();
        if (url.startsWith('/__authtics_host_apis__/') || url === "/__authtics_hmr__") {
            return originalFetch(...args);
        }
        const body = args[1]?.body;
        const bodyBytes = body ? new Blob([body]).size : 0;
        const headerStr = JSON.stringify(args[1]?.headers ?? {});
        const sentBytes = bodyBytes + url.length + headerStr.length;
        onBytesClient(sentBytes);
        onFetch({ url, method, status: null, id: savedFetchId, response: null, sent: body ? JSON.stringify(body, null, 2).replace('"{', '{')
                .replace('}"', '}')
                .replaceAll('\\"', '"') : null });
        try {
            const resp = await originalFetch(...args);
            const clone = resp.clone();
            setFetch({ url, method, status: clone.status, id: savedFetchId, response: await clone.text(), sent: body ? JSON.stringify(body, null, 2).replace('"{', '{')
                    .replace('}"', '}')
                    .replaceAll('\\"', '"') : null });
            clone.arrayBuffer().then(buf => {
                onBytesServer(buf.byteLength);
            }).catch(() => { });
            return resp;
        }
        catch (e) {
            onFetch({ url, method, status: 0, id: savedFetchId, response: null, sent: body ? JSON.stringify(body, null, 2).replace(/[{}/"]/g, "") : null });
            throw e;
        }
    };
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        fetchId++;
        const savedId = fetchId;
        const ws = new OriginalWebSocket(url, protocols);
        if (url.includes('__authtics'))
            return ws;
        onWebSocket({
            url,
            status: 'Connecting...',
            id: savedId,
            type: "WebSocket"
        });
        ws.addEventListener('open', () => {
            setWebSocket({
                url,
                status: 'Connected',
                id: savedId,
                type: "WebSocket"
            });
        });
        ws.addEventListener('close', () => {
            setWebSocket({
                url,
                status: 'Disconnected',
                id: savedId,
                type: "WebSocket"
            });
        });
        ws.addEventListener('message', (event) => {
            const bytes = new Blob([event.data]).size;
            onBytesServer(bytes);
            setWebSocket({
                url,
                status: 'Connected',
                id: savedId,
                type: "WebSocket"
            });
        });
        ws.addEventListener('error', () => {
            const status = ws.readyState === OriginalWebSocket.CLOSED
                ? 'Disconnected'
                : 'Connection Failed';
            setWebSocket({
                url,
                status,
                id: savedId,
                type: "WebSocket"
            });
        });
        const OriginalSend = ws.send;
        ws.send = function (data) {
            let bytes = 0;
            if (typeof data === 'string') {
                bytes = new Blob([data]).size;
            }
            else if (data instanceof Blob) {
                bytes = data.size;
            }
            else if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
                bytes = data.byteLength;
            }
            else if (ArrayBuffer.isView(data)) {
                bytes = data.byteLength;
            }
            onBytesClient(bytes);
            OriginalSend.call(this, data);
        };
        return ws;
    };
    Object.defineProperty(window.WebSocket, 'prototype', {
        value: OriginalWebSocket.prototype,
        writable: false
    });
    Object.assign(window.WebSocket, OriginalWebSocket);
    const OriginalEventSource = window.EventSource;
    window.EventSource = function (url, eventSourceInitDict) {
        fetchId++;
        const savedId = fetchId;
        const es = new OriginalEventSource(url, eventSourceInitDict);
        if (url.includes('__authtics'))
            return es;
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
    window.EventSource.prototype = OriginalEventSource.prototype;
    Object.assign(window.EventSource, OriginalEventSource);
    let usedResourcesSlots = [];
    let beforeResources = [];
    let currentResources = [];
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
                if (!usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId }))
                    onResource({ url: img.src, type: 'img', id: savedFetchId });
                currentResources.push({ url: img.src, type: 'img', id: savedFetchId });
                if (usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId }))
                    setResource({ url: img.src, type: 'img', id: savedFetchId });
                if (!usedResourcesSlots.includes({ url: img.src, type: 'img', id: savedFetchId }))
                    usedResourcesSlots.push({ url: img.src, type: 'img', id: savedFetchId });
            }
        });
        queryScript.forEach((script) => {
            if (script.src) {
                fetchId++;
                let savedFetchId = fetchId;
                if (!usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId }))
                    onResource({ url: script.src, type: 'script', id: savedFetchId });
                currentResources.push({ url: script.src, type: 'script', id: savedFetchId });
                if (usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId }))
                    setResource({ url: script.src, type: 'script', id: savedFetchId });
                if (!usedResourcesSlots.includes({ url: script.src, type: 'script', id: savedFetchId }))
                    usedResourcesSlots.push({ url: script.src, type: 'script', id: savedFetchId });
            }
        });
        queryLink.forEach((link) => {
            if (link.href) {
                fetchId++;
                let savedFetchId = fetchId;
                if (!usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId }))
                    onResource({ url: link.href, type: 'link', id: savedFetchId });
                currentResources.push({ url: link.href, type: 'link', id: savedFetchId });
                if (usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId }))
                    setResource({ url: link.href, type: 'link', id: savedFetchId });
                if (!usedResourcesSlots.includes({ url: link.href, type: 'link', id: savedFetchId }))
                    usedResourcesSlots.push({ url: link.href, type: 'link', id: savedFetchId });
            }
        });
        beforeResources.forEach((resource) => {
            if (!currentResources.includes(resource)) {
                rmvResource(resource);
            }
        });
    }, 250);
}
function installConsoleInterceptor() {
    if (window.__authtics_intercepted__)
        return;
    window.__authtics_intercepted__ = true;
    window.addEventListener("error", event => {
        const error = event.error;
        const stack = error?.stack ?? "";
        const location = stack
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
        const t = type.toLowerCase();
        const original = console[t].bind(console);
        console[t] = (...args) => {
            original(...args);
            const errorArgument = args.find(value => value instanceof Error);
            const stack = errorArgument?.stack || new Error().stack || "";
            const generatedLocation = parseStackLocation(stack, errorArgument ? 0 : 1);
            const message = args
                .map(value => {
                if (value instanceof Error) {
                    return value.message;
                }
                if (typeof value === "object") {
                    try {
                        return JSON.stringify(value, null, 2);
                    }
                    catch {
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
    return (_jsxs("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: '10px 10px', textAlign: 'center', gap: '8px' }, children: [_jsx(CircleX, { size: 32, color: '#ff7d7d' }), _jsx("span", { style: { color: '#ff7d7d', fontSize: 24 }, children: "This tab is currently not accessible" }), _jsx("span", { style: { color: '#ff7d7d', fontSize: 12 }, children: "To access this tab, you need to set \"dat\" to your current DAT in the Authtics Host config to set restriction and then restart." })] }));
}
function ShutdownTab() {
    return (_jsxs("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: '10px 10px', textAlign: 'center', gap: '8px' }, children: [_jsx(Power, { size: 32, color: 'grey' }), _jsx("span", { style: { color: 'grey', fontSize: 24 }, children: "The server was shutdown by you." })] }));
}
function PanelButton({ onClick, onClick2, children, style, fullWidth, disabled, background }) {
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);
    return (_jsx("div", { onClick: (e) => {
            if (onClick && !disabled) {
                onClick();
            }
            else if (onClick2 && !disabled) {
                onClick2(e);
            }
        }, onMouseEnter: () => setHovered(true), onMouseLeave: () => { setHovered(false); setPressed(false); }, onMouseDown: () => setPressed(true), onMouseUp: () => setPressed(false), style: {
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
            background: disabled
                ? '#bdbdbd'
                : pressed
                    ? `color-mix(in srgb, ${background} 12%, transparent)`
                    : hovered
                        ? `color-mix(in srgb, ${background} 6%, transparent)`
                        : background ?? '#fff',
            transition: 'background 0.15s ease',
            ...style,
        }, children: children }));
}
const MAX_POINTS = 20;
const generateToken = () => {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 16);
};
export default function DevPanel() {
    const [logs, setLogs] = useState([]);
    const [open, setOpen] = useState(false);
    const [errorBoxOpen, setErrorBoxOpen] = useState(false);
    const [errors, setErrors] = useState([]);
    const [selectedError, setSelectedError] = useState(1);
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
    const [highRiskDeps, setHighRiskDeps] = useState([]);
    const [mediumRiskDeps, setMediumRiskDeps] = useState([]);
    const [lowRiskDeps, setLowRiskDeps] = useState([]);
    const [panelColor, setPanelColor] = useState({
        background: '#111',
        border: '#333'
    });
    const [hasIssue, setHasIssue] = useState(false);
    const [ping__, setPing__] = useState(0);
    const [networkFetches, setNetworkFetches] = useState([]);
    const [eventSources, setEventSources] = useState([]);
    const [usersPausedRealInfo, setUsersPausedRealInfo] = useState(false);
    const [webSockets, setWebSockets] = useState([]);
    const [resourcesFound, setResourcesFound] = useState([]);
    const [status, setStatus] = useState(200);
    const [pathName, setPathName] = useState(undefined);
    const [hostName, setHostName] = useState(undefined);
    const [protocol, setProtocol] = useState(undefined);
    const [path, setPath] = useState(undefined);
    const [renderType, setRenderType] = useState("???");
    const datRestrictionMissingRef = useRef(true);
    const cpuUsage = useRef(0);
    const heapUsage = useRef(0);
    const heapTotal = useRef(0);
    const [datMatch, setDatMatch] = useState(false);
    const [compilerType, setCompilerType] = useState("?");
    const [httpVersion, setHttpVersion] = useState("v?.?");
    const [errorBoxOpenable, setErrorBoxOpenable] = useState(true);
    const [uptime, setUptime] = useState("00:00:00:00");
    const [requests, setRequests] = useState(0);
    const [hostVersion, setHostVersion] = useState("Loading...");
    const [users, setUsers] = useState(0);
    const [token, setToken] = useState(null);
    const [tokenLength, setTokenLength] = useState(0);
    const [tokenHidden, setTokenHidden] = useState(true);
    const [locationMode, setLocationMode] = useState("approximate");
    const NOTIFICATION_SLEEP_MS = 10 * 60 * 1000;
    const notificationSleepingUntilRef = useRef(0);
    const [notificationSleepingUntil, setNotificationSleepingUntil] = useState(0);
    const sleepErrorNotifications = () => {
        const until = Date.now() + NOTIFICATION_SLEEP_MS;
        notificationSleepingUntilRef.current = until;
        setNotificationSleepingUntil(until);
        setErrorBoxOpen(false);
        setHasIssue(false);
    };
    const fpsSpanRef = useRef(null);
    const frameCount = useRef(0);
    const frames = useRef(0);
    const consoleScrollRef = useRef(null);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [datRestrictionMissing, setDatRestrictionMissing] = useState(true);
    const [heapResult, setHeapResult] = useState("0 Bytes / 0 Bytes");
    const cookie = {
        set: (k, v, sS = "Lax", s = true, mA = null) => {
            const cookieParts = [`${encodeURIComponent(k)}=${encodeURIComponent(v)}`, "path=/"];
            if (mA !== null) {
                cookieParts.push(`max-age=${mA}`);
                const d = new Date();
                d.setTime(d.getTime() + (mA * 1000));
                cookieParts.push(`expires=${d.toUTCString()}`);
            }
            if (s)
                cookieParts.push("secure");
            if (sS)
                cookieParts.push(`samesite=${sS}`);
            document.cookie = cookieParts.join("; ");
        },
        get: (k) => {
            const cookies = document.cookie.split(";").filter(Boolean);
            for (const c of cookies) {
                const [key, ...valParts] = c.trim().split("=");
                if (decodeURIComponent(key) === k) {
                    return decodeURIComponent(valParts.join("="));
                }
            }
            return undefined;
        },
        del: (k) => {
            document.cookie = `${encodeURIComponent(k)}=; path=/; max-age=0; samesite=Lax; secure`;
        }
    };
    const [doc, setDoc] = useState(null);
    const [filters, setFilters] = useState({
        Log: true, Info: true, Warn: true, Error: true, Debug: false
    });
    const errorCount = logs.filter(l => l.type === 'Error').length;
    const warnCount = logs.filter(l => l.type === 'Warn').length;
    const filteredLogs = logs.filter(l => filters[l.type]);
    const handleScroll = () => {
        if (consoleScrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = consoleScrollRef.current;
            const reachedBottom = scrollHeight - scrollTop - clientHeight < 5;
            setIsAtBottom(reachedBottom);
        }
    };
    useEffect(() => {
        if (isAtBottom && consoleScrollRef.current) {
            consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
        }
    }, [filteredLogs, isAtBottom]);
    const loop = () => {
        frameCount.current++;
        requestAnimationFrame(loop);
    };
    useEffect(() => {
        const getPath = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-file-by-pathname', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pathname: window.location.pathname, })
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setPath(data.filePath);
            }
        };
        const getDatMatching = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-dat-matching', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setDatMatch(data.isMatching);
                const resp3 = await fetch('/__authtics_host_apis__/is-users-paused', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                let paused = false;
                if (resp3.status === 200) {
                    const data = await resp3.json();
                    paused = data.paused;
                    setUsersPausedRealInfo(data.realInfo);
                }
                if (!data.isMatching && !paused) {
                    doc?.getElementById('authtics-dev-panel-root')?.remove();
                }
                const resp2 = await fetch('/__authtics_host_apis__/get-dat-restriction-missing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                if (resp2.status === 200) {
                    const data = await resp2.json();
                    setDatRestrictionMissing(!data.enabled);
                    datRestrictionMissingRef.current = !data.enabled;
                    return "";
                }
            }
            return "";
        };
        const getRenderType = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-render-type', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setRenderType(data.renderType);
            }
        };
        const getUsage = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-cpu_memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                cpuUsage.current = data.cpuUsage;
                heapUsage.current = data.heapUsed;
                heapTotal.current = data.heapTotal;
            }
        };
        const getHostVersion = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-host-ver', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setHostVersion(data.version);
            }
        };
        const getCompilerType = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-compiler', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setCompilerType(data.compiler);
            }
        };
        const getHttpVersion = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setHttpVersion(data.httpVersion);
            }
        };
        const formatSeconds = (totalSeconds) => {
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            const pad = (num) => String(num).padStart(2, '0');
            return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        };
        const userSettings = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-user-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setErrorBoxOpenable(data.showError);
            }
        };
        const update = async () => {
            const resp = await fetch('/__authtics_host_apis__/get-server-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.status === 200) {
                const data = await resp.json();
                setUptime(formatSeconds(data.uptime));
                setRequests(data.totalRequests);
                setUsers(data.users);
            }
        };
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
    }, []);
    const restart = async () => {
        await fetch('/__authtics_host_apis__/restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    };
    const shutDown = async () => {
        setShuttingDown(true);
        await fetch('/__authtics_host_apis__/shutdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        setShutdown(true);
    };
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
    const pendingSent = useRef(0);
    const pendingReceived = useRef(0);
    const [sentHistory, setSentHistory] = useState(Array(MAX_POINTS).fill(0));
    const [receivedHistory, setReceivedHistory] = useState(Array(MAX_POINTS).fill(0));
    const [cpuUsageHistory, setCpuUsageHistory] = useState(Array(MAX_POINTS).fill(0));
    const [heapUsageHistory, setHeapUsageHistory] = useState(Array(MAX_POINTS).fill(0));
    const [fpsHistory, setFpsHistory] = useState(Array(MAX_POINTS).fill(0));
    const drawerHeight = !open
        ? '0px'
        : consoleOpen || networkOpen || routeOpen || webpageInfoOpen || clientInfoOpen || aboutHostOpen
            ? '320px'
            : '320px';
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const timeStart = Date.now();
                const resp = await fetch('/__authtics_host_apis__/ping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                if (resp.status === 200) {
                    const data = await resp.json();
                    if (data.status === 'ok')
                        setPing__(Date.now() - timeStart);
                }
            }
            catch { }
        }, 1000);
        return () => clearInterval(interval);
    }, []);
    const formatBytes = (b, d = 2, r = false) => {
        if (b === 0)
            return r ? 'Bytes' : '0 Bytes';
        const k = 1024;
        const dm = d < 0 ? 0 : d;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return r ? sizes[i] : parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };
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
        if (!notificationSleepingUntil)
            return;
        const remaining = notificationSleepingUntil - Date.now();
        const timer = window.setTimeout(() => {
            notificationSleepingUntilRef.current = 0;
            setNotificationSleepingUntil(0);
        }, Math.max(remaining, 0));
        return () => window.clearTimeout(timer);
    }, [notificationSleepingUntil]);
    useEffect(() => {
        installConsoleInterceptor();
        installNetworkInterceptor((f) => setNetworkFetches(prev => [...prev.slice(-499), f]), (f) => setNetworkFetches(prev => prev.map(p => p.id === f.id ? f : p)), (f) => setEventSources(prev => [...prev.slice(-499), f]), (f) => setEventSources(prev => prev.map(p => p.id === f.id ? f : p)), (f) => setWebSockets(prev => [...prev.slice(-499), f]), (f) => setWebSockets(prev => prev.map(p => p.id === f.id ? f : p)), (f) => setResourcesFound(prev => [...prev.slice(-499), f]), (f) => setResourcesFound(prev => prev.map(p => p.id === f.id ? f : p)), (f) => setResourcesFound(prev => prev.filter(p => p.id !== f.id)), (sent) => {
            pendingSent.current += sent;
        }, (received) => {
            pendingReceived.current += received;
        });
        const handler = (event) => {
            const detail = event.detail;
            const entry = {
                ...detail,
                id: Date.now() + Math.random(),
            };
            setLogs(prev => [...prev.slice(-99), entry]);
            const isNotificationSleeping = notificationSleepingUntilRef.current > Date.now();
            if (detail.type === "Error") {
                setErrors(prev => [...prev, entry]);
                if (!isNotificationSleeping) {
                    setHasIssue(true);
                    setErrorBoxOpen(true);
                }
            }
        };
        try {
            const existingToken = cookie.get('dat');
            const panelColor = cookie.get('panelColor');
            if (panelColor) {
                setPanelColor({
                    background: panelColor.split('|')[0],
                    border: panelColor.split('|')[1]
                });
            }
            else {
                const cfg = window.__authtics_config__;
                const serverDevMode = cfg?.devMode !== false;
                const serverDatRestricted = cfg?.datRestricted === true;
                if (serverDevMode && !serverDatRestricted) {
                    cookie.set('panelColor', '#111|#333', "Lax", true, 365 * 24 * 60 * 60);
                }
            }
            if (existingToken) {
                setToken(existingToken);
                let length_ = existingToken?.split('');
                let length;
                length = length_?.length;
                setTokenLength(length);
            }
            else {
                const cfg = window.__authtics_config__;
                const serverDevMode = cfg?.devMode !== false;
                const serverDatRestricted = cfg?.datRestricted === true;
                if (serverDevMode && !serverDatRestricted) {
                    const newToken = generateToken();
                    cookie.set('dat', newToken, "Lax", true, 5 * 365 * 24 * 60 * 60);
                    setToken(newToken);
                    let length_ = newToken?.split('');
                    let length;
                    length = length_?.length;
                    setTokenLength(length);
                }
            }
        }
        catch (error) {
        }
        window.addEventListener('authtics:log', handler);
        setInterval(() => setStatus(window.__status_code__ || 200), 1000);
        setPathName(window.location.pathname);
        setHostName(window.location.hostname);
        setDoc(document);
        setProtocol(window.location.protocol.replace(':', '').toUpperCase());
        return () => window.removeEventListener('authtics:log', handler);
    }, []);
    const getOS = () => {
        const ua = window.navigator.userAgent;
        if (/Android/i.test(ua))
            return "Android";
        if (/Linux/i.test(ua)) {
            return (navigator.maxTouchPoints > 0) ? "Android (Desktop Mode)" : "Linux";
        }
        if (/iPhone|iPad|iPod/i.test(ua))
            return "iOS";
        if (/Mac/i.test(ua))
            return "MacOS";
        if (/Win/i.test(ua))
            return "Windows";
        return "Unknown";
    };
    useEffect(() => {
        setHasIssue(errorCount > 0);
    }, [errorCount, warnCount]);
    const toggleFilter = (type) => {
        setFilters(prev => ({ ...prev, [type]: !prev[type] }));
    };
    const errorBoxRef = useRef(null);
    setInterval(() => {
        if (errorBoxRef.current) {
            if (errorBoxOpen && errorBoxRef.current.style.opacity == '0') {
                errorBoxRef.current.style.opacity = '1';
            }
            else if (!errorBoxOpen && errorBoxRef.current.style.opacity == '1') {
                errorBoxRef.current.style.opacity = '0';
            }
        }
    }, 500);
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
        };
        __();
    }, []);
    const pause_Resume_Users = async () => {
        if (usersPausedRealInfo) {
            const resp = await fetch('/__authtics_host_apis__/set-users-paused', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paused: false
                })
            });
            if (resp.status === 200) {
                setUsersPausedRealInfo(false);
            }
        }
        else {
            const resp = await fetch('/__authtics_host_apis__/set-users-paused', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paused: true
                })
            });
            if (resp.status === 200) {
                setUsersPausedRealInfo(true);
            }
        }
    };
    return (_jsxs(_Fragment, { children: [_jsx("div", { style: {
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
                }, ref: errorBoxRef, children: errorBoxOpen && errorBoxOpenable && errors.length > 0 ? (_jsxs("div", { style: {
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
                    }, children: [_jsxs("div", { style: {
                                padding: '6px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: 'system-ui, sans-serif',
                            }, children: [_jsxs("div", { style: {
                                        background: 'rgba(0,0,0,0.15)',
                                        borderRadius: '100px',
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        whiteSpace: 'nowrap',
                                        gap: '4px'
                                    }, children: [_jsx(ShieldCheck, { size: 16, color: "#f472b6", style: { flexShrink: 0 } }), " Authtics Host"] }), _jsxs("p", { style: { color: 'red', fontSize: '12px' }, children: ["Error found (", selectedError, "/", errors.length, ")"] }), _jsx(PanelButton, { onClick: () => { setErrorBoxOpen(false); sleepErrorNotifications(); }, style: { marginLeft: 'auto', }, children: "Close" })] }), _jsxs("div", { style: {
                                padding: '6px 2px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: 'system-ui, sans-serif',
                                flexDirection: 'column'
                            }, children: [_jsxs("p", { style: { color: 'red', fontSize: '24px', gap: '6px', display: 'flex', justifyContent: 'left', alignItems: 'left', textAlign: 'left', marginLeft: '10px', whiteSpace: 'normal', wordBreak: 'break-word', width: '100%' }, children: [_jsx(CircleX, { size: 24, color: 'red' }), errors[selectedError - 1]?.message] }), _jsxs("div", { style: {
                                        display: "flex",
                                        gap: "6px",
                                        marginTop: "10px",
                                        marginBottom: "6px",
                                        flexDirection: 'row'
                                    }, children: [_jsx(PanelButton, { onClick: () => setLocationMode("approximate"), style: {
                                                background: locationMode === "approximate"
                                                    ? "#34a8eb"
                                                    : undefined,
                                            }, children: "Approximate" }), _jsx(PanelButton, { onClick: () => setLocationMode("precise"), style: {
                                                background: locationMode === "precise"
                                                    ? "#34a8eb"
                                                    : undefined,
                                            }, children: "Precise" })] }), (() => {
                                    const selected = errors[selectedError - 1];
                                    const location = selected?.location;
                                    if (!location) {
                                        return _jsx("p", { style: { textAlign: "left" }, children: "At an unknown location" });
                                    }
                                    const line = location.line || 0;
                                    const column = location.column || 1;
                                    return _jsxs("p", { style: { textAlign: "left" }, children: ["At ", location ? `${location.file.replace(window?.location.host, "")}:${line}:${column}` : `an unknown location`] });
                                })(), (() => {
                                    const selected = errors[selectedError - 1];
                                    const location = selected?.location;
                                    if (!location) {
                                        return (_jsx("pre", { style: { color: "#777", fontSize: "12px" }, children: "No source location available." }));
                                    }
                                    const sourceLine = location.sourceText || "";
                                    const line = location.line || 0;
                                    const column = location.column || 1;
                                    const length = location.length || 1;
                                    if (locationMode === "precise") {
                                        return (_jsxs("pre", { style: {
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
                                            }, children: [line, " | ", sourceLine, "\n", _jsx("div", { style: {
                                                        color: "#f472b6"
                                                    }, children: getPreciseMarker(sourceLine, column, length, line) })] }));
                                    }
                                    return (_jsx("pre", { style: {
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
                                        }, children: location.lines?.join("\n") || `` }));
                                })()] }), _jsxs("div", { style: {
                                padding: '6px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontFamily: 'system-ui, sans-serif'
                            }, children: [_jsxs(PanelButton, { onClick: () => { setSelectedError(selectedError - 1 < 1 ? selectedError : selectedError - 1); }, style: { marginLeft: 'auto', width: '50%', justifyContent: 'space-between', display: 'flex' }, children: [_jsx(ChevronLeft, { size: 12 }), " Previous"] }), _jsxs(PanelButton, { onClick: () => { setSelectedError(selectedError + 1 > errors.length ? selectedError : selectedError + 1); }, style: { marginLeft: 'auto', width: '50%', justifyContent: 'space-between', display: 'flex', background: '#34a8eb' }, children: ["Next ", _jsx(ChevronRight, { size: 12 })] })] })] })) : (_jsx(_Fragment, {})) }), _jsxs("div", { style: {
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
                }, children: [_jsx("div", { style: {
                            maxHeight: drawerHeight,
                            opacity: open ? 1 : 0,
                            pointerEvents: open ? 'auto' : 'none',
                            overflow: (!consoleOpen && !networkOpen && !aboutHostOpen && !webpageInfoOpen && !clientInfoOpen ? 'hidden auto' : 'hidden'),
                            borderRadius: '10px',
                            transition: 'max-height 0.35s ease, opacity 0.25s ease',
                            border: '1px solid #e6e3e3',
                        }, children: _jsxs("div", { style: {
                                background: '#f7f7f7',
                                borderRadius: '10px',
                                width: '320px',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                                boxSizing: 'border-box',
                                overflow: 'hidden',
                            }, children: [shutdown ? (_jsx(ShutdownTab, {})) : (_jsx(_Fragment, {})), consoleOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setConsoleOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Terminal, { size: 12, color: "#16a34a" }), " Console"] }), _jsxs("span", { style: { fontSize: '10px', color: '#aaa', marginLeft: '2px' }, children: [filteredLogs.length, " message", filteredLogs.length !== 1 ? 's' : '', " shown, ", logs.length, " in total"] }), _jsx(PanelButton, { onClick: () => setLogs([]), style: { color: '#aaa', marginLeft: 'auto' }, children: "Clear" })] }), _jsx("div", { style: {
                                                display: 'flex',
                                                gap: '4px',
                                                padding: '5px 8px',
                                                borderBottom: '1px solid #eee',
                                                background: '#fafafa',
                                                flexWrap: 'wrap',
                                            }, children: [...LOG_TYPES].map(type => (_jsxs("label", { style: {
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
                                                }, children: [_jsx("input", { type: "checkbox", checked: filters[type], onChange: () => toggleFilter(type), style: { display: 'none' } }), type] }, type))) }), _jsx("div", { style: { overflowY: 'auto', maxHeight: '220px' }, ref: consoleScrollRef, onScroll: handleScroll, children: filteredLogs.length === 0
                                                ? _jsx("div", { style: { padding: '16px 12px', color: '#aaa', fontSize: '12px' }, children: "No logs yet." })
                                                : [...filteredLogs].map(log => {
                                                    const s = TYPE_STYLE[log.type];
                                                    return (_jsxs("div", { style: {
                                                            display: 'flex',
                                                            gap: '8px',
                                                            padding: '5px 10px',
                                                            background: s.bg,
                                                            borderBottom: '1px solid #f0f0f0',
                                                            alignItems: 'flex-start',
                                                        }, children: [s.icon && (_jsx("span", { style: { color: s.color, marginTop: '1px', flexShrink: 0, display: 'flex' }, children: s.icon })), _jsx("span", { style: {
                                                                    color: s.textColor ?? '#555',
                                                                    fontSize: '11px',
                                                                    fontFamily: 'monospace',
                                                                    wordBreak: 'break-all',
                                                                }, children: log.message })] }, log.id));
                                                }) })] })) : networkOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setNetworkOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Wifi, { size: 12, color: "#3b82f6" }), " Network"] })] }), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }, children: [_jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { children: "Ping" }), _jsx("span", { style: { color: ping__ < 100 ? '#16a34a' : ping__ < 300 ? '#d97706' : '#e53e3e', fontFamily: 'monospace' }, children: ping__ > 0 ? `${ping__}ms` : '??ms' })] }), datRestrictionMissing ? (_jsxs("span", { style: { display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }, children: [_jsx(Info, { size: 30 }), "This analytic is unavaliable. Set \"dat\" to your current DAT in the Authtics Host config to set restriction and then restart."] })) : (_jsx(_Fragment, {})), _jsx(Sparkline, { data: receivedHistory, color: "#3b82f6", label: "Received", unit: " bytes" }), _jsx(Sparkline, { data: sentHistory, color: "#16a34a", label: "Sent", unit: " bytes" }), _jsxs("span", { style: { fontSize: '15px', color: '#333', fontWeight: 'bold' }, children: ["Fetches \u2014 ", networkFetches.length, " total fetches"] }), networkFetches.length === 0
                                                    ? _jsx("div", { style: { color: '#aaa', fontSize: '12px', padding: '4px 2px' }, children: "No network requests yet." })
                                                    : [...networkFetches].reverse().map((f, i) => (_jsxs("div", { style: {
                                                            background: '#fff',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            borderRadius: '10px',
                                                            border: '1px solid #eee',
                                                            fontSize: '11px',
                                                            fontFamily: 'monospace',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }, children: [_jsxs("div", { style: { display: 'flex',
                                                                    justifyContent: 'space-between', gap: '8px', padding: '6px 10px', borderBottom: '1px solid #eee' }, children: [_jsx("span", { style: { color: '#3b82f6' }, children: f.method }), _jsx("span", { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }, children: f.url }), _jsx("span", { style: { color: f.status ? (f.status < 400 ? '#16a34a' : '#e53e3e') : 'orange' }, children: f.status || "Awaiting for response..." })] }), f.method === "POST" && f.sent?.trim() ? (_jsxs("div", { style: { padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }, children: [_jsx("p", { style: { color: 'orange', fontFamily: 'system-ui, sans-serif', margin: 0 }, children: "Sent: " }), _jsx("div", { children: f.sent })] })) : (_jsx(_Fragment, {})), _jsxs("div", { style: { padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }, children: [_jsx("p", { style: { color: 'green', fontFamily: 'system-ui, sans-serif', margin: 0 }, children: "Received: " }), _jsx(TruncatedText, { content: f.response || "...", id: `${f.id}_fetch` })] }), f.response ? (f.response.split('').length > 100 ? (_jsxs(PanelButton, { onClick2: (e) => { const obj___ = document.getElementById(`${f.id}_fetch`); if (obj___ && !obj___.hasAttribute('expanded')) {
                                                                    obj___.innerText = f.response;
                                                                    obj___.setAttribute('expanded', '');
                                                                    e.currentTarget.innerText = 'View less';
                                                                }
                                                                else if (obj___ && obj___.hasAttribute('expanded')) {
                                                                    obj___.innerText = f.response?.slice(0, 100) + "...";
                                                                    obj___.removeAttribute('expanded');
                                                                    e.currentTarget.innerText = `View more (${f.response ? (f.response.split('').length - 100) : 0} bytes hidden)`;
                                                                } }, style: { padding: '8px 10px', borderRadius: '10px', background: '#34a8eb', color: '#fff', border: 'none', cursor: 'pointer', margin: '10px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }, children: ["View more (", f.response ? (f.response.split('').length - 100) : 0, " bytes hidden)"] })) : (_jsx(_Fragment, {}))) : (_jsx(_Fragment, {}))] }, i))), _jsx("span", { style: { fontSize: '15px', color: '#333', fontWeight: 'bold' }, children: "Active connections" }), eventSources.length === 0 ? (_jsx("div", { style: { color: '#aaa', fontSize: '12px', padding: '4px 2px' }, children: "No active connections." })) :
                                                    [...eventSources, ...webSockets].reverse().map((es, i) => (_jsx("div", { style: {
                                                            background: '#fff',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            borderRadius: '10px',
                                                            border: '1px solid #eee',
                                                            fontSize: '11px',
                                                            fontFamily: 'monospace'
                                                        }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px' }, children: [_jsxs("span", { style: { color: '#3b82f6', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }, children: [es.type === "EventSource" ? _jsx(Zap, { color: "green", size: 12 }) : es.type === "WebSocket" ? _jsx(Globe, { color: "green", size: 12 }) : _jsx(_Fragment, {}), es.type === "EventSource" ? "Event Source" : es.type === "WebSocket" ? "Web Socket" : "???"] }), _jsx("span", { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }, children: es.url }), _jsx("span", { style: { color: es.status === 'Connected' ? '#16a34a' : es.status === 'Disconnected' ? '#e53e3e' : 'orange' }, children: es.status === 'Connected' ? 'Active' : es.status === 'Disconnected' ? 'Disconnected' : es.status === 'Connecting...' ? '...' : es.status === 'Connection Failed' ? 'Failed' : 'Unknown' })] }) }, i))), _jsxs("span", { style: { fontSize: '15px', color: '#333', fontWeight: 'bold' }, children: ["Resources Found \u2014 ", resourcesFound.length, " total resources"] }), resourcesFound.length === 0 ? (_jsx("div", { style: { color: '#aaa', fontSize: '12px', padding: '4px 2px' }, children: "No resources found." })) :
                                                    [...resourcesFound].reverse().map((r, i) => (_jsx("div", { style: {
                                                            background: '#fff',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            borderRadius: '10px',
                                                            border: '1px solid #eee',
                                                            fontSize: '11px',
                                                            fontFamily: 'monospace',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                        }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 10px' }, children: [_jsx("span", { style: { color: '#3b82f6', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }, children: r.type }), _jsx("span", { style: { flex: 1, color: '#333' }, children: r.url })] }) }, i)))] })] })) : routeOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setRouteOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Route, { size: 12, color: "#3b82f6" }), " Route"] }), _jsx("span", { style: { fontSize: '10px', color: '#aaa', marginLeft: '2px' }, children: pathName })] }), datRestrictionMissing ? (_jsx(SecuredTab, {})) : (_jsx(_Fragment, {})), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: [_jsx("span", { style: { fontSize: '24px', color: '#333', fontWeight: 'bold' }, children: pathName }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Load Status Code" }), _jsx("span", { style: { color: status === 200 ? '#16a34a' : '#e53e3e', fontFamily: 'monospace' }, children: status })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "File Path" }), _jsx("span", { style: { color: 'blue', fontFamily: 'monospace' }, children: path })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "File Name" }), _jsx("span", { style: { color: 'blue', fontFamily: 'monospace' }, children: path?.split('/').pop() })] })] })] })) : webpageInfoOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setWebpageInfoOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Globe, { size: 12, color: "#3b82f6" }), " Webpage Info"] })] }), datRestrictionMissing ? (_jsx(SecuredTab, {})) : (_jsx(_Fragment, {})), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: [_jsxs("span", { style: { fontSize: '12px', color: '#333' }, children: [_jsx("span", { style: { fontSize: '24px', color: '#333', fontWeight: 'bold' }, children: pathName }), " on ", _jsx("span", { style: { fontSize: '12px', color: '#333', fontWeight: 'bold' }, children: hostName })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Protocol" }), _jsx("span", { style: { fontSize: '12px', color: 'orange' }, children: protocol })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "SSL" }), _jsx("span", { style: { fontSize: '12px', color: (protocol === 'HTTPS' ? '#16a34a' : '#e53e3e') }, children: protocol === 'HTTPS' ? 'Yes' : 'No' })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Renderer Type" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: renderType === "ssr" ? 'SSR (Server-Side Rendering)' : renderType === "csr" ? 'CSR (Client-Side Rendering)' : renderType === "ssg" ? 'SSG (Static Site Generation)' : '???' })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Compiler Type" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: compilerType })] })] })] })) : clientInfoOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setClientInfoOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Info, { size: 12, color: "#3b82f6" }), " Client Info"] })] }), datRestrictionMissing ? (_jsx(SecuredTab, {})) : (_jsx(_Fragment, {})), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: [_jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "HTTP Version" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: "v" + httpVersion })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "User Agent" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: navigator.userAgent })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "OS" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: getOS() })] }), _jsx(Sparkline, { data: fpsHistory, color: frames.current < 30 ? '#e53e3e' : frames.current < 60 ? '#d97706' : '#16a34a', label: "FPS", unit: " frames" })] })] })) : panelCustomOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setPanelCustomOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Cog, { size: 12, color: "#3b82f6" }), " Panel Configuration"] })] }), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Colors" }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        alignItems: 'center'
                                                    }, children: [_jsxs("div", { style: { background: '#16a34a', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #15803d', gap: '8px' }, onClick: () => {
                                                                setPanelColor({
                                                                    background: '#16a34a',
                                                                    border: '#15803d'
                                                                });
                                                                cookie.set('panelColor', '#16a34a|#15803d', "Lax", true, 365 * 24 * 60 * 60);
                                                            }, children: [panelColor.background === '#16a34a' ? _jsx(Tick, { color: "white", size: 12 }) : _jsx(_Fragment, {}), " ", _jsx("span", { style: { fontSize: '12px', color: '#fff' }, children: "Green" })] }), _jsxs("div", { style: { background: '#111', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #333', gap: '8px' }, onClick: () => {
                                                                setPanelColor({
                                                                    background: '#111',
                                                                    border: '#333'
                                                                });
                                                                cookie.set('panelColor', '#111|#333', "Lax", true, 365 * 24 * 60 * 60);
                                                            }, children: [panelColor.background === '#111' ? _jsx(Tick, { color: "white", size: 12 }) : _jsx(_Fragment, {}), " ", _jsx("span", { style: { fontSize: '12px', color: '#fff' }, children: "Black" })] }), _jsxs("div", { style: { background: '#f7c623', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #d9ad1e', gap: '8px' }, onClick: () => {
                                                                setPanelColor({
                                                                    background: '#f7c623',
                                                                    border: '#d9ad1e'
                                                                });
                                                                cookie.set('panelColor', '#f7c623|#d9ad1e', "Lax", true, 365 * 24 * 60 * 60);
                                                            }, children: [panelColor.background === '#f7c623' ? _jsx(Tick, { color: "white", size: 12 }) : _jsx(_Fragment, {}), " ", _jsx("span", { style: { fontSize: '12px', color: '#fff' }, children: "Yellow" })] }), _jsxs("div", { style: { background: '#3bb0ff', width: '50px', height: '50px', borderRadius: '100px', cursor: 'pointer', alignItems: 'center', textAlign: 'center', justifyContent: 'center', flexDirection: 'column', display: 'flex', border: '1px solid #3290cf', gap: '8px' }, onClick: () => {
                                                                setPanelColor({
                                                                    background: '#3bb0ff',
                                                                    border: '#3290cf'
                                                                });
                                                                cookie.set('panelColor', '#3bb0ff|#3290cf', "Lax", true, 365 * 24 * 60 * 60);
                                                            }, children: [panelColor.background === '#3bb0ff' ? _jsx(Tick, { color: "white", size: 12 }) : _jsx(_Fragment, {}), " ", _jsx("span", { style: { fontSize: '12px', color: '#fff' }, children: "Blue" })] })] })] })] })) : aboutHostOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setAboutHostOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(ShieldCheck, { size: 12, color: "#f472b6" }), " About Host"] })] }), datRestrictionMissing ? (_jsx(SecuredTab, {})) : (_jsx(_Fragment, {})), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: [_jsxs("span", { style: { fontSize: '24px', color: '#333', fontWeight: 'bold', textAlign: 'center', display: 'flex', alignItems: 'center', flexDirection: 'column', gap: '6px' }, children: [_jsx(ShieldCheck, { size: 36, color: "#f472b6" }), "Authtics Host"] }), _jsx("span", { style: { fontSize: '12px', color: '#333', textAlign: 'center' }, children: "A lightweight, fast, and secure web framework for modern web applications." }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Version" }), _jsxs("span", { style: { fontSize: '12px', color: 'blue' }, children: ["v", hostVersion] })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Made By" }), _jsx("span", { style: { fontSize: '12px', color: 'orange' }, children: "bananakitssu" })] }), _jsxs("a", { style: {
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
                                                    }, href: "https://www.npmjs.com/package/@bananacool467/authtics-host", children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Documentation" }), _jsx("span", { style: { fontSize: '12px', color: '#333' }, children: _jsx(ChevronRight, { size: 12 }) })] })] })] })) : serverInfoOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setServerInfoOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Server, { size: 12, color: "#f472b6" }), " Server Info"] })] }), datRestrictionMissing ? (_jsx(SecuredTab, {})) : (_jsx(_Fragment, {})), _jsxs("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: [_jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Server uptime" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: uptime })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Total requests" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: requests })] }), _jsxs("div", { style: {
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333' }, children: "Total current users" }), _jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: users })] }), _jsx(Sparkline, { data: cpuUsageHistory, color: "#3b82f6", label: "CPU Usage", unit: "" }), _jsx(Sparkline, { data: heapUsageHistory, color: "#3b82f6", label: "Heap Used", unit: heapResult })] })] })) : settingsOpen && !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderBottom: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }, children: [_jsxs(PanelButton, { onClick: () => setSettingsOpen(false), style: { color: '#555' }, children: [_jsx(ArrowLeft, { size: 12 }), " Back"] }), _jsxs("span", { style: { fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }, children: [_jsx(Cog, { size: 12, color: "#f472b6" }), " Settings"] })] }), _jsx("div", { style: { overflowY: 'auto', maxHeight: '260px', padding: '10px', display: (datRestrictionMissing ? 'none' : 'flex'), flexDirection: 'column', gap: '8px' }, children: _jsxs(PanelButton, { onClick: () => setPanelCustomOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Cog, { size: 12, color: "#3b82f6" }), " Panel Customization"] }), _jsx(ChevronRight, { size: 12 })] }) })] })) : !shutdown ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: { padding: '8px', gap: '4px', display: 'flex', flexDirection: 'column' }, children: [_jsxs(PanelButton, { onClick: () => setConsoleOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Terminal, { size: 12, color: "#16a34a" }), " Console"] }), logs.length > 0 && (_jsx("span", { style: { color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }, children: logs.length }))] }), _jsxs(PanelButton, { onClick: () => setRouteOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Route, { size: 12, color: "#3b82f6" }), " Route"] }), _jsxs("span", { style: { color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }, children: [datRestrictionMissing && _jsx(TriangleAlert, { size: 12, color: "orange" }), pathName] })] }), _jsxs(PanelButton, { onClick: () => setWebpageInfoOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Globe, { size: 12, color: "#3b82f6" }), " Webpage Info"] }), datRestrictionMissing && _jsx(TriangleAlert, { size: 12, color: "orange" })] }), _jsx(PanelButton, { onClick: () => setSettingsOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Cog, { size: 12, color: "#f472b6" }), " Settings"] }) }), _jsxs(PanelButton, { onClick: () => setPackageSecurityOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Shield, { size: 12, color: "#f472b6" }), " Package Security"] }), highRiskDeps.length > 0 ?
                                                            (_jsxs("div", { style: { gap: '4px', alignItems: 'center', justifyContent: 'center', display: 'flex' }, children: [_jsx(TriangleAlert, { size: 12, color: "red" }), _jsx("span", { style: { color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }, children: highRiskDeps.length })] })) : mediumRiskDeps.length > 0 ?
                                                            (_jsxs("div", { style: { gap: '8px', alignItems: 'center', justifyContent: 'center', display: 'flex' }, children: [_jsx(TriangleAlert, { size: 12, color: "#f7c623" }), _jsx("span", { style: { color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }, children: mediumRiskDeps.length })] })) : lowRiskDeps.length > 0 ?
                                                            (_jsxs("div", { style: { gap: '8px', alignItems: 'center', justifyContent: 'center', display: 'flex' }, children: [_jsx(Info, { size: 12, color: "#3bb0ff" }), _jsx("span", { style: { color: '#111', borderRadius: '100px', padding: '1px 6px', fontSize: '10px' }, children: lowRiskDeps.length })] })) : _jsx(CheckCircle2, { size: 12, color: "#16a34a" })] }), _jsx(PanelButton, { onClick: () => setNetworkOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Wifi, { size: 12, color: "#3b82f6" }), " Network"] }) }), _jsxs(PanelButton, { onClick: () => setClientInfoOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Info, { size: 12, color: "#3b82f6" }), " Client Info"] }), datRestrictionMissing && _jsx(TriangleAlert, { size: 12, color: "orange" })] }), _jsxs(PanelButton, { onClick: () => setAboutHostOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(ShieldCheck, { size: 12, color: "#f472b6" }), " About HostJS"] }), datRestrictionMissing && _jsx(TriangleAlert, { size: 12, color: "orange" })] }), _jsxs(PanelButton, { onClick: () => setServerInfoOpen(true), fullWidth: true, style: { color: '#333', justifyContent: 'space-between', height: '32px' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [_jsx(Server, { size: 12, color: "#f472b6" }), " Server Info"] }), datRestrictionMissing && _jsx(TriangleAlert, { size: 12, color: "orange" })] })] }), _jsxs("div", { style: {
                                                padding: '6px 8px',
                                                borderTop: '1px solid #ddd',
                                                background: '#fff',
                                                display: 'flex',
                                                gap: '6px',
                                                overflowY: 'auto',
                                                maxHeight: '260px',
                                                flexDirection: 'column',
                                            }, children: [_jsxs("div", { style: {
                                                        justifyContent: 'space-between',
                                                        padding: '6px 10px',
                                                        background: '#fff',
                                                        borderRadius: '10px',
                                                        border: '1px solid #eee',
                                                        fontSize: '12px',
                                                        color: '#333',
                                                        display: 'flex'
                                                    }, children: [_jsx("span", { style: { fontSize: '12px', color: '#333', position: 'relative' }, children: "DAT (Developer Access Token)" }), _jsxs("div", { style: { position: 'relative',
                                                                display: 'inline-flex' }, children: [_jsx("span", { style: { fontSize: '12px', color: 'blue' }, children: token }), tokenHidden && (_jsxs("div", { style: {
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
                                                                    }, onClick: () => setTokenHidden(false), children: [_jsx(Eye, { size: 12 }), "Click to reveal"] }))] })] }), tokenLength !== 16 ? (_jsx(_Fragment, { children: _jsxs("div", { style: {
                                                            display: 'flex',
                                                            background: '#ba4e4e',
                                                            borderRadius: '10px',
                                                            padding: '6px 10px',
                                                            justifyContent: 'left',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            color: '#fff',
                                                            flexDirection: 'row',
                                                        }, children: [_jsx(CircleX, { size: 12 }), "Invalid Developer Access Token (DAT)"] }) })) : (_jsx(_Fragment, {})), hostVersion === "0.0.1-beta.9" ? (_jsx(_Fragment, { children: _jsx("div", { style: {
                                                            display: 'flex',
                                                            background: 'orange',
                                                            borderRadius: '10px',
                                                            padding: '6px 10px',
                                                            justifyContent: 'left',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            color: '#fff',
                                                            flexDirection: 'row',
                                                        }, children: "Updates to security. Apps with version 0.0.1-beta.9 and over will now require DAT restriction to access remote features like restarting and shutting down the app." }) })) : (_jsx(_Fragment, {})), _jsx(PanelButton, { onClick: () => { restart(); }, fullWidth: true, style: { color: '#fff', justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd' : '#ba4e4e') }, disabled: datRestrictionMissing, children: _jsx("span", { style: { display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }, children: "Restart App" }) }), datRestrictionMissing ? (_jsxs("span", { style: { display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }, children: [_jsx(Info, { size: 30 }), "Restarting the app is unavaliable. Set \"dat\" to your current DAT in the Authtics Host config to set restriction and then restart."] })) : (_jsx(_Fragment, {})), _jsx(PanelButton, { onClick: () => { shutDown(); }, fullWidth: true, style: { color: '#fff', justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd' : '#ba4e4e') }, disabled: datRestrictionMissing, children: _jsx("span", { style: { display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }, children: shuttingDown ? "Shutting Down App" : "Shut Down App" }) }), datRestrictionMissing ? (_jsxs("span", { style: { display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }, children: [_jsx(Info, { size: 30 }), "Shutting down the app is unavaliable. Set \"dat\" to your current DAT in the Authtics Host config to set restriction and then restart."] })) : (_jsx(_Fragment, {})), _jsx(PanelButton, { onClick: () => { pause_Resume_Users(); }, fullWidth: true, style: { color: (datRestrictionMissing ? '#fff' : '#333'), justifyContent: 'center', height: '32px', background: (datRestrictionMissing ? '#bdbdbd' : '#f2f2f2') }, disabled: datRestrictionMissing, children: _jsx("span", { style: { display: 'flex', alignItems: 'center', gap: '6px', textAlign: 'center' }, children: usersPausedRealInfo ? "Resume Users" : "Pause Users" }) }), datRestrictionMissing ? (_jsxs("span", { style: { display: 'flex', opacity: 0.5, fontSize: 10, justifyContent: 'center', alignItems: 'center', gap: '8px' }, children: [_jsx(Info, { size: 30 }), "Pausing users from accessing the app is unavaliable. Set \"dat\" to your current DAT in the Authtics Host config to set restriction and then restart."] })) : (_jsx(_Fragment, {}))] })] })) : (_jsx(_Fragment, {}))] }) }), datMatch ? (_jsxs("div", { onClick: () => setOpen(o => !o), style: {
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: hasIssue ? '100px' : '10px',
                            background: hasIssue ? '#ba4e4e' : panelColor.background,
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
                        }, children: [_jsx(ShieldCheck, { size: 16, color: "#f472b6", style: { flexShrink: 0 } }), _jsx("div", { style: {
                                    maxWidth: hasIssue ? '160px' : '0px',
                                    opacity: hasIssue ? 1 : 0,
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                    marginLeft: hasIssue ? '8px' : '0px',
                                    transition: 'max-width 0.4s ease, opacity 0.4s ease, margin-left 0.4s ease',
                                }, children: _jsxs("span", { style: {
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: 'rgba(255,255,255,0.15)',
                                        padding: '3px 8px',
                                        borderRadius: '100px',
                                        fontSize: '12px',
                                    }, children: [_jsx(CircleX, { size: 11 }), errorCount > 0 && _jsxs("span", { children: [errorCount, " error", errorCount > 1 ? 's' : '', "."] })] }) }), _jsx("div", { style: { marginLeft: hasIssue ? '6px' : '4px', opacity: 0.4, display: 'flex' }, children: open ? _jsx(ChevronDown, { size: 12 }) : _jsx(ChevronUp, { size: 12 }) })] })) : (_jsx(_Fragment, {}))] })] }));
}
