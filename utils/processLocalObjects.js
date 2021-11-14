import { getObject, listObjects } from "@/slib/s3.js";
import postToDb from "@/slib/postToDb.js";

(async () => {
  // const files = await recursiveList("./blog/");
  const bucketName = "bucket";
  const prefix = "blog/";
  const list = await listObjects(bucketName, prefix);
  const objects = await Promise.all(list.map((o) => getObject(bucketName, o)));
  console.log({ list, objects });
  await Promise.all(list.map((o) => postToDb(bucketName, o)));
})();
