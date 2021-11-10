import db from "../slib/db.js";
import fromMarkdown from "../slib/fromMarkdown.js";
import getObject from "../slib/getObject.js";

const { queries: q, query } = db;
console.log("udb prepped", q);
//
// const prefix = "blog/";
// const listParams = { ...bucketParams, Prefix: prefix };

export default async function postToDb(bucket, key) {
  const content = await getObject(bucket, key);

  const keyPath = key.split("/").slice(0, -1).join("/");
  const objectName = key.split("/").slice(-1).join("/");

  const id = objectName.split(".").slice(0, -1).join(".");
  const extension = objectName.split(".").slice(-1)[0];

  const entityType = "post";
  const postType = keyPath || "blog";
  const info = extension === "md" ? fromMarkdown(content) : {};
  const idTitle = info.title || id.replace(/^[0-9]+-/, "").replace(/-/g, " ");
  const { title = idTitle, heading = idTitle, createdDate } = info;
  const tags = (info.tags || []).join(",");
  const item = { entityType, postType, id, extension, title, heading, tags };
  if (createdDate)
    item.createdDate = new Date(Date.parse(createdDate)).toISOString();

  const written = await db.put([item]);

  const [gotBetween] = await query(q.between([item, { ...item, id: "e" }]));

  console.log({ item, gotBetween });

  return [item, written];
}

/*

// eslint-disable-next-line no-unused-vars


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
