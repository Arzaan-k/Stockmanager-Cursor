import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
// import { WebSocketService } from "./websocket";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  
  // WebSocket service temporarily disabled due to compilation issues
  // const webSocketService = new WebSocketService(server);
  // 
  // // Make WebSocket service available globally
  // (global as any).webSocketService = webSocketService;

  // Initialize permissions and roles
  try {
    await storage.initializePermissions();
    log("Permissions initialized successfully");
  } catch (e) {
    log("Warning: failed to initialize permissions");
  }

  // Ensure a default admin user exists for easy login in development/demo
  try {
    const admin = await storage.getUserByUsername("admin");
    if (!admin) {
      await storage.createUser({
        username: "admin",
        email: "admin@example.com",
        password: "admin",
        role: "admin",
      });
      log("Seeded default admin user (username: admin, password: admin)");
    } else if (admin.password !== "admin") {
      await storage.updateUser(admin.id, { password: "admin" });
      log("Updated admin user's password to default 'admin'");
    }

    // Create a default employee user for testing
    const employee = await storage.getUserByUsername("employee");
    if (!employee) {
      await storage.createUser({
        username: "employee",
        email: "employee@example.com",
        password: "employee",
        role: "employee",
        firstName: "John",
        lastName: "Doe"
      });
      log("Seeded default employee user (username: employee, password: employee)");
    }
  } catch (e) {
    log("Warning: failed to ensure default users");
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions: {
    port: number;
    host: string;
    reusePort?: boolean;
  } = {
    port,
    host: "0.0.0.0",
  };

  // reusePort is not supported on Windows; enabling it causes ENOTSUP
  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
