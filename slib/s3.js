import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

// https://serverless.pub/migrating-to-aws-sdk-v3/
// https://betterdev.blog/aws-javascript-sdk-v3-usage-problems-testing/

const region = process.env.REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const endpoint = process.env.S3_ENDPOINT; // 'http://localhost:4568' for fake S3rver
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE;

const s3Props = { region };
if (accessKeyId || secretAccessKey)
  s3Props.credentials = { accessKeyId, secretAccessKey };
if (endpoint) s3Props.endpoint = endpoint;
if (forcePathStyle) s3Props.forcePathStyle = forcePathStyle;

const s3 = new S3Client(s3Props);

export async function listObjects(bucketName, prefix) {
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return []; // fail safe
  const listParams = { Bucket: bucketName, Prefix: prefix };
  return s3.send(new ListObjectsV2Command(listParams));
}
export async function getObject(bucketName, key) {
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
