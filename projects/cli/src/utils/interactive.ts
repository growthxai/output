const state = { nonInteractive: false };

export const setNonInteractive = ( value: boolean ): void => {
  state.nonInteractive = value;
};

export const isInteractive = (): boolean => !state.nonInteractive && !!process.stdin.isTTY;
