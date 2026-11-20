export const parseModelsDevData = data => {
  const map = new Map();
  for ( const [ providerId, provider ] of Object.entries( data ) ) {
    if ( providerId === '_meta' ) {
      continue;
    }
    for ( const [ modelName, { cost, reasoning } ] of Object.entries( provider.models ?? {} ) ) {
      if ( cost ) { // some models don't have cost
        map.set( `${providerId}/${modelName}`, {
          cost,
          reasoning: reasoning === true
        } );
      }
    }
  }
  if ( map.size === 0 ) {
    throw new Error( 'Empty response' );
  }
  return map;
};
