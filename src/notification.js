const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// const region = process.env.REGION;
const region = "us-east-1";

// https://serverless.pub/migrating-to-aws-sdk-v3/

const s3 = new S3Client({ region });

const ddbTable = "testa-nextjs-blog-Blog";

// Create an Amazon DynamoDB service client object.
const ddb = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddb);

// const prefix = "blog/";
// const listParams = { ...bucketParams, Prefix: prefix };

const handle = (promise) =>
  promise
    .then((data) => [data, undefined])
    .catch((error) => Promise.resolve([undefined, error]));

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

const udbFactory = (schema) => {
  const udb = {
    table: "", // placeholder
    keys: ["pk", "sk"], // default
    timestamps: ["_created", "_modified"], // default
    entities: {
      // examples
      user: {
        index: {
          // eslint-disable-next-line no-unused-vars
          pk: (data) => `User`,
          sk: ({ username }) => username,
        },
        items: (data) => [data, { ...data, entityType: "userEmail" }],
      },
      userEmail: {
        index: {
          // eslint-disable-next-line no-unused-vars
          pk: (data) => `UserEmail`,
          sk: ({ email }) => email,
        },
        //items not needed
      },
    },
    ...schema,
  };

  udb.getKeys = (data) => {
    const indexTuples = Object.entries(udb.entities[data.entityType].index);
    return Object.fromEntries(indexTuples.map(([k, f]) => [k, f(data)]));
  };

  udb.dbPut = async (data) => {
    const params = { TableName: udb.table };
    const [ctd, mod] = udb.timestamps;
    const created = data[ctd];
    const timeStamp = { [created ? mod : ctd]: Date.now() };
    const itemsFn = udb.entities[data.entityType].items;
    const items = itemsFn ? itemsFn(data) : [data];
    const bodies = items.map((item) => ({
      ...item,
      [ctd]: created, // propagate to all related items
      ...timeStamp,
    }));
    await Promise.all(
      bodies.map((body) => {
        const Item = { ...udb.getKeys(body), ...body };
        return docClient.send(new PutCommand({ ...params, Item }));
      })
    );
    return bodies[0];
  };

  udb.dbGet = async (data) => {
    const keys = udb.getKeys(data);
    const params = { TableName: udb.table, Key: keys };
    const got = (await docClient.send(new GetCommand(params))).Item;
    const indexes = Object.keys(udb.entities[data.entityType].index);
    const tuples = Object.entries(got).filter(([k]) => !indexes.includes(k));
    return Object.fromEntries(tuples);
  };

  udb.dbGetAll = async (data) => {
    const indexes = udb.entities[data.entityType].index;
    const params = {
      TableName: udb.table,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": indexes.pk(data) },
    };
    const got = (await docClient.send(new QueryCommand(params))).Items;
    return got.map((item) => {
      const tuples = Object.entries(item).filter(([k]) => !indexes[k]);
      return Object.fromEntries(tuples);
    });
  };

  return udb;
};

const mySchema = {
  table: ddbTable,
  keys: ["pk", "sk"],
  timestamps: ["_created", "_modified"],
  entities: {
    post: {
      index: {
        pk: ({ postType, tag }) => `postType#${postType}#tag#${tag}`,
        sk: ({ key }) => `era#${isNaN(key[0]) ? 0 : 1}#post#${key}`,
      },
      items: ({ postType, key, ...data }) => [
        { postType, key, ...data },
        ...(!data.tags
          ? []
          : data.tags.split(",").map((tag) => ({
              entityType: "postTag",
              postType,
              tag: tag.trim(),
              key,
            }))),
      ],
    },
    postTag: {
      index: {
        pk: ({ postType }) => `postType#${postType}`,
        sk: ({ key }) => `era#${isNaN(key[0]) ? 0 : 1}#post#${key}`,
      },
    },
  },
};

const udb = udbFactory(mySchema);

async function processObject(bucket, key) {
  const content = await getObject(bucket, key);
  const data = {
    entityType: "post",
    postType: "blog",
    key,
    tags: "mytag",
    content,
  };
  const put = await udb.dbPut(data);
  const updated = await udb.dbPut(put);
  const fetched = await udb.dbGet(data);
  const gotAll = await udb.dbGetAll(data);
  return [data, put, updated, fetched, gotAll];
}

export async function main(event) {
  const s3Record = event.Records[0].s3;
  // Grab the filename and bucket name
  const key = s3Record.object.key;
  const bucket = s3Record.bucket.name;
  const [r, err] = await handle(processObject(bucket, key));
  if (err)
    throw new Error(`Cannot process ${key} from ${bucket} because ${err}`);
  const [data, put, updated, fetched, gotAll] = r;
  console.log({ data, put, updated, fetched, gotAll });
  return true;
}
