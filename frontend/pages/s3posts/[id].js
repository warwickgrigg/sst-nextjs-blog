import Markdown from "markdown-to-jsx";
import db from "@/slib/db.js";
// import { filterExp } from "@/slib/udb.js";
import fromMarkdown from "@/slib/fromMarkdown.js";
import { getObject } from "slib/s3.js"; // can't get Slib/s3.js to alias
import handle from "@/slib/handle.js";
import getRelatedPosts from "@/slib/getRelatedPosts.js";

const postDef = { entityType: "post", postType: "blog" };
const prefix = `${postDef.postType}/`;

const getPostRefs = async () => {
  const { conditions: c, query } = await db;
  const end10Exp = { ...c.all(postDef), Limit: 10, ScanIndexForward: false };
  return query(end10Exp);
};

const getPost = async (id) => {
  const testVar = process.env.TEST_VAR;
  const bucketName =
    process.env.BUCKET_NAME_FOR_LOCALHOST || process.env.BUCKET_NAME;
  const objectName = `${prefix}${id}.md`;
  console.log({ bucketName, objectName, testVar });
  if (!bucketName || bucketName.slice(0, 3) === "{{ ") return; // fail safe
  const md = await getObject(bucketName, objectName);
  const post = fromMarkdown(md);
  console.log({
    related: await getRelatedPosts({ ...post, postType: "blog" }),
  });
  return post;
};

export async function getStaticPaths() {
  const [r, err] = await handle(getPostRefs());

  if (err) throw new Error(`Could not get post paths because ${err}`);
  const [refs] = r;
  const paths = refs.slice(0, 10).map(({ id }) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  return post ? { props: post } : { notFound: true };
}

// eslint-disable-next-line no-unused-vars
const Post = ({ heading, createdDate, writtenBy, img, content }) => (
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
