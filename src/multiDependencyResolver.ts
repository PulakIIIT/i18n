import Resolver from 'jest-resolve';
import { DependencyResolver } from 'jest-resolve-dependencies';

/*
MultiDependencyResolver is a wrapper around DependencyResolver which
resolves the dependency once for each extension. In this way if there is a an
import from "hello", it will get "hello.android.js", "hello.ios.js", "hello.js"
if both files exist.
*/
export default class MultiDependencyResolver {
  resolvers: any;
  depResolvers: any;

  constructor(extensions, moduleMap, options, hasteFS) {
    this.resolvers = extensions.map(
      // eslint-disable-next-line new-cap
      (extension) => new Resolver.default(moduleMap, {
        ...options,
        extensions: [`.${extension}`],
      }),
    );
    this.depResolvers = this.resolvers.map(
      (resolver) => new DependencyResolver(resolver, hasteFS, null),
    );
  }

  multiResolve(module) {
    const resolved = [];
    this.depResolvers.forEach((depResolver) => {
      resolved.push(...depResolver.resolve(module));
    });
    return {resolved, errors: []};
  }
}
