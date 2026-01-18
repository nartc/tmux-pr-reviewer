import { Context, Layer } from 'effect';
export interface McpConfig {
    readonly workingDir: string;
    readonly clientName: string;
    readonly dbPaths: readonly string[];
}
export declare const McpConfig: Context.Tag<McpConfig, McpConfig>;
export declare const McpConfigLive: Layer.Layer<McpConfig, never, never>;
export declare const makeTestConfig: (overrides: Partial<McpConfig>) => McpConfig;
export declare const McpConfigTest: (overrides?: Partial<McpConfig>) => Layer.Layer<McpConfig, never, never>;
