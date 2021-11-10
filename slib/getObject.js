import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// https://serverless.pub/migrating-to-aws-sdk-v3/
// https://betterdev.blog/aws-javascript-sdk-v3-usage-problems-testing/

const region = process.env.REGION;
const s3 = new S3Client({ region });

export default async function getObject(bucketName, key) {
  const chunks = []; //
  const bucketParams = { Bucket: bucketName };
  const r = await s3.send(new GetObjectCommand({ ...bucketParams, Key: key }));
  const stream = r.Body;
  return new Promise((resolve, reject) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(chunks.join("")));
  });
}
//
