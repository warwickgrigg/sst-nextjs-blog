import handle from "../slib/handle.js";
import postToDb from "../slib/postToDb.js";

export async function main(event) {
  const s3Record = event.Records[0].s3;
  // Grab the filename and bucket name
  const key = s3Record.object.key;
  const bucket = s3Record.bucket.name;
  const [r, err] = await handle(postToDb(bucket, key));
  if (err)
    throw new Error(`Cannot process ${key} from ${bucket} because ${err}`);
  const [item, written, updated, fetched, gotBegins] = r;
  console.log({ item, written, updated, fetched, gotBegins });
  return true;
}
