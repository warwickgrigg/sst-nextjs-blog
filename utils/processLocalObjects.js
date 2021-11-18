import { /* getObject, */ listObjects } from "@/slib/s3.js";
import dbPromise from "@/slib/db.js";
import postToDb from "@/slib/postToDb.js";
import handle from "@/slib/handle.js";

(async () => {
  const db = await dbPromise;
  const bucketName = "bucket";
  const prefix = "blog/";
  const list = await listObjects(bucketName, prefix);
  // const objects = await Promise.all(list.map((o) => getObject(bucketName, o)));
  // console.log({ list, objects });
  return Promise.all(
    list.map(async (o) => {
      const [data, objErr] = await handle(postToDb(bucketName, o));
      if (objErr)
        throw new Error(`Cannot process object ${o} because ${objErr}`);
      return data;
    })
  );
})();
