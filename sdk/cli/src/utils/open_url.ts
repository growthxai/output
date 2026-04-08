import { execFile } from 'node:child_process';

const resolveCommand = (): { cmd: string; args: ( url: string ) => string[] } => {
  if ( process.platform === 'darwin' ) {
    return { cmd: 'open', args: url => [ url ] };
  }
  if ( process.platform === 'win32' ) {
    return { cmd: 'cmd', args: url => [ '/c', 'start', url ] };
  }
  return { cmd: 'xdg-open', args: url => [ url ] };
};

export const openUrl = ( url: string ): void => {
  const { cmd, args } = resolveCommand();
  execFile( cmd, args( url ) );
};
