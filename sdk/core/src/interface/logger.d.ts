/**
 * Additional structured fields attached to a log record.
 */
export type LogMetadata = Record<string, unknown>;

/**
 * Log an error (level 0)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function error( message: string, metadata?: LogMetadata ) : void;

/**
 * Log a warn (level 1)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function warn( message: string, metadata?: LogMetadata ) : void;

/**
 * Log an info (level 2)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function info( message: string, metadata?: LogMetadata ) : void;

/**
 * Log http (level 3)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function http( message: string, metadata?: LogMetadata ) : void;

/**
 * Log verbose (level 4)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function verbose( message: string, metadata?: LogMetadata ) : void;

/**
 * Log debug (level 5)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function debug( message: string, metadata?: LogMetadata ) : void;

/**
 * Log silly (level 6)
 * @param message Log message
 * @param metadata Additional information to be displayed
 */
export declare function silly( message: string, metadata?: LogMetadata ) : void;
