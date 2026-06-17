import { getWorkflowCatalog, getWorkflowCatalogId, type GetWorkflowCatalog200, type Workflow } from './generated/api.js';

/**
 * Resolve the workflows in a catalog. When `catalog` is provided (e.g. from
 * `--catalog`/`OUTPUT_CATALOG_ID`) it resolves that specific catalog, otherwise
 * the API server's default catalog. Returns `[]` when the catalog has no workflows.
 */
export async function fetchWorkflowCatalog( catalog?: string ): Promise<Workflow[]> {
  const response = catalog ? await getWorkflowCatalogId( catalog ) : await getWorkflowCatalog();
  const data = response?.data as GetWorkflowCatalog200 | undefined;
  return data?.workflows ?? [];
}
