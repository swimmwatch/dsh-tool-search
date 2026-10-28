import { ToolDiscovery } from '../../src/discovery.js';
import type { SearchTool } from '../../src/types.js';

const discovery = new ToolDiscovery({
  embeddingClient: {
    model: 'test-local',
    embedBatches: async (inputs) => inputs.map(() => [1, 0]),
  },
});
const tools: SearchTool[] = [
  {
    name: 'custom_probe',
    description: 'Private definition text',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
];
await discovery.search({}, tools, { query: 'query-marker-never-persist', mode: 'hybrid' });
