import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';

interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface Order {
  customerId: string;
  items: OrderItem[];
  status: number;
  paymentStatus: number;
  shippingStatus: number;
  deliveredDate: string;
  notes: string;
}

interface Review {
  productId: string;
  userId: string;
  username: string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  status: string;
}

/**
 * Validate that reviews only come from users who have purchased the products
 */
export class ReviewValidator {
  private purchaseMap: Map<string, Set<string>> = new Map();

  constructor() {
    this.buildPurchaseMap();
  }

  /**
   * Build a map of user -> products they purchased
   */
  private buildPurchaseMap(): void {
    const ordersPath = join(process.cwd(), 'src', 'data', 'orders.json');
    const ordersData: Order[] = JSON.parse(readFileSync(ordersPath, 'utf-8'));

    for (const order of ordersData) {
      const userId = order.customerId;
      if (!this.purchaseMap.has(userId)) {
        this.purchaseMap.set(userId, new Set());
      }

      for (const item of order.items) {
        this.purchaseMap.get(userId)!.add(item.productId);
      }
    }

    logger.info('📦 Built purchase history map:');
    for (const [userId, products] of this.purchaseMap.entries()) {
      logger.info(`   ${userId}: ${Array.from(products).join(', ')}`);
    }
  }

  /**
   * Validate all reviews against purchase history
   */
  validateReviews(): { valid: Review[]; invalid: Review[]; violations: string[] } {
    const reviewsPath = join(process.cwd(), 'src', 'data', 'reviews.json');
    const reviewsData: Review[] = JSON.parse(readFileSync(reviewsPath, 'utf-8'));

    const valid: Review[] = [];
    const invalid: Review[] = [];
    const violations: string[] = [];

    logger.header('🔍 Validating Review Business Logic');

    for (let i = 0; i < reviewsData.length; i++) {
      const review = reviewsData[i];

      // Convert placeholder IDs to actual format for comparison
      const userId = review.userId.replace('PLACEHOLDER_USER_', 'user_');
      const productId = review.productId.replace('PLACEHOLDER_PRODUCT_', 'product_');

      const userPurchases = this.purchaseMap.get(userId) || new Set();
      const hasPurchased = userPurchases.has(productId);

      if (hasPurchased) {
        valid.push(review);
        logger.success(`✅ Review ${i + 1}: ${review.username} → ${productId} (purchased)`);
      } else {
        invalid.push(review);
        const violation = `❌ Review ${i + 1}: ${
          review.username
        } (${userId}) reviewing ${productId} - NEVER PURCHASED!`;
        violations.push(violation);
        logger.error(violation);
      }
    }

    logger.info('');
    logger.info(`📊 Validation Summary:`);
    logger.info(`   ✅ Valid reviews: ${valid.length}`);
    logger.info(`   ❌ Invalid reviews: ${invalid.length}`);
    logger.info(`   📉 Compliance rate: ${Math.round((valid.length / reviewsData.length) * 100)}%`);

    return { valid, invalid, violations };
  }

  /**
   * Generate valid reviews based on actual purchase history
   */
  generateValidReviews(): Review[] {
    const validReviews: Review[] = [];

    // Sample review templates with different sentiments
    const reviewTemplates = [
      {
        rating: 5,
        title: 'Absolutely love it!',
        comment:
          'This product exceeded all my expectations. The quality is outstanding and delivery was super fast. Highly recommend!',
        sentiment: 'positive',
      },
      {
        rating: 4,
        title: 'Great quality, minor issues',
        comment:
          'Overall very satisfied with this purchase. The product works as described, though delivery took a bit longer than expected.',
        sentiment: 'positive',
      },
      {
        rating: 5,
        title: 'Perfect for my needs',
        comment: 'Exactly what I was looking for! Great build quality, easy to use, and excellent customer service.',
        sentiment: 'positive',
      },
      {
        rating: 3,
        title: 'Decent product',
        comment: "It's okay for the price point. Does what it's supposed to do but nothing exceptional.",
        sentiment: 'neutral',
      },
      {
        rating: 4,
        title: 'Good value for money',
        comment: 'Impressed with the quality given the price. A few minor flaws but overall a solid purchase.',
        sentiment: 'positive',
      },
      {
        rating: 2,
        title: 'Not as described',
        comment: "Product didn't match the description on the website. Quality seems cheaper than expected.",
        sentiment: 'negative',
      },
    ];

    const usernames = {
      user_1: 'john.customer',
      user_2: 'sarah.premium',
      user_3: 'mike.admin',
      user_4: 'emma.vendor',
      user_5: 'alex.support',
    };

    let templateIndex = 0;

    for (const [userId, products] of this.purchaseMap.entries()) {
      for (const productId of products) {
        const template = reviewTemplates[templateIndex % reviewTemplates.length];
        const username = usernames[userId as keyof typeof usernames];

        validReviews.push({
          productId: `PLACEHOLDER_PRODUCT_${productId.replace('product_', '')}`,
          userId: `PLACEHOLDER_USER_${userId.replace('user_', '')}`,
          username,
          rating: template.rating,
          title: template.title,
          comment: template.comment,
          isVerifiedPurchase: true,
          status: 'approved',
        });

        templateIndex++;
      }
    }

    logger.info(`🔄 Generated ${validReviews.length} valid reviews based on actual purchases`);
    return validReviews;
  }
}
