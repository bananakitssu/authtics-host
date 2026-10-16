type bAPI = 'navigator' | 'window' | 'document' | 'location' | 'localStorage' | 'sessionStorage' | 'fetch' | 'XMLHttpRequest';
export declare function load(browserAPI: bAPI): Promise<any>;
export declare class Cookies {
    private Document;
    constructor();
    set(name: string, value: string, sameSite?: string, Secure?: boolean, MaxAge?: number | null): Promise<void>;
    get(name: string): Promise<string | undefined>;
    del(name: string): Promise<void>;
}
export {};
