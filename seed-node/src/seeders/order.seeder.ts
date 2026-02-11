import { BaseSeeder, SeederOptions } from './base.seeder.js';
import { ServiceConfig } from '../config/services.js';
import { idMapper } from '../utils/id-mapper.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sql from 'mssql';
import { MSSQLConnector } from '../connectors/mssql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  totalPrice: number;
  discountAmount: number;
  taxAmount: number;
  shippingCostPerItem: number;
  discountPercentage: number;
  isGiftWrapped: boolean;
  giftWrapCost: number;
  refundedAmount: number;
  isReturnable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  customerId: string;
  orderNumber: string;
  status: number; // 0=Created, 1=Processing, 2=Shipped, 3=Delivered, 4=Cancelled
  paymentStatus: number; // 0=Pending, 1=Paid, 2=Failed, 3=Refunded
  shippingStatus: number; // 0=NotShipped, 1=Shipped, 2=Delivered, 3=Returned
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
  shippingCost: number;
  totalAmount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingZipCode: string;
  shippingCountry: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingZipCode: string;
  billingCountry: string;
  isReturnable: boolean;
  deliveredDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  items: OrderItem[];
}

export class OrderSeeder extends BaseSeeder {
  private sqlPool: sql.ConnectionPool | null = null;
  private mssqlConnector: MSSQLConnector | null = null;

  constructor(serviceConfig: ServiceConfig) {
    super('order-service', serviceConfig);
  }

  /**
   * Connect to SQL Server database
   */
  async connectToSQLServer(): Promise<void> {
    try {
      this.mssqlConnector = new MSSQLConnector(this.serviceConfig.config as any);
      await this.mssqlConnector.connect();
      this.sqlPool = this.mssqlConnector.getPool();
    } catch (error) {
      logger.error('Failed to connect to SQL Server', error);
      throw error;
    }
  }

  /**
   * Load order data from JSON file
   */
  private loadOrdersData(): any[] {
    try {
      const dataPath = join(__dirname, '..', 'data', 'orders.json');
      logger.info(`Loading orders data from: ${dataPath}`);
      const data = readFileSync(dataPath, 'utf-8');
      const parsedData = JSON.parse(data);
      logger.info(`📁 Loaded ${parsedData.length} order records from data file`);
      return parsedData;
    } catch (error) {
      logger.error('Failed to load orders data file', error);
      // Return default order data if file doesn't exist
      return this.getDefaultOrderData();
    }
  }
  private getDefaultOrderData(): any[] {
    return [
      {
        customerId: 'user_1', // John Customer
        items: [
          { productId: 'product_1', quantity: 1, unitPrice: 29.99 }, // Classic White T-Shirt
          { productId: 'product_4', quantity: 1, unitPrice: 45.99 }, // Gold Layered Necklace
        ],
        status: 3, // Delivered
        paymentStatus: 1, // Paid
        shippingStatus: 2, // Delivered
        deliveredDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      },
      {
        customerId: 'user_2', // Sarah Premium
        items: [
          { productId: 'product_2', quantity: 1, unitPrice: 79.99 }, // Floral Summer Dress
          { productId: 'product_5', quantity: 1, unitPrice: 159.99 }, // Leather Crossbody Bag
        ],
        status: 3, // Delivered
        paymentStatus: 1, // Paid
        shippingStatus: 2, // Delivered
        deliveredDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      },
      {
        customerId: 'user_3', // Mike Admin
        items: [
          { productId: 'product_6', quantity: 1, unitPrice: 59.99 }, // Oxford Button-Down Shirt
          { productId: 'product_8', quantity: 1, unitPrice: 199.99 }, // Stainless Steel Watch
        ],
        status: 3, // Delivered
        paymentStatus: 1, // Paid
        shippingStatus: 2, // Delivered
        deliveredDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      },
      {
        customerId: 'user_4', // Emma Vendor
        items: [
          { productId: 'product_3', quantity: 1, unitPrice: 89.99 }, // High-Waist Skinny Jeans
          { productId: 'product_7', quantity: 1, unitPrice: 79.99 }, // Slim Fit Chinos
        ],
        status: 3, // Delivered
        paymentStatus: 1, // Paid
        shippingStatus: 2, // Delivered
        deliveredDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
      },
      {
        customerId: 'user_5', // Alex Support
        items: [
          { productId: 'product_9', quantity: 1, unitPrice: 39.99 }, // Kids Graphic T-Shirt Pack
          { productId: 'product_10', quantity: 1, unitPrice: 49.99 }, // Athletic Sneakers
        ],
        status: 3, // Delivered
        paymentStatus: 1, // Paid
        shippingStatus: 2, // Delivered
        deliveredDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      },
    ];
  }

