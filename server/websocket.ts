import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { log } from './vite';
import { storage } from './storage';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      log('WebSocket client connected');

      ws.on('close', () => {
        this.clients.delete(ws);
        log('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        log(`WebSocket error: ${error.message}`);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to inventory updates service'
      }));
    });
  }

  // Broadcast inventory updates to all connected clients
  async broadcastInventoryUpdate(productId: string) {
    try {
      const product = await storage.getProduct(productId);
      if (product) {
        const message = JSON.stringify({
          type: 'inventory_update',
          productId: product.id,
          productName: product.name,
          stockAvailable: product.stockAvailable,
          stockTotal: product.stockTotal,
          stockUsed: product.stockUsed,
          timestamp: new Date().toISOString()
        });

        this.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      }
    } catch (error) {
      console.error('Error broadcasting inventory update:', error);
    }
  }

  // Broadcast product search suggestions (for unrecognized products)
  broadcastProductSearch(suggestions: any[]) {
    const message = JSON.stringify({
      type: 'product_search',
      suggestions,
      timestamp: new Date().toISOString()
    });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }
}