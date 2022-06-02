import * as babel from '@babel/core';
import JestHasteMap from 'jest-haste-map';
import { resolve } from 'path';
import chalk from 'chalk';
import fs from 'fs';
import { cpus } from 'os';
import cliProgress from 'cli-progress';
import _traverse from '@babel/traverse';
import Resolver from 'jest-resolve';
// import { DependencyResolver } from 'jest-resolve-dependencies';
// eslint-disable-next-line import/extensions
import MultiDependencyResolver from './multiDependencyResolver.js';

function getExtension(filename) {
  return filename.split('.').pop();
}

function test(file, hasteFS, moduleMap, rootDir) {
  const dependencies = Array.from(hasteFS.getDependencies(file) || []);
  // eslint-disable-next-line new-cap
  const resolver = new Resolver.default(moduleMap, {
    extensions: ['web.js', 'android.js', 'ios.js', 'js', 'jsx', 'ts', 'tsx'],
    hasCoreModules: true,
    rootDir,
  });
  // const dependencyResolver = new DependencyResolver(resolver, hasteFS);
  dependencies.forEach((dep) => {
    try {
      console.log(dep, resolver.resolveModule(file, dep));
    } catch (err) {
      console.log('Error:', dep, file);
    }
  });
  //  dependencies.forEach((dep) => console.log(dep, resolver.resolveModule(file, dep)));
}

function processor(extractorFunctionName, code, filename) {
  const stringsFound = [];
  const traverse = _traverse.default;

  const isTargetNode = (node) => node.arguments
    && node.arguments.length > 0
    && node.arguments[0].type === 'StringLiteral'
    && node.callee
    && (node.callee.name === extractorFunctionName
      || (node.callee.property
        && node.callee.property.name === extractorFunctionName));

  try {
    const { ast } = babel.transformSync(code, {
      filename,
      presets: [
        '@babel/preset-typescript',
        '@babel/preset-react',
        '@babel/preset-flow',
      ],
      plugins: [['@babel/plugin-proposal-decorators', { legacy: true }]],
      code: false,
      ast: true,
    });

    traverse(ast, {
      CallExpression(path) {
        const { node } = path;
        if (isTargetNode(node)) {
          stringsFound.push(node.arguments[0].value);
        }
      },
    });
  } catch (err) {
    return false;
  }

  return stringsFound;
}

async function processFiles(allFiles, fileProcessor) {
  const allCodes = [];
  const errorFiles = [];
  const stringsFound = [];
  let done = 0;
  const bar1 = new cliProgress.SingleBar(
    {},
    cliProgress.Presets.shades_classic,
  );
  bar1.start(allFiles.length, 0);
  await Promise.all(
    Array.from(allFiles).map(async (file) => {
      const code = await fs.promises.readFile(file, 'utf8');
      allCodes.push(code);
      const ret = fileProcessor(code, file);
      if (!ret) {
        errorFiles.push(file);
      } else {
        stringsFound.push(...ret);
      }
      done += 1;
      bar1.update(done);
    }),
  ).catch(console.err);
  bar1.stop();
  return { errorFiles, stringsFound };
}

function getExtensionsMap(platforms, extensions) {
  const extensionsMap = [];
  platforms.forEach((platform) => {
    extensions.forEach((extension) => {
      extensionsMap.push(`${platform}.${extension}`);
    });
  });
  return extensionsMap.concat(extensions);
}

async function getStringsToTranslate({
  entryPoints,
  rootDir,
  platforms,
  extensions,
  extractorFunctionName,
}) {
  const root = resolve(process.cwd(), rootDir);
  console.log(
    chalk.bold(`❯ Building HasteMap for directory ${chalk.blue(root)}`),
  );

  const extensionsMap = getExtensionsMap(platforms, extensions);

  const hasteMapOptions = {
    extensions,
    name: 'jest-bundler',
    platforms: [],
    rootDir: root,
    roots: [root],
    maxWorkers: cpus().length,
  };
  // eslint-disable-next-line new-cap
  const hasteMap = new JestHasteMap.default(hasteMapOptions);

  await hasteMap.setupCachePath(hasteMapOptions);
  const { hasteFS, moduleMap } = await hasteMap.build();

  const entryPointAbsolute = entryPoints.map((entryPoint) => {
    const absolutePath = resolve(process.cwd(), entryPoint);
    if (!hasteFS.exists(absolutePath)) {
      throw new Error(
        chalk.red(
          `${entryPoint} does not exist. Please provide a path to valid file`,
        ),
      );
    }
    return absolutePath;
  });

  console.log(chalk.bold('❯ Resolving dependencies recursively'));

  const resolverOpts = {
    hasCoreModules: true,
    rootDir: root,
  };
  console.log(extensionsMap);

  const depFactory = new MultiDependencyResolver(
    extensionsMap,
    moduleMap,
    resolverOpts,
    hasteFS,
  );
  const queue = entryPointAbsolute;
  const allFiles = new Set();

  while (queue.length) {
    const module = queue.shift();

    if (allFiles.has(module) || !extensions.includes(getExtension(module))) {
      continue;
    }

    allFiles.add(module);
    test(module, hasteFS, moduleMap, rootDir);
    const dependencies = depFactory.multiResolve(module);
    console.log(dependencies);
    queue.push(...dependencies);
  }

  console.log(chalk.bold(`❯ Found ${chalk.blue(allFiles.size)} files`));
  const { errorFiles, stringsFound } = await processFiles(
    Array.from(allFiles),
    (code, filename) => processor(extractorFunctionName, code, filename),
  );
  console.log(
    chalk.bold(`❯ ${chalk.blue(errorFiles.length)} files failed to parse`),
  );
  if (errorFiles.length) console.log(errorFiles);
  const stringsSet = new Set(stringsFound);
  console.log(
    chalk.bold(
      `❯ Found ${chalk.blue(
        stringsFound.length,
      )} strings out of which ${chalk.blue(stringsSet.size)} are unique`,
    ),
  );
  if (stringsFound.length) console.log(new Set(stringsFound));
}
export default getStringsToTranslate;

getStringsToTranslate({
  entryPoints: ['/Users/pulak.malhotra/Desktop/i18n/devhub/packages/mobile/index.js'],
  rootDir: '/Users/pulak.malhotra/Desktop/i18n/devhub',
  platforms: ['web', 'android', 'native', 'ios', 'shared'],
  extensions: ['js', 'jsx', 'tsx', 'ts'],
  extractorFunctionName: 't',
});
// getStringsToTranslate({
//   entryPoints: ['./product/entry-point.js'],
//   rootDir: './product',
//   extensions: ['android.js', 'ios.js', 'js', 'jsx', 'tsx', 'ts'],
//   extractorFunctionName: 'getString',
// });
// getStringsToTranslate({
//   entryPoints: ['../i18n/eigen/index.android.js', '../i18n/eigen/index.ios.js'],
//   rootDir: '../i18n/eigen',
//   extensions: ['android.js', 'ios.js', 'js', 'jsx', 'tsx', 'ts'],
//   extractorFunctionName: 'useFeatureFlag',
// });