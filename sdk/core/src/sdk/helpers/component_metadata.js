import { METADATA_ACCESS_SYMBOL } from '#consts';

export const ComponentMetadata = {
  getName: fn => fn[METADATA_ACCESS_SYMBOL]?.name,
  has: fn => !!fn[METADATA_ACCESS_SYMBOL]
};
