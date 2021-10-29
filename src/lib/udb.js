// Minimal dynamodb helper library for single tabel design

// See https://www.serverlesslife.com/DynamoDB_Design_Patterns_for_Single_Table_Design.html

/*
   Example schema

const schema = {
  ddb: {}, // placeholder - dynamodb imports
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

const udb = (schema) => {
  const ddbClient = new schema.ddb.DynamoDBClient(schema.region);
  const docClient = schema.ddb.DynamoDBDocumentClient.from(ddbClient);
  const db = { ...schema, ddbClient, docClient };

  const { GetCommand, PutCommand } = db.ddb;
  const { QueryCommand, UpdateCommand, TransactWriteCommand } = db.ddb;

  db.getKeys = (data) => {
    const tuples = Object.entries(db.entities[data.entityType].calc);
    return Object.fromEntries(tuples.map(([k, f]) => [k, f(data)]));
  };

  db.put = async (data) => {
    const params = { TableName: db.table };
    const [ctd, mod] = db.timestamps;
    const created = data[ctd];
    const timeStamp = { [created ? mod : ctd]: Date.now() };
    const { transform } = db.entities[data.entityType];
    const items = transform ? transform(data) : [data];
    const bodies = items.map((item) => ({
      ...item,
      [ctd]: created, // propagate to all related items
      ...timeStamp,
    }));
    // Maybe should use transact if more than one item
    await Promise.all(
      bodies.map((body) => {
        const Item = { ...db.getKeys(body), ...body };
        return docClient.send(new PutCommand({ ...params, Item }));
      })
    );
    return bodies[0];
  };

  const clean = (data) => {
    // Remove calculated attributes
    const { calc } = db.entities[data.entityType];
    const tuples = Object.entries(data).filter(([k]) => !calc[k]);
    return Object.fromEntries(tuples);
  };

  db.get = async (data) => {
    const keys = db.getKeys(data);
    const params = { TableName: db.table, Key: keys };
    return clean((await docClient.send(new GetCommand(params))).Item);
  };

  db.query = async (data, params) => {
    const { calc } = db.entities[data.entityType];
    const pk = db.keys[0];
    const allP = {
      TableName: db.table,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": calc[pk](data) },
      ...params,
    };
    return (await docClient.send(new QueryCommand(allP))).Items.map(clean);
  };

  db.update = async (data, params) => {
    const allP = { TableName: db.table, Key: db.getKeys(data), ...params };
    return docClient.send(new UpdateCommand(allP));
  };

  db.transact = async (ops) => docClient.send(new TransactWriteCommand(ops));

  return db;
};

export default udb;
