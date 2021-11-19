import db from "@/slib/db.js";
import { /* filterExp, */ limit, keyExp } from "@/slib/udb.js";
import handle from "@/slib/handle.js";

// const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

export default async function findRelatedPosts({ id, postType, tags = [] }) {
  if (!tags) return [];
  const { /* conditions,  prep, */ getKeys, query } = await db;
  const byTag = await Promise.all(
    tags.map(async (tag) => {
      //const keySpec = { entityType: "postTag", postType, id, tag };
      const { pk, sk } = getKeys({ entityType: "postTag", postType, id, tag });
      const condition = keyExp`#pk = ${pk} AND #sk < ${sk}`;
      const [r, err] = await handle(query(condition, limit(-10)));
      if (err)
        throw new Error(
          `Could not findRelatedPosts tagged ${tag} for ${id}, because ${err}`
        );
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
