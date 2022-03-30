// SPDX-FileCopyrightText: 2022 Tim Cutts <tim@thecutts.org>
//
// SPDX-License-Identifier: CC0-1.0

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