  /**
   * Convert loaded data to Order format
   */
  private convertToOrders(data: any[]): Order[] {
    logger.info('🔄 Converting order data to database format...');
    const orders: Order[] = [];

    for (let i = 0; i < data.length; i++) {
      const orderData = data[i];
      const orderId = this.generateUuid();
      const customerId = idMapper.getMongoId(orderData.customerId).toString();

      if (i < 5) logger.debug(`Processing order ${i + 1} for customer: ${orderData.customerId}`);

      // Calculate totals
      const subtotal = orderData.items.reduce((sum: number, item: any) => sum + item.unitPrice * item.quantity, 0);
      const discountAmount = orderData.discountAmount || 0; // Discount amount (default 0)
      const taxRate = 0.08; // 8% tax
      const taxAmount = (subtotal - discountAmount) * taxRate;
      const shippingCost = subtotal > 100 ? 0 : 9.99; // Free shipping over $100
      const totalAmount = subtotal - discountAmount + taxAmount + shippingCost;

      // Get user info for customer details
      const userEmail = this.getUserEmail(orderData.customerId);
      const userName = this.getUserName(orderData.customerId);
      const userPhone = this.getUserPhone(orderData.customerId);

      const order: Order = {
        id: orderId,
        customerId,
        orderNumber: `ORD-${String(Date.now()).slice(-8)}-${String(i + 1).padStart(3, '0')}`,
        status: orderData.status || 3, // Delivered
        paymentStatus: orderData.paymentStatus || 1, // Paid
        shippingStatus: orderData.shippingStatus || 2, // Delivered
        subtotal,
        discountAmount,
        taxAmount,
        taxRate,
        shippingCost,
        totalAmount,
        currency: 'USD',
        customerEmail: userEmail,
        customerName: userName,
        customerPhone: userPhone,
        shippingAddressLine1: '123 Main Street',
        shippingAddressLine2: '',
        shippingCity: 'New York',
        shippingState: 'NY',
        shippingZipCode: '10001',
        shippingCountry: 'US',
        billingAddressLine1: '123 Main Street',
        billingAddressLine2: '',
        billingCity: 'New York',
        billingState: 'NY',
        billingZipCode: '10001',
        billingCountry: 'US',
        isReturnable: true,
        deliveredDate: orderData.deliveredDate
          ? new Date(orderData.deliveredDate)
          : new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        createdAt: new Date(
          (orderData.deliveredDate ? new Date(orderData.deliveredDate).getTime() : Date.now()) -
            5 * 24 * 60 * 60 * 1000,
        ),
        updatedAt: orderData.deliveredDate
          ? new Date(orderData.deliveredDate)
          : new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        createdBy: customerId, // Use the actual customer who placed the order
        items: this.convertToOrderItems(orderId, orderData.items),
      };

      orders.push(order);
    }

    logger.info(`✅ Converted ${orders.length} orders with generated UUIDs`);
    return orders;
  }

  /**
   * Convert items to OrderItem format
   */
  private convertToOrderItems(orderId: string, items: any[]): OrderItem[] {
    return items.map((item: any, index: number) => {
      const productId = idMapper.getMongoId(item.productId).toString();
      const unitPrice = item.unitPrice || 99.99;
      const quantity = item.quantity || 1;
      const totalPrice = unitPrice * quantity;

      return {
        id: this.generateUuid(),
        orderId,
        productId,
        productName: this.getProductName(item.productId),
        productSku: `SKU-${String(index + 1).padStart(4, '0')}`,
        quantity,
        unitPrice,
        originalPrice: unitPrice,
        totalPrice,
        discountAmount: 0,
        taxAmount: totalPrice * 0.08,
        shippingCostPerItem: 0,
        discountPercentage: 0,
        isGiftWrapped: false,
        giftWrapCost: 0,
        refundedAmount: 0,
        isReturnable: true,
        createdAt: new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      };
    });
  }

