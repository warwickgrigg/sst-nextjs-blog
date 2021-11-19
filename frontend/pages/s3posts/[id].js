import Markdown from "markdown-to-jsx";
import db from "@/slib/db.js";
import { keyExp, limit /*, filterExp*/ } from "@/slib/udb.js";
import fromMarkdown from "@/slib/fromMarkdown.js";
import { getObject } from "slib/s3.js"; // can't get Slib/s3.js to alias
import handle from "@/slib/handle.js";
// import getRelatedPosts from "@/slib/getRelatedPosts.js";

const postType = "blog";

const getRelatedPosts = async ({ id }) => {
  const { getKeys, query } = await db;
  const entityType = "relatedPost";
  const { pk, sk } = getKeys({ entityType, postType, id, relatedId: "" });
  const condition = keyExp`#pk = ${pk} AND #sk begins_with ${sk.slice(0, -1)}`;
  const ProjectionExpression = "title, relatedId";
  return query(condition, ProjectionExpression, limit(-10));
};

const getRecentPosts = async () => {
  const { getKeys, query } = await db;
  const { pk } = getKeys({ entityType: "post", postType });
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
  const [refs] = r;
  const paths = refs.slice(0, 10).map(({ id }) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  const [related = []] = await getRelatedPosts(post);
  return post ? { props: { post, relatedPosts } } : { notFound: true };
}

// eslint-disable-next-line no-unused-vars
const PostBody = ({ heading, createdDate, writtenBy, img, content }) => (
  <>
    <h1> {heading} </h1>

    <div className="flex justified">
      <p>{createdDate}</p>
      {!!writtenBy && <p>by {writtenBy}</p>}
    </div>
    {/* !!img && (
      <Picture
        src={`${staticAssetServerUrl}${assetPath}blog/${img.id}.jpg`}
        alt={img.alt}
      />
    ) */}
    <br />
    {/* eslint-disable-next-line react/no-children-prop */}
    <Markdown children={content || ""} />
  </>
);

export default Post;
