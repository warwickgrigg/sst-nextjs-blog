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
    .then((r) => [r.Parameter.Value, undefined])
    .catch((e) => [undefined, e]);
};

getParameter("warwick-nextjs-blog-ContentBucketName", "us-east-1").then((r) =>
  console.log(r)
);
