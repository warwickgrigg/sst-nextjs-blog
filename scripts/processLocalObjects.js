import { /* getObject, */ listObjects } from "@/slib/s3.js";
// import dbPromise from "@/slib/db.js";
import dbPromise from "../slib/db.js";
import postToDb from "@/slib/postToDb.js";
import handle from "@/slib/handle.js";

(async () => {
  //const db = await dbPromise;
  const db = await dbPromise;
  const bucketName = "bucket";
  const entityType = "post";
  const postType = "blog";
  const prefix = `${postType}/`;
  const list = await listObjects(bucketName, prefix);
  // const objects = await Promise.all(list.map((o) => getObject(bucketName, o)));
  // console.log({ list, objects });
  /*
  await Promise.all(
    list.map(async (o) => {
      const [data, objErr] = await handle(postToDb(bucketName, o));
      if (objErr)
        throw new Error(`Cannot process object ${o} because ${objErr}`);
      return data;
    })
  );
  */
  const sortedList = list.sort((v1, v2) => {
    const sortKey = (key) => {
      const [objectName] = key.split("/").slice(-1);
      const id = objectName.split(".").slice(0, -1).join(".");
      const { sk } = db.getKeys({ entityType, postType, id });
      return sk;
    };
    const [a, b] = [sortKey(v1), sortKey(v2)];
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  for (const item of sortedList) {
    const [, err] = await handle(postToDb(bucketName, item));
    if (err) throw new Error(`Cannot process object ${item} because ${err}`);
  }
  console.log("Done");
})();
