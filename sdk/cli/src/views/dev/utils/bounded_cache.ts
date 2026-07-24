export interface BoundedCache<K, V extends {}> {
  get( key: K ): V | undefined;
  set( key: K, value: V ): void;
  has( key: K ): boolean;
  clear(): void;
  size(): number;
}

/**
 * A small LRU cache backed by an insertion-ordered `Map`, capped at `maxSize`
 * entries. Reading a key refreshes its recency; once the cap is exceeded the
 * least-recently-used entries are evicted. Drop-in compatible with the
 * `Map.get` / `Map.set` calls it replaces.
 */
export const createBoundedCache = <K, V extends {}>( maxSize: number ): BoundedCache<K, V> => {
  if ( maxSize < 1 ) {
    throw new Error( 'createBoundedCache: maxSize must be >= 1' );
  }
  const entries = new Map<K, V>();

  return {
    get( key: K ): V | undefined {
      const value = entries.get( key );
      if ( value === undefined ) {
        return value;
      }
      entries.delete( key );
      entries.set( key, value );
      return value;
    },
    set( key: K, value: V ): void {
      entries.delete( key );
      entries.set( key, value );
      if ( entries.size > maxSize ) {
        const oldest = entries.keys().next();
        if ( !oldest.done ) {
          entries.delete( oldest.value );
        }
      }
    },
    has( key: K ): boolean {
      return entries.has( key );
    },
    clear(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    }
  };
};
