import { udb, sKey, keyExp } from "../slib/udb.js";

const ddbTable = process.env.TABLE_NAME;
const region = process.env.REGION;

const seq = (s) => ("00000" + (parseInt(s) || 0)).slice(-6);

const mySchema = {
  region,
  table: ddbTable,
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
  queries: {
    // Key condition expressions generate queries in udb(schema).queries
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
  scans: {
    // The scan condition expressions used in scans returned in udb(schema).scans
  },
  filters: {
    // Filter expressions returned unchanged in udb(schema).filters
  },
};

const db = udb(mySchema);

export default db;
