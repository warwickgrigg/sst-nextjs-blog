// Minimal dynamodb helper library for single tabel design

// See https://www.serverlesslife.com/DynamoDB_Design_Patterns_for_Single_Table_Design.html

/*
   Example schema

const schema = {
  region,
  table: "", // placeholder - table name
  indexes: {primaryIndex: ["pk", "sk"]}, // default. maybe also ... gsi1:[], gsi2:[] etc
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
  BatchGetItemCommand,
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

const dehash = (s, hash = "#", escape = "\\") =>
  s.replace(escape, escape + escape).replace(hash, escape + "d");

const dh = (strings, ...keys) => {
  const r = [];
  for (let i = 0; i < strings.length; i += 1) {
    r.push(strings[i]);
    if (i < keys.length) r.push(dehash(keys[i]));
  }
  return r.join("");
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

const beginsWith = (k) => (k ? ` AND begins_with(${k[0]}, ${k[1]})` : "");
const op = (binop) => (k) => k ? ` AND ${k[0]} ${binop} ${k[1]}` : "";

const keyCondition = (condition, keys) => {
  const { names, values, placeholders } = attributes(keys);
  const [pk, ...sk] = placeholders;
  return {
    KeyConditionExpression: `${pk[0]} = ${pk[1]}` + condition(...sk),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: marshall(values),
  };
};

const toArray = (a) => (Array.isArray(a) ? a : [a]);

const udb = (schema) => {
  const db = {
    indexes: { primaryIndex: ["pk", "sk"] },
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

  const getKeyTuples = (data, names) => {
    const calcs = db.entities[data.entityType].calc;
    const r = [];
    (names || Object.values(db.indexes).flat()).forEach((k) => {
      if (k in data) r.push([k, data[k]]);
      else if (k in calcs) r.push([k, calcs[k](data)]);
    });
    return r;
  };

  const getKeys = (...args) => Object.fromEntries(getKeyTuples(...args));

  const getPrimaryKey = (data) => getKeys(data, db.indexes.primaryIndex);

  const withKeys = (data) => ({ ...data, ...getKeys(data) });

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
      roots: stamped.map((i) => i[0]),
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
    const { roots, dataToWrite } = toWrite(data);
    const requestItems = dataToWrite.map((item) => ({
      PutRequest: { Item: marshall(item) },
    }));
    await doBatchWrite(requestItems);
    return roots;
  };

  const del = async (data) => {
    const { roots, dataToWrite } = toWrite(data);
    const requestItems = dataToWrite.map((item) => ({
      DeleteRequest: { Key: marshall(getPrimaryKey(item)) },
    }));
    await doBatchWrite(requestItems);
    return roots;
  };

  const get = async (data, params) => {
    const Keys = toArray(data).map((d) => marshall(getPrimaryKey(d)));
    if (Keys.length > 0) {
      const RequestItems = { [db.table]: { Keys } };
      const r = await dbDo(BatchGetItemCommand, { RequestItems, ...params });
      return r.Responses[db.table].map((item) => clean(unmarshall(item)));
    }
    const props = { TableName: db.table, Key: Keys[0], ...params };
    return [clean(unmarshall((await dbDo(GetItemCommand, props)).Item))];
  };

  const query = async (params) => {
    const r = await dbDo(QueryCommand, { TableName: db.table, ...params });
    const items = r.Items.map((item) => clean(unmarshall(item)));
    return [items, r];
  };

  const update = async (data, params) =>
    dbDo(UpdateItemCommand, {
      TableName: db.table,
      Key: marshall(getPrimaryKey(data)),
      ...params,
    });

  return { get, put, del, query, update, getKeys, dbDo };
};

export { udb, dh, dehash, attributes, keyCondition, beginsWith, op };
