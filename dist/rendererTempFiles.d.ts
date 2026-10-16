export declare function ensureTempDirs(): void;
export declare function tempFileForTsx(tsxPath: string, variant?: string): string;
export declare function tempFileForDev(): string;
export declare function isTempUpToDate(tsxPath: string, tempPath: string): boolean;
export declare function writeTempFile(tempPath: string, content: string): void;
export declare function readTempFile(tempPath: string): string;
export declare function clearCache(): void;