  /**
   * Generate UUID for PostgreSQL
   */
  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Helper to get user email by user key
   */
  private getUserEmail(userKey: string): string {
    const emails: Record<string, string> = {
      user_1: 'john.customer@example.com',
      user_2: 'sarah.premium@example.com',
      user_3: 'mike.admin@example.com',
      user_4: 'emma.vendor@example.com',
      user_5: 'alex.support@example.com',
    };
    return emails[userKey] || 'unknown@example.com';
  }

  /**
   * Helper to get user name by user key
   */
  private getUserName(userKey: string): string {
    const names: Record<string, string> = {
      user_1: 'John Anderson',
      user_2: 'Sarah Johnson',
      user_3: 'Michael Smith',
      user_4: 'Emma Wilson',
      user_5: 'Alexander Brown',
    };
    return names[userKey] || 'Unknown User';
  }

  /**
   * Helper to get user phone by user key
   */
  private getUserPhone(userKey: string): string {
    const phones: Record<string, string> = {
      user_1: '+1-555-0101',
      user_2: '+1-555-0102',
      user_3: '+1-555-0103',
      user_4: '+1-555-0104',
      user_5: '+1-555-0105',
    };
    return phones[userKey] || '+1-555-0000';
  }

  /**
   * Helper to get product name by product key
   */
  private getProductName(productKey: string): string {
    const names: Record<string, string> = {
      product_1: 'Classic White T-Shirt',
      product_2: 'Floral Summer Dress',
      product_3: 'High-Waist Skinny Jeans',
      product_4: 'Gold Layered Necklace',
      product_5: 'Leather Crossbody Bag',
      product_6: 'Oxford Button-Down Shirt',
      product_7: 'Slim Fit Chinos',
      product_8: 'Stainless Steel Watch',
      product_9: 'Kids Graphic T-Shirt Pack',
      product_10: 'Athletic Sneakers',
    };
    return names[productKey] || 'Unknown Product';
  }

  /**
   * Seed orders
   */
  async seed(_options: SeederOptions = {}): Promise<void> {
    logger.info('🌱 Starting order seeding process...');

    try {
      // Connect to SQL Server
      await this.connectToSQLServer();

      // Load and convert data
      const rawData = this.loadOrdersData();
      const orders = this.convertToOrders(rawData);
      this.stats.totalRecords = orders.length;

      // Check if tables have data
      const existingOrdersResult = await this.sqlPool!.request().query('SELECT COUNT(*) as count FROM [Orders]');
      const existingCount = parseInt(existingOrdersResult.recordset[0].count);

      if (existingCount > 0) {
        logger.warn(`⚠️  Orders table already has ${existingCount} records. Proceeding with insertion...`);
      }

      // Insert orders and items
      for (const order of orders) {
        await this.insertOrder(order);
        await this.insertOrderItems(order.items);
      }

      this.stats.insertedRecords = orders.length;
      logger.success(`🎉 Successfully seeded ${orders.length} orders into the database!`);

      // Log order summary
      this.logOrderSummary(orders);
    } catch (error) {
      this.stats.errors++;
      logger.error('❌ Failed to seed orders', error);
      throw error;
    } finally {
      if (this.mssqlConnector) {
        await this.mssqlConnector.disconnect();
      }
    }
  }

