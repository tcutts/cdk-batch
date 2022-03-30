import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as batch from "@aws-cdk/aws-batch-alpha";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";

interface ComputeResourcesSubset {
  maxvCpus?: number;
  minvCpus?: number;
  desiredvCpus?: number;
  bidPercentage?: number;
}

export interface SpotFleetBatchWithS3Props {
  vpc: ec2.Vpc;
  inputBucketProps?: s3.BucketProps;
  outputBucketProps?: s3.BucketProps;
  computeResources?: ComputeResourcesSubset;
  containerImage: ecs.ContainerImage;
  filters: s3.NotificationKeyFilter[];
}

export class SpotfleetBatchWithS3Buckets extends Construct {
  public inputBucket: s3.Bucket;
  public outputBucket: s3.Bucket;
  public jobRole: iam.Role;
  public executionRole: iam.Role;
  public jobDef: batch.JobDefinition;
  public jobQueue: batch.JobQueue;
  public bucketArrivalFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: SpotFleetBatchWithS3Props) {
    super(scope, id);

    this.createBuckets(props);
    this.createBatchEnvironment(props);

    const filters: s3.NotificationKeyFilter[] = props.filters;

    this.createTriggerFunction(...filters);

    // Output some variables the user will want to know
    new cdk.CfnOutput(this, "inputBucketName", {
      value: this.inputBucket.bucketName,
      description: "Files placed in here will trigger a batch job submission",
      exportName: "inputBucket",
    });

    new cdk.CfnOutput(this, "outputBucketName", {
      value: this.outputBucket.bucketName,
      description: "Jobs should write output here",
      exportName: "outputBucket",
    });

    new cdk.CfnOutput(this, "jobQueueName", {
      value: this.jobQueue.jobQueueName,
      description: "The job queue to submit jobs to",
      exportName: "jobQueuesName",
    });

    new cdk.CfnOutput(this, "jobDefinitionName", {
      value: this.jobDef.jobDefinitionName,
      description: "Test job definition",
      exportName: "testJobDefinitionName",
    });

    new cdk.CfnOutput(this, "submissionLogGroup", {
      value: this.bucketArrivalFunction.logGroup.logGroupArn,
      description:
        "Logs of batch submission by the lambda function will be here",
      exportName: "submissionLogGroup",
    });
  }

  private createBuckets(props: SpotFleetBatchWithS3Props) {
    let inputBucketProps = {
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
    };

    Object.assign(inputBucketProps, props.inputBucketProps);

    let outputBucketProps = {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: false,
      publicReadAccess: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
    };

    Object.assign(outputBucketProps, props.outputBucketProps);

    // Source of job files
    this.inputBucket = new s3.Bucket(this, "InputBucket", inputBucketProps);

    // Sink for output files
    this.outputBucket = new s3.Bucket(this, "OutputBucket", outputBucketProps);
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

  private createBatchEnvironment(props: SpotFleetBatchWithS3Props) {
    const batchServiceRole = new iam.Role(this, "batchServiceRole", {
      roleName: "batchServiceRole",
      assumedBy: new iam.ServicePrincipal("batch.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSBatchServiceRole"
        ),
      ],
    });

    const spotFleetRole = new iam.Role(this, "spotFleetRole", {
      roleName: "AmazonEC2SpotFleetRole",
      assumedBy: new iam.ServicePrincipal("spotfleet.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2SpotFleetTaggingRole"
        ),
      ],
    });

    const batchInstanceRole = new iam.Role(this, "batchInstanceRole", {
      roleName: "batchInstanceRole",
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("ec2.amazonaws.com"),
        new iam.ServicePrincipal("ecs.amazonaws.com")
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
      ],
    });

    this.inputBucket.grantRead(batchInstanceRole);
    this.outputBucket.grantWrite(batchInstanceRole);

    new iam.CfnInstanceProfile(this, "batchInstanceProfile", {
      instanceProfileName: batchInstanceRole.roleName,
      roles: [batchInstanceRole.roleName],
    });

    // Defaults for the compute_resources + user overrides
    const compute_resources: batch.ComputeResources = Object.assign(
      {
        type: batch.ComputeResourceType.SPOT,
        maxvCpus: 128,
        minvCpus: 0,
        desiredvCpus: 0,
        serviceRole: batchServiceRole.roleArn,
        spotIamFleetRole: spotFleetRole.roleArn,
        instanceRole: batchInstanceRole.roleName,
        instanceTypes: [
          ec2.InstanceType.of(ec2.InstanceClass.C4, ec2.InstanceSize.LARGE),
        ],
        vpc: props.vpc,
      },
      props.computeResources
    );

    // The fargate compute environment
    const spotFleetEnvironment = new batch.ComputeEnvironment(
      this,
      "SpotFleetEnvironment",
      {
        computeResources: compute_resources,
      }
    );

    //  A queue to run the jobs
    this.jobQueue = new batch.JobQueue(this, "JobQueue", {
      computeEnvironments: [
        {
          computeEnvironment: spotFleetEnvironment,
          order: 1,
        },
      ],
    });

    // A default job to run
    this.jobDef = new batch.JobDefinition(this, "TestJob", {
      container: {
        image: props.containerImage,
        executionRole: batchInstanceRole,
        jobRole: batchInstanceRole,
      },
      platformCapabilities: [batch.PlatformCapabilities.EC2],
      retryAttempts: 3,
      timeout: cdk.Duration.days(1),
    });
  }

  // lambda function to respond to events
  public createTriggerFunction(...filters: s3.NotificationKeyFilter[]) {
    this.bucketArrivalFunction = new lambda.Function(this, "BucketArrival", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("lambda/bucketarrival"),
      handler: "bucketarrival.handler",
      environment: {
        JOB_DEFINITION_NAME: this.jobDef.jobDefinitionName,
        JOB_QUEUE_NAME: this.jobQueue.jobQueueName,
        S3_OUTPUT_BUCKET: this.outputBucket.bucketName,
      },
    });

    // the lambda function needs to be able to submit jobs
    const batchSubmitPolicy = new iam.PolicyStatement({
      actions: ["batch:SubmitJob"],
      resources: [this.jobDef.jobDefinitionArn, this.jobQueue.jobQueueArn],
    });

    this.bucketArrivalFunction.role?.attachInlinePolicy(
      new iam.Policy(this, "submit-jobs-policy", {
        statements: [batchSubmitPolicy],
      })
    );

    // The lambda function can read the bucket (but doesn't actually need to in many cases)
    this.inputBucket.grantRead(this.bucketArrivalFunction);

    // Set up the notifications when objects arrive
    this.inputBucket.addObjectCreatedNotification(
      new s3n.LambdaDestination(this.bucketArrivalFunction),
      ...filters
    );
  }
}
