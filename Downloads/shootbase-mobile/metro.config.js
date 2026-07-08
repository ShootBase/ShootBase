const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const TANSTACK_PACKAGES = ['@tanstack/query-core', '@tanstack/react-query'];

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (TANSTACK_PACKAGES.some((pkg) => moduleName.startsWith(pkg))) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ['require'] },
      moduleName,
      platform,
    );
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
