// SPDX-FileCopyrightText: 2022 Tim Cutts <tim@thecutts.org>
//
// SPDX-License-Identifier: MIT

const AWS = require("aws-sdk");

const batch = new AWS.Batch();

exports.handler = async function (event) {
  const srcBucket = event.Records[0].s3.bucket.name;

  const srcKey = event.Records[0].s3.object.key;

  console.log(`Submitting job for ${srcKey}`);

  const params = {
    jobDefinition: process.env.JOB_DEFINITION_NAME,
    jobQueue: process.env.JOB_QUEUE_NAME,
    jobName: srcKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 127),
    retryStrategy: {
      attempts: 3,
    },
    containerOverrides: {
      environment: [
        {
          name: "S3_INPUT_OBJECT",
          value: srcKey,
        },
        {
          name: "S3_INPUT_BUCKET",
          value: srcBucket,
        },
        {
          name: "S3_OUTPUT_BUCKET",
          value: process.env.S3_OUTPUT_BUCKET,
        },
      ],
    },
  };

  console.log("Parameters: " + JSON.stringify(params));

  try {
    const data = await batch.submitJob(params).promise();
    console.log(data);
  } catch (err) {
    console.log(err);
  }
};
