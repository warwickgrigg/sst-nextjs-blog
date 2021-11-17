let path = require("path");
const fakeS3 = process.env.S3FS_PATH;
module.exports = {
  env: {
    /*
    // temporary workaround, not needed now
    REGION: process.env.REGION,
    BUCKET_NAME: process.env.BUCKET_NAME,
    TEST_VAR: process.env.TEST_VAR,
    BUCKET_NAME_FOR_LOCALHOST: process.env.BUCKET_NAME_FOR_LOCALHOST,
    */
  },
  reactStrictMode: true,
  // eslint-disable-next-line no-unused-vars
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Important: return the modified config
    if (fakeS3) {
      // console.log({ defaultLoaders });
      const devAliases = {
        "Slib/s3": path.resolve(__dirname, "../slib/s3fs.js"),
        "Slib/s3.js": path.resolve(__dirname, "../slib/s3fs.js"),
        "slib/s3": path.resolve(__dirname, "../slib/s3fs.js"),
        "slib/s3.js": path.resolve(__dirname, "../slib/s3fs.js"),
        "../slib/s3": path.resolve(__dirname, "../slib/s3fs.js"),
        "../slib/s3.js": path.resolve(__dirname, "../slib/s3fs.js"),
      };
      // console.log({ devAliases });
      config.resolve.alias = { ...config.resolve.alias, ...devAliases };
    }
    return config;
  },
};
