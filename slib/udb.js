// Minimal dynamodb helper library for single tabel design

// See https://www.serverlesslife.com/DynamoDB_Design_Patterns_for_Single_Table_Design.html

/*
   Example schema

const schema = {
  ddbProps, // region, credentials etc
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
      cascade: (data) => [data, { ...data, entityType: "userEmail" }],
    },
    userEmail: {
      calc: {
        pk: ( { entityType }) => `${entityType}`,
        sk: ({ email }) => email,
      },
      //cascade not needed
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
  ScanCommand,
  UpdateItemCommand,
  CreateTableCommand,
} from "@aws-sdk/client-dynamodb";

/*
  const intersection(array1, array2) =>  {
    const set = new Set(array2);
    return Array.from(new Set(array1.filter(elem => set.has(elem))));
  };
  const pick = (keys) => (o) => Object.fromEntries(keys.map((k) => [k, o[k]]));
*/

const toArray = (a) => (Array.isArray(a) ? a : [a]);
const deepMerge2 = (obj1, obj2) => {
  if (Array.isArray(obj1) && Array.isArray(obj2)) return obj1.concat(obj2);
  if (typeof obj1 === "object" && typeof obj2 === "object") {
    const obj3 = {};
    for (const key in obj1) obj3[key] = deepMerge2(obj1[key], obj2[key]);
    for (const key in obj2) if (!(key in obj1)) obj3[key] = obj2[key]; // obj3[key] = deepMerge(undefined, obj2[key]);
    return obj3;
  }
  return obj2 !== undefined ? obj2 : obj1;
};
const deepMerge = (object1, ...rest) => rest.reduce(deepMerge2, object1);

const limit = (n) =>
  n > 0 ? { Limit: n } : { Limit: -n, ScanIndexForward: false };

const dehash = (s, hash = "#", escape = "\\") =>
  !s ? s : s.replace(escape, escape + escape).replace(hash, escape + "d");

// Factory functions for tagged template functions

const keyFactory =
  ({ hash = "#", escape = "\\" }) =>
  (strings, ...keys) => {
    const r = [];
    for (let i = 0; i < strings.length; i += 1) {
      r.push(strings[i]);
      if (i < keys.length) r.push(dehash(keys[i], hash, escape));
    }
    return r.join("");
  };
const sKey = keyFactory({});

