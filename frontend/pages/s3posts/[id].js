import Markdown from "markdown-to-jsx";
import db from "@/slib/db.js";
import fromMarkdown from "@/slib/fromMarkdown.js";
import { getObject } from "@/slib/s3.js";
import handle from "@/slib/handle.js";

const bucketName =
  process.env.BUCKET_NAME_FOR_LOCALHOST || process.env.BUCKET_NAME;
const testVar = process.env.TEST_VAR;

const entityType = "post";
const postType = "blog";
const prefix = `${postType}/`;

const getPostRefs = async () => {
  const { conditions: c, query } = db;
  return query(c.first10({ entityType, postType }));
};

const getPost = async (id) => {
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return; // fail safe
  const object = await getObject(bucketName, `${prefix}${id}.md`);
  console.log({ object, markdown: fromMarkdown(object) });
  return fromMarkdown(object);
};

export async function getStaticPaths() {
  const [r, err] = await handle(getPostRefs());

  if (err) throw new Error(`Could not get post paths because ${err}`);
  const [refs] = r;
  const paths = refs.slice(0, 1).map(({ id }) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  console.log({ bucketName, testVar, post });
  return post ? { props: post } : { notFound: true };
}

// eslint-disable-next-line no-unused-vars
const Post = ({ heading, createdDate, writtenBy, img, content }) => (
  <>
    <h1> {heading} </h1>

    <div className="flex justified">
      <p>{createdDate}</p>
      {!!writtenBy && <p>by {writtenBy}</p>}
    </div>
    {/* !!img && (
      <Picture
        src={`${staticAssetServerUrl}${assetPath}blog/${img.id}.jpg`}
        alt={img.alt}
      />
    ) */}
    <br />
    {/* eslint-disable-next-line react/no-children-prop */}
    <Markdown children={content || ""} />
  </>
);

export default Post;

/*

// const prefix = "blog/";
// const listParams = { ...bucketParams, Prefix: prefix };

const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const region = process.env.REGION;

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

const getPostRefs = async () => {
  console.log({ bucketName, testVar });
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return []; // fail safe
  const s3Response = await s3.send(new ListObjectsV2Command(listParams));
  return s3Response.Contents.map(({ Key }) => Key.slice(prefix.length)).sort();
};

export async function getStaticPaths() {
  const staticKeys = (await getPostRefs()).slice(0, 1); // just one
  console.log({ staticKeys });
  const paths = staticKeys.map((id) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  console.log({ bucketName, testVar, post });
  return post ? { props: { post } } : { notFound: true };
}

export default function Post({ post }) {
  return <h1>{post}</h1>;
}
*/
