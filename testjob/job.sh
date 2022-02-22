#!/bin/bash

date
echo "Args: $@"
echo "This is my simple test job!."
echo "jobId: $AWS_BATCH_JOB_ID"
echo "jobQueue: $AWS_BATCH_JQ_NAME"
echo "computeEnvironment: $AWS_BATCH_CE_NAME"
echo "inputFile: $S3_INPUT_OBJECT"
echo "inputBucket: $S3_INPUT_BUCKET"
date
