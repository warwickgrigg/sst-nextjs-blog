import Markdown from "markdown-to-jsx";
import db from "@/slib/db.js";
import { keyExp, limit, filterExp } from "@/slib/udb.js";
import fromMarkdown from "@/slib/fromMarkdown.js";
import { getObject } from "slib/s3.js"; // can't get Slib/s3.js to alias
import handle from "@/slib/handle.js";
import Post from "../../components/post.js";
// import getRelatedPosts from "@/slib/getRelatedPosts.js";

const postType = "blog";

const getRelatedPosts = async (id) => {
  const { getKeys, query } = await db;
  const entityType = "relatedPost";
  const { pk, sk } = getKeys({ entityType, postType, id, relatedId: "" });
  const skStart = sk.split("#").slice(0, 5).join("#");
  const condition = keyExp`#pk = ${pk} AND begins_with(#sk, ${skStart})`;
  const ProjectionExpression = "title, relatedId";
  return query(condition, /* ProjectionExpression, */ limit(-10));
};

const getRecentPosts = async (excludeId) => {
  const { getKeys, query } = await db;
  const filter = excludeId === undefined ? {} : filterExp`id<>${excludeId}`;
  const { pk } = getKeys({ entityType: "post", filter, postType });
  return query(keyExp`#pk = ${pk}`, limit(-10));
};

const getPost = async (id) => {
  const testVar = process.env.TEST_VAR;
  const bucketName =
    process.env.BUCKET_NAME_FOR_LOCALHOST || process.env.BUCKET_NAME;
  const objectName = `${postType}/${id}.md`;
  console.log({ bucketName, objectName, testVar });
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return; // fail safe
  const md = await getObject(bucketName, objectName);
  const post = fromMarkdown(md);
  return post;
};

export async function getStaticPaths() {
  const [r, err] = await handle(getRecentPosts());
  if (err) throw new Error(`Could not get post paths because ${err}`);
  const paths = r[0].map(({ id }) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params: { id } }) {
  const [r, err] = await handle(
    Promise.all([getPost(id), getRelatedPosts(id), getRecentPosts(id)])
  );
  if (err) {
    console.error(`Could not get post info because ${err}`);
    return { notFound: true };
  }
  const [post, [related], [recentPosts]] = r;

  const relatedPosts = related.map((item) => ({
    id: item.relatedId,
    title: item.title,
  }));

  return post
    ? { props: { ...post, relatedPosts, recentPosts } }
    : { notFound: true };
}

export default Post;
