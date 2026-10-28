import { createElement } from 'react';
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type { CredentialActions } from './credential-field.js';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { PLUGIN_NAME } from '../constants.js';
import { SETTINGS_TEXT } from './messages.js';
import { ToolSearchSettings } from './settings.js';

export const inject = ['slots', 'remote.credentials'];

export function apply(ctx: Context): void {
  const credentials: CredentialActions = {
    describe: async (ref) => {
      const response = await ctx.remote.credentials.describe([ref]);
      if (!response.ok) throw new Error(SETTINGS_TEXT.keyFailed);
      return response.value[ref] ?? { configured: false, writable: false };
    },
    set: async (ref, value) => {
      const response = await ctx.remote.credentials.set(ref, value);
      if (!response.ok) throw new Error(SETTINGS_TEXT.keyFailed);
    },
  };
  const Settings = (props: PluginConfigViewProps) =>
    createElement(ToolSearchSettings, { ...props, credentials });
  ctx.effect(() =>
    ctx.slots.inject('plugins.row.config', () =>
      ctx.slots.register(
        { name: 'plugins.row.config', key: `${PLUGIN_NAME}#${PLUGIN_NAME}` },
        Settings,
      ),
    ),
  );
}
