type Logger = {
  /**
   * Log an error (level 0)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  error( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log a warn (level 1)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  warn( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log an info (level 2)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  info( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log http (level 3)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  http( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log verbose (level 4)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  verbose( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log debug (level 5)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  debug( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Log silly (level 6)
   * @param message Log message
   * @param metadata Additional information to be displayed
   */
  silly( message: string, metadata?: Record<string, unknown> ) : void,

  /**
   * Creates a new Logger with a namespace value preset for all emitted logs.
   * @param namespace
   */
  createLogger( namespace: string ) : Logger
};

/**
 * Logger tool. Can be used in activities or workflows. Logs together with the framework's own logs.
 */
export declare const Logger : Logger;
