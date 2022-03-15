import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as bc from "./fargate-batch-with-s3";
import { Vpc } from "aws-cdk-lib/aws-ec2";

export class CdkBatchStack extends cdk.Stack {
  public batchCluster: bc.FargateBatchWithS3Buckets;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for the compute environment
    const vpc = new Vpc(this, "BatchVPC");

    this.batchCluster = new bc.FargateBatchWithS3Buckets(this, "Test", {
      vpc: vpc,
      containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
      computeResources: {
        maxvCpus: 1000,
      },
      filters: [],
    });
  }
}
