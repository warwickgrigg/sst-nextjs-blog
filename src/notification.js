import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { udb, sKey, keyExp } from "./lib/udb.js";

// https://serverless.pub/migrating-to-aws-sdk-v3/
// https://betterdev.blog/aws-javascript-sdk-v3-usage-problems-testing/

const region = process.env.REGION;
const ddbTable = process.env.TABLE_NAME;

const s3 = new S3Client({ region });

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
    // also, optionally, secondary indexes
    // gsi1: ["gsi1pk", "gsi1sk"],
    // gsi2: ["gsi2pk", "gsi2sk"],
  },
  entities: {
    // Keyed by entityType, a mandatory attribute in every item
    // Use sKey`string` for safe key interpolation: "#" > "\h", "\" > \\
    post: {
      calc: {
        // Calculate item attributes, eg keys, ttl etc
        pk: ({ postType }) => sKey`postType#${postType}`,
        sk: ({ id }) => sKey`seq#${seq(id)}#post#${id}#`,
      },
      // Denormalise the item via cascade function
      cascade: ({ postType, id, tags }) => [
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
        pk: ({ postType, tag }) => sKey`postType#${postType}#tag#${tag}`,
        sk: ({ id }) => sKey`seq#${seq(id)}#post#${id}#`,
      },
    },
  },
  queries: {
    // Key condition expressions generate queries in udb(schema).queries
    all: (data) => keyExp`#pk = ${data.pk}`,
    beginsWith: ({ pk, sk }) => keyExp`#pk = ${pk} AND begins_with(#sk, ${sk})`,
    between: ([{ pk, sk }, hi]) =>
      keyExp`#pk = ${pk} AND #sk BETWEEN ${sk} AND ${hi.sk}`,
    gsiBetween: ([{ gsi1pk, gsi1sk }, hi]) => ({
      ...keyExp`#gsi1pk = ${gsi1pk} AND #sk BETWEEN ${gsi1sk} AND ${hi.gsi1sk}`,
      IndexName: "gsi1",
    }),
  },
  scans: {
    // The scan condition expressions used in scans returned in udb(schema).scans
  },
  filters: {
    // Filter expressions returned unchanged in udb(schema).filters
  },
};

const db = udb(mySchema);
const q = db.queries;

console.log("udb prepped", q);

const fromMarkdown = (markdown) => {
  const unFlatObj = (obj) => {
    const result = {};
    Object.entries(obj).forEach(([keyPath, v]) => {
      const keys = keyPath.split(".");
      let r = result;
      keys.slice(0, -1).forEach((k) => {
        if (typeof r[k] !== "object") r[k] = {};
        r = r[k];
      });
      const key = keys[keys.length - 1];
      if (key.slice(-4) === "List")
        r[key.slice(0, -4)] = v.split(",").map((s) => s.trim());
      else r[key] = v;
    });
    return result;
  };
  const front = markdown.match(/---\n([\s\S]*?)\n---\n/m);
  if (!front) return { content: markdown };
  const vars = front[1].split("\n");
  const props = {};
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < vars.length; i++) {
    const [, key] = vars[i].match(/^(\S*?):/) || [];
    if (!key) return null; // invalid font matter
    const [, v] = vars[i].match(/:\s*(.*)$/) || [undefined, ""];
    props[key] = v;
  }
  return {
    ...unFlatObj(props),
    content: markdown.slice(front[0].length),
  };
};

async function processObject(bucket, key) {
  const entityType = "post";
  const content = await getObject(bucket, key);
  const [postType, objectName] = key.split("/").slice(-2);
  const id = objectName.split(".")[0];
  const info = key.slice(-3) === ".md" ? fromMarkdown(content) : {};
  const inferredTitle = objectName.slice(0, -3).replace(/-/g, " ");
  const { title = inferredTitle, heading = inferredTitle, tags } = info;

  const data = {
    entityType,
    postType,
    id,
    objectName: key,
    tags: tags.join(","),
    heading,
    title,
  };
  console.log({ data });
  const written = await db.put([data]);
  console.log({ written });

  return [data, written];
}

export async function main(event) {
  const s3Record = event.Records[0].s3;
  // Grab the filename and bucket name
  const key = s3Record.object.key;
  const bucket = s3Record.bucket.name;
  const [r, err] = await handle(processObject(bucket, key));
  if (err)
    throw new Error(`Cannot process ${key} from ${bucket} because ${err}`);
  const [data, written, updated, fetched, gotBegins] = r;
  console.log({ data, written, updated, fetched, gotBegins });
  return true;
}

/*
const updated = await db.put(written);
  const fetched = await db.get(data);
  const [gotBegins] = await q.beginsWith(data);
  console.log({ gotBegins });

  const [gotBetween] = await q.between([data, { ...data, id: "e" }]);

  console.log({ data, written, updated, fetched, gotBetween, gotBegins });
  const tagQuery = {
    entityType: "postTag",
    postType: "blog",
    tag: "mytag",
  };
  const [gotTagged] = await q.all(tagQuery);

  console.log({ gotTagged });
  const bRec = {
    entityType: "post",
    postType: "blog",
    id: "b.txt",
    tags: "mytag, othertag",
  };
  const deleted = await db.del(bRec);
  console.log({ deleted });

*/
