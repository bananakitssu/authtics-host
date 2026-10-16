'use strict';
export async function load(browserAPI) {
    while (typeof window === "undefined") {
        return null;
    }
    const apiMap = {
        navigator: window.navigator,
        window: window,
        document: window.document,
        location: window.location,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
        fetch: window.fetch.bind(window),
        XMLHttpRequest: window.XMLHttpRequest
    };
    return apiMap[browserAPI];
}
export class Cookies {
    Document;
    constructor() {
        this.Document = load('document');
    }
    async set(name, value, sameSite = "Lax", Secure = true, MaxAge = null) {
        const Document = this.Document;
        const cookieParts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, "Path=/"];
        if (MaxAge !== null) {
            cookieParts.push(`max-age=${MaxAge}`);
            const d = new Date();
            d.setTime(d.getTime() + (MaxAge * 1000));
            cookieParts.push(`expires=${d.toUTCString()}`);
        }
        if (Secure)
            cookieParts.push("secure");
        if (sameSite)
            cookieParts.push(`samesite=${sameSite}`);
        Document.cookie = cookieParts.join("; ");
    }
    async get(name) {
        const Document = this.Document;
        const cookies = Document.cookie.split(";").filter(Boolean);
        for (const c of cookies) {
            const [key, ...valParts] = c.trim().split("=");
            if (decodeURIComponent(key) === name) {
                return decodeURIComponent(valParts.join("="));
            }
        }
        return undefined;
    }
    async del(name) {
        const Document = await load('document');
        Document.cookie = `${encodeURIComponent(name)}=; path=/; max-age=0; samesite=Lax; secure`;
    }
}
