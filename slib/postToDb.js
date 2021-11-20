import dbPromise from "../slib/db.js";
import fromMarkdown from "../slib/fromMarkdown.js";
import { getObject } from "@/slib/s3.js";
import handle from "../slib/handle.js";
import findRelatedPosts from "@/slib/findRelatedPosts.js";

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

  await new Promise((resolve) => setTimeout(resolve, 500));
  // console.log("getting related", { id });
  const related = await findRelatedPosts({ ...item, tags: info.tags });
  // eslint-disable-next-line no-unused-vars, no-shadow
  const strip = ({ tag, createdDate, heading, extension, _created, ...rest }) =>
    rest;

  // updateExpression`SET #relatedPosts = list_append(if_not_exists(#ri, ${[]}), ${[ "id1", "id2", ]})`;
  const relatedtoWrite = related.flatMap((relatedPost) => {
    const commonTags = relatedPost.commonTags.join(",");
    const attributes = { entityType: "relatedPost", commonTags };
    return [
      { ...strip(relatedPost), ...attributes, id, relatedId: relatedPost.id },
      { ...strip(item), ...attributes, id: relatedPost.id, relatedId: id },
    ];
  });

  item.relatedPosts = related.flatMap((relatedPost) =>
    JSON.stringify([relatedPost.id, relatedPost.title])
  );
  const { put } = await dbPromise;
  // if (relatedtoWrite.length) await db.put(relatedtoWrite);
  const [written, err] = await handle(put([...relatedtoWrite, item]));
  if (err) throw new Error(`Error putting item ${item} because ${err}`);

  return [item, written[0]];
}
