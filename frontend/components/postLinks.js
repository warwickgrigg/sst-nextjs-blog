// import Lnk from "./lnk";
const Lnk = ({ childen }) => <div>{children}</div>;

const PostLinks = ({ recentPosts, relatedPosts }) => (
  <>
    <h1>Blog posts</h1>
    {[
      ["Recent posts", recentPosts],
      ["Related posts", relatedPosts],
    ].map(
      ([heading, links], key) =>
        !!(links && links.length) && (
          <div key={key}>
            <h2>{heading}</h2>
            {
              // eslint-disable-next-line no-shadow
              links.map(({ title, id }, key) => (
                <p key={key}>
                  <Lnk link={`/about/blog/${id}`}> {title} </Lnk>
                </p>
              ))
            }
          </div>
        )
    )}
  </>
);

export default PostLinks;
