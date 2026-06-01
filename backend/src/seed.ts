// backend/src/seed.ts
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import config from './config';
import models from './models';
import { UserRole, OrderStatus, PaymentStatus, FraudRiskLevel, AuditAction, ThreatSeverity } from './types';

const { User, Product, Category, Cart, Order, AuditLog, FraudAlert } = models;

async function seed() {
  try {
    console.log('\n Starting database seed...\n');

    // Connect to MongoDB
    await mongoose.connect(config.database.uri);
    console.log(' Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Category.deleteMany({}),
      Cart.deleteMany({}),
      Order.deleteMany({}),
      AuditLog.deleteMany({}),
      FraudAlert.deleteMany({}),
    ]);
    console.log(' Cleared existing data\n');

    // ======================================
    // 1. CREATE USERS
    // ======================================
    console.log('Creating users...');
    
    const adminUser = await User.create({
      email: 'admin@securecommerce.com',
      password: 'Admin123!@#',
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      isActive: true,
      isVerified: true,
      mfaEnabled: false,
      lastLogin: new Date(),
      lastLoginIp: '127.0.0.1',
    });
    console.log('   Admin user created: admin@securecommerce.com / Admin123!@#');

    const auditorUser = await User.create({
      email: 'auditor@securecommerce.com',
      password: 'Auditor123!@#',
      firstName: 'Security',
      lastName: 'Auditor',
      role: UserRole.AUDITOR,
      isActive: true,
      isVerified: true,
      mfaEnabled: true,
      lastLogin: new Date(),
      lastLoginIp: '127.0.0.1',
    });
    console.log('   Auditor user created: auditor@securecommerce.com / Auditor123!@#');

    const sellerUser = await User.create({
      email: 'seller@securecommerce.com',
      password: 'Seller123!@#',
      firstName: 'Shop',
      lastName: 'Owner',
      role: UserRole.ADMIN, // Sellers have admin role in this system
      isActive: true,
      isVerified: true,
      lastLogin: new Date(),
      lastLoginIp: '127.0.0.1',
    });
    console.log('   Seller user created: seller@securecommerce.com / Seller123!@#');

    // Regular customers
    const customers = await User.insertMany([
      {
        email: 'john.doe@example.com',
        password: 'Customer123!@#',
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: true,
        lastLogin: new Date(),
        lastLoginIp: '192.168.1.100',
      },
      {
        email: 'jane.smith@example.com',
        password: 'Customer123!@#',
        firstName: 'Jane',
        lastName: 'Smith',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: true,
        lastLogin: new Date(),
        lastLoginIp: '192.168.1.101',
      },
      {
        email: 'bob.wilson@example.com',
        password: 'Customer123!@#',
        firstName: 'Bob',
        lastName: 'Wilson',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: true,
        lastLogin: new Date(),
        lastLoginIp: '192.168.1.102',
      },
      {
        email: 'alice.johnson@example.com',
        password: 'Customer123!@#',
        firstName: 'Alice',
        lastName: 'Johnson',
        role: UserRole.CUSTOMER,
        isActive: false, // Suspended account for testing
        isVerified: true,
        lastLogin: new Date(),
        lastLoginIp: '192.168.1.103',
      },
      {
        email: 'suspicious.user@example.com',
        password: 'Customer123!@#',
        firstName: 'Suspicious',
        lastName: 'User',
        role: UserRole.CUSTOMER,
        isActive: true,
        isVerified: false,
        lastLogin: new Date(),
        lastLoginIp: '10.0.0.1', // Suspicious IP
        failedLoginAttempts: 8, // Almost locked out
      },
    ]);
    console.log(`   Created ${customers.length} customer accounts`);
    console.log('     All customer passwords: Customer123!@#\n');

    // ======================================
    // 2. CREATE CATEGORIES
    // ======================================
    console.log('Creating categories...');

    const electronics = await Category.create({
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices, gadgets, and accessories',
      isActive: true,
      productCount: 0,
    });

    const clothing = await Category.create({
      name: 'Clothing & Fashion',
      slug: 'clothing-fashion',
      description: 'Apparel, accessories, and fashion items',
      isActive: true,
      productCount: 0,
    });

    const homeGarden = await Category.create({
      name: 'Home & Garden',
      slug: 'home-garden',
      description: 'Home improvement, furniture, and garden supplies',
      isActive: true,
      productCount: 0,
    });

    const sports = await Category.create({
      name: 'Sports & Outdoors',
      slug: 'sports-outdoors',
      description: 'Sports equipment, outdoor gear, and fitness',
      isActive: true,
      productCount: 0,
    });

    const books = await Category.create({
      name: 'Books & Media',
      slug: 'books-media',
      description: 'Books, e-books, music, and entertainment',
      isActive: true,
      productCount: 0,
    });

    const food = await Category.create({
      name: 'Food & Beverages',
      slug: 'food-beverages',
      description: 'Gourmet food, beverages, and snacks',
      isActive: true,
      productCount: 0,
    });

    // Subcategories
    const smartphones = await Category.create({
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Mobile phones and accessories',
      parentId: electronics._id,
      isActive: true,
      productCount: 0,
    });

    const laptops = await Category.create({
      name: 'Laptops & Computers',
      slug: 'laptops-computers',
      description: 'Laptops, desktops, and computer accessories',
      parentId: electronics._id,
      isActive: true,
      productCount: 0,
    });

    const mensClothing = await Category.create({
      name: "Men's Clothing",
      slug: 'mens-clothing',
      description: 'Clothing for men',
      parentId: clothing._id,
      isActive: true,
      productCount: 0,
    });

    const womensClothing = await Category.create({
      name: "Women's Clothing",
      slug: 'womens-clothing',
      description: 'Clothing for women',
      parentId: clothing._id,
      isActive: true,
      productCount: 0,
    });

    console.log(`   Created ${10} categories (6 main, 4 subcategories)\n`);

    // ======================================
    // 3. CREATE PRODUCTS
    // ======================================
    console.log('Creating products...');

    const products = await Product.insertMany([
      // Electronics - Smartphones
      {
        name: 'iPhone 15 Pro Max',
        description: 'Apple iPhone 15 Pro Max with A17 Pro chip, 256GB, Titanium. Features pro camera system, USB-C, and action button.',
        price: 1199.99,
        compareAtPrice: 1299.99,
        categoryId: smartphones._id,
        images: ['https://picsum.photos/seed/iphone15/600/600'],
        inventory: 50,
        sku: 'IPH15PM-256-TIT',
        isActive: true,
        tags: ['apple', 'iphone', 'smartphone', '5G'],
        averageRating: 4.8,
        reviewCount: 234,
        createdBy: adminUser._id,
      },
      {
        name: 'Samsung Galaxy S24 Ultra',
        description: 'Samsung Galaxy S24 Ultra with AI features, S Pen, 512GB. Titanium frame with advanced camera system.',
        price: 1299.99,
        compareAtPrice: 1399.99,
        categoryId: smartphones._id,
        images: ['https://picsum.photos/seed/galaxys24/600/600'],
        inventory: 35,
        sku: 'SGS24U-512-TIT',
        isActive: true,
        tags: ['samsung', 'galaxy', 'smartphone', 'android'],
        averageRating: 4.7,
        reviewCount: 189,
        createdBy: adminUser._id,
      },
      // Electronics - Laptops
      {
        name: 'MacBook Pro 16" M3 Max',
        description: 'Apple MacBook Pro 16" with M3 Max chip, 32GB RAM, 1TB SSD. Space Black. Perfect for professionals.',
        price: 3499.99,
        compareAtPrice: null,
        categoryId: laptops._id,
        images: ['https://picsum.photos/seed/macbookpro/600/600'],
        inventory: 20,
        sku: 'MBP16-M3M-32-1TB',
        isActive: true,
        tags: ['apple', 'macbook', 'laptop', 'professional'],
        averageRating: 4.9,
        reviewCount: 156,
        createdBy: adminUser._id,
      },
      {
        name: 'Dell XPS 15" Laptop',
        description: 'Dell XPS 15 with Intel i9-13900H, 32GB RAM, 1TB SSD, RTX 4070. OLED display.',
        price: 2499.99,
        compareAtPrice: 2699.99,
        categoryId: laptops._id,
        images: ['https://picsum.photos/seed/dellxps/600/600'],
        inventory: 15,
        sku: 'DELL-XPS15-I9-32',
        isActive: true,
        tags: ['dell', 'laptop', 'windows', 'professional'],
        averageRating: 4.6,
        reviewCount: 98,
        createdBy: adminUser._id,
      },
      // Clothing
      {
        name: 'Premium Leather Jacket',
        description: 'Handcrafted genuine leather jacket for men. Classic design with modern fit. Available in brown and black.',
        price: 299.99,
        compareAtPrice: 399.99,
        categoryId: mensClothing._id,
        images: ['https://picsum.photos/seed/leatherjacket/600/600'],
        inventory: 100,
        sku: 'MJ-LEATHER-001',
        isActive: true,
        tags: ['leather', 'jacket', 'men', 'premium'],
        averageRating: 4.5,
        reviewCount: 312,
        createdBy: sellerUser._id,
      },
      {
        name: 'Silk Evening Dress',
        description: 'Elegant silk evening dress for women. Perfect for formal occasions. Available in multiple colors.',
        price: 199.99,
        compareAtPrice: 299.99,
        categoryId: womensClothing._id,
        images: ['https://picsum.photos/seed/silkdress/600/600'],
        inventory: 75,
        sku: 'WD-SILK-001',
        isActive: true,
        tags: ['silk', 'dress', 'evening', 'formal'],
        averageRating: 4.7,
        reviewCount: 178,
        createdBy: sellerUser._id,
      },
      // Home & Garden
      {
        name: 'Robot Vacuum Cleaner X1',
        description: 'Smart robot vacuum with LiDAR navigation, 2500Pa suction, and auto-emptying station. Works with Alexa/Google.',
        price: 599.99,
        compareAtPrice: 799.99,
        categoryId: homeGarden._id,
        images: ['https://picsum.photos/seed/robotvac/600/600'],
        inventory: 40,
        sku: 'HOME-VAC-X1',
        isActive: true,
        tags: ['robot', 'vacuum', 'smart home', 'cleaning'],
        averageRating: 4.4,
        reviewCount: 567,
        createdBy: adminUser._id,
      },
      {
        name: 'Ergonomic Office Chair',
        description: 'Premium ergonomic office chair with lumbar support, adjustable armrests, and mesh back. 10-year warranty.',
        price: 449.99,
        compareAtPrice: null,
        categoryId: homeGarden._id,
        images: ['https://picsum.photos/seed/officechair/600/600'],
        inventory: 60,
        sku: 'HOME-CHAIR-PRO',
        isActive: true,
        tags: ['office', 'chair', 'ergonomic', 'furniture'],
        averageRating: 4.6,
        reviewCount: 234,
        createdBy: sellerUser._id,
      },
      // Sports & Outdoors
      {
        name: 'Carbon Fiber Road Bike',
        description: 'Professional carbon fiber road bike with Shimano Ultegra groupset. Weighs only 7.8kg. 12-speed.',
        price: 2499.99,
        compareAtPrice: 2999.99,
        categoryId: sports._id,
        images: ['https://picsum.photos/seed/roadbike/600/600'],
        inventory: 10,
        sku: 'BIKE-CARBON-PRO',
        isActive: true,
        tags: ['bike', 'carbon', 'cycling', 'professional'],
        averageRating: 4.9,
        reviewCount: 89,
        createdBy: adminUser._id,
      },
      {
        name: 'Yoga Mat Premium',
        description: 'Extra thick 6mm eco-friendly TPE yoga mat with alignment lines. Non-slip, includes carrying strap.',
        price: 49.99,
        compareAtPrice: 69.99,
        categoryId: sports._id,
        images: ['https://picsum.photos/seed/yogamat/600/600'],
        inventory: 200,
        sku: 'SPORT-YOGA-MAT',
        isActive: true,
        tags: ['yoga', 'mat', 'fitness', 'eco-friendly'],
        averageRating: 4.3,
        reviewCount: 891,
        createdBy: sellerUser._id,
      },
      // Books & Media
      {
        name: 'The Art of Programming',
        description: 'Comprehensive guide to modern software engineering practices. Covers design patterns, testing, and system design.',
        price: 59.99,
        compareAtPrice: null,
        categoryId: books._id,
        images: ['https://picsum.photos/seed/progbook/600/600'],
        inventory: 150,
        sku: 'BOOK-PROG-001',
        isActive: true,
        tags: ['programming', 'software', 'engineering', 'education'],
        averageRating: 4.8,
        reviewCount: 1234,
        createdBy: adminUser._id,
      },
      // Food & Beverages
      {
        name: 'Single Origin Coffee Beans',
        description: 'Ethiopian Yirgacheffe single origin coffee beans. Light roast, floral notes with citrus undertones. 1lb bag.',
        price: 24.99,
        compareAtPrice: 29.99,
        categoryId: food._id,
        images: ['https://picsum.photos/seed/coffee/600/600'],
        inventory: 300,
        sku: 'FOOD-COFFEE-ETH',
        isActive: true,
        tags: ['coffee', 'single origin', 'ethiopian', 'gourmet'],
        averageRating: 4.7,
        reviewCount: 456,
        createdBy: sellerUser._id,
      },
      // More electronics
      {
        name: 'Wireless Noise-Cancelling Headphones',
        description: 'Premium ANC headphones with 30-hour battery life, aptX HD, and memory foam ear cushions.',
        price: 299.99,
        compareAtPrice: 349.99,
        categoryId: electronics._id,
        images: ['https://picsum.photos/seed/headphones/600/600'],
        inventory: 80,
        sku: 'ELEC-WH-ANC-PRO',
        isActive: true,
        tags: ['headphones', 'wireless', 'noise-cancelling', 'audio'],
        averageRating: 4.5,
        reviewCount: 678,
        createdBy: adminUser._id,
      },
      {
        name: '4K Smart TV 65"',
        description: 'OLED 4K Smart TV with HDR10+, Dolby Vision, and built-in streaming apps. 120Hz refresh rate.',
        price: 1799.99,
        compareAtPrice: 2199.99,
        categoryId: electronics._id,
        images: ['https://picsum.photos/seed/smarttv/600/600'],
        inventory: 25,
        sku: 'ELEC-TV-OLED65',
        isActive: true,
        tags: ['tv', 'oled', '4k', 'smart tv'],
        averageRating: 4.6,
        reviewCount: 345,
        createdBy: adminUser._id,
      },
      {
        name: 'Mechanical Keyboard RGB',
        description: 'Hot-swappable mechanical keyboard with Cherry MX switches, per-key RGB, and aluminum frame.',
        price: 159.99,
        compareAtPrice: 199.99,
        categoryId: electronics._id,
        images: ['https://picsum.photos/seed/keyboard/600/600'],
        inventory: 120,
        sku: 'ELEC-KB-MECH-RGB',
        isActive: true,
        tags: ['keyboard', 'mechanical', 'rgb', 'gaming'],
        averageRating: 4.4,
        reviewCount: 567,
        createdBy: sellerUser._id,
      },
      // More clothing
      {
        name: 'Cashmere Sweater',
        description: "Luxuriously soft 100% cashmere sweater. Perfect for layering. Available in men's and women's sizes.",
        price: 179.99,
        compareAtPrice: 249.99,
        categoryId: clothing._id,
        images: ['https://picsum.photos/seed/cashmere/600/600'],
        inventory: 90,
        sku: 'CLOTH-CASHMERE-001',
        isActive: true,
        tags: ['cashmere', 'sweater', 'luxury', 'winter'],
        averageRating: 4.8,
        reviewCount: 234,
        createdBy: sellerUser._id,
      },
      // More home
      {
        name: 'Smart LED Bulb 4-Pack',
        description: 'WiFi-enabled RGB smart bulbs. Works with Alexa, Google Home. 16 million colors, dimmable.',
        price: 39.99,
        compareAtPrice: 49.99,
        categoryId: homeGarden._id,
        images: ['https://picsum.photos/seed/smartbulb/600/600'],
        inventory: 500,
        sku: 'HOME-BULB-SMART4',
        isActive: true,
        tags: ['smart home', 'lighting', 'led', 'wifi'],
        averageRating: 4.2,
        reviewCount: 1234,
        createdBy: adminUser._id,
      },
      {
        name: 'Cast Iron Cookware Set',
        description: '5-piece pre-seasoned cast iron cookware set. Includes 10" skillet, 12" skillet, Dutch oven, and accessories.',
        price: 199.99,
        compareAtPrice: 299.99,
        categoryId: homeGarden._id,
        images: ['https://picsum.photos/seed/castiron/600/600'],
        inventory: 45,
        sku: 'HOME-CASTIRON-SET',
        isActive: true,
        tags: ['cookware', 'cast iron', 'kitchen', 'cooking'],
        averageRating: 4.9,
        reviewCount: 345,
        createdBy: sellerUser._id,
      },
      // More sports
      {
        name: 'Hiking Backpack 45L',
        description: 'Waterproof hiking backpack with ergonomic design, multiple compartments, and rain cover included.',
        price: 129.99,
        compareAtPrice: 169.99,
        categoryId: sports._id,
        images: ['https://picsum.photos/seed/backpack/600/600'],
        inventory: 70,
        sku: 'SPORT-BP-45L',
        isActive: true,
        tags: ['hiking', 'backpack', 'outdoor', 'camping'],
        averageRating: 4.5,
        reviewCount: 456,
        createdBy: adminUser._id,
      },
      {
        name: 'Resistance Bands Set',
        description: 'Complete set of 5 resistance bands with different strengths. Includes door anchor, handles, and carrying bag.',
        price: 29.99,
        compareAtPrice: 39.99,
        categoryId: sports._id,
        images: ['https://picsum.photos/seed/resistance/600/600'],
        inventory: 250,
        sku: 'SPORT-RBANDS-SET',
        isActive: true,
        tags: ['fitness', 'resistance', 'exercise', 'home gym'],
        averageRating: 4.3,
        reviewCount: 789,
        createdBy: sellerUser._id,
      },
    ]);
    
    // Update category product counts
    console.log('  Updating category product counts...');
    for (const category of [electronics, clothing, homeGarden, sports, books, food, smartphones, laptops, mensClothing, womensClothing]) {
      const count = await Product.countDocuments({ categoryId: category._id, isActive: true });
      await Category.findByIdAndUpdate(category._id, { productCount: count });
    }
    
    console.log(`   Created ${products.length} products across all categories\n`);

    // ======================================
    // 4. CREATE ORDERS (with various statuses)
    // ======================================
    console.log('Creating orders...');

    // Helper to create orders
    const createOrder = async (user: any, items: any[], status: OrderStatus, paymentStatus: PaymentStatus, hoursAgo: number) => {
      const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const tax = subtotal * 0.08;
      const shipping = subtotal > 100 ? 0 : 9.99;
      const total = subtotal + tax + shipping;

      return Order.create({
        orderNumber: `ORD-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase(),
        userId: user._id,
        items: items.map(item => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
        })),
        shippingAddress: {
          fullName: `${user.firstName} ${user.lastName}`,
          street: '123 Main Street',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'US',
          phone: '+1-555-0123',
        },
        billingAddress: {
          fullName: `${user.firstName} ${user.lastName}`,
          street: '123 Main Street',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'US',
          phone: '+1-555-0123',
        },
        paymentInfo: {
          method: 'card',
          transactionId: `TXN-${crypto.randomBytes(4).toString('hex')}`,
          last4: '4242',
          brand: 'visa',
        },
        subtotal,
        tax,
        shipping,
        total,
        status,
        paymentStatus,
        createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
      });
    };

    // John's orders (regular customer)
    await createOrder(customers[0], [
      { productId: products[0]._id, name: products[0].name, price: products[0].price, quantity: 1, image: products[0].images[0] },
      { productId: products[7]._id, name: products[7].name, price: products[7].price, quantity: 2, image: products[7].images[0] },
    ], OrderStatus.DELIVERED, PaymentStatus.COMPLETED, 168); // 7 days ago

    await createOrder(customers[0], [
      { productId: products[2]._id, name: products[2].name, price: products[2].price, quantity: 1, image: products[2].images[0] },
    ], OrderStatus.SHIPPED, PaymentStatus.COMPLETED, 24); // 1 day ago

    // Jane's orders
    await createOrder(customers[1], [
      { productId: products[4]._id, name: products[4].name, price: products[4].price, quantity: 1, image: products[4].images[0] },
      { productId: products[5]._id, name: products[5].name, price: products[5].price, quantity: 1, image: products[5].images[0] },
    ], OrderStatus.DELIVERED, PaymentStatus.COMPLETED, 96); // 4 days ago

    await createOrder(customers[1], [
      { productId: products[11]._id, name: products[11].name, price: products[11].price, quantity: 3, image: products[11].images[0] },
    ], OrderStatus.PROCESSING, PaymentStatus.COMPLETED, 2); // 2 hours ago

    // Bob's orders (with a refunded one)
    await createOrder(customers[2], [
      { productId: products[12]._id, name: products[12].name, price: products[12].price, quantity: 1, image: products[12].images[0] },
    ], OrderStatus.DELIVERED, PaymentStatus.REFUNDED, 336); // 14 days ago

    await createOrder(customers[2], [
      { productId: products[1]._id, name: products[1].name, price: products[1].price, quantity: 1, image: products[1].images[0] },
      { productId: products[16]._id, name: products[16].name, price: products[16].price, quantity: 2, image: products[16].images[0] },
    ], OrderStatus.PROCESSING, PaymentStatus.COMPLETED, 4);

    // Suspicious user - multiple high-value orders (for fraud testing)
    await createOrder(customers[4], [
      { productId: products[2]._id, name: products[2].name, price: products[2].price, quantity: 2, image: products[2].images[0] },
      { productId: products[12]._id, name: products[12].name, price: products[12].price, quantity: 1, image: products[12].images[0] },
    ], OrderStatus.PENDING, PaymentStatus.PENDING, 1);

    await createOrder(customers[4], [
      { productId: products[8]._id, name: products[8].name, price: products[8].price, quantity: 1, image: products[8].images[0] },
    ], OrderStatus.PENDING, PaymentStatus.FAILED, 0.5);

    // Pending orders for testing
    await createOrder(customers[0], [
      { productId: products[18]._id, name: products[18].name, price: products[18].price, quantity: 1, image: products[18].images[0] },
    ], OrderStatus.PENDING, PaymentStatus.PENDING, 0.25); // 15 minutes ago

    const orderCount = await Order.countDocuments();
    console.log(`   Created ${orderCount} orders with various statuses\n`);

    // ======================================
    // 5. CREATE AUDIT LOGS
    // ======================================
    console.log('Creating audit logs...');

    const auditLogs = await AuditLog.insertMany([
      {
      userId: adminUser._id,
      action: AuditAction.LOGIN_SUCCESS,
      resource: 'auth',
      resourceId: adminUser._id.toString(),
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      success: true,
      severity: ThreatSeverity.LOW,
      timestamp: new Date(Date.now() - 3600000),
     },
  {
    userId: customers[4]._id,
    action: AuditAction.LOGIN_FAILED,
    resource: 'auth',
    resourceId: customers[4]._id.toString(),
    ip: '10.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    success: false,
    details: { reason: 'Invalid password', attempt: 8 },
    severity: ThreatSeverity.HIGH,
    timestamp: new Date(Date.now() - 1800000),
  },
  {
    userId: adminUser._id,
    action: AuditAction.PRODUCT_CREATE,
    resource: 'products',
    resourceId: products[0]._id.toString(),
    ip: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    success: true,
    details: { productName: products[0].name },
    severity: ThreatSeverity.LOW,
    timestamp: new Date(Date.now() - 7200000),
  },
  {
    userId: customers[0]._id,
    action: AuditAction.ORDER_CREATE,
    resource: 'orders',
    resourceId: '', // Will be set if needed
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
    success: true,
    details: { total: 1199.99 },
    severity: ThreatSeverity.LOW,
    timestamp: new Date(Date.now() - 900000),
  },
  {
    action: AuditAction.UNAUTHORIZED_ACCESS,
    resource: 'admin',
    ip: '10.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    success: false,
    details: { attemptedResource: '/api/v1/admin/users' },
    severity: ThreatSeverity.HIGH,
    timestamp: new Date(Date.now() - 3600000),
  },
]);
    console.log(`   Created ${auditLogs.length} audit logs\n`);

    // ======================================
    // 6. CREATE FRAUD ALERTS (for testing)
    // ======================================
    console.log('Creating fraud alerts...');

    const suspiciousOrder = await Order.findOne({ userId: customers[4]._id }).sort({ createdAt: -1 }).limit(1);
    
    if (suspiciousOrder) {
      await FraudAlert.create({
        alertId: `FRAUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase(),
        orderId: suspiciousOrder._id,
        userId: customers[4]._id,
        riskScore: 0.85,
        riskLevel: FraudRiskLevel.HIGH,
        reasons: [
          'High-value order from new account',
          'Multiple orders in short time period',
          'Suspicious IP address detected',
          'Billing/shipping address mismatch',
        ],
        status: 'open',
      });
      console.log('   Created fraud alert for suspicious user\n');
    }

    // ======================================
    // SUMMARY
    // ======================================
    console.log('========================================');
    console.log(' SEED COMPLETE - SUMMARY');
    console.log('========================================');
    console.log(`Users:      ${await User.countDocuments()} (1 admin, 1 auditor, 1 seller, 5 customers)`);
    console.log(`Categories: ${await Category.countDocuments()} (6 main, 4 sub)`);
    console.log(`Products:   ${await Product.countDocuments()}`);
    console.log(`Orders:     ${await Order.countDocuments()}`);
    console.log(`Audit Logs: ${await AuditLog.countDocuments()}`);
    console.log(`Fraud Alerts: ${await FraudAlert.countDocuments()}`);
    console.log('\n TEST ACCOUNTS:');
    console.log('  Admin:    admin@securecommerce.com / Admin123!@#');
    console.log('  Auditor:  auditor@securecommerce.com / Auditor123!@#');
    console.log('  Seller:   seller@securecommerce.com / Seller123!@#');
    console.log('  Customer: john.doe@example.com / Customer123!@#');
    console.log('  Suspicious: suspicious.user@example.com / Customer123!@#');
    console.log('\n SERVICES:');
    console.log('  Frontend: http://localhost:3000');
    console.log('  Backend:  http://localhost:5000');
    console.log('  Health:   http://localhost:5000/health');
    console.log('  Fraud:    http://localhost:8000/health');
    console.log('========================================\n');

  } catch (error) {
    console.error(' Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run seed
seed();