import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { storage } from '../storage';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    firstName?: string;
    lastName?: string;
  };
}

// Authentication middleware
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // For development, we'll use a simple approach
    // In production, you should use proper JWT validation
    if (token === 'mock-jwt-token') {
      // Get user from headers or use admin for testing
      const username = req.headers['x-user'] as string || 'admin';
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as string,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
      };
      
      return next();
    }

    // For real JWT tokens
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      const user = await storage.getUser(decoded.userId);
      
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid or inactive user' });
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role as string,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
      };
      
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Authorization middleware factory
export const authorize = (resource: string, action: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admin has all permissions
      if (req.user.role === 'admin') {
        return next();
      }

      // Check role permissions
      const hasPermission = await checkPermission(req.user.role, resource, action);
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: `${resource}:${action}`,
          role: req.user.role
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

// Check if a role has permission for a specific resource and action
export const checkPermission = async (role: string, resource: string, action: string): Promise<boolean> => {
  try {
    const result = await db.execute(sql`
      SELECT 1
      FROM permissions p
      INNER JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE p.resource = ${resource}
        AND p.action = ${action}
        AND rp.role = ${role}
    `);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Permission check error:', error);
    return false;
  }
};

// Role-based middleware shortcuts
export const requireEmployee = authorize('system', 'access');
export const requireManager = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({ error: 'Manager or admin access required' });
  }
  
  next();
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};