const expressionFactory =
  ({ prefix }) =>
  (strings, ...values) => {
    const r = { values: {}, names: {}, expressionParts: [] };
    const valueUsedCount = {};
    let name = "v";
    for (let i = 0; i < strings.length; i += 1) {
      r.expressionParts.push(strings[i]);
      const names = strings[i].match(/#[A-Za-z]\w+/g) || [];
      names.forEach((k) => {
        name = k.slice(1);
        r.names[k] = name;
      });
      if (i < values.length) {
        valueUsedCount[name] = (valueUsedCount[name] || 0) + 1;
        const valueName = `:${name}${valueUsedCount[name]}`;
        r.expressionParts.push(valueName);
        r.values[valueName] = values[i];
      }
    }
    return {
      [`${prefix}Expression`]: r.expressionParts.join(""),
      ExpressionAttributeNames: r.names,
      ExpressionAttributeValues: marshall(r.values),
    };
  };

const keyExp = expressionFactory({ prefix: "KeyCondition" });
const filterExp = expressionFactory({ prefix: "Filter" });

const udb = (schema) => {
  const db = {
    indexes: { primaryIndex: ["pk", "sk"] },
    timestamps: ["_created", "_modified"], // default
    ...schema,
  };
  const ddbClient = new DynamoDBClient(schema.ddbProps);
  const dbDo = (Command, ...params) => ddbClient.send(new Command(...params));

  const create = () => {
    const keys = db.indexes.primaryIndex;
    const params = {
      AttributeDefinitions: keys.map((name) => ({
        AttributeName: name,
        AttributeType: "S",
      })),
      KeySchema: keys.map((name, i) => ({
        AttributeName: name,
        KeyType: ["HASH", "RANGE"][i],
      })),
      TableName: db.table,
      BillingMode: "PAY_PER_REQUEST",
    };
    return dbDo(CreateTableCommand, params);
  };

  const deCalc = (data) => {
    const { calc } = db.entities[data.entityType];
    if (!calc) return data;
    const tuples = Object.entries(data).filter(([k]) => !calc[k]);
    return Object.fromEntries(tuples);
  };

  const getCalcs = (data, names) => {
    const { calc } = db.entities[data.entityType];
    const r = {};
    for (const k of names || Object.keys(calc)) r[k] = calc[k](data);
    return r;
  };

  const getKeys = (data, names) =>
    getCalcs(data, names || Object.values(db.indexes).flat());

  const getPrimaryKey = (data) => getCalcs(data, db.indexes.primaryIndex);

  const toWrite = (data) => {
    const r = { roots: [], dataToWrite: [] };
    const [ctd, mod] = db.timestamps;
    const now = new Date().toISOString();

    toArray(data).forEach((d) => {
      const stamps = d[ctd] ? { [ctd]: d[ctd], [mod]: now } : { [ctd]: now };
      const recursiveCascade = (c) => {
        const calcs = getCalcs(c);
        const expanded = { ...c, ...calcs, ...stamps };
        r.dataToWrite.push(expanded);
        const { cascade } = db.entities[c.entityType];
        if (cascade) cascade(expanded).forEach(recursiveCascade);
      };
      r.roots.push({ ...d, ...stamps });
      recursiveCascade(d);
    });

    return r;
  };

  const doBatchWrite = async (data) => {
    const TableName = db.table;
    if (data.length > 1)
      return dbDo(BatchWriteItemCommand, {
        RequestItems: { [TableName]: data },
      });
    const [request, props] = Object.entries(data[0])[0];
    const params = { TableName, ...props };
    // console.log({ params });
    if (request === "PutRequest") return dbDo(PutItemCommand, params);
    return dbDo(DeleteItemCommand, params);
  };

  const put = async (data) => {
    const { roots, dataToWrite } = toWrite(data);
    // console.log("to write", { dataToWrite });
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
      return r.Responses[db.table].map((item) => deCalc(unmarshall(item)));
    }
    const props = { TableName: db.table, Key: Keys[0], ...params };
    return [deCalc(unmarshall((await dbDo(GetItemCommand, props)).Item))];
  };

  const queryOrScan = async (command, ...params) => {
    const options = deepMerge({ TableName: db.table }, ...params);
    // console.log(JSON.stringify({ options }, null, 2));
    const r = await dbDo(command, options);
    const items = r.Items.map((item) => deCalc(unmarshall(item)));
    return [items, r];
  };

  const query = (...params) => queryOrScan(QueryCommand, ...params);
  const scan = (...params) => queryOrScan(ScanCommand, ...params);

  /*
  const mapObj = (f) => (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const maybeMap = (f) => (d) => Array.isArray(d) ? d.map(f) : f(d);
  const prep = (data) => maybeMap((d) => ({ ...d, ...getCalcs(d) }))(data);
  const enrichWithCalcs = (f) => (data) => f(prep(data));
  const conditions = mapObj(enrichWithCalcs)(schema.conditions);
  const expression = (fn, data) => fn(prep(data));
  */

  const update = async (data, params) =>
    dbDo(UpdateItemCommand, {
      TableName: db.table,
      Key: marshall(getPrimaryKey(data)),
      ...params,
    });

  const itemFunctions = { put, get, update, del, query, scan };
  const attributeFunctions = { getCalcs, getKeys };
  const tablefunctions = { dbDo, create };

  return { ...itemFunctions, ...attributeFunctions, ...tablefunctions };
};

export { udb, sKey, keyExp, filterExp, expressionFactory, limit };
