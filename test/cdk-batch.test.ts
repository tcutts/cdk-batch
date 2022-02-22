import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as CdkBatch from "../lib/cdk-batch-stack";

test("SQS Queue and SNS Topic Created", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CdkBatch.CdkBatchStack(app, "MyTestStack");
  // THEN

  const template = Template.fromStack(stack);

  console.error("No tests yet");
});
