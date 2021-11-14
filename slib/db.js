import { udb, sKey, keyExp } from "../slib/udb.js";

const isFakeDynamoDB = process.env.IS_FAKE_DDB;
const [tableName, region, accessKeyId, secretAccessKey, endpoint] =
  isFakeDynamoDB
    ? ["myTable", "eu-west-2", "fake", "fake", "http://localhost:4567"]
    : [
        process.env.TABLE_NAME,
        process.env.REGION,
        process.env.AWS_ACCESS_KEY_ID,
        process.env.AWS_SECRET_ACCESS_KEY,
        process.env.DDB_ENDPOINT,
      ];

const ddbProps = { REGION: region };

if (endpoint) ddbProps.endpoint = endpoint;

if (accessKeyId || secretAccessKey)
  ddbProps.credentials = { accessKeyId, secretAccessKey };

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
      cascade: ({ postType, id, extension, tags }) => [
        ...(!tags
          ? []
          : tags.split(",").map((tag) => ({
              entityType: "postTag",
              postType,
              tag: tag.trim(),
              tags,
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
    beginsWith: ({ pk, sk }) => keyExp`#pk = ${pk} AND begins_with(#sk, ${sk})`,
    between: ([{ pk, sk }, hi]) =>
      keyExp`#pk = ${pk} AND #sk BETWEEN ${sk} AND ${hi.sk}`,
    gsiBetween: ([{ gsi1pk, gsi1sk }, hi]) => ({
      ...keyExp`#gsi1pk = ${gsi1pk} AND #sk BETWEEN ${gsi1sk} AND ${hi.gsi1sk}`,
      IndexName: "gsi1",
    }),
  },
};

const db = async () => {
  const d = udb(mySchema);
  if (isFakeDynamoDB) await d.create().catch();
  return d;
};

export default db();
