'use strict';

function handleProfiles(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    linkedin: process.env.LINKEDIN_PROFILE || '',
    github: process.env.GITHUB_PROFILE || '',
    b2b: 'I can quickly register as a sole proprietor in Armenia (or Georgia if required) and work via a standard B2B invoicing arrangement.\nAlternatively, I can work for crypto without paperwork - first payment after one week, then after two weeks, then moving to 1-2 payments per month.',
  }));
}

module.exports = [
  { method: 'GET', pattern: '/api/v1/copy', handler: handleProfiles },
];
