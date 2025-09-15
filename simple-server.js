const http = require('http');

const server = http.createServer((req, res) => {
  console.log('Request received:', req.url);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello, World!\n');});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

// Handle errors
server.on('error', (error) => {
  console.error('Server error:', error);
});
