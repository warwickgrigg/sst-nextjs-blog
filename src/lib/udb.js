// Minimal dynamodb helper library for single tabel design

// See https://www.serverlesslife.com/DynamoDB_Design_Patterns_for_Single_Table_Design.html

/*
   Example schema

const schema = {
  table: "", // placeholder - table name
  keys: ["pk", "sk"], // default - could also include gpk1 etc
  timestamps: ["_created", "_modified"], // default
  entities: {
    // examples
    user: {
      calc: {
        // eslint-disable-next-line no-unused-vars
        pk: (data) => `User`,
        sk: ({ username }) => username,
        // gpk1: (data) => ...
      },
      transform: (data) => [data, { ...data, entityType: "userEmail" }],
    },
    userEmail: {
      calc: {
        // eslint-disable-next-line no-unused-vars
        pk: (data) => `UserEmail`,
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
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

const udb = (schema) => {
  const db = {
    indexes: {
      primaryIndex: ["pk", "sk"],
      // gsi1: ["gsi1pk", "gsi1sk"],
      // gsi2: ["gsi2pk", "gsi2sk"],
    },
    timestamps: ["_created", "_modified"], // default
    ...schema,
  };
  const ddbClient = new DynamoDBClient(db.region);
  const dbDo = (Command, ...params) => ddbClient.send(new Command(...params));

  const clean = (ddbReturnItem) => {
    // Remove calculated attributes, return unmarshalled
    const data = unmarshall(ddbReturnItem);
    const { calc } = db.entities[data.entityType];
    if (!calc) return data;
    const tuples = Object.entries(data).filter(([k]) => !calc[k]);
    return Object.fromEntries(tuples);
  };

  // const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

  /*
  const intersection(array1, array2) =>  {
    const set = new Set(array2);
    return Array.from(new Set(array1.filter(elem => set.has(elem))));
  };
  */

  const getKeys = (data, names) => {
    const calcs = db.entities[data.entityType].calc;
    const r = {};
    //(names || [].concat(...db.keys)).forEach((k) => {
    (names || [].concat(...Object.values(db.indexes))).forEach((k) => {
      if (data[k]) r[k] = data[k];
      else if (calcs[k]) r[k] = calcs[k](data);
    });
    return r;
  };

  const withKeys = (data, keys) => ({ ...data, ...getKeys(data, keys) });

  const get = async (data) => {
    const params = { TableName: db.table, Key: marshall(getKeys(data)) };
    return clean((await dbDo(GetItemCommand, params)).Item);
  };

  const put = async (data) => {
    const TableName = db.table;
    const [ctd, mod] = db.timestamps;
    const created = data[ctd];
    const stamp = { [created ? mod : ctd]: Date.now() };
    const { transform } = db.entities[data.entityType];
    const items = [].concat(transform ? transform(data) : data).map((item) => {
      return { ...item, [ctd]: created, ...stamp }; // timestamped
    });
    // Maybe should use batchWrite if more than one item
    await Promise.all(
      items.map((item) =>
        dbDo(PutItemCommand, { TableName, Item: marshall(withKeys(item)) })
      )
    );
    return items[0];
  };

  const del = async (data) => {
    const TableName = db.table;
    const { transform } = db.entities[data.entityType];
    const items = [].concat(transform ? transform(data) : data);
    return Promise.all(
      items.map((item) =>
        dbDo(DeleteItemCommand, { TableName, Key: marshall(getKeys(item)) })
      )
    );
  };

  const mkExpAtt = (data) => {
    const placeholders = [],
      names = {},
      values = {};
    Object.keys(data).forEach((key) => {
      placeholders.push([`#${key}`, `:${key}`]);
      names[`#${key}`] = key;
      values[`:${key}`] = data[key];
    });
    return [placeholders, names, values];
  };

  // const qAll = (data, keys = [db.keys[0][0]]) => {
  const qAll = (data, keys = [db.indexes.primaryIndex[0]]) => {
    const [placeholders, names, values] = mkExpAtt(getKeys(data, keys));
    console.log({ placeholders, names, values });
    return {
      KeyConditionExpression: placeholders
        .map((p) => p.join(" = "))
        .join(" and "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: marshall(values),
    };
  };

  const query = async (params) =>
    (await dbDo(QueryCommand, params)).Items.map(clean);

  const update = async (data, options) => {
    const TableName = db.table;
    const Key = marshall(getKeys(data));
    return dbDo(UpdateItemCommand, { TableName, Key, ...options });
  };

  const transact = async (x) => x; // (ops) => dcDo(TransactWriteCommand, ops);

  return {
    get,
    put,
    del,
    query,
    update,
    transact,
    qAll,
    getKeys,
    withKeys,
    marshall,
  };
};

export default udb;
