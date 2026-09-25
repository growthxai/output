// Minimal types so TS modules (credentials) can import this JS file
export declare function createChildLogger( namespace: string ): {
  info: ( message: string, meta?: Record<string, unknown> ) => void;
};
