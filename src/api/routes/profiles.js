'use strict';
const { b2b } = require('../../../constants/text.constants.js');

function handleProfiles(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    linkedin: process.env.LINKEDIN_PROFILE || '',
    github: process.env.GITHUB_PROFILE || '',
    b2b,
  }));
}

module.exports = [
  { method: 'GET', pattern: '/api/v1/copy', handler: handleProfiles },
];
