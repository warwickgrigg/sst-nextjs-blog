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
  const [written, err] = await handle(
    Promise.all(list.map((o) => postToDb(bucketName, o)))
  );
  if (err) console.log(`Error ${err}`);
  console.log(JSON.stringify(written, null, 2));

  const item = { entityType: "post", postType: "blog" };
  const [gotBetween] = await db.query(
    db.conditions.between([
      { ...item, id: "b" },
      { ...item, id: "311" },
    ])
  );

  console.log({ gotBetween });
})();
