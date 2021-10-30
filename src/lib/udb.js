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
    keys: ["pk", "sk"], // default - could also include gpk1 etc
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

  db.getKeys = (data) => {
    const tuples = Object.entries(db.entities[data.entityType].calc);
    return Object.fromEntries(tuples.map(([k, f]) => [k, f(data)]));
  };

  db.get = async (data) => {
    const params = { TableName: db.table, Key: marshall(db.getKeys(data)) };
    return clean((await dbDo(GetItemCommand, params)).Item);
  };

  db.put = async (data) => {
    const TableName = db.table;
    const [ctd, mod] = db.timestamps;
    const created = data[ctd];
    const stamp = { [created ? mod : ctd]: Date.now() };
    const { transform } = db.entities[data.entityType];
    const items = [].concat(transform ? transform(data) : data).map((item) => {
      return { ...item, [ctd]: created, ...stamp }; // timestamped
    });
    // Maybe should use transact if more than one item
    await Promise.all(
      items.map((item) => {
        const Item = marshall({ ...db.getKeys(item), ...item });
        return dbDo(PutItemCommand, { TableName, Item });
      })
    );
    return items[0];
  };

  db.delete = async (data) => {
    const TableName = db.table;
    const { transform } = db.entities[data.entityType];
    const items = [].concat(transform ? transform(data) : data);
    return Promise.all(
      items.map((item) =>
        dbDo(DeleteItemCommand, { TableName, Key: marshall(db.getKeys(item)) })
      )
    );
  };

  db.query = async (data, params) => {
    const { calc } = db.entities[data.entityType];
    const pk = db.keys[0];
    const allP = {
      TableName: db.table,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: marshall({ ":pk": calc[pk](data) }),
      ...params,
    };
    return (await dbDo(QueryCommand, allP)).Items.map(clean);
  };

  db.update = async (data, options) => {
    const TableName = db.table;
    const Key = marshall(db.getKeys(data));
    return dbDo(UpdateItemCommand, { TableName, Key, ...options });
  };

  db.transact = async (x) => x; // (ops) => dcDo(TransactWriteCommand, ops);

  return db;
};

export default udb;
