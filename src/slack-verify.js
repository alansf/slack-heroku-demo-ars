/**
 * Standalone Slack URL Verification Server
 * 
 * This is a minimal Express server that only handles Slack URL verification.
 * It runs on a different port (3001) from the main application and only
 * responds to the challenge parameter for URL verification.
 */

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

// Create a minimal Express app just for Slack verification
const app = express();

// Use raw body parser to capture the raw request
app.use((req, res, next) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    try {
      if (data && data.length > 0) {
        req.body = JSON.parse(data);
      }
    } catch (e) {
      console.error('Error parsing request body:', e);
    }
    next();
  });
});

// Simple logging middleware
app.use((req, res, next) => {
  console.log(`[Slack Verify] ${req.method} ${req.url}`);
  next();
});

// Handle Slack URL verification challenge
app.post('/slack/events', (req, res) => {
  console.log('Received request to /slack/events');
  console.log('Request body:', req.body);
  
  // Check if this is a challenge request from Slack
  if (req.body && req.body.type === 'url_verification') {
    const challenge = req.body.challenge;
    console.log('Responding to Slack URL verification challenge with:', challenge);
    
    // Return ONLY the challenge string value directly
    return res.status(200).send(challenge);
  }
  
  // For any other requests, just return OK
  return res.status(200).json({ status: 'ok' });
});

// Start the server on a different port
const PORT = process.env.SLACK_VERIFY_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Slack verification server listening on port ${PORT}`);
  console.log('URL for Slack Events API: http://localhost:${PORT}/slack/events');
});