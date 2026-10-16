#!/usr/bin/env node
import { IncomingMessage, ServerResponse, Server } from "node:http";
export default class App {
    server: Server | null | undefined;
    constructor();
    startServer(): Promise<void>;
    registerApp(route: string): void;
    get(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    post(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    put(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    delete(routePath: string, handler: (req: IncomingMessage, res: ServerResponse) => void): void;
    use(handler: (req: IncomingMessage, res: ServerResponse, id: bigint | null, next: Function) => void): void;
    on(method: string, handler: (...args: any[]) => void): void;
    remove(method: string, routePath: string): void;
}
