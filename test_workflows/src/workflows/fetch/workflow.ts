import { workflow, z } from '@outputai/core';
import { httpBinResponseSchema } from './types.js';
import { listClientsStep, createClientStep, exportClientsStep, listContractsStep, createContractStep } from './steps.js';

export default workflow( {
  name: 'fetch',
  description: 'Demonstrates @outputai/http\'s fetch',
  outputSchema: z.object( {
    clientsListResponse: httpBinResponseSchema,
    createClientResponse: httpBinResponseSchema,
    exportResponse: httpBinResponseSchema,
    contractsListResponse: httpBinResponseSchema,
    createContractResponse: httpBinResponseSchema
  } ),
  fn: async () => {
    const clientsListResponse = await listClientsStep();
    const createClientResponse = await createClientStep( {
      name: 'Test Client',
      email: 'test@example.com'
    } );
    const exportResponse = await exportClientsStep();
    const contractsListResponse = await listContractsStep();
    const createContractResponse = await createContractStep( {
      clientId: 'test-client-123',
      title: 'Service Agreement',
      value: 10000
    } );

    return {
      clientsListResponse,
      createClientResponse,
      exportResponse,
      contractsListResponse,
      createContractResponse
    };
  }
} );
