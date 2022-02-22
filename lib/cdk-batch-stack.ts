import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as batch from "@aws-cdk/aws-batch-alpha";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
export class CdkBatchStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // NB Both input and output buckets have their contents deleted when the
    // stack is destroyed

    // Source of job files
    const inputBucket = new s3.Bucket(this, "InputBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          expiration: cdk.Duration.days(7),
        },
      ],
    });

    // Sink for output files
    const outputBucket = new s3.Bucket(this, "OutputBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(90),
          expiration: cdk.Duration.days(365),
          // Uncomment the following to automatically migrate older output files to a cheaper storage tier
          /*         transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            }, 
          ], */
        },
      ],
    });

    // Give Fargate ECS instances permission to read and write from the buckets
    const ecsInstanceRole = this.createTaskExecutionRole();
    inputBucket.grantRead(ecsInstanceRole);
    outputBucket.grantWrite(ecsInstanceRole);

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

    // A default job to run
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
        S3_OUTPUT_BUCKET: outputBucket.bucketName,
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

    // The lambda function can read the bucket (but doesn't actually need to in many cases)
    inputBucket.grantRead(bucketArrival);

    // Set up the notifications when objects arrive
    inputBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(bucketArrival)
      // { prefix: "foo", suffix: ".txt" }
    );

    // Output some variables the user will want to know
    new cdk.CfnOutput(this, "inputBucketName", {
      value: inputBucket.bucketName,
      description: "Files placed in here will trigger a batch job submission",
      exportName: "inputBucket",
    });

    new cdk.CfnOutput(this, "outputBucketName", {
      value: outputBucket.bucketName,
      description: "Jobs should write output here",
      exportName: "outputBucket",
    });

    new cdk.CfnOutput(this, "submissionLogGroup", {
      value: bucketArrival.logGroup.logGroupArn,
      description:
        "Logs of batch submission by the lambda function will be here",
      exportName: "submissionLogGroup",
    });
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
