<!--
SPDX-FileCopyrightText: 2022 Tim Cutts <tim@thecutts.org>

SPDX-License-Identifier: MIT
-->

# Canned batch cluster on Fargate

A common paradigm is to trigger batch jobs when files arrive in an S3 bucket.
Genomics batch jobs can be quite long running, and arrive in large numbers,
so the purpose here is to create an AWS Batch cluster, backed by Fargate,
to which jobs are submitted every time a file arrives in an input S3 bucket

NB.  This is very much a proof-of-concept bit of code, and contains very little error checking of any kind.

# Guard rails
For safety, there are a few guard rails in the construct:
* a timeout on each job of one day
* resource requirements default to just 0.25 vCPU and 512MB RAM.  To increase this you will need to replace the job definition with a new one, but keep its name as TestJob.

# How it works

The stack creates:
* An S3 bucket for input files
* An S3 bucket for output files
* A Fargate Spot compute environment
* An AWS Batch environment with a single job queue
* A job definition which runs a container (defined in the [`job_definitions/testjob`](job_definitions/testjob) directory)
* A lambda function, [`lambda/bucketarrival`](lambda/bucketarrival/bucketarrival.js) triggered by files arriving in the S3 input bucket, which submits jobs to the queue, setting environment variables for the job to know which file to work on, and where the output bucket is.

## Props

You must provide a container image that contains your job.  The container
will be passed three environment variables describing the buckets and object:

`S3_INPUT_BUCKET`, `S3_INPUT_OBJECT` and `S3_OUTPUT_BUCKET`.  Hopefully these
are self explanatory!

See the examples below for an example in this repository.

You must also provide a list of filters to specify the files you want to trigger the batch job.   An empty list `[]` will cause a job to be launched for every
object regardless of its name.

Optionally, use the bucket props to override the defaults on the ways the buckets are created, and the computeResources to override some of the defaults in the Fargate compute resource.

```javascript
// Subset of aws_batch_alpha.ComputeResources
interface ComputeResourcesSubset {
  maxvCpus?: number;
  minvCpus?: number;
  desiredvCpus?: number;
  bidPercentage?: number;
}

interface FargateBatchWithS3Props {
  vpc: ec2.Vpc;
  inputBucketProps?: s3.BucketProps;
  outputBucketProps?: s3.BucketProps;
  computeResources?: ComputeResourceSubset;
  containerImage: ecs.ContainerImage;
  filters: s3.NotificationKeyFilter[];
}
```
# Examples
## Example 1:  Simple case responding to .txt files:

```javascript
declare const vpc: ec2.Vpc;

const batchCluster = new FargateBatchWithS3Buckets(this, "Test", {
    vpc: vpc,
    containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
    filters: [{ suffix: ".txt" }]
});
```

## Example 2:  More complex setup

* Doesn't destroy the output bucket when the stack is deleted
* Migrates completed data in output bucket to cheaper tier after 30 days
* Expires data in the output bucket after a year
* Increases the vCPU limit from the default (256) to 1000
    
```javascript
declare const vpc: ec2.Vpc;

const batchCluster = new FargateBatchWithS3Buckets(this, "Test", {
    vpc: vpc,
    containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
    outputBucketProps: {
        autoDeleteObjects: false,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        lifecycleRules: [{
            abortIncompleteMultipartUploadAfter: cdk.Duration.days(90),
            expiration: cdk.Duration.days(365),
            transitions: [
                {
                  storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                  transitionAfter: cdk.Duration.days(30),
                }, 
            ],
        }]
    },
    computeResources: {
        maxvCpus: 1000,
    },
    filters: [],
});
```