  /**
   * Insert single order
   */
  private async insertOrder(order: Order): Promise<void> {
    const request = this.sqlPool!.request();

    request.input('Id', sql.UniqueIdentifier, order.id);
    request.input('CustomerId', sql.NVarChar(50), order.customerId);
    request.input('OrderNumber', sql.NVarChar(50), order.orderNumber);
    request.input('Status', sql.Int, order.status);
    request.input('PaymentStatus', sql.Int, order.paymentStatus);
    request.input('ShippingStatus', sql.Int, order.shippingStatus);
    request.input('Subtotal', sql.Decimal(18, 2), order.subtotal);
    request.input('DiscountAmount', sql.Decimal(18, 2), order.discountAmount);
    request.input('TaxAmount', sql.Decimal(18, 2), order.taxAmount);
    request.input('TaxRate', sql.Decimal(18, 4), order.taxRate);
    request.input('ShippingCost', sql.Decimal(18, 2), order.shippingCost);
    request.input('TotalAmount', sql.Decimal(18, 2), order.totalAmount);
    request.input('Currency', sql.NVarChar(10), order.currency);
    request.input('CustomerEmail', sql.NVarChar(255), order.customerEmail);
    request.input('CustomerName', sql.NVarChar(255), order.customerName);
    request.input('CustomerPhone', sql.NVarChar(50), order.customerPhone);
    request.input('ShippingAddressLine1', sql.NVarChar(100), order.shippingAddressLine1);
    request.input('ShippingAddressLine2', sql.NVarChar(100), order.shippingAddressLine2);
    request.input('ShippingCity', sql.NVarChar(50), order.shippingCity);
    request.input('ShippingState', sql.NVarChar(50), order.shippingState);
    request.input('ShippingZipCode', sql.NVarChar(20), order.shippingZipCode);
    request.input('ShippingCountry', sql.NVarChar(2), order.shippingCountry);
    request.input('BillingAddressLine1', sql.NVarChar(100), order.billingAddressLine1);
    request.input('BillingAddressLine2', sql.NVarChar(100), order.billingAddressLine2);
    request.input('BillingCity', sql.NVarChar(50), order.billingCity);
    request.input('BillingState', sql.NVarChar(50), order.billingState);
    request.input('BillingZipCode', sql.NVarChar(20), order.billingZipCode);
    request.input('BillingCountry', sql.NVarChar(2), order.billingCountry);
    request.input('IsReturnable', sql.Bit, order.isReturnable);
    request.input('DeliveredDate', sql.DateTime2, order.deliveredDate || null);
    request.input('CreatedAt', sql.DateTime2, order.createdAt);
    request.input('UpdatedAt', sql.DateTime2, order.updatedAt);
    request.input('CreatedBy', sql.NVarChar(50), order.createdBy);

    const query = `
      INSERT INTO [Orders] (
        [Id], [CustomerId], [OrderNumber], [Status], [PaymentStatus], [ShippingStatus],
        [Subtotal], [DiscountAmount], [TaxAmount], [TaxRate], [ShippingCost], [TotalAmount], [Currency],
        [CustomerEmail], [CustomerName], [CustomerPhone],
        [ShippingAddressLine1], [ShippingAddressLine2], [ShippingCity],
        [ShippingState], [ShippingZipCode], [ShippingCountry],
        [BillingAddressLine1], [BillingAddressLine2], [BillingCity],
        [BillingState], [BillingZipCode], [BillingCountry],
        [IsReturnable], [DeliveredDate], [CreatedAt], [UpdatedAt], [CreatedBy]
      ) VALUES (
        @Id, @CustomerId, @OrderNumber, @Status, @PaymentStatus, @ShippingStatus,
        @Subtotal, @DiscountAmount, @TaxAmount, @TaxRate, @ShippingCost, @TotalAmount, @Currency,
        @CustomerEmail, @CustomerName, @CustomerPhone,
        @ShippingAddressLine1, @ShippingAddressLine2, @ShippingCity,
        @ShippingState, @ShippingZipCode, @ShippingCountry,
        @BillingAddressLine1, @BillingAddressLine2, @BillingCity,
        @BillingState, @BillingZipCode, @BillingCountry,
        @IsReturnable, @DeliveredDate, @CreatedAt, @UpdatedAt, @CreatedBy
      )
    `;

    await request.query(query);
  }

