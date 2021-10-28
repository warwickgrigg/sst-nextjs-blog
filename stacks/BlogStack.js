import {
  Stack,
  Table,
  TableFieldType,
  Bucket,
  NextjsSite,
} from "@serverless-stack/resources";
import { EventType } from "@aws-cdk/aws-s3";
import s3deploy from "@aws-cdk/aws-s3-deployment";
import ssm from "@aws-cdk/aws-ssm";
import { ProjectionType } from "@aws-cdk/aws-dynamodb";
import { RemovalPolicy } from "@aws-cdk/core";

export default class MyStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
    const { ssmParamName, bucketName = "" } = props;
    console.log({ ssmParamName, bucketName });

    const table = new Table(this, "Blog", {
      fields: { pk: TableFieldType.STRING, sk: TableFieldType.STRING },
      primaryIndex: {
        partitionKey: "pk",
        sortKey: "sk",
        /*
        indexProps: {
          nonKeyAttributes: ["nk"],
          projectionType: ProjectionType.INCLUDE,
        },
        */
      },
      dynamodbTable: {
        removalPolicy: RemovalPolicy.DESTROY,
      },
    });

    // Define the content bucket

    const contentBucket = new Bucket(this, "contentBucket", {
      notifications: [
        {
          function: "src/notification.main",
          notificationProps: {
            events: [EventType.OBJECT_CREATED],
          },
        },
      ],
      s3Bucket: {
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    });

    contentBucket.attachPermissions([table, contentBucket]);

    new s3deploy.BucketDeployment(this, "DeployContentPostBucket", {
      sources: [s3deploy.Source.asset("./content/bucket/blog")],
      destinationBucket: contentBucket.s3Bucket,
      destinationKeyPrefix: "blog", // optional prefix in destination bucket
    });

    // Define the ssm paramter
    new ssm.StringParameter(this, "ContentBucketNameParameter", {
      parameterName: ssmParamName,
      stringValue: contentBucket.bucketName,
    });

    // Define the Next.js site
    const site = new NextjsSite(this, "Site", {
      path: "frontend",
      environment: {
        // Pass the bucket details to our app
        REGION: scope.region,
        BUCKET_NAME: bucketName,
        TEST_VAR: "TEST_VAR contents",
      },
    });

    // Allow the Next.js site to access the content bucket
    site.attachPermissions([contentBucket]);

    // Show the site URL and content bucket name in the output
    this.addOutputs({
      URL: site.url,
      BUCKET_NAME: contentBucket.bucketName,
      MESSAGE: bucketName
        ? ""
        : "Rerun 'sst deploy' to generate static pages from s3 bucket",
    });
  }
}
