const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

// const region = process.env.REGION;
const region = "us-east-1";
const bucketName =
  process.env.BUCKET_NAME_FOR_LOCALHOST || process.env.BUCKET_NAME;
const testVar = process.env.TEST_VAR;
const bucketParams = { Bucket: bucketName };
const prefix = "blog/";
const listParams = { ...bucketParams, Prefix: prefix };

const s3 = new S3Client({ region });

// https://serverless.pub/migrating-to-aws-sdk-v3/

const streamToString = function (stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(chunks.join("")));
  });
};

const getPost = async (id) => {
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return; // fail safe
  const key = `${prefix}${id}`;
  console.log({ key });
  const r = await s3.send(new GetObjectCommand({ ...bucketParams, Key: key }));
  return streamToString(r.Body);
};

const getPostKeys = async () => {
  console.log({ bucketName, testVar });
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return []; // fail safe
  const s3Response = await s3.send(new ListObjectsV2Command(listParams));
  return s3Response.Contents.map(({ Key }) => Key.slice(prefix.length)).sort();
};

export async function getStaticPaths() {
  const staticKeys = (await getPostKeys()).slice(0, 1); // just one
  console.log({ staticKeys });
  const paths = staticKeys.map((id) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  console.log({ post });
  return post ? { props: { post } } : { notFound: true };
}

export default function Post({ post }) {
  return <h1>{post}</h1>;
}
