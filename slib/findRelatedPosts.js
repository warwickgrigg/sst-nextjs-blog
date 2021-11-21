import db from "@/slib/db.js";
import { limit, keyExp } from "@/slib/udb.js";
import handle from "@/slib/handle.js";

// const pipe = (...fns) => (x) => fns.reduce((v, f) => f(v), x);

const maxPostsPerTag = 5;

export default async function findRelatedPosts({ id, postType, tags = [] }) {
  if (!tags.length) return [];
  const { getKeys, query } = await db;

  // For each tag query for related posts preceding this post

  const byTag = await Promise.all(
    tags.map(async (tag) => {
      const { pk, sk } = getKeys({ entityType: "postTag", postType, tag, id });
      // const condition = keyExp`#pk = ${pk} AND #sk <> ${sk}`; // inc. future
      const condition = keyExp`#pk = ${pk} AND #sk < ${sk}`;
      const [r, err] = await handle(query(condition, limit(-maxPostsPerTag)));
      if (err)
        throw new Error(
          `Could not findRelatedPosts tagged ${tag} for ${id}, because ${err}`
        );
      return r[0];
    })
  );
  // console.log({ byTag });

  // Flatten, combine by post and sort by descending number of ftags in common

  const byPost = byTag.flat().reduce((a, c) => {
    if (!a[c.id]) a[c.id] = { ...c, tags: [c.tag] };
    else a[c.id].tags.push(c.tag);
    return a;
  }, {});

  // eslint-disable-next-line no-shadow
  const r = Object.values(byPost).sort(({ tags }) => -tags.length);
  return r;
}
