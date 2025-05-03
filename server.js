import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
// app.use(express.static('public'));

// Store connected clients
const clients = new Set();

// SSE endpoint for clients to connect
app.get('/maintenance-status', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection message
  res.write('data: {"status": "connected"}\n\n');

  // Add client to the set
  clients.add(res);

  // Remove client when they disconnect
  req.on('close', () => clients.delete(res));
});

// Admin endpoint to trigger maintenance complete notification
app.post('/admin/maintenance-complete', (req, res) => {
  const secretKey = req.headers['x-admin-key'];
  
  // Simple security check - in production use proper authentication
  if (secretKey !== 'your-secret-key') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Notify all connected clients
  clients.forEach(client => {
    client.write('data: {"status": "complete"}\n\n');
  });

  res.json({ message: 'Maintenance complete notification sent' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});