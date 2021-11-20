let onResolvePlugin = {
  name: "example",
  setup(build) {
    let path = require("path");
    // eslint-disable-next-line no-unused-vars
    build.onResolve({ filter: /^@\/slib\/s3.js$/ }, (args) => {
      // console.error({ args, cwd: process.cwd(), dirname: __dirname });
      return { path: path.join(process.cwd(), "slib/s3fs.js") };
    });
    build.onResolve({ filter: /^@\// }, (args) => {
      // console.error({ args, cwd: process.cwd(), dirname: __dirname });
      return { path: path.join(process.cwd(), args.path.slice(2)) };
    });

    // Examples

    /*
    let path = require("path");
    // Redirect all paths starting with "images/" to "./public/images/"
    build.onResolve({ filter: /^images\// }, (args) => {
      return { path: path.join(args.resolveDir, "public", args.path) };
    });

    // Mark all paths starting with "http://" or "https://" as external
    build.onResolve({ filter: /^https?:\/\// }, (args) => {
      return { path: args.path, external: true };
    });
    */
  },
};
//
require("esbuild").build({
  entryPoints: ["utils/processLocalObjects.js"],
  bundle: true,
  platform: "node",
  plugins: [onResolvePlugin],
  treeShaking: true,
  // loader: { ".png": "binary" },
});
//.catch(() => process.exit(1));
