import { QUERY_INSTRUCTION } from '../../../src/core/embeddings/provider.js';
import type { EmbeddingAdapter, ToolMetadata } from '../../../src/core/shared/types.js';

export function toolDefinition(
  name: string,
  description: string,
  fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly description?: string;
    readonly optional?: boolean;
  }[] = [],
): ToolMetadata {
  const fieldSource = fields
    .flatMap((field) => [
      ...(field.description ? [`    // ${field.description}`] : []),
      `    ${field.name}${field.optional ? '?' : ''}: ${field.type};`,
    ])
    .join('\n');
  return {
    name,
    description: `${description}\nexec tool declaration:\n\`\`\`ts\ndeclare const tools: {\n  ${name}(args: {\n${fieldSource}\n  }): Promise<unknown>;\n};\n\`\`\``,
  };
}

export const readTool = toolDefinition('mcp__github__fetch_issue', 'Fetch one GitHub issue.', [
  { name: 'owner', type: 'string', description: 'Repository owner.' },
  { name: 'repository', type: 'string', description: 'Repository name.' },
  { name: 'issue_number', type: 'number', description: 'Issue number.' },
]);
export const writeTool = toolDefinition('mcp__github__update_issue', 'Update one GitHub issue.');
export const executionTool = toolDefinition('exec_command', 'Run a local command.');
export const destructiveTool = toolDefinition(
  'mcp__github__delete_issue',
  'Delete one GitHub issue.',
);

export class DeterministicEmbeddingAdapter implements EmbeddingAdapter {
  public embedQueries(inputs: readonly string[]): Promise<readonly (readonly number[])[]> {
    return this.embedBatches(inputs.map((query) => `${QUERY_INSTRUCTION}${query}`));
  }
  public readonly model = 'deterministic-test';

  public async embedBatches(inputs: readonly string[]): Promise<readonly (readonly number[])[]> {
    return inputs.map((input) => {
      const value = input.toLowerCase();
      return [
        value.includes('github') ? 1 : 0,
        value.includes('issue') ? 1 : 0,
        value.includes('update') ? 1 : 0,
        value.includes('fetch') ? 1 : 0,
      ];
    });
  }
}
