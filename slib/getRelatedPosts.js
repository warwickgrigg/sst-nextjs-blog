import db from "@/slib/db.js";
import { filterExp } from "@/slib/udb.js";
import handle from "@/slib/handle.js";

export default async function getRelatedPosts({ id, postType, tags }) {
  if (!tags) return [];
  const rangeDef = { Limit: 10, ScanIndexForward: false };
  const entityType = "postTag";
  const filter = filterExp`#id<${id}`;
  // console.log({ filter });
  const { conditions, query } = await db;
  const byTag = await Promise.all(
    tags.map(async (tag) => {
      const allExp = conditions.all({ entityType, postType, tag: tag.trim() });
      // const qparams = { ...deepMerge(allExp, filter), ...rangeDef };
      // console.log({ allExp, filter, rangeDef });
      const [r, err] = await handle(query(allExp, filter, rangeDef));
      if (err)
        throw new Error(`Could not getRelatedPosts for ${id}, because ${err}`);
      // console.log({ r });
      return r[0];
    })
  );
  // console.log({ byTag });
  const byPost = byTag.flat().reduce((a, c) => {
    if (!a[c.id]) a[c.id] = { ...c, commonTags: [c.tag] };
    else a[c.id].commonTags.push(c.tag);
    return a;
  }, {});
  return Object.values(byPost);
}
