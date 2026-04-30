const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: '*'
}));
app.use(express.json());

// ============================================
// CONFIG - Yeh values Vercel environment variables mein daalni hain
// ============================================
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const BASE_EMAIL = 'dropmailservices@gmail.com'; // aapki Gmail

// ============================================
// Access Token lena (refresh token se)
// ============================================
async function getAccessToken() {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  return res.data.access_token;
}

// ============================================
// Random Gmail address generate karna
// dropmailservices+xyz123@gmail.com style
// ============================================
app.get('/api/email', (req, res) => {
  const random = Math.random().toString(36).substring(2, 10);
  const email = `dropmailservices+${random}@gmail.com`;
  res.json({ email, tag: random });
});

// ============================================
// Inbox check karna - specific tag ke emails
// ============================================
app.get('/api/inbox', async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) return res.status(400).json({ error: 'tag required' });

    const accessToken = await getAccessToken();

    // Gmail API se emails fetch karo jo is tag pe aaye hain
    const searchRes = await axios.get(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: `to:dropmailservices+${tag}@gmail.com`,
          maxResults: 20
        }
      }
    );

    const messages = searchRes.data.messages || [];

    if (messages.length === 0) {
      return res.json({ emails: [] });
    }

    // Har email ki details fetch karo
    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const detail = await axios.get(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] }
          }
        );

        const headers = detail.data.payload.headers;
        const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

        return {
          id: msg.id,
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          snippet: detail.data.snippet
        };
      })
    );

    res.json({ emails: emailDetails });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch inbox', details: err.message });
  }
});

// ============================================
// Single email ka full body lena
// ============================================
app.get('/api/email/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = await getAccessToken();

    const detail = await axios.get(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { format: 'full' }
      }
    );

    const headers = detail.data.payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    // Email body extract karna
    let body = '';
    const parts = detail.data.payload.parts || [];

    if (parts.length > 0) {
      // HTML body prefer karo
      const htmlPart = parts.find(p => p.mimeType === 'text/html');
      const textPart = parts.find(p => p.mimeType === 'text/plain');
      const part = htmlPart || textPart;
      if (part?.body?.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    } else if (detail.data.payload.body?.data) {
      body = Buffer.from(detail.data.payload.body.data, 'base64').toString('utf-8');
    }

    res.json({
      from: getHeader('From'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch email', details: err.message });
  }
});

// ============================================
// Auth callback (refresh token lene ke liye - already done)
// ============================================
app.get('/auth/callback', (req, res) => {
  res.json({ message: 'Auth complete! Refresh token already saved.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`DropMail backend running on port ${PORT}`));
