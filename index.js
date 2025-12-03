// index.js
require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// 1) Set up OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// If we already have a refresh token, set credentials now
if (process.env.GOOGLE_REFRESH_TOKEN) {
  oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
}

// 2) Route to start Google OAuth (you open this yourself once)
app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly'
  ];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });

  res.redirect(authUrl);
});

// 3) OAuth callback: Google redirects here with ?code=...
app.get('/oauth2/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oAuth2Client.getToken(code);

    console.log('Tokens received from Google:', tokens);

    res.send(`
      <h1>Auth successful</h1>
      <p>Copy this refresh token and put it into your .env file as GOOGLE_REFRESH_TOKEN:</p>
      <pre>${tokens.refresh_token || 'No refresh_token (may already be granted before)'}</pre>
    `);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).send('Error during OAuth callback');
  }
});

// 4) Main API for Voiceflow: get availability
app.get('/api/calendar/availability', async (req, res) => {
  try {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(400).json({ error: 'No refresh token configured yet.' });
    }

    oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

    const { timeMin, timeMax } = req.query;
    if (!timeMin || !timeMax) {
      return res.status(400).json({ error: 'timeMin and timeMax query params are required.' });
    }

    console.log('Requesting free/busy with:', {
  timeMin,
  timeMax,
  calendarId: process.env.CALENDAR_ID
});

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        timeZone: 'America/Chicago',
        items: [{ id: process.env.CALENDAR_ID }]
      }
    });

    const busy = response.data.calendars[process.env.CALENDAR_ID].busy;
    res.json({ busy });

} catch (err) {
  console.error('Error fetching free/busy details:');
  if (err.response && err.response.data) {
    console.error(JSON.stringify(err.response.data, null, 2));
  } else {
    console.error(err.message);
  }
  res.status(500).json({ error: 'Error fetching calendar availability.' });
}

});

// Start server
app.listen(process.env.PORT, () => {
  console.log(`Server listening on http://localhost:${process.env.PORT}`);
});

