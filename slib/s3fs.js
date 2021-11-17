import { stat, readdir, readFile } from "fs/promises";
import { join, resolve } from "path";

console.log("s3fs.js loaded")

async function recursiveList(directoryPath) {
  const files = await readdir(directoryPath);
  const filePaths = [];
  for (const file of files) {
    const filePath = join(directoryPath, file);
    const info = await stat(filePath);
    if (info.isDirectory()) {
      const subFiles = await recursiveList(filePath);
      filePaths.push(...subFiles);
    } else {
      filePaths.push(filePath);
    }
  }
  return filePaths;
}

const s3fsPath = resolve(process.env.S3FS_PATH || "./content");

export async function listObjects(bucketName = "bucket", prefix) {
  const bucketPath = join(s3fsPath, bucketName);
  const prefixPath = join(bucketPath, prefix);
  const r = await recursiveList(prefixPath);
  return r.map((fPath) => fPath.slice(bucketPath.length + 1));
}

export async function getObject(bucketName, key) {
  const objectPath = join(s3fsPath, bucketName, key);
  return (await readFile(objectPath)).toString();
}
