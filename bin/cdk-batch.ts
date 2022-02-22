#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CdkBatchStack } from "../lib/cdk-batch-stack";

const app = new cdk.App();
const stack = new CdkBatchStack(app, "CdkBatchStack");

cdk.Tags.of(stack).add("purpose", "BatchTest");
