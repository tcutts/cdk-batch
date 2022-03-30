import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as bc from "./spotfleet-batch-wth-s3";
import { Vpc } from "aws-cdk-lib/aws-ec2";

export class CdkBatchStack extends cdk.Stack {
  public batchCluster: bc.SpotfleetBatchWithS3Buckets;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC for the compute environment
    const vpc = new Vpc(this, "BatchVPC", { maxAzs: 6 });

    this.batchCluster = new bc.SpotfleetBatchWithS3Buckets(this, "Test", {
      vpc: vpc,
      containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
      filters: [],
    });
  }
}
