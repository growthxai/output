import Decimal from 'decimal.js';

export const formatCost = events => ( {
  events,
  total: Decimal( events.reduce( ( sum, c ) => c.total + sum, 0 ) ).toNumber()
} );
