/*

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
*/

export default function App() {
  return <div className="App">Home page</div>;
}
