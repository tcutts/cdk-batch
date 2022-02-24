import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as bc from "./fargate-batch-with-s3";

export class CdkBatchStack extends cdk.Stack {
  public batchCluster: bc.FargateBatchWithS3Buckets;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.batchCluster = new bc.FargateBatchWithS3Buckets(this, "Test", {
      containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
      filters: [],
    });
  }
}
