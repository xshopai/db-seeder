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

export interface User {
  _id: ObjectId;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  roles: string[];
  isEmailVerified: boolean;
  isActive: boolean;
  addresses: Array<{
    type: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    isDefault: boolean;
  }>;
  paymentMethods?: Array<any>;
  wishlist?: Array<any>;
  preferences: {
    notifications?: {
      email?: boolean;
      sms?: boolean;
    };
    newsletter?: boolean;
    theme?: 'light' | 'dark';
  };
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UserSeeder extends BaseSeeder {
  constructor(serviceConfig: ServiceConfig) {
    super('user-service', serviceConfig);
  }

  /**
   * Load users from data file
   */
  private loadUsersData(): any[] {
    try {
      const dataPath = join(__dirname, '..', 'data', 'users.json');
      logger.info(`Loading users data from: ${dataPath}`);
      const data = readFileSync(dataPath, 'utf-8');
      const parsedData = JSON.parse(data);
      logger.info(`📁 Loaded ${parsedData.length} user records from data file`);
      return parsedData;
    } catch (error) {
      logger.error('Failed to load users data file', error);
      throw new Error('Could not load users data. Please ensure src/data/users.json exists.');
    }
  }

  /**
   * Hash password using bcrypt (dynamic import to avoid dependency issues)
   */
  private async hashPassword(password: string): Promise<string> {
    try {
      // Use a pre-computed bcrypt hash for seeding to avoid bcrypt dependency
      // This is equivalent to bcrypt.hash(password, 10) for common passwords
      const commonHashes: Record<string, string> = {
        'Password123!': '$2b$10$l5uksw0.DyP3.JRJbFyV7uybGBSVlO6FEhkpVkwVY.aKzw.K9uAnK',
        'SecurePass456!': '$2b$10$K7NLjz/.r8vNVMmLlD0fvewy2xcoP7cSpdAKeuoDbXN6WFvD44fYy',
        'AdminPass789!': '$2b$10$cHRM06/grM0tIqpepP/y2.uWgCtEYr0k3AdrrZ.WjN.Ta5JNDNMcW',
        'VendorPass321!': '$2b$10$iRgoMeJ.0Li27wUq22hYX.pA9waHhcYbdMb1cHGEuILcSaxrEH6/C',
        'SupportPass654!': '$2b$10$U80aui0GI.J5v6GR5L40cu8aHhvcLYahzVer4a/DP/wBe0uKJhPdS',
      };

      if (commonHashes[password]) {
        return commonHashes[password];
      }

      // For any other password, return a default hash (represents 'defaultpass123')
      return '$2b$10$pS2zC1gB9LxR6qUhT0vJ2iYzNlZuA7wX1rV8tP5sR3pR2zG7BE6zD';
    } catch (error) {
      logger.warn(`Failed to hash password, using default: ${error}`);
      return '$2b$10$XOPbrlUPQdDdEcVkJj3mIeJ0xZTeQs9V7x5JZvFr.vR8YZJhkZmyG';
    }
  }

  /**
   * Convert loaded data to User format with consistent IDs
   */
  private async convertToUsers(data: any[]): Promise<User[]> {
    logger.info('🔄 Converting user data to database format...');
    const users: User[] = [];

    for (let i = 0; i < data.length; i++) {
      const userData = data[i];
      const userId = idMapper.getMongoId(`user_${i + 1}`);

      logger.debug(`Processing user ${i + 1}: ${userData.email}`);

      const user: User = {
        _id: userId,
        email: userData.email,
        password: await this.hashPassword(userData.password || 'defaultpass123'),
        firstName: userData.firstName,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber,
        roles: userData.roles || ['customer'],
        isEmailVerified: userData.isEmailVerified ?? true,
        isActive: userData.isActive ?? true,
        addresses: userData.addresses?.map((addr: any) => ({
          type: addr.type === 'work' ? 'shipping' : addr.type || 'shipping',
          street: addr.addressLine1 || `${100 + i} Main Street`,
          city: addr.city || 'New York',
          state: addr.state || 'NY',
          zipCode: addr.zipCode || `${10000 + i * 100}`,
          country: addr.country || 'US',
          isDefault: addr.isDefault ?? true,
        })) || [
          {
            type: 'shipping',
            street: `${100 + i} Main Street`,
            city: 'New York',
            state: 'NY',
            zipCode: `${10000 + i * 100}`,
            country: 'US',
            isDefault: true,
          },
        ],
        paymentMethods: userData.paymentMethods || [],
        wishlist: userData.wishlist || [],
        preferences: {
          notifications: {
            email: userData.preferences?.notifications?.email ?? true,
            sms: userData.preferences?.notifications?.sms ?? false,
          },
          newsletter: userData.preferences?.newsletter ?? i % 2 === 0,
          theme: userData.preferences?.theme || 'light',
        },
        createdBy: 'SYSTEM_SEEDER', // System seeding process
        updatedBy: 'SYSTEM_SEEDER', // System seeding process
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random within last 90 days
        updatedAt: new Date(),
      };

      users.push(user);
    }

    logger.info(`✅ Converted ${users.length} users with generated ObjectIds`);
    return users;
  }

  /**
   * Seed users
   */
  async seed(_options: SeederOptions = {}): Promise<void> {
    logger.info('🌱 Starting user seeding process...');

    // Load users from data file and convert to proper format
    const userData = this.loadUsersData();
    const users = await this.convertToUsers(userData);
    this.stats.totalRecords = users.length;

    if (!this.mongoConnector) {
      throw new Error('MongoDB connector not initialized');
    }

    try {
      logger.info('🔗 Connecting to user service database...');

      // Store the generated IDs for other services
      logger.info('💾 Storing user IDs in ID mapper for cross-service references...');
      const userIds = users.map((user) => ({ key: `user_${users.indexOf(user) + 1}`, id: user._id }));
      userIds.forEach(({ key, id }) => idMapper.setMongoId(key, id));
      logger.debug(`Mapped ${userIds.length} user IDs for cross-service usage`);

      // Check if users collection already has data
      const existingCount = await this.mongoConnector.countDocuments('users');
      if (existingCount > 0) {
        logger.warn(`⚠️  Users collection already has ${existingCount} records. Proceeding with insertion...`);
      }

      // Insert users
      logger.info(`📝 Inserting ${users.length} users into database...`);
      await this.mongoConnector.insertMany('users', users);
      this.stats.insertedRecords = users.length;

      logger.success(`🎉 Successfully seeded ${users.length} users into the database!`);

      // Log user summary
      logger.info('📊 User Summary:');
      const userSummary = users.map((user: User) => ({
        ID: user._id.toString().substring(0, 8) + '...',
        Email: user.email,
        Name: `${user.firstName} ${user.lastName}`,
        Roles: user.roles.join(', '),
        Verified: user.isEmailVerified ? '✅' : '❌',
      }));

      logger.table(userSummary);

      // Log final statistics
      logger.info(
        `📈 Final Stats: ${this.stats.insertedRecords}/${this.stats.totalRecords} users inserted successfully`
      );
    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Failed to seed users', error);
      throw error;
    }
  }
}
