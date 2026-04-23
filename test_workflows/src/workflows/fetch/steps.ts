import { step, z } from '@outputai/core';
import { getClients, createClient, exportClients, getContracts, createContract } from './api_client.js';
import { ClientInput, ContractInput, httpBinResponseSchema } from './types.js';

// Test GET request to clients endpoint using API key authentication
export const listClientsStep = step( {
  name: 'listClientsStep',
  description: 'Test GET request with API key auth (@outputai/http fetch)',
  outputSchema: httpBinResponseSchema,
  fn: async () => {
    const response = await getClients();
    return response;
  }
} );

// Test POST request to clients endpoint using API key authentication
export const createClientStep = step( {
  name: 'createClientStep',
  description: 'Test POST request with API key auth (@outputai/http fetch)',
  inputSchema: z.object( {
    name: z.string(),
    email: z.string()
  } ),
  outputSchema: httpBinResponseSchema,
  fn: async input => {
    const response = await createClient( input as ClientInput );
    return response;
  }
} );

// Test GET request to export endpoint without authentication
export const exportClientsStep = step( {
  name: 'exportClientsStep',
  description: 'Test GET request without authentication (@outputai/http fetch)',
  outputSchema: httpBinResponseSchema,
  fn: async () => {
    const response = await exportClients();
    return response;
  }
} );

// Test GET request to contracts endpoint using Basic authentication
export const listContractsStep = step( {
  name: 'listContractsStep',
  description: 'Test GET request with Basic auth (@outputai/http fetch)',
  outputSchema: httpBinResponseSchema,
  fn: async () => {
    const response = await getContracts();
    return response;
  }
} );

// Test POST request to contracts endpoint using Basic authentication
export const createContractStep = step( {
  name: 'createContractStep',
  description: 'Test POST request with Basic auth (@outputai/http fetch)',
  inputSchema: z.object( {
    clientId: z.string(),
    title: z.string(),
    value: z.number()
  } ),
  outputSchema: httpBinResponseSchema,
  fn: async input => {
    const response = await createContract( input as ContractInput );
    return response;
  }
} );
