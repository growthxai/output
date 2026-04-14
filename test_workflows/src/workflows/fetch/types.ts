import { z } from '@outputai/core';

export interface HttpBinResponse {
  args: Record<string, string | string[]>;
  headers: Record<string, string[]>;
  method: string;
  origin: string;
  url: string;
  data: string;
  files: Record<string, unknown>;
  form: Record<string, string | string[]>;
  json: unknown;
}

export interface ClientInput {
  name: string;
  email: string;
}

export interface ContractInput {
  clientId: string;
  title: string;
  value: number;
}

export const httpBinResponseSchema = z.object( {
  args: z.record( z.string(), z.union( [ z.string(), z.array( z.string() ) ] ) ),
  headers: z.record( z.string(), z.array( z.string() ) ),
  method: z.string(),
  origin: z.string(),
  url: z.string(),
  data: z.string(),
  files: z.record( z.string(), z.unknown() ),
  form: z.record( z.string(), z.union( [ z.string(), z.array( z.string() ) ] ) ),
  json: z.unknown()
} );
