import { DeepRedact } from '@hackylabs/deep-redact/index.ts';

const redactor = new DeepRedact( {
  blacklistedKeys: [
    /^(.*_)?(secret|password|passwd|credential|private_key)(_.*)?$/i,
    /^(.*_)?(api_key|apikey|access_key|auth_token)(_.*)?$/i
  ],
  stringTests: [
    {
      pattern: /sk-[a-zA-Z0-9_-]{20,}/g,
      replacer: ( value: string, pattern: RegExp ) => value.replace( pattern, 'sk-***REDACTED***' )
    },
    {
      pattern: /AKIA[A-Z0-9]{16}/g,
      replacer: ( value: string, pattern: RegExp ) => value.replace( pattern, 'AKIA***REDACTED***' )
    },
    {
      pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      replacer: ( value: string, pattern: RegExp ) => value.replace( pattern, '***JWT_REDACTED***' )
    },
    {
      pattern: /Bearer\s+[a-zA-Z0-9_.-]{20,}/g,
      replacer: ( value: string, pattern: RegExp ) => value.replace( pattern, 'Bearer ***REDACTED***' )
    }
  ],
  serialize: false
} );

export function sanitizeSecrets( value: unknown ): unknown {
  return redactor.redact( value );
}
