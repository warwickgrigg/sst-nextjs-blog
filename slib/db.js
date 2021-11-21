import { udb, sKey /*, keyExp */ } from "../slib/udb.js";
import handle from "../slib/handle.js";

// Get process.env config

const fakeDynamoDB = process.env.FAKE_DDB; // convenience override
const [tableName, endpoint, accessKeyId, secretAccessKey] = fakeDynamoDB
  ? ["myTable", "http://localhost:4567", "fake", "fake"]
  : [process.env.TABLE_NAME];

const region = process.env.REGION || process.env.AWS_REGION || "eu-west-2";

// Always set REGION in Dynamo DB config props

const ddbProps = { REGION: region };

// Optionally set Dynamo DB config props

if (endpoint) ddbProps.endpoint = endpoint;

if (accessKeyId || secretAccessKey)
  ddbProps.credentials = { accessKeyId, secretAccessKey };

// Schema helper functions

const seq = (s) => ("00000" + (parseInt(s) || 0)).slice(-6);
const cascadePostTags = ({ postType, id, extension, title, tags }) =>
  tags.map((tag) => ({
    entityType: "postTag",
    postType,
    tag,
    title,
    id,
    extension,
  }));

// Schema

const mySchema = {
  ddbProps,
  table: tableName,
  indexes: {
    primaryIndex: ["pk", "sk"],
    // also, optionally, secondary indexes
    // gsi1: ["gsi1pk", "gsi1sk"],
    // gsi2: ["gsi2pk", "gsi2sk"],
  },
  entities: {
    // Keyed by entityType, a mandatory attribute in every item
    // Use sKey`string` for safe key interpolation: "#" > "\h", "\" > \\
    post: {
      calc: {
        // Calculate item attributes, eg keys, ttl etc
        pk: ({ postType }) => sKey`postType#${postType}`,
        sk: ({ id }) => sKey`seq#${seq(id)}#post#${id}#`,
      },
      // Denormalise the item via cascade function
      cascade: cascadePostTags,
    },
    // One postTag Item for each post's tag
    postTag: {
      calc: {
        pk: ({ postType, tag }) => sKey`postType#${postType}#tag#${tag}`,
        sk: ({ id }) => sKey`seq#${seq(id)}#post#${id}#`,
      },
    },
    // One relatedPost Item for each ordered pair of posts related by tag(s)
    relatedPost: {
      calc: {
        pk: ({ postType }) => sKey`relatedPost#${postType}`,
        sk: ({ id, relatedId }) =>
          sKey`seq#${seq(id)}#post#${id}#` +
          sKey`seq#${seq(relatedId)}#post#${relatedId}#`,
      },
    },
  },
  /*
  conditions: {
    // returned in udb(schema).conditions enriched with calc attributes (eg pk/sk etc)
    all: (data) => keyExp`#pk = ${data.pk}`,
    first10: (data) => ({ ...keyExp`#pk = ${data.pk}`, Limit: 10 }),
    beginsWith: ({ pk, sk }) => keyExp`#pk = ${pk} AND begins_with(#sk, ${sk})`,
    between: ([{ pk, sk }, hi]) =>
      keyExp`#pk = ${pk} AND #sk BETWEEN ${sk} AND ${hi.sk}`,
    gsiBetween: ([{ gsi1pk, gsi1sk }, hi]) => ({
      ...keyExp`#gsi1pk = ${gsi1pk} AND #sk BETWEEN ${gsi1sk} AND ${hi.gsi1sk}`,
      IndexName: "gsi1",
    }),
  },
  */
};

const initDb = async () => {
  // May need to create the table for fake db. Always return a Promise
  const d = udb(mySchema);
  if (fakeDynamoDB) {
    // eslint-disable-next-line no-unused-vars
    const { credentials, ...reportableProps } = ddbProps;
    console.log("Initialising fake DynamoDB", reportableProps);
    const err = await handle(d.create())[1];
    if (err && err.code === "ResourceInUseException") return d; // it's ready
    if (err) throw new Error(`Cannot open fake DynamoDB because ${err}`);
    await new Promise((resolve) => setTimeout(resolve, 600)); // await creation
  }
  return d;
};

const dbPromise = initDb();

export default dbPromise;
