import { METADATA_ACCESS_SYMBOL } from '#consts';

export const readAttributes = fn => fn[METADATA_ACCESS_SYMBOL];

export const isComponent = fn => !!fn[METADATA_ACCESS_SYMBOL];
