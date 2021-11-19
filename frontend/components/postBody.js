import Markdown from "markdown-to-jsx";
//import { joinIfArray } from "../lib/utils";
// import Picture from "./picture";

// import { staticAssetServerUrl, assetPath } from "db/config.json";

const [staticAssetServerUrl, assetPath] = ["", ""];
// eslint-disable-next-line no-unused-vars
const Picture = ({ children }) => <></>;

const PostBody = ({ heading, createdDate, writtenBy, img, content }) => (
  <>
    <h1> {heading} </h1>

    <div className="flex justified">
      <p>{createdDate}</p>
      {!!writtenBy && <p>by {writtenBy}</p>}
    </div>
    {!!img && (
      <Picture
        src={`${staticAssetServerUrl}${assetPath}blog/${img.id}.jpg`}
        alt={img.alt}
      />
    )}
    <br />
    {/* eslint-disable-next-line react/no-children-prop */}
    <Markdown children={content} />
  </>
);

export default PostBody;
