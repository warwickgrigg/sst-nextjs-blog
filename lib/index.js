import MyStack from "./MyStack";
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const getParameter = async (paramName, region) => {
  const params = {
    Name: paramName,
    WithDecryption: false,
  };

  // https://serverless.pub/migrating-to-aws-sdk-v3/
  const ssmClient = new SSMClient({ region });
  return ssmClient
    .send(new GetParameterCommand(params))
    .then((r) => r.Parameter.Value)
    .catch(() => undefined);
};

export default async function main(app) {
  // Set default runtime for all functions
  app.setDefaultFunctionProps({
    runtime: "nodejs12.x",
  });

  // Check ssm parameter for name of previously created bucket
  // Must do this async operation outside of Stack's constructor
  const ssmParamName = app.logicalPrefixedName("ContentBucketName");

  const bucketName = await getParameter(ssmParamName, app.region);

  console.log({ ssmParamName, bucketName });

  new MyStack(app, "my-stack", { ssmParamName, bucketName });

  // Add more stacks
}
