import { workflow, z } from '@outputai/core';
import { httpBinResponseSchema, responseMetadataSchema } from './types.js';
import {
  listClientsStep,
  createClientStep,
  exportClientsStep,
  exportMetadataStep,
  listContractsStep,
  createContractStep
} from './steps.js';

export default workflow( {
  name: 'http',
  description: 'Demonstrates HTTP client library with different authentication strategies using httpbin.io',
  outputSchema: z.object( {
    clientsListResponse: httpBinResponseSchema,
    createClientResponse: httpBinResponseSchema,
    exportResponse: httpBinResponseSchema,
    exportMetadataResponse: responseMetadataSchema,
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
    const exportMetadataResponse = await exportMetadataStep();
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
      exportMetadataResponse,
      contractsListResponse,
      createContractResponse
    };
  }
} );
