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
} from "@aws-sdk/client-dynamodb";

/*
  const intersection(array1, array2) =>  {
    const set = new Set(array2);
    return Array.from(new Set(array1.filter(elem => set.has(elem))));
  };
*/

//const pick = (keys) => (o) => Object.fromEntries(keys.map((k) => [k, o[k]]));

const mapObj = (f) => (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
/*
const mapObj = (o) => (f) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  */
const toArray = (a) => (Array.isArray(a) ? a : [a]);
const maybeMap = (f) => (d) => Array.isArray(d) ? d.map(f) : f(d);
const dehash = (s, hash = "#", escape = "\\") =>
  !s ? s : s.replace(escape, escape + escape).replace(hash, escape + "d");

// Tagged template functions

const sKey = (strings, ...keys) => {
  const r = [];
  for (let i = 0; i < strings.length; i += 1) {
    r.push(strings[i]);
    if (i < keys.length) r.push(dehash(keys[i]));
  }
  return r.join("");
};

const dExp =
  (prefix) =>
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

const keyExp = dExp("KeyCondition");
const filterExp = dExp("Filter");

const udb = (schema) => {
  const db = {
    indexes: { primaryIndex: ["pk", "sk"] },
    timestamps: ["_created", "_modified"], // default
    ...schema,
  };
  const ddbClient = new DynamoDBClient(db.region);
  const dbDo = (Command, ...params) => ddbClient.send(new Command(...params));

  const deCalc = (data) => {
    const { calc } = db.entities[data.entityType];
    if (!calc) return data;
    const tuples = Object.entries(data).filter(([k]) => !calc[k]);
    return Object.fromEntries(tuples);
  };

  const getCalcs = (data, names) => {
    const { calc } = db.entities[data.entityType];
    const r = {};
    for (const k of names || Object.keys(calc))
      r[k] = k in data ? data[k] : calc[k](data);
    return r;
  };

  const getPrimaryKey = (data) => getCalcs(data, db.indexes.primaryIndex);

  const toWrite = (data) => {
    const r = { roots: [], dataToWrite: [] };
    const [ctd, mod] = db.timestamps;
    const now = new Date().toISOString();

    toArray(data).forEach((d) => {
      const stamps = d[ctd] ? { [ctd]: d[ctd], [mod]: now } : { [ctd]: now };
      const recursiveCascade = (c) => {
        const expanded = { ...c, ...getCalcs(c), ...stamps };
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
      return r.Responses[db.table].map((item) => deCalc(unmarshall(item)));
    }
    const props = { TableName: db.table, Key: Keys[0], ...params };
    return [deCalc(unmarshall((await dbDo(GetItemCommand, props)).Item))];
  };

  const queryOrScan = async (command, params) => {
    const r = await dbDo(command, { TableName: db.table, ...params });
    const items = r.Items.map((item) => deCalc(unmarshall(item)));
    return [items, r];
  };

  const query = (...params) => queryOrScan(QueryCommand, ...params);
  const scan = (...params) => queryOrScan(ScanCommand, ...params);

  const withCalcs = (data) => maybeMap((d) => ({ ...d, ...getCalcs(d) }))(data);

  /*
  const makeQueriesWithCalcs = ([command, condFns]) =>
    mapObj(condFns)((f) => (data) => queryOrScan(command, f(withCalcs(data))));

  const [queries, scans] = [
    [QueryCommand, schema.queries],
    [ScanCommand, schema.scans],
  ].map(makeQueriesWithCalcs);
  */
  const makeQueriesWithCalcs = mapObj((f) => (data) => f(withCalcs(data)));

  const [queries, scans] = [schema.queries, schema.scans].map(
    makeQueriesWithCalcs
  );

  const update = async (data, params) =>
    dbDo(UpdateItemCommand, {
      TableName: db.table,
      Key: marshall(getPrimaryKey(data)),
      ...params,
    });

  return { get, put, del, query, scan, update, getCalcs, queries, scans, dbDo };
};

export { udb, sKey, keyExp, filterExp, dExp, dehash };

/*
const attributes = (data) => {
  const r = { knames: {}, vnames: {}, groupings: {} };
  toArray(data).forEach((d) =>
    Object.keys(d).forEach((k) => {
      const kname = `#${k}`;
      if (!r.groupings[k]) r.groupings[k] = { kname, vnames: [] };
      const vname = `:${k}${r.groupings[k].vnames.length}`;
      r.groupings[k].vnames.push(vname);
      r.knames[kname] = k;
      r.vnames[vname] = d[k];
    })
  );
  return r;
};

const applyOp = (keyGroup, op) => {
  const keyFunctions = {
    beginsWith: (k, v) => `begins_with(${k}, ${v[0]})`,
    between: (k, v) => `${k} BETWEEN ${v[0]} AND ${v[1]}`,
  };
  const binop = (k, o, v) => `${k} ${o} ${v[0]}`;

  const { kname: kn, vnames: vn } = keyGroup;
  if (["=", "<", ">", "<=", ">="].includes(op)) return binop(kn, op, vn);
  if (keyFunctions[op]) return keyFunctions[op](kn, vn);
};

const keyCondition = (keys, ops = ["=", "beginsWith"]) => {
  const { knames, vnames, groupings } = attributes(keys);
  const exp = Object.values(groupings).map((g, i) => applyOp(g, ops[i]));
  return {
    KeyConditionExpression: exp.join(" AND "),
    ExpressionAttributeNames: knames,
    ExpressionAttributeValues: marshall(vnames),
  };
};
*/
