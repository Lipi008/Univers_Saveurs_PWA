const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Pnpm monorepo: watch workspace root so Metro sees hoisted packages
config.watchFolders = [monorepoRoot];

// Resolve packages from both the project and the monorepo root (pnpm virtual store)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Explicit @/ path alias → project root (mirrors tsconfig paths)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    const resolved = path.resolve(projectRoot, moduleName.slice(2));
    return context.resolveRequest(context, resolved, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.assetExts.push('wasm');

module.exports = config;
