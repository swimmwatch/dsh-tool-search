import type { ToolMetadata } from '../../../src/core/shared/types.js';

interface FixtureField {
  readonly name: string;
  readonly type: string;
  readonly description: string;
  readonly optional?: boolean;
}

export function tool(
  name: string,
  description: string,
  fields: readonly FixtureField[] = [],
): ToolMetadata {
  const argumentsSource = fields
    .flatMap((field) => [
      `    // ${field.description}`,
      `    ${field.name}${field.optional ? '?' : ''}: ${field.type};`,
    ])
    .join('\n');
  return {
    name,
    description:
      `${description}\nexec tool declaration:\n\`\`\`ts\n` +
      `declare const tools: {\n  ${name}(args: {\n${argumentsSource}\n` +
      '  }): Promise<unknown>;\n};\n```',
  };
}
