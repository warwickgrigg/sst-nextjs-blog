import { udb, sKey, keyExp } from "../slib/udb.js";
// import handle from "../slib/handle.js";

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

console.log({ ddbProps });

// Main

const seq = (s) => ("00000" + (parseInt(s) || 0)).slice(-6);

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
      cascade: ({ postType, id, extension, title, tags }) => [
        ...(!tags
          ? []
          : tags.split(",").map((tag) => ({
              entityType: "postTag",
              postType,
              tag: tag.trim(),
              tags,
              title,
              id,
              extension,
            }))),
      ],
    },
    postTag: {
      calc: {
        pk: ({ postType, tag }) => sKey`postType#${postType}#tag#${tag}`,
        sk: ({ id }) => sKey`seq#${seq(id)}#post#${id}#`,
      },
    },
  },
  conditions: {
    // returned in udb(schema).conditions enriched with calc attributes (eg pk/sk etc)
    all: (data) => keyExp`#pk = ${data.pk}`,
    first10: (data) => ({ ...keyExp`#pk = ${data.pk}`, Limit: 10 }),
    end10: (data) => ({
      ...keyExp`#pk = ${data.pk}`,
      ScanIndexForward: false,
      Limit: 10,
    }),
    beginsWith: ({ pk, sk }) => keyExp`#pk = ${pk} AND begins_with(#sk, ${sk})`,
    between: ([{ pk, sk }, hi]) =>
      keyExp`#pk = ${pk} AND #sk BETWEEN ${sk} AND ${hi.sk}`,
    gsiBetween: ([{ gsi1pk, gsi1sk }, hi]) => ({
      ...keyExp`#gsi1pk = ${gsi1pk} AND #sk BETWEEN ${gsi1sk} AND ${hi.gsi1sk}`,
      IndexName: "gsi1",
    }),
  },
};

const initDb = async () => {
  // May need to create the table for fake db. Always return a Promise
  const d = udb(mySchema);
  if (fakeDynamoDB) {
    console.log("Initialising Fake DynamoDB");
    d.create().catch((e) => console.log(`Fake DynamoDB warning ${e}`));
    // await 1000ms to allow table to be created
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return d;
};

const dbPromise = initDb();

export default dbPromise;
