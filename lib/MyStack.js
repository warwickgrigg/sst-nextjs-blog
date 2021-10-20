import * as sst from "@serverless-stack/resources";
import s3deploy from "@aws-cdk/aws-s3-deployment";
import ssm from "@aws-cdk/aws-ssm";

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { ssmParamName, bucketName = "" } = props;
    console.log({ ssmParamName, bucketName });

    // Define the content bucket

    const ContentBucket = new sst.Bucket(this, "ContentBucket");

    new s3deploy.BucketDeployment(this, "DeployContentPostBucket", {
      sources: [s3deploy.Source.asset("./content/bucket/blog")],
      destinationBucket: ContentBucket.s3Bucket,
      destinationKeyPrefix: "blog", // optional prefix in destination bucket
    });

    // Define the ssm paramter
    new ssm.StringParameter(this, "ContentBucketNameParameter", {
      parameterName: ssmParamName,
      stringValue: ContentBucket.bucketName,
    });

    // Create a Next.js site
    const site = new sst.NextjsSite(this, "Site", {
      path: "frontend",
      environment: {
        // Pass the bucket details to our app
        REGION: scope.region,
        BUCKET_NAME: bucketName, // will be "" if not pre-existing
        //BUCKET_NAME:  ContentBucket.bucketName,
        //BUCKET_NAME: ssm.StringParameter.valueFromLookup(this, ssmParamName),
        TEST_VAR: "TEST_VAR contents",
      },
    });

    // Allow the Next.js site to access the content bucket
    site.attachPermissions([ContentBucket]);

    // Show the site URL and content bucket name in the output
    this.addOutputs({
      URL: site.url,
      BUCKET_NAME: ContentBucket.bucketName,
      MESSAGE: bucketName
        ? ""
        : "Rerun 'sst deploy' to generate static pages from s3 bucket",
    });
  }
}
