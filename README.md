# Canned batch cluster on Fargate

A common paradigm is to trigger batch jobs when files arrive in an S3 bucket.
Genomics batch jobs can be quite long running, and arrive in large numbers,
so the purpose here is to create an AWS Batch cluster, backed by Fargate,
to which jobs are submitted every time a file arrives in an input S3 bucket

NB.  This is very much a proof-of-concept bit of code, and contains very little error checking of any kind.

# How it works

The stack creates:
* An S3 bucket
* A Fargate Spot compute environment
* An AWS Batch environment with a single job queue
* A job definition which runs a container (defined in the testjob directory)
* A lambda function triggered by files arriving in the S3 bucket, which submits jobs to the queue, setting an environment variable for the job to know which file to work on.
