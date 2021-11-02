// Minimal dynamodb helper library for single tabel design

// See https://www.serverlesslife.com/DynamoDB_Design_Patterns_for_Single_Table_Design.html

/*
   Example schema

const schema = {
  region,
  table: "", // placeholder - table name
  indexes: [["pk", "sk"],], // default - could also include [gsk1pk, gsk2sk] etc
  timestamps: ["_created", "_modified"], // default
  entities: {
    // examples
    user: {
      calc: {
        pk: ({ entityType }) => `${entityType}`,
        sk: ({ username }) => username,
        // gpk1: (data) => ...
      },
      transform: (data) => [data, { ...data, entityType: "userEmail" }],
    },
    userEmail: {
      calc: {
        pk: ( { entityType }) => `${entityType}`,
        sk: ({ email }) => email,
      },
      //transform not needed
    },
  },
};

*/

// https://serverless.pub/migrating-to-aws-sdk-v3/
// https://betterdev.blog/aws-javascript-sdk-v3-usage-problems-testing/

import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  DynamoDBClient,
  GetItemCommand,
  DeleteItemCommand,
  PutItemCommand,
  BatchWriteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

// const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

/*
  const intersection(array1, array2) =>  {
    const set = new Set(array2);
    return Array.from(new Set(array1.filter(elem => set.has(elem))));
  };
*/

const toArray = (a) => (Array.isArray(a) ? a : [a]);

const udb = (schema) => {
  const db = {
    indexes: [
      ["pk", "sk"],
      // ["gsi1pk", "gsi1sk"],
      // ["gsi2pk", "gsi2sk"],
    ],
    timestamps: ["_created", "_modified"], // default
    ...schema,
  };
  const ddbClient = new DynamoDBClient(db.region);
  const dbDo = (Command, ...params) => ddbClient.send(new Command(...params));

  const clean = (data) => {
    const { calc } = db.entities[data.entityType];
    if (!calc) return data;
    const tuples = Object.entries(data).filter(([k]) => !calc[k]);
    return Object.fromEntries(tuples);
  };

  const getKeys = (data, names) => {
    const calcs = db.entities[data.entityType].calc;
    return (names || db.indexes.flat()).reduce((r, k) => {
      if (data[k]) r[k] = data[k];
      else if (calcs[k]) r[k] = calcs[k](data);
      return r;
    }, {});
  };

  const withKeys = (data) => ({ ...data, ...getKeys(data) });

  const get = async (data) => {
    const params = { TableName: db.table, Key: marshall(getKeys(data)) };
    return clean(unmarshall((await dbDo(GetItemCommand, params)).Item));
  };

  const stamps = (data) => {
    const [ctd, mod] = db.timestamps;
    return data[ctd]
      ? { [ctd]: data[ctd], [mod]: new Date().toISOString() }
      : { [ctd]: new Date().toISOString() };
  };

  const toWrite = (data) => {
    const stamped = toArray(data).map((d) => {
      const { transform } = db.entities[d.entityType];
      const transformed = toArray(transform ? transform(d) : d);
      return transformed.map((item) => ({ ...item, ...stamps(d) }));
    });
    return {
      dataToWrite: stamped.flatMap((a) => a.map(withKeys)),
      stamped: stamped.map((i) => i[0]),
    };
  };

  const doBatchWrite = async (data) => {
    const TableName = db.table;
    if (data.length > 1)
      return dbDo(BatchWriteItemCommand, {
        RequestItems: { [TableName]: data },
      });
    const [request, props] = Object.entries(data[0]);
    const params = { TableName: db.table, ...props };
    if (request === "PutRequest") return dbDo(PutItemCommand, params);
    return dbDo(DeleteItemCommand, params);
  };

  const put = async (data) => {
    const { stamped, dataToWrite } = toWrite(data);
    const requestItems = dataToWrite.map((item) => ({
      PutRequest: { Item: marshall(item) },
    }));
    await doBatchWrite(requestItems);
    return stamped;
  };

  const del = async (data) => {
    const { stamped, dataToWrite } = toWrite(data);
    const requestItems = dataToWrite.map((item) => ({
      DeleteRequest: { Key: marshall(getKeys(item)) },
    }));
    await doBatchWrite(requestItems);
    return stamped;
  };

  const attributes = (data) =>
    Object.keys(data).reduce(
      (r, k) => {
        r.placeholders.push([`#${k}`, `:${k}`]);
        r.names[`#${k}`] = k;
        r.values[`:${k}`] = data[k];
        return r;
      },
      { placeholders: [], names: {}, values: {} }
    );

  const query = async (data, params) => {
    const { names, values, placeholders: p } = attributes(data);
    const exp1 = `${p[0][0]} = ${p[0][1]}`;
    const exp2 = p[1] ? ` AND begins_with(${p[1][0]}, ${p[1][1]})` : "";
    const KeyConditionExpression = exp1 + exp2;
    const allParams = {
      TableName: db.table,
      KeyConditionExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values),
      ...params,
    };
    const response = await dbDo(QueryCommand, allParams);
    const items = response.Items.map((item) => clean(unmarshall(item)));
    return { items, response, names, values, KeyConditionExpression };
  };

  const update = async (data, params) => {
    const TableName = db.table;
    const Key = marshall(getKeys(data));
    return dbDo(UpdateItemCommand, { TableName, Key, ...params });
  };

  return { get, put, del, query, update, getKeys, attributes, marshall, dbDo };
};

export default udb;
