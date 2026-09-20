import type { BetterAuthPlugin } from "better-auth";

const authPlugins: BetterAuthPlugin[] = [];

/**
 * Register a Better Auth plugin from an extension layer (e.g. sp-cloud).
 * Must be registered before the auth handler handles incoming requests.
 */
export const registerAuthPlugin = (plugin: BetterAuthPlugin) => {
  authPlugins.push(plugin);
};

export const getRegisteredAuthPlugins = (): BetterAuthPlugin[] => authPlugins;
