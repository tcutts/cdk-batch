# Canned batch cluster on Fargate

A common paradigm is to trigger batch jobs when files arrive in an S3 bucket.
Genomics batch jobs can be quite long running, and arrive in large numbers,
so the purpose here is to create an AWS Batch cluster, backed by Fargate,
to which jobs are submitted every time a file arrives in an input S3 bucket

NB.  This is very much a proof-of-concept bit of code, and contains very little error checking of any kind.

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

Optionally, use the bucket props to override the defaults on the ways the buckets are created.

```javascript
interface FargateBatchWithS3Props {
  inputBucketProps?: s3.BucketProps;
  outputBucketProps?: s3.BucketProps;
  containerImage: ecs.ContainerImage;
  filters: s3.NotificationKeyFilter[];
}
```
# Examples
## Example responding to only .txt files:

```javascript
const batchCluster = new FargateBatchWithS3Buckets(this, "Test", {
    containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
    filters: [{ suffix: ".txt" }]
});
```

## Example that doesn't destroy the output bucket when the stack is deleted.
    
```javascript
const batchCluster = new FargateBatchWithS3Buckets(this, "Test", {
    containerImage: ecs.ContainerImage.fromAsset("job_definitions/testjob"),
    outputBucketProps: {
        autoDeleteObjects: false,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
    },
    filters: [],
});
```
