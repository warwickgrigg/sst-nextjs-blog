import React from "react";
import Head from "next/head";
// import Layout from "./layout";
import PostBody from "./postBody";
import PostLinks from "./postLinks";

const Layout = ({ children }) => <div>{children}</div>;

const Post = ({ recentPosts, relatedPosts, head, ...post }) => {
  console.log({ post });
  return (
    <Layout>
      {!!head && (
        <Head>
          <title>{head.title}</title>
          {Object.entries(head.meta).map(([property, content]) => (
            <meta {...{ property, content }} key={property} />
          ))}
        </Head>
      )}
      <div className="flex row justified container padded">
        <div
          className="flex column"
          key="article"
          style={{ flex: "1 1 30rem" }}
        >
          <PostBody {...post} />
        </div>
        <div
          className="flex column"
          key="tags"
          style={{ flex: "0 1 20rem", marginLeft: "3em" }}
        >
          <PostLinks {...{ recentPosts, relatedPosts }} />
        </div>
      </div>
    </Layout>
  );
};

export default Post;
