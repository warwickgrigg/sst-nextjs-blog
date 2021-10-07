import * as sst from "@serverless-stack/resources";
import s3deploy from "@aws-cdk/aws-s3-deployment";

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // Create the content bucket

    const ContentBucket = new sst.Bucket(this, "ContentBucket");

    new s3deploy.BucketDeployment(this, "DeployContentPostBucket", {
      sources: [s3deploy.Source.asset("./content/bucket/blog")],
      destinationBucket: ContentBucket.s3Bucket,
      destinationKeyPrefix: "blog", // optional prefix in destination bucket
    });

    // Create a Next.js site
    const site = new sst.NextjsSite(this, "Site", {
      path: "frontend",
      environment: {
        // Pass the bucket details to our app
        REGION: scope.region,
        BUCKET_NAME: ContentBucket.bucketName,
      },
    });

    // Allow the Next.js site to access the content bucket
    site.attachPermissions([ContentBucket]);

    // Show the site URL and content bucket name in the output
    this.addOutputs({
      URL: site.url,
      BUCKET_NAME: ContentBucket.bucketName,
    });
  }
}
