declare module "http" {
  interface IncomingMessage {
    ip: string | undefined;
    ipType: number;
    body: any;
    cookies: Record<string, string>;
    ua: string | undefined;
    os: any;
    browser: any;
    dat: string | undefined;
    bodySize: number;
    bodyType: string;
    sentTime: number;
  }
  interface ServerResponse {
    redirect: (url: string) => void;
    html: (content: string) => void;
    json: (content: any) => void;
    text: (content: string) => void;
    file: (path_: string) => void;
    status: (code: number) => ServerResponse;
    reload: () => void;
    setCookie: (name: string, value: string) => void;
    rmvCookie: (name: string) => void;
  }
}

import { defineConfig } from './config.js';
import App from './cli.js';
import { Route, RouteMap, Paused } from './route.js';
import { load as loadBAPI, Cookies } from "./BrowserAPIs.js";

export { App, Route, RouteMap, Paused, defineConfig, loadBAPI, Cookies };