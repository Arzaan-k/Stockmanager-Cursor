import { storage } from '../storage';
import { db } from '../db';
import { stockMovements, orders, orderItems } from '../../shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

export interface ProductRecommendation {
  productId: string;
  productName: string;
  sku: string;
  reason: string;
  confidence: number;
  type: 'low_stock' | 'frequently_used' | 'similar_products' | 'trending' | 'seasonal';
  metadata?: any;
}

export class RecommendationService {
  
  // Get low stock recommendations
  async getLowStockRecommendations(limit: number = 10): Promise<ProductRecommendation[]> {
    try {
      const products = await storage.getProducts();
      const lowStockProducts = products
        .filter(p => p.stockAvailable <= (p.minStockLevel || 10))
        .sort((a, b) => a.stockAvailable - b.stockAvailable)
        .slice(0, limit);

      return lowStockProducts.map(product => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        reason: `Low stock: ${product.stockAvailable} units remaining (min: ${product.minStockLevel || 10})`,
        confidence: Math.min(1, (product.minStockLevel || 10) / Math.max(1, product.stockAvailable)),
        type: 'low_stock' as const,
        metadata: {
          currentStock: product.stockAvailable,
          minStockLevel: product.minStockLevel || 10,
          urgency: product.stockAvailable === 0 ? 'critical' : 'warning'
        }
      }));
    } catch (error) {
      console.error('Error getting low stock recommendations:', error);
      return [];
    }
  }

  // Get frequently used products
  async getFrequentlyUsedRecommendations(limit: number = 10): Promise<ProductRecommendation[]> {
    try {
      const recentMovements = await db
        .select({
          productId: stockMovements.productId,
          totalQuantity: sql<number>`SUM(${stockMovements.quantity})`.as('totalQuantity'),
          movementCount: sql<number>`COUNT(*)`.as('movementCount')
        })
        .from(stockMovements)
        .where(sql`${stockMovements.createdAt} >= NOW() - INTERVAL '30 days'`)
        .groupBy(stockMovements.productId)
        .orderBy(desc(sql`SUM(${stockMovements.quantity})`))
        .limit(limit);

      const recommendations: ProductRecommendation[] = [];
      
      for (const movement of recentMovements) {
        const product = await storage.getProduct(movement.productId);
        if (product) {
          recommendations.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            reason: `Frequently used: ${movement.totalQuantity} units moved in last 30 days`,
            confidence: Math.min(1, movement.totalQuantity / 100), // Normalize to 0-1
            type: 'frequently_used' as const,
            metadata: {
              totalQuantity: movement.totalQuantity,
              movementCount: movement.movementCount,
              period: '30 days'
            }
          });
        }
      }

      return recommendations;
    } catch (error) {
      console.error('Error getting frequently used recommendations:', error);
      return [];
    }
  }

  // Get trending products (based on recent order activity)
  async getTrendingRecommendations(limit: number = 10): Promise<ProductRecommendation[]> {
    try {
      const trendingProducts = await db
        .select({
          productId: orderItems.productId,
          totalQuantity: sql<number>`SUM(${orderItems.quantity})`.as('totalQuantity'),
          orderCount: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`.as('orderCount')
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(sql`${orders.createdAt} >= NOW() - INTERVAL '7 days'`)
        .groupBy(orderItems.productId)
        .orderBy(desc(sql`SUM(${orderItems.quantity})`))
        .limit(limit);

      const recommendations: ProductRecommendation[] = [];
      
      for (const item of trendingProducts) {
        const product = await storage.getProduct(item.productId);
        if (product) {
          recommendations.push({
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            reason: `Trending: ${item.totalQuantity} units ordered in last 7 days across ${item.orderCount} orders`,
            confidence: Math.min(1, item.totalQuantity / 50), // Normalize to 0-1
            type: 'trending' as const,
            metadata: {
              totalQuantity: item.totalQuantity,
              orderCount: item.orderCount,
              period: '7 days'
            }
          });
        }
      }

      return recommendations;
    } catch (error) {
      console.error('Error getting trending recommendations:', error);
      return [];
    }
  }

  // Get similar products based on type and usage patterns
  async getSimilarProductRecommendations(productId: string, limit: number = 5): Promise<ProductRecommendation[]> {
    try {
      const targetProduct = await storage.getProduct(productId);
      if (!targetProduct) return [];

      const allProducts = await storage.getProducts();
      const similarProducts = allProducts
        .filter(p => p.id !== productId && p.type === targetProduct.type)
        .slice(0, limit);

      return similarProducts.map(product => ({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        reason: `Similar to ${targetProduct.name} (same type: ${product.type})`,
        confidence: 0.7, // Fixed confidence for similar products
        type: 'similar_products' as const,
        metadata: {
          similarTo: targetProduct.name,
          commonType: product.type
        }
      }));
    } catch (error) {
      console.error('Error getting similar product recommendations:', error);
      return [];
    }
  }

  // Get all recommendations combined
  async getAllRecommendations(limit: number = 20): Promise<ProductRecommendation[]> {
    try {
      const [
        lowStock,
        frequentlyUsed,
        trending,
      ] = await Promise.all([
        this.getLowStockRecommendations(Math.ceil(limit * 0.4)),
        this.getFrequentlyUsedRecommendations(Math.ceil(limit * 0.3)),
        this.getTrendingRecommendations(Math.ceil(limit * 0.3))
      ]);

      // Combine and deduplicate by productId
      const allRecommendations = [...lowStock, ...frequentlyUsed, ...trending];
      const uniqueRecommendations = new Map<string, ProductRecommendation>();

      for (const rec of allRecommendations) {
        const existing = uniqueRecommendations.get(rec.productId);
        if (!existing || rec.confidence > existing.confidence) {
          uniqueRecommendations.set(rec.productId, rec);
        }
      }

      return Array.from(uniqueRecommendations.values())
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, limit);
    } catch (error) {
      console.error('Error getting all recommendations:', error);
      return [];
    }
  }

  // Get recommendations for a specific user/context
  async getPersonalizedRecommendations(userId: string, limit: number = 10): Promise<ProductRecommendation[]> {
    try {
      // This could be enhanced with user-specific data
      // For now, return general recommendations
      return this.getAllRecommendations(limit);
    } catch (error) {
      console.error('Error getting personalized recommendations:', error);
      return [];
    }
  }
}

export const recommendationService = new RecommendationService();
