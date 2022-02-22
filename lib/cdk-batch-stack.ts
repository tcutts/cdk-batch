import { aws_s3, Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as batch from "@aws-cdk/aws-batch-alpha";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { JobDefinition } from "@aws-cdk/aws-batch-alpha";

const SCRIPT_BUCKET_NAME = "tc-batch-20220217";

export class CdkBatchStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Source of job file
    const bucket = s3.Bucket.fromBucketName(
      this,
      "ScriptBucket",
      SCRIPT_BUCKET_NAME
    );

    const ecsInstanceRole = this.createTaskExecutionRole();

    bucket.grantReadWrite(ecsInstanceRole);

    // VPC for the compute environment
    const vpc = new ec2.Vpc(this, "BatchVPC");

    // The fargate compute environment
    const fargateSpotEnvironment = new batch.ComputeEnvironment(
      this,
      "FargateEnvironment",
      {
        computeResources: {
          type: batch.ComputeResourceType.FARGATE_SPOT,
          vpc,
        },
      }
    );

    //  A queue to run the jobs
    const jobQueue = new batch.JobQueue(this, "JobQueue", {
      computeEnvironments: [
        {
          computeEnvironment: fargateSpotEnvironment,
          order: 1,
        },
      ],
    });

    const jobDef = new batch.JobDefinition(this, "TestJob", {
      container: {
        image: ecs.ContainerImage.fromAsset("testjob"),
        executionRole: ecsInstanceRole,
      },
      platformCapabilities: [batch.PlatformCapabilities.FARGATE],
    });

    // lambda function to respond to events
    const bucketArrival = new lambda.Function(this, "BucketArrival", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("lambda/bucketarrival"),
      handler: "bucketarrival.handler",
      environment: {
        JOB_DEFINITION_NAME: jobDef.jobDefinitionName,
        JOB_QUEUE_NAME: jobQueue.jobQueueName,
      },
    });

    // the lambda function needs to be able to submit jobs
    const batchSubmitPolicy = new iam.PolicyStatement({
      actions: ["batch:SubmitJob"],
      resources: [jobDef.jobDefinitionArn, jobQueue.jobQueueArn],
    });

    bucketArrival.role?.attachInlinePolicy(
      new iam.Policy(this, "submit-jobs-policy", {
        statements: [batchSubmitPolicy],
      })
    );

    bucket.grantRead(bucketArrival, "input/*");
    bucket.grantWrite(bucketArrival, "output/*");

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(bucketArrival),
      // 👇 only invoke lambda if object matches the filter
      { prefix: "input/", suffix: ".txt" }
    );
  }

  private createTaskExecutionRole(): iam.Role {
    const role = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    return role;
  }
}
