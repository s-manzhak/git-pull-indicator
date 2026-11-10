const assert = require('node:assert/strict');
const {
  remoteUrlToBrowserUrl,
} = require('../out/remoteRepository');

const cases = [
  [
    'git@github.com:owner/repository.git',
    'https://github.com/owner/repository',
  ],
  [
    'ssh://git@gitlab.com/group/subgroup/repository.git',
    'https://gitlab.com/group/subgroup/repository',
  ],
  [
    'https://token@example.com/group/repository.git?private=1',
    'https://example.com/group/repository',
  ],
  [
    'git://bitbucket.org/team/repository.git',
    'https://bitbucket.org/team/repository',
  ],
  [
    'git@ssh.dev.azure.com:v3/organization/project/repository',
    'https://dev.azure.com/organization/project/_git/repository',
  ],
  ['../local-repository.git', undefined],
  ['file:///tmp/local-repository.git', undefined],
];

for (const [remoteUrl, expected] of cases) {
  assert.equal(remoteUrlToBrowserUrl(remoteUrl), expected, remoteUrl);
}

console.log(`Remote URL tests passed: ${cases.length}`);