  /**
   * Insert order items
   */
  private async insertOrderItems(items: OrderItem[]): Promise<void> {
    for (const item of items) {
      const request = this.sqlPool!.request();

      request.input('Id', sql.UniqueIdentifier, item.id);
      request.input('OrderId', sql.UniqueIdentifier, item.orderId);
      request.input('ProductId', sql.NVarChar(50), item.productId);
      request.input('ProductName', sql.NVarChar(255), item.productName);
      request.input('ProductSku', sql.NVarChar(50), item.productSku);
      request.input('UnitPrice', sql.Decimal(18, 2), item.unitPrice);
      request.input('OriginalPrice', sql.Decimal(18, 2), item.originalPrice);
      request.input('Quantity', sql.Int, item.quantity);
      request.input('TotalPrice', sql.Decimal(18, 2), item.totalPrice);
      request.input('DiscountAmount', sql.Decimal(18, 2), item.discountAmount);
      request.input('TaxAmount', sql.Decimal(18, 2), item.taxAmount);
      request.input('ShippingCostPerItem', sql.Decimal(18, 2), item.shippingCostPerItem);
      request.input('DiscountPercentage', sql.Decimal(18, 4), item.discountPercentage);
      request.input('IsGiftWrapped', sql.Bit, item.isGiftWrapped);
      request.input('GiftWrapCost', sql.Decimal(18, 2), item.giftWrapCost);
      request.input('RefundedAmount', sql.Decimal(18, 2), item.refundedAmount);
      request.input('IsReturnable', sql.Bit, item.isReturnable);
      request.input('CreatedAt', sql.DateTime2, item.createdAt);
      request.input('UpdatedAt', sql.DateTime2, item.updatedAt);

      const query = `
        INSERT INTO [OrderItems] (
          [Id], [OrderId], [ProductId], [ProductName], [ProductSku],
          [UnitPrice], [OriginalPrice], [Quantity], [TotalPrice],
          [DiscountAmount], [TaxAmount], [ShippingCostPerItem], [DiscountPercentage],
          [IsGiftWrapped], [GiftWrapCost], [RefundedAmount], [IsReturnable],
          [CreatedAt], [UpdatedAt]
        ) VALUES (
          @Id, @OrderId, @ProductId, @ProductName, @ProductSku,
          @UnitPrice, @OriginalPrice, @Quantity, @TotalPrice,
          @DiscountAmount, @TaxAmount, @ShippingCostPerItem, @DiscountPercentage,
          @IsGiftWrapped, @GiftWrapCost, @RefundedAmount, @IsReturnable,
          @CreatedAt, @UpdatedAt
        )
      `;

      await request.query(query);
    }
  }

  /**
   * Clear orders from database
   */
  async clear(): Promise<void> {
    try {
      await this.connectToSQLServer();

      // Clear order items first due to foreign key constraints
      const itemsResult = await this.sqlPool!.request().query('DELETE FROM [OrderItems]');
      logger.info(`Cleared ${itemsResult.rowsAffected[0]} records from order_items`);

      // Clear orders
      const ordersResult = await this.sqlPool!.request().query('DELETE FROM [Orders]');
      logger.info(`Cleared ${ordersResult.rowsAffected[0]} records from orders`);
    } catch (error) {
      logger.error('Failed to clear order data', error);
      throw error;
    } finally {
      if (this.mssqlConnector) {
        await this.mssqlConnector.disconnect();
      }
    }
  }

  /**
   * Log order summary
   */
  private logOrderSummary(orders: Order[]): void {
    logger.info('📊 Order Summary (first 5):');
    const orderSummary = orders.slice(0, 5).map((order, _index) => ({
      'Order #': order.orderNumber,
      Customer: order.customerName,
      Items: order.items.length,
      Total: `$${order.totalAmount.toFixed(2)}`,
      Status: this.getStatusName(order.status),
      Delivered: order.deliveredDate?.toLocaleDateString() || 'N/A',
    }));

    logger.table(orderSummary);

    if (orders.length > 5) {
      logger.info(`... and ${orders.length - 5} more orders`);
    }

    logger.info(
      `📈 Final Stats: ${this.stats.insertedRecords}/${this.stats.totalRecords} orders inserted successfully`,
    );
  }

  /**
   * Helper to get status name
   */
  private getStatusName(status: number): string {
    const statusNames = ['Created', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
    return statusNames[status] || 'Unknown';
  }
}
