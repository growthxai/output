const hooks = [];

export const registerStartupHook = fn => hooks.push( fn );
export const runStartupHooks = () => hooks.flatMap( fn => fn() ?? [] );
