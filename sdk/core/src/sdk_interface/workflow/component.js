import { METADATA_ACCESS_SYMBOL } from '#consts';

export const getComponentName = fn => fn[METADATA_ACCESS_SYMBOL]?.name;

export const isComponent = fn => !!fn[METADATA_ACCESS_SYMBOL];
