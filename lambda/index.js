const https = require('https');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Client } = require('pg');

const ssm = new SSMClient({ region: 'us-west-2' });
const bedrock = new BedrockRuntimeClient({ region: 'us-west-2' });
const s3 = new S3Client({ region: 'us-west-2' });

const FEEDBACK_BUCKET = 'executive-dashboard-feedback-uploads';

async function getJiraToken() {
  const cmd = new GetParameterCommand({
    Name: '/executive-dashboard/jira-api-token',
    WithDecryption: true
  });
  const res = await ssm.send(cmd);
  return res.Parameter.Value;
}

async function getDbUrl() {
  const cmd = new GetParameterCommand({
    Name: '/executive-dashboard/db-url',
    WithDecryption: true
  });
  const res = await ssm.send(cmd);
  return res.Parameter.Value;
}

async function getDbClient() {
  const dbUrl = await getDbUrl();
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

function jiraRequest(path, token) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`skippy@jpv.dev:${token}`).toString('base64');
    const options = {
      hostname: 'bldglabs.atlassian.net',
      path,
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchOpenBugsForChat(token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jql: `project=SM AND issuetype in (Bug, Epic) AND status != "Done" AND status != "Deployed to Production" ORDER BY created DESC`,
      maxResults: 50,
      fields: ['summary', 'status', 'issuetype', 'description']
    });
    const auth = Buffer.from(`skippy@jpv.dev:${token}`).toString('base64');
    const options = {
      hostname: 'bldglabs.atlassian.net',
      path: '/rest/api/3/search/jql',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };

  // OPTIONS preflight for all routes
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // ─── POST /api/feedback/chat ───────────────────────────────────────────────
  if (event.httpMethod === 'POST' && event.path === '/api/feedback/chat') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { messages, submittedBy, feedbackId } = body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'messages array required' }) };
      }

      // Fetch open Jira issues for context
      const token = await getJiraToken();
      const issuesData = await fetchOpenBugsForChat(token);
      const issues = (issuesData.issues || []).map(i => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status.name,
        type: i.fields.issuetype.name
      }));

      const systemPrompt = `You are a helpful bug reporting assistant for the Skematic executive dashboard.
Help the executive describe their issue clearly, then match it against known bugs.

Be concise, warm, and professional. Keep responses short (2-3 sentences max).

After the user describes their issue, look through the open issues below and find the best match.
If you find a match, present it clearly: "I found something similar: [SM-XXX] — [summary]. Does this match what you're seeing?"
If no match, say you'll log it as a new issue.
Once resolved (linked or new), confirm and mention they can view it in 'My Reports'.

Open issues:
${JSON.stringify(issues, null, 2)}

IMPORTANT: End every response with a JSON action on its own line (no markdown, raw JSON only):
{"action":"continue"} — still gathering info
{"action":"link","jiraKey":"SM-XXX"} — user confirmed match to existing issue
{"action":"create"} — confirmed new issue, no existing match`;

      const cmd = new InvokeModelCommand({
        modelId: 'us.anthropic.claude-opus-4-6-v1:0',
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages
        })
      });

      const bedrockRes = await bedrock.send(cmd);
      const bedrockBody = JSON.parse(Buffer.from(bedrockRes.body).toString());
      const fullText = bedrockBody.content[0].text;

      // Parse the last line for a JSON action block
      const lines = fullText.trim().split('\n');
      const lastLine = lines[lines.length - 1].trim();
      let action = null;
      let reply = fullText;

      try {
        const parsed = JSON.parse(lastLine);
        if (parsed.action) {
          action = parsed;
          reply = lines.slice(0, -1).join('\n').trim();
        }
      } catch (e) {
        // Last line wasn't JSON, just use the full text as reply
      }

      // Save to DB if action is link or create
      let savedFeedbackId = feedbackId || null;
      if (action && (action.action === 'link' || action.action === 'create') && submittedBy) {
        try {
          const db = await getDbClient();
          const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
          const description = lastUserMessage ? lastUserMessage.content : '';
          const status = action.action === 'link' ? 'linked' : 'not_reviewed';
          const jiraKey = action.jiraKey || null;

          if (!savedFeedbackId) {
            const result = await db.query(
              'INSERT INTO feedback (submitted_by, description, status, jira_ticket_key, chat_transcript) VALUES ($1, $2, $3, $4, $5) RETURNING id',
              [submittedBy, description, status, jiraKey, JSON.stringify(messages)]
            );
            savedFeedbackId = result.rows[0].id;
          } else {
            await db.query(
              'UPDATE feedback SET description = $1, status = $2, jira_ticket_key = $3, chat_transcript = $4, updated_at = NOW() WHERE id = $5',
              [description, status, jiraKey, JSON.stringify(messages), savedFeedbackId]
            );
          }
          await db.end();
        } catch (dbErr) {
          console.error('DB error:', dbErr);
          // Don't fail the whole request on DB error
        }
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ reply, action, feedbackId: savedFeedbackId })
      };
    } catch (err) {
      console.error('feedback/chat error:', err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─── GET /api/feedback ────────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && event.path === '/api/feedback') {
    try {
      const submittedBy = event.queryStringParameters?.submittedBy;
      if (!submittedBy) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'submittedBy query param required' }) };
      }

      const db = await getDbClient();
      const result = await db.query(
        'SELECT id, submitted_by, description, status, jira_ticket_key, screenshot_url, created_at FROM feedback WHERE submitted_by = $1 ORDER BY created_at DESC',
        [submittedBy]
      );
      await db.end();

      const feedback = result.rows.map(row => ({
        id: row.id,
        submittedBy: row.submitted_by,
        description: row.description,
        status: row.status,
        jiraTicketKey: row.jira_ticket_key,
        screenshotUrl: row.screenshot_url,
        createdAt: row.created_at
      }));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ feedback })
      };
    } catch (err) {
      console.error('GET /api/feedback error:', err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─── POST /api/feedback/screenshot-url ───────────────────────────────────
  if (event.httpMethod === 'POST' && event.path === '/api/feedback/screenshot-url') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { feedbackId, filename, contentType } = body;

      if (!feedbackId || !filename || !contentType) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'feedbackId, filename, and contentType required' }) };
      }

      const key = `${feedbackId}/${filename}`;
      const cmd = new PutObjectCommand({
        Bucket: FEEDBACK_BUCKET,
        Key: key,
        ContentType: contentType
      });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });
      const fileUrl = `https://${FEEDBACK_BUCKET}.s3.us-west-2.amazonaws.com/${key}`;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ uploadUrl, fileUrl })
      };
    } catch (err) {
      console.error('screenshot-url error:', err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─── PATCH /api/feedback/:id/screenshot ──────────────────────────────────
  if (event.httpMethod === 'PATCH' && event.path && event.path.startsWith('/api/feedback/') && event.path.endsWith('/screenshot')) {
    try {
      const parts = event.path.split('/');
      // path: /api/feedback/:id/screenshot → parts: ['', 'api', 'feedback', ':id', 'screenshot']
      const id = parts[3];
      if (!id) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id required in path' }) };
      }

      const body = JSON.parse(event.body || '{}');
      const { screenshotUrl } = body;
      if (!screenshotUrl) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'screenshotUrl required' }) };
      }

      const db = await getDbClient();
      await db.query(
        'UPDATE feedback SET screenshot_url = $1, updated_at = NOW() WHERE id = $2',
        [screenshotUrl, id]
      );
      await db.end();

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true })
      };
    } catch (err) {
      console.error('PATCH screenshot error:', err);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ─── Original Jira proxy ──────────────────────────────────────────────────
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };

  try {
    const token = await getJiraToken();
    const project = event.queryStringParameters?.project || 'SM';

    // Fetch epics
    const epicsBody = JSON.stringify({
      jql: `project=${project} AND issuetype=Epic AND status != Deferred ORDER BY created ASC`,
      maxResults: 100,
      fields: ['summary', 'status', 'duedate', 'description', 'startdate', 'created']
    });

    const epicsData = await new Promise((resolve, reject) => {
      const auth = Buffer.from(`skippy@jpv.dev:${token}`).toString('base64');
      const options = {
        hostname: 'bldglabs.atlassian.net',
        path: '/rest/api/3/search/jql',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(epicsBody)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(epicsBody);
      req.end();
    });

    // Fetch story metrics
    const storiesData = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jql: `project=${project} AND issuetype=Story`,
        maxResults: 0,
        fields: ['status']
      });
      const auth = Buffer.from(`skippy@jpv.dev:${token}`).toString('base64');
      const options = {
        hostname: 'bldglabs.atlassian.net',
        path: '/rest/api/3/search/jql',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    // Fetch bug metrics
    const bugsData = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jql: `project=${project} AND issuetype=Bug AND status != Done`,
        maxResults: 0,
        fields: ['status']
      });
      const auth = Buffer.from(`skippy@jpv.dev:${token}`).toString('base64');
      const options = {
        hostname: 'bldglabs.atlassian.net',
        path: '/rest/api/3/search/jql',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    function extractText(node) {
      if (!node) return '';
      if (node.type === 'text') return node.text || '';
      return (node.content || []).map(extractText).join('');
    }

    const epics = (epicsData.issues || []).map(i => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status.name,
      startDate: i.fields.startdate || (i.fields.created ? i.fields.created.split('T')[0] : null),
      dueDate: i.fields.duedate || null,
      description: extractText(i.fields.description).slice(0, 300) || null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        epics,
        metrics: {
          totalStories: storiesData.total || 0,
          openBugs: bugsData.total || 0
        }
      })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
