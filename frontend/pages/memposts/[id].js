const getPosts = async () => ({
  "a.txt": "a is the first letter",
  "b.txt": "b is the second letter",
  "c.txt": "c is the third letter",
});

const staticPaths = ["a.txt"];

const getPost = async (id) => (await getPosts())[id];

export async function getStaticPaths() {
  const paths = (await staticPaths).map((id) => ({ params: { id } }));
  return { paths, fallback: "blocking" };
}

export async function getStaticProps({ params }) {
  const post = await getPost(params.id);
  return post ? { props: { post } } : { notFound: true };
}

export default function Post({ post }) {
  return <h1>{post}</h1>;
}
