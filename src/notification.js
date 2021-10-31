const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");

import udb from "./lib/udb.js";

// const region = process.env.REGION;
const region = "us-east-1";

// https://serverless.pub/migrating-to-aws-sdk-v3/

const s3 = new S3Client({ region });

const ddbTable = "testa-nextjs-blog-Blog";

const getObject = async (bucketName, key) => {
  const chunks = [];
  const bucketParams = { Bucket: bucketName };
  const r = await s3.send(new GetObjectCommand({ ...bucketParams, Key: key }));
  const stream = r.Body;
  return new Promise((resolve, reject) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(chunks.join("")));
  });
};

// const prefix = "blog/";
// const listParams = { ...bucketParams, Prefix: prefix };

const handle = (promise) =>
  promise
    .then((data) => [data, undefined])
    .catch((error) => Promise.resolve([undefined, error]));

const seq = (s) => ("00000" + (parseInt(s) || 0)).slice(-6);

const mySchema = {
  region,
  table: ddbTable,
  indexes: {
    primaryIndex: ["pk", "sk"],
    // gsi1: ["gsi1pk", "gsi1sk"],
    // gsi2: ["gsi2pk", "gsi2sk"],
  },
  entities: {
    post: {
      calc: {
        pk: ({ postType }) => `postType#${postType}`,
        sk: ({ id }) => `seq#${seq(id)}#post#${id}`,
      },
      transform: ({ postType, id, tags, ...data }) => [
        { postType, id, ...data, tags },
        ...(!tags
          ? []
          : tags.split(",").map((tag) => ({
              entityType: "postTag",
              postType,
              tag: tag.trim(),
              tags,
              id,
            }))),
      ],
    },
    postTag: {
      calc: {
        pk: ({ postType, tag }) => `postType#${postType}#tag#${tag}`,
        sk: ({ id }) => `seq#${seq(id)}#post#${id}`,
      },
    },
  },
  queries: {},
};

const db = udb(mySchema);

async function processObject(bucket, key) {
  const content = await getObject(bucket, key);
  const data = {
    entityType: "post",
    postType: "blog",
    id: key,
    tags: "mytag, othertag",
    title: content,
  };
  const written = await db.put(data);
  const updated = await db.put(written);
  const fetched = await db.get(data);
  const qParams = {
    TableName: ddbTable,
    ...db.qAll(data),
  };
  console.log({ qParams });
  const gotAll = await db.query(qParams);
  const tagQuery = {
    entityType: "postTag",
    postType: "blog",
    tag: "mytag",
  };
  const tagParams = db.qAll(tagQuery);
  console.log({ tagParams });
  const gotTagged = await db.query({ TableName: ddbTable, ...tagParams });
  console.log({ gotTagged });
  const bRec = {
    entityType: "post",
    postType: "blog",
    id: "b.txt",
    tags: "mytag, othertag",
  };
  await db.del(bRec);
  //const keys = db.getKeys(bRec);

  return [data, written, updated, fetched, gotAll];
}

export async function main(event) {
  const s3Record = event.Records[0].s3;
  // Grab the filename and bucket name
  const key = s3Record.object.key;
  const bucket = s3Record.bucket.name;
  const [r, err] = await handle(processObject(bucket, key));
  if (err)
    throw new Error(`Cannot process ${key} from ${bucket} because ${err}`);
  const [data, written, updated, fetched, gotAll] = r;
  console.log({ data, written, updated, fetched, gotAll });
  return true;
}
