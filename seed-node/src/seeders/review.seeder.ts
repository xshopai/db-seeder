import { BaseSeeder, SeederOptions } from './base.seeder.js';
import { ServiceConfig } from '../config/services.js';
import { idMapper } from '../utils/id-mapper.js';
import { logger } from '../utils/logger.js';
import { ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Review {
  _id: ObjectId;
  productId: ObjectId;
  userId: ObjectId;
  username: string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  status: 'pending' | 'approved' | 'rejected';
  helpfulVotes: {
    helpful: number;
    notHelpful: number;
  };
  sentiment: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRating {
  _id: ObjectId;
  productId: ObjectId;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  lastUpdated: Date;
}

export class ReviewSeeder extends BaseSeeder {
  constructor(serviceConfig: ServiceConfig) {
    super('review-service', serviceConfig);
  }

  /**
   * Load reviews from data file
   */
  private loadReviewsData(): any[] {
    try {
      const dataPath = join(__dirname, '..', 'data', 'reviews.json');
      logger.info(`Loading reviews data from: ${dataPath}`);
      const data = readFileSync(dataPath, 'utf-8');
      const parsedData = JSON.parse(data);
      logger.info(`📁 Loaded ${parsedData.length} review records from data file`);
      return parsedData;
    } catch (error) {
      logger.error('Failed to load reviews data file', error);
      throw new Error('Could not load reviews data. Please ensure src/data/reviews.json exists.');
    }
  }

  /**
   * Convert loaded data to Review format with placeholder replacement
   */
  private convertToReviews(data: any[]): Review[] {
    const reviews: Review[] = [];

    for (let i = 0; i < data.length; i++) {
      const reviewData = data[i];
      const reviewId = idMapper.getMongoId(`review_${i + 1}`);

      // Replace placeholder user ID with real ID
      let userId = reviewData.userId;
      if (typeof userId === 'string' && userId.startsWith('PLACEHOLDER_USER_')) {
        const userIndex = parseInt(userId.replace('PLACEHOLDER_USER_', ''));
        userId = idMapper.getMongoId(`user_${userIndex}`);
      }

      // Replace placeholder product ID with real ID
      let productId = reviewData.productId;
      if (typeof productId === 'string' && productId.startsWith('PLACEHOLDER_PRODUCT_')) {
        const productIndex = parseInt(productId.replace('PLACEHOLDER_PRODUCT_', ''));
        productId = idMapper.getMongoId(`product_${productIndex}`);
      }

      const review: Review = {
        _id: reviewId,
        productId: productId,
        userId: userId,
        username: reviewData.username,
        rating: reviewData.rating,
        title: reviewData.title,
        comment: reviewData.comment,
        isVerifiedPurchase: reviewData.isVerifiedPurchase ?? true,
        status: reviewData.status || 'approved',
        helpfulVotes: {
          helpful: reviewData.helpfulVotes?.helpful || 0,
          notHelpful: reviewData.helpfulVotes?.notHelpful || 0,
        },
        sentiment: {
          score: reviewData.sentiment?.score || (reviewData.rating >= 4 ? 0.8 : reviewData.rating <= 2 ? -0.8 : 0),
          label:
            reviewData.sentiment?.label ||
            (reviewData.rating >= 4 ? 'positive' : reviewData.rating <= 2 ? 'negative' : 'neutral'),
          confidence: reviewData.sentiment?.confidence || 0.85,
        },
        createdAt: new Date(reviewData.createdAt || Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random within last 30 days
        updatedAt: new Date(),
      };

      reviews.push(review);
    }

    return reviews;
  }

  /**
   * Generate product ratings based on reviews
   */
  private generateProductRatings(reviews: Review[]): ProductRating[] {
    const ratingsMap = new Map<
      string,
      {
        totalRating: number;
        count: number;
        distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
      }
    >();

    // Aggregate reviews by product
    reviews.forEach((review) => {
      const productIdStr = review.productId.toString();
      const existing = ratingsMap.get(productIdStr) || {
        totalRating: 0,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };

      existing.totalRating += review.rating;
      existing.count += 1;
      existing.distribution[review.rating as keyof typeof existing.distribution] += 1;

      ratingsMap.set(productIdStr, existing);
    });

    // Convert to ProductRating objects
    return Array.from(ratingsMap.entries()).map(([productIdStr, data]) => {
      const averageRating = Math.round((data.totalRating / data.count) * 10) / 10; // Round to 1 decimal place

      return {
        _id: new ObjectId(),
        productId: new ObjectId(productIdStr),
        averageRating,
        totalReviews: data.count,
        ratingDistribution: data.distribution,
        lastUpdated: new Date(),
      };
    });
  }

  /**
   * Seed reviews and product ratings
   */
  async seed(_options: SeederOptions = {}): Promise<void> {
    logger.info('🌱 Starting review seeding process...');

    try {
      if (!this.mongoConnector) {
        throw new Error('MongoDB connector not initialized');
      }

      logger.info('🔗 Connecting to review service database...');

      // Load reviews from data file and convert to proper format
      const reviewsData = this.loadReviewsData();
      logger.info('🔄 Converting review data to database format...');
      const reviews = this.convertToReviews(reviewsData);
      logger.info('📈 Generating product ratings from reviews...');
      const productRatings = this.generateProductRatings(reviews);

      this.stats.totalRecords = reviews.length + productRatings.length;

      logger.info(`✅ Prepared ${reviews.length} reviews and ${productRatings.length} product ratings`);

      // Check existing data
      const existingReviews = await this.mongoConnector.countDocuments('reviews');
      const existingRatings = await this.mongoConnector.countDocuments('product_ratings');
      if (existingReviews > 0 || existingRatings > 0) {
        logger.warn(
          `⚠️  Collections already have data: ${existingReviews} reviews, ${existingRatings} ratings. Proceeding with insertion...`
        );
      }

      // Insert reviews
      logger.info(`📝 Inserting ${reviews.length} reviews into database...`);
      await this.mongoConnector.insertMany('reviews', reviews);
      logger.success(`✅ Inserted ${reviews.length} reviews`);

      // Insert product ratings
      logger.info(`📝 Inserting ${productRatings.length} product ratings into database...`);
      await this.mongoConnector.insertMany('product_ratings', productRatings);
      logger.success(`✅ Inserted ${productRatings.length} product ratings`);

      this.stats.insertedRecords = reviews.length + productRatings.length;

      logger.success(`🎉 Successfully seeded ${this.stats.insertedRecords} total records into the database!`);

      // Log review summary
      const reviewSummary = reviews.slice(0, 10).map((review) => ({
        'Review ID': review._id.toString().substring(0, 8) + '...',
        'Product ID': review.productId.toString().substring(0, 8) + '...',
        User: review.username,
        Rating: '⭐'.repeat(review.rating),
        Title: review.title.length > 25 ? review.title.substring(0, 25) + '...' : review.title,
        Status: review.status === 'approved' ? '✅' : '⏳',
        Verified: review.isVerifiedPurchase ? '✅' : '❌',
      }));

      logger.table(reviewSummary);

      if (reviews.length > 10) {
        logger.info(`... and ${reviews.length - 10} more reviews`);
      }

      // Log product ratings summary
      logger.info('📊 Product Ratings Summary:');
      const ratingsSummary = productRatings.map((rating) => ({
        'Product ID': rating.productId.toString().substring(0, 8) + '...',
        'Avg Rating': `⭐ ${rating.averageRating}/5`,
        'Total Reviews': rating.totalReviews,
        Distribution: `5:${rating.ratingDistribution[5]} 4:${rating.ratingDistribution[4]} 3:${rating.ratingDistribution[3]} 2:${rating.ratingDistribution[2]} 1:${rating.ratingDistribution[1]}`,
      }));

      logger.table(ratingsSummary);

      // Log final statistics
      logger.info(
        `📈 Final Stats: ${this.stats.insertedRecords}/${this.stats.totalRecords} records inserted successfully`
      );

      // Sync review aggregates to product service
      logger.info('🔄 Syncing review aggregates to product service...');
      await this.syncReviewAggregatesToProducts(productRatings);
      logger.success('✅ Review aggregates synced to product service');

    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Failed to seed reviews', error);
      throw error;
    }
  }

  /**
   * Sync review aggregates to product service (denormalized data)
   */
  private async syncReviewAggregatesToProducts(productRatings: ProductRating[]): Promise<void> {
    let productClient = null;
    try {
      // Build MongoDB URL for product service
      const productConfig = this.serviceConfig.config as any;
      const productDbUrl = `mongodb://${productConfig.username}:${productConfig.password}@${productConfig.host}:27019/product_service_db?authSource=${productConfig.authSource}`;
      
      logger.info(`Connecting to product service database at localhost:27019/product_service_db...`);
      
      const { MongoClient } = await import('mongodb');
      productClient = new MongoClient(productDbUrl);
      await productClient.connect();
      const productDb = productClient.db();

      logger.info(`Updating ${productRatings.length} products with review aggregates...`);

      let updated = 0;
      for (const rating of productRatings) {
        const result = await productDb.collection('products').updateOne(
          { _id: rating.productId },
          {
            $set: {
              review_aggregates: {
                average_rating: rating.averageRating,
                total_review_count: rating.totalReviews,
                last_updated: new Date(),
              },
            },
          }
        );
        if (result.modifiedCount > 0) updated++;
      }

      logger.success(`✅ Updated ${updated}/${productRatings.length} products with review aggregates`);
    } catch (error) {
      logger.error('Failed to sync review aggregates to products:', error);
      // Don't throw - this is a non-critical operation
    } finally {
      if (productClient) {
        await productClient.close();
      }
    }
  }

  /**
   * Clear all review data
   */
  async clear(): Promise<void> {
    logger.info('🧹 Clearing review data...');

    if (!this.mongoConnector) {
      throw new Error('MongoDB connector not initialized');
    }

    try {
      await this.mongoConnector.clearCollection('reviews');
      await this.mongoConnector.clearCollection('product_ratings');

      logger.success('✅ Review data cleared successfully');
    } catch (error) {
      logger.error('❌ Failed to clear review data:', error);
      throw error;
    }
  }
}
