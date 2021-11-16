import dbPromise from "../slib/db.js";
import fromMarkdown from "../slib/fromMarkdown.js";
import { getObject } from "@/slib/s3.js";
import handle from "../slib/handle.js";

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
  const db = await dbPromise;
  const [written, err] = await handle(db.put([item]));
  if (err) throw new Error(`Error putting item ${item} because ${err}`);
  return [item, written[0]];
}
