/**
 * Seed script.
 *
 * Two tiers of data:
 *
 *  1. REFERENCE data — the service catalogue and Islamabad service zones. Real,
 *     production-appropriate rows. Idempotent: re-running updates in place.
 *  2. DEMO data — sample providers, bookings and reviews, every row flagged
 *     `isDemo: true` so the UI can label it and `scripts/purge-demo.ts` can
 *     remove it. Guarded behind ALLOW_DEMO_SEED so a production database cannot
 *     be filled with fake reviews by accident.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ALLOW_DEMO = process.env.ALLOW_DEMO_SEED === 'true' || process.env.ALLOW_DEMO_SEED === '1';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@islamabadfix.pk';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!Admin123';
const DEMO_PASSWORD = 'DemoPass!2024';

const rs = (rupees: number) => rupees * 100;

const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

// ============================ reference data ==============================

interface ServiceSeed {
  name: string;
  slug?: string;
  minRupees: number;
  maxRupees?: number;
  requiresInspection?: boolean;
  minutes?: number;
  emergency?: boolean;
  guarantee?: boolean;
}

interface CategorySeed {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  iconKey: string;
  emergencyCategory?: boolean;
  services: ServiceSeed[];
}

/**
 * Prices are indicative Islamabad market ranges shown before a technician
 * quotes. They are never charged: the provider's own quote decides the price.
 */
const CATEGORIES: CategorySeed[] = [
  {
    name: 'AC & Cooling',
    slug: 'ac-cooling',
    tagline: 'AC service, repair and installation',
    description:
      'Split and window AC service, repair, installation and gas refilling. Verified technicians who inspect first, then quote.',
    iconKey: 'snowflake',
    emergencyCategory: true,
    services: [
      {
        name: 'AC Service',
        slug: 'ac-service',
        minRupees: 1500,
        maxRupees: 3000,
        requiresInspection: false,
        minutes: 90,
      },
      {
        name: 'AC Repair',
        slug: 'ac-repair',
        minRupees: 1500,
        maxRupees: 8000,
        minutes: 120,
        emergency: true,
      },
      {
        name: 'AC Installation',
        slug: 'ac-installation',
        minRupees: 3500,
        maxRupees: 9000,
        minutes: 180,
      },
      {
        name: 'AC Dismantling',
        slug: 'ac-dismantling',
        minRupees: 2000,
        maxRupees: 4500,
        minutes: 120,
      },
      {
        name: 'AC Gas Refill',
        slug: 'ac-gas-refill',
        minRupees: 3500,
        maxRupees: 9000,
        minutes: 120,
      },
      {
        name: 'AC Deep Cleaning',
        slug: 'ac-deep-cleaning',
        minRupees: 2500,
        maxRupees: 5000,
        requiresInspection: false,
        minutes: 150,
      },
    ],
  },
  {
    name: 'Electrical',
    slug: 'electrical',
    tagline: 'Wiring, fans, UPS and generators',
    description:
      'Electrical repair for homes and offices, wiring, light installation, UPS and generator work. Do not attempt electrical work yourself.',
    iconKey: 'bolt',
    emergencyCategory: true,
    services: [
      {
        name: 'Electrical Repair',
        slug: 'electrical-repair',
        minRupees: 1000,
        maxRupees: 6000,
        minutes: 90,
        emergency: true,
      },
      {
        name: 'House Wiring',
        slug: 'house-wiring',
        minRupees: 5000,
        maxRupees: 60000,
        minutes: 480,
      },
      { name: 'Fan Repair', slug: 'fan-repair', minRupees: 800, maxRupees: 3000, minutes: 60 },
      {
        name: 'Light Installation',
        slug: 'light-installation',
        minRupees: 700,
        maxRupees: 4000,
        requiresInspection: false,
        minutes: 60,
      },
      {
        name: 'Switch & Socket Repair',
        slug: 'switch-socket-repair',
        minRupees: 600,
        maxRupees: 2500,
        minutes: 45,
      },
      {
        name: 'UPS Installation & Repair',
        slug: 'ups-service',
        minRupees: 1500,
        maxRupees: 8000,
        minutes: 90,
      },
      {
        name: 'Generator Service',
        slug: 'generator-service',
        minRupees: 2500,
        maxRupees: 15000,
        minutes: 150,
        emergency: true,
      },
    ],
  },
  {
    name: 'Plumbing',
    slug: 'plumbing',
    tagline: 'Leaks, blockages and bathroom work',
    description:
      'Pipe leaks, drain blockages, tap repair, water tanks and bathroom/kitchen plumbing. Emergency service is available for a major leak.',
    iconKey: 'droplet',
    emergencyCategory: true,
    services: [
      {
        name: 'Pipe Leakage',
        slug: 'pipe-leakage',
        minRupees: 1000,
        maxRupees: 6000,
        minutes: 90,
        emergency: true,
      },
      {
        name: 'Drain Blockage',
        slug: 'drain-blockage',
        minRupees: 1200,
        maxRupees: 5000,
        minutes: 90,
        emergency: true,
      },
      {
        name: 'Tap / Faucet Repair',
        slug: 'tap-faucet-repair',
        minRupees: 700,
        maxRupees: 3000,
        minutes: 45,
      },
      {
        name: 'Water Tank Repair',
        slug: 'water-tank-repair',
        minRupees: 1500,
        maxRupees: 8000,
        minutes: 120,
      },
      {
        name: 'Bathroom Plumbing',
        slug: 'bathroom-plumbing',
        minRupees: 1500,
        maxRupees: 12000,
        minutes: 150,
      },
      {
        name: 'Kitchen Plumbing',
        slug: 'kitchen-plumbing',
        minRupees: 1200,
        maxRupees: 9000,
        minutes: 120,
      },
    ],
  },
  {
    name: 'Cleaning',
    slug: 'cleaning',
    tagline: 'Home, office and sofa cleaning',
    description:
      'Home and office deep cleaning, sofa and carpet shampooing, water tank cleaning. The team brings its own equipment.',
    iconKey: 'sparkles',
    services: [
      {
        name: 'Home Cleaning',
        slug: 'home-cleaning',
        minRupees: 3500,
        maxRupees: 15000,
        requiresInspection: false,
        minutes: 300,
      },
      {
        name: 'Office Cleaning',
        slug: 'office-cleaning',
        minRupees: 5000,
        maxRupees: 25000,
        requiresInspection: false,
        minutes: 360,
      },
      {
        name: 'Sofa Cleaning',
        slug: 'sofa-cleaning',
        minRupees: 2000,
        maxRupees: 8000,
        requiresInspection: false,
        minutes: 120,
      },
      {
        name: 'Carpet Cleaning',
        slug: 'carpet-cleaning',
        minRupees: 1500,
        maxRupees: 7000,
        requiresInspection: false,
        minutes: 120,
      },
      {
        name: 'Water Tank Cleaning',
        slug: 'water-tank-cleaning',
        minRupees: 2500,
        maxRupees: 6000,
        requiresInspection: false,
        minutes: 150,
      },
    ],
  },
  {
    name: 'Carpenter',
    slug: 'carpenter',
    tagline: 'Door, furniture and cabinet work',
    description:
      'Door repair, furniture repair, cabinet and shelf work. The carpenter inspects and quotes for material and labour.',
    iconKey: 'hammer',
    services: [
      { name: 'Door Repair', slug: 'door-repair', minRupees: 1200, maxRupees: 8000, minutes: 120 },
      {
        name: 'Furniture Repair',
        slug: 'furniture-repair',
        minRupees: 1500,
        maxRupees: 12000,
        minutes: 150,
      },
      {
        name: 'Cabinet Work',
        slug: 'cabinet-work',
        minRupees: 5000,
        maxRupees: 60000,
        minutes: 480,
      },
      {
        name: 'Shelves & Storage',
        slug: 'shelves-storage',
        minRupees: 2500,
        maxRupees: 20000,
        minutes: 240,
      },
      {
        name: 'General Carpentry',
        slug: 'general-carpentry',
        minRupees: 1500,
        maxRupees: 15000,
        minutes: 180,
      },
    ],
  },
  {
    name: 'Painting',
    slug: 'painting',
    tagline: 'Room, house and office painting',
    description:
      'Room and whole-house painting, office painting and wall repair. Quoted after measuring the area.',
    iconKey: 'brush',
    services: [
      {
        name: 'Room Painting',
        slug: 'room-painting',
        minRupees: 6000,
        maxRupees: 25000,
        minutes: 480,
      },
      {
        name: 'House Painting',
        slug: 'house-painting',
        minRupees: 25000,
        maxRupees: 250000,
        minutes: 2880,
      },
      {
        name: 'Office Painting',
        slug: 'office-painting',
        minRupees: 20000,
        maxRupees: 200000,
        minutes: 1440,
      },
      { name: 'Wall Repair', slug: 'wall-repair', minRupees: 2500, maxRupees: 20000, minutes: 240 },
    ],
  },
  {
    name: 'Appliances',
    slug: 'appliances',
    tagline: 'Fridge, washing machine and geyser',
    description:
      'Refrigerator, washing machine, microwave and geyser repair. Tell us the brand and model so the technician brings the right parts.',
    iconKey: 'plug',
    services: [
      {
        name: 'Refrigerator Repair',
        slug: 'refrigerator',
        minRupees: 1500,
        maxRupees: 12000,
        minutes: 120,
      },
      {
        name: 'Washing Machine Repair',
        slug: 'washing-machine',
        minRupees: 1500,
        maxRupees: 10000,
        minutes: 120,
      },
      {
        name: 'Microwave Repair',
        slug: 'microwave',
        minRupees: 1200,
        maxRupees: 7000,
        minutes: 90,
      },
      {
        name: 'Geyser Repair',
        slug: 'geyser',
        minRupees: 1500,
        maxRupees: 9000,
        minutes: 120,
        emergency: true,
      },
      {
        name: 'Other Appliances',
        slug: 'other-appliances',
        minRupees: 1200,
        maxRupees: 12000,
        minutes: 120,
      },
    ],
  },
  {
    name: 'Security',
    slug: 'security',
    tagline: 'CCTV and access control',
    description:
      'CCTV installation and repair, access control and security system maintenance. You get a quote for cameras and cabling after a site visit.',
    iconKey: 'shield',
    services: [
      {
        name: 'CCTV Installation',
        slug: 'cctv-installation',
        minRupees: 8000,
        maxRupees: 120000,
        minutes: 360,
      },
      { name: 'CCTV Repair', slug: 'cctv-repair', minRupees: 2000, maxRupees: 15000, minutes: 120 },
      {
        name: 'Access Control',
        slug: 'access-control',
        minRupees: 12000,
        maxRupees: 90000,
        minutes: 300,
      },
      {
        name: 'Security System Maintenance',
        slug: 'security-maintenance',
        minRupees: 3000,
        maxRupees: 20000,
        minutes: 180,
      },
    ],
  },
];

/**
 * Islamabad service zones. Data, not business logic — admins add, rename and
 * retire these from the panel. Centroids are approximate sector centres, used
 * only for distance estimates when a customer gives no GPS pin.
 */
const ZONES: Array<{ name: string; lat?: number; lng?: number }> = [
  { name: 'F-6', lat: 33.7295, lng: 73.0787 },
  { name: 'F-7', lat: 33.7276, lng: 73.0563 },
  { name: 'F-8', lat: 33.7089, lng: 73.0479 },
  { name: 'F-10', lat: 33.6963, lng: 73.0165 },
  { name: 'F-11', lat: 33.6905, lng: 72.9977 },
  { name: 'G-6', lat: 33.7191, lng: 73.0862 },
  { name: 'G-7', lat: 33.7118, lng: 73.0771 },
  { name: 'G-8', lat: 33.7013, lng: 73.0654 },
  { name: 'G-9', lat: 33.6939, lng: 73.0466 },
  { name: 'G-10', lat: 33.6844, lng: 73.0155 },
  { name: 'G-11', lat: 33.6768, lng: 72.9982 },
  { name: 'G-13', lat: 33.6472, lng: 72.9515 },
  { name: 'G-14', lat: 33.6371, lng: 72.9345 },
  { name: 'H-8', lat: 33.6893, lng: 73.0723 },
  { name: 'I-8', lat: 33.6664, lng: 73.0748 },
  { name: 'I-9', lat: 33.6547, lng: 73.0632 },
  { name: 'I-10', lat: 33.6488, lng: 73.0424 },
  { name: 'E-11', lat: 33.7015, lng: 72.9724 },
  { name: 'DHA Phase 2', lat: 33.5354, lng: 73.1521 },
  { name: 'Bahria Town Phase 4', lat: 33.5273, lng: 73.1015 },
  { name: 'Bahria Town Phase 7', lat: 33.5089, lng: 73.1348 },
  { name: 'Gulberg Greens', lat: 33.6008, lng: 73.1349 },
  { name: 'PWD Colony', lat: 33.5573, lng: 73.1265 },
  { name: 'Soan Garden', lat: 33.5645, lng: 73.1074 },
  { name: 'Blue Area', lat: 33.7104, lng: 73.0578 },
];

// ============================== demo data =================================

interface DemoProviderSeed {
  businessName: string;
  fullName: string;
  email: string;
  phone: string;
  headline: string;
  description: string;
  years: number;
  serviceSlugs: string[];
  zoneNames: string[];
  emergency: boolean;
  emergencyFeeRupees: number;
  startingRupees: number;
  completedJobs: number;
  ratingAverage: number;
  ratingCount: number;
}

const DEMO_PROVIDERS: DemoProviderSeed[] = [
  {
    businessName: 'Ali Electric & Cooling Services',
    fullName: 'Ali Raza',
    email: 'demo.ali@islamabadfix.pk',
    phone: '+923001234501',
    headline: '12 years of AC and electrical experience',
    description:
      'Split and window AC service, repair and gas refilling. Also electrical repair and UPS installation. Inspection before every job, then a clear quote.',
    years: 12,
    serviceSlugs: [
      'ac-service',
      'ac-repair',
      'ac-installation',
      'ac-gas-refill',
      'electrical-repair',
      'ups-service',
      'fan-repair',
    ],
    zoneNames: ['G-10', 'G-11', 'F-10', 'F-11', 'G-9'],
    emergency: true,
    emergencyFeeRupees: 800,
    startingRupees: 1500,
    completedJobs: 387,
    ratingAverage: 4.8,
    ratingCount: 214,
  },
  {
    businessName: 'Islamabad Plumbing Works',
    fullName: 'Muhammad Naveed',
    email: 'demo.naveed@islamabadfix.pk',
    phone: '+923001234502',
    headline: 'Leaks and blockages sorted fast',
    description:
      'Pipe leaks, drain blockages and bathroom plumbing. Emergency calls attended at night too. Own tools and camera inspection.',
    years: 9,
    serviceSlugs: [
      'pipe-leakage',
      'drain-blockage',
      'tap-faucet-repair',
      'bathroom-plumbing',
      'kitchen-plumbing',
      'water-tank-repair',
    ],
    zoneNames: ['G-10', 'G-9', 'G-8', 'I-8', 'H-8', 'Blue Area'],
    emergency: true,
    emergencyFeeRupees: 1000,
    startingRupees: 1200,
    completedJobs: 256,
    ratingAverage: 4.6,
    ratingCount: 148,
  },
  {
    businessName: 'SafaiWala Cleaning Co.',
    fullName: 'Bilal Ahmed',
    email: 'demo.bilal@islamabadfix.pk',
    phone: '+923001234503',
    headline: 'Deep cleaning team with their own equipment',
    description:
      'Deep cleaning for homes and offices, sofa and carpet shampooing. Trained team, machine cleaning, fixed rates per area.',
    years: 5,
    serviceSlugs: [
      'home-cleaning',
      'office-cleaning',
      'sofa-cleaning',
      'carpet-cleaning',
      'water-tank-cleaning',
    ],
    zoneNames: ['F-6', 'F-7', 'F-8', 'G-6', 'G-7', 'DHA Phase 2'],
    emergency: false,
    emergencyFeeRupees: 0,
    startingRupees: 3500,
    completedJobs: 142,
    ratingAverage: 4.7,
    ratingCount: 96,
  },
  {
    businessName: 'Master Tariq Carpentry',
    fullName: 'Tariq Mehmood',
    email: 'demo.tariq@islamabadfix.pk',
    phone: '+923001234504',
    headline: 'Furniture, door and cabinet work',
    description:
      'Door and furniture repair, kitchen cabinets and wardrobes. Material costing is given in writing upfront.',
    years: 18,
    serviceSlugs: [
      'door-repair',
      'furniture-repair',
      'cabinet-work',
      'shelves-storage',
      'general-carpentry',
    ],
    zoneNames: ['G-13', 'G-14', 'E-11', 'F-11', 'G-11'],
    emergency: false,
    emergencyFeeRupees: 0,
    startingRupees: 1500,
    completedJobs: 203,
    ratingAverage: 4.9,
    ratingCount: 121,
  },
  {
    businessName: 'CoolTech Appliance Repair',
    fullName: 'Usman Khalid',
    email: 'demo.usman@islamabadfix.pk',
    phone: '+923001234505',
    headline: 'Fridge, washing machine and geyser',
    description:
      'Refrigerator, washing machine, microwave and geyser repair. Parts available for Dawlance, PEL, Haier and Samsung.',
    years: 7,
    serviceSlugs: ['refrigerator', 'washing-machine', 'microwave', 'geyser', 'other-appliances'],
    zoneNames: ['I-8', 'I-9', 'I-10', 'G-9', 'G-8', 'PWD Colony'],
    emergency: true,
    emergencyFeeRupees: 700,
    startingRupees: 1500,
    completedJobs: 178,
    ratingAverage: 4.5,
    ratingCount: 103,
  },
  {
    businessName: 'SecureView CCTV Solutions',
    fullName: 'Hamza Sheikh',
    email: 'demo.hamza@islamabadfix.pk',
    phone: '+923001234506',
    headline: 'CCTV installation and maintenance',
    description:
      'CCTV for homes and shops, DVR/NVR setup and live view on your phone. Camera count and cabling are quoted after a site survey.',
    years: 6,
    serviceSlugs: ['cctv-installation', 'cctv-repair', 'access-control', 'security-maintenance'],
    zoneNames: ['Blue Area', 'F-8', 'G-8', 'I-9', 'Gulberg Greens', 'Bahria Town Phase 4'],
    emergency: false,
    emergencyFeeRupees: 0,
    startingRupees: 8000,
    completedJobs: 89,
    ratingAverage: 4.4,
    ratingCount: 57,
  },
  {
    businessName: 'Rang Saaz Painters',
    fullName: 'Imran Butt',
    email: 'demo.imran@islamabadfix.pk',
    phone: '+923001234507',
    headline: 'Room and house painting',
    description:
      'Emulsion and weather coat painting, putty and wall repair. The area is measured and a per-square-foot rate is quoted.',
    years: 11,
    serviceSlugs: ['room-painting', 'house-painting', 'office-painting', 'wall-repair'],
    zoneNames: ['G-13', 'G-14', 'E-11', 'Soan Garden', 'Bahria Town Phase 7'],
    emergency: false,
    emergencyFeeRupees: 0,
    startingRupees: 6000,
    completedJobs: 67,
    ratingAverage: 4.6,
    ratingCount: 41,
  },
  {
    businessName: 'QuickFix Electricals',
    fullName: 'Shahid Iqbal',
    email: 'demo.shahid@islamabadfix.pk',
    phone: '+923001234508',
    headline: 'Wiring, generators and emergency electrical',
    description:
      'House wiring, generator service and emergency electrical faults. Available at night for urgent faults.',
    years: 14,
    serviceSlugs: [
      'electrical-repair',
      'house-wiring',
      'generator-service',
      'light-installation',
      'switch-socket-repair',
      'ups-service',
    ],
    zoneNames: ['F-6', 'F-7', 'G-6', 'G-7', 'Blue Area', 'F-8'],
    emergency: true,
    emergencyFeeRupees: 1200,
    startingRupees: 1000,
    completedJobs: 312,
    ratingAverage: 4.7,
    ratingCount: 187,
  },
];

const DEMO_REVIEW_COMMENTS: Record<string, string[]> = {
  'ac-cooling': [
    'The technician arrived on time and serviced the AC thoroughly. It cools better than before.',
    'The AC runs fine after the gas refill. Quoted upfront, no extra charges.',
    'Inspected, explained the problem, then repaired it. Clean work.',
  ],
  plumbing: [
    'Fixed the leak straight away. Left the bathroom clean.',
    'Came out on an emergency call at night and cleared the drain. Thank you.',
    'The work was fine but they arrived a little late. Everything else was good.',
  ],
  cleaning: [
    'The whole team came and made the house sparkle. The sofa looks brand new.',
    'The office cleaning was done professionally. We will book again.',
  ],
  carpenter: [
    'Fixed the door and replaced the hinges too. The rate was fair.',
    'Did the cabinet work very cleanly. Gave the material costing in writing beforehand.',
  ],
  appliances: [
    'The fridge is cooling again. Showed me the bill for the parts as well.',
    'Understood the washing machine problem and fixed it. Fair charges.',
  ],
  electrical: [
    'Did the switchboard work properly and took care over safety.',
    'The noise dropped after the generator service. A real professional.',
  ],
  security: ['Installed the CCTV and set it up on my phone too. Explained everything in detail.'],
  painting: ['The room painting was neat, they covered the furniture. Finished on time.'],
};

// ================================= main ===================================

async function main(): Promise<void> {
  console.info('Islamabad Fix — seeding database');
  console.info('--------------------------------');

  await seedAdmin();
  const zones = await seedZones();
  const services = await seedCatalogue();
  await seedSettings();
  await seedMembershipPlans();

  if (!ALLOW_DEMO) {
    console.info('\nALLOW_DEMO_SEED is not set to "true" — skipping demo data.');
    console.info('Reference catalogue and admin account are in place.');
    return;
  }

  const providers = await seedDemoProviders(zones, services);
  await seedDemoBookings(providers, services, zones);

  console.info('\nDemo data seeded. Every demo row carries isDemo=true.');
  console.info('Remove it later with: npx tsx scripts/purge-demo.ts');
}

async function seedAdmin(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL.toLowerCase() },
    create: {
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      fullName: 'Platform Admin',
      role: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
    // Do not silently reset the password of an existing admin on re-seed.
    update: { role: 'SUPER_ADMIN' },
  });
  console.info(`  admin account: ${admin.email} (SUPER_ADMIN)`);
  if (ADMIN_PASSWORD === 'ChangeMe!Admin123') {
    console.warn('  WARNING: default admin password in use. Change it before deploying.');
  }
}

async function seedZones(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const [index, zone] of ZONES.entries()) {
    const slug = slugify(`islamabad-${zone.name}`);
    const row = await prisma.serviceZone.upsert({
      where: { slug },
      create: {
        name: zone.name,
        slug,
        city: 'Islamabad',
        latitude: zone.lat ?? null,
        longitude: zone.lng ?? null,
        sortOrder: index,
      },
      update: {
        name: zone.name,
        latitude: zone.lat ?? null,
        longitude: zone.lng ?? null,
        sortOrder: index,
      },
    });
    map.set(zone.name, row.id);
  }
  console.info(`  service zones: ${map.size}`);
  return map;
}

async function seedCatalogue(): Promise<Map<string, { id: string; categorySlug: string }>> {
  const services = new Map<string, { id: string; categorySlug: string }>();

  for (const [categoryIndex, category] of CATEGORIES.entries()) {
    const categoryRow = await prisma.serviceCategory.upsert({
      where: { slug: category.slug },
      create: {
        name: category.name,
        slug: category.slug,
        tagline: category.tagline,
        description: category.description,
        iconKey: category.iconKey,
        sortOrder: categoryIndex,
        isEmergencyCategory: category.emergencyCategory ?? false,
      },
      update: {
        name: category.name,
        tagline: category.tagline,
        description: category.description,
        iconKey: category.iconKey,
        sortOrder: categoryIndex,
        isEmergencyCategory: category.emergencyCategory ?? false,
        deletedAt: null,
        isActive: true,
      },
    });

    for (const [serviceIndex, service] of category.services.entries()) {
      const slug = service.slug ?? slugify(service.name);
      const row = await prisma.service.upsert({
        where: { slug },
        create: {
          categoryId: categoryRow.id,
          name: service.name,
          slug,
          minPricePaisa: rs(service.minRupees),
          maxPricePaisa: service.maxRupees ? rs(service.maxRupees) : null,
          requiresInspection: service.requiresInspection ?? true,
          estimatedMinutes: service.minutes ?? 90,
          isEmergencyEnabled: service.emergency ?? false,
          guaranteeEligible: service.guarantee ?? true,
          sortOrder: serviceIndex,
        },
        update: {
          categoryId: categoryRow.id,
          name: service.name,
          minPricePaisa: rs(service.minRupees),
          maxPricePaisa: service.maxRupees ? rs(service.maxRupees) : null,
          requiresInspection: service.requiresInspection ?? true,
          estimatedMinutes: service.minutes ?? 90,
          isEmergencyEnabled: service.emergency ?? false,
          sortOrder: serviceIndex,
          deletedAt: null,
          isActive: true,
        },
      });
      services.set(slug, { id: row.id, categorySlug: category.slug });
    }
  }

  console.info(`  categories: ${CATEGORIES.length}, services: ${services.size}`);
  return services;
}

/** Only writes settings that are not already present, so admin edits survive. */
async function seedSettings(): Promise<void> {
  const defaults: Array<[string, Prisma.InputJsonValue]> = [
    ['platform.city', 'Islamabad'],
    ['platform.commissionRateBp', 1000],
    ['guarantee.enabled', true],
    ['guarantee.days', 7],
    ['emergency.enabled', true],
    ['payments.enabledMethods', ['CASH']],
  ];
  let written = 0;
  for (const [key, value] of defaults) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.setting.create({ data: { key, value } });
      written += 1;
    }
  }
  console.info(`  settings: ${written} written, ${defaults.length - written} already set`);
}

/**
 * Reference membership plans.
 *
 * Written as inactive, and `memberships.enabled` stays false: a plan is a
 * commercial promise, so it goes live only when somebody decides it should,
 * from the admin panel.
 */
async function seedMembershipPlans(): Promise<void> {
  const plans = [
    {
      code: 'care',
      name: 'Care',
      tagline: 'For a household that calls us a few times a year',
      description:
        'Five percent off every completed booking, and two extra weeks of re-visit guarantee on the services that carry one.',
      pricePaisa: 250_000,
      periodDays: 365,
      discountBp: 500,
      maxDiscountPaisa: 150_000,
      guaranteeBonusDays: 14,
      priorityFanoutBonus: 1,
      emergencyFeeWaiverPaisa: 0,
      sortOrder: 1,
    },
    {
      code: 'care-plus',
      name: 'Care Plus',
      tagline: 'For a household or small shop that calls us often',
      description:
        'Ten percent off every completed booking, a month of extra guarantee, part of the emergency call-out fee covered, and your request reaches more technicians at once.',
      pricePaisa: 600_000,
      periodDays: 365,
      discountBp: 1000,
      maxDiscountPaisa: 400_000,
      guaranteeBonusDays: 30,
      priorityFanoutBonus: 3,
      emergencyFeeWaiverPaisa: 50_000,
      sortOrder: 2,
    },
  ];

  let written = 0;
  for (const plan of plans) {
    const existing = await prisma.membershipPlan.findUnique({ where: { code: plan.code } });
    if (existing) continue;
    await prisma.membershipPlan.create({ data: { ...plan, isActive: false } });
    written += 1;
  }
  console.info(`  membership plans: ${written} written (inactive until published)`);
}

async function seedDemoProviders(
  zones: Map<string, string>,
  services: Map<string, { id: string; categorySlug: string }>,
): Promise<
  Array<{ providerId: string; userId: string; serviceSlugs: string[]; zoneNames: string[] }>
> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const result: Array<{
    providerId: string;
    userId: string;
    serviceSlugs: string[];
    zoneNames: string[];
  }> = [];

  for (const seed of DEMO_PROVIDERS) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        email: seed.email,
        phone: seed.phone,
        passwordHash,
        fullName: seed.fullName,
        role: 'PROVIDER',
        isDemo: true,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
      },
      update: { isDemo: true },
    });

    const slug = slugify(seed.businessName);
    const provider = await prisma.providerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessName: seed.businessName,
        slug,
        status: 'VERIFIED',
        headline: seed.headline,
        description: seed.description,
        yearsExperience: seed.years,
        contactPhone: seed.phone,
        city: 'Islamabad',
        emergencyAvailable: seed.emergency,
        emergencyFeePaisa: rs(seed.emergencyFeeRupees),
        completedJobs: seed.completedJobs,
        ratingAverage: seed.ratingAverage,
        ratingCount: seed.ratingCount,
        // Consistent with the counters above so the matcher has sane inputs.
        offeredJobs: Math.round(seed.completedJobs * 1.4),
        acceptedJobs: seed.completedJobs,
        responseRate: 0.9,
        avgResponseMinutes: 12,
        verifiedAt: new Date(),
        isDemo: true,
      },
      update: { status: 'VERIFIED', isDemo: true },
    });

    // Verification badges: demo providers get identity, phone, email and
    // platform review — the four checks this platform actually performs.
    for (const kind of ['IDENTITY_CNIC', 'PHONE', 'EMAIL', 'PLATFORM_ONBOARDING'] as const) {
      await prisma.providerVerification.upsert({
        where: { providerId_kind: { providerId: provider.id, kind } },
        create: {
          providerId: provider.id,
          kind,
          status: 'APPROVED',
          reviewedAt: new Date(),
          notes: 'Demo data — seeded as approved.',
          reference: kind === 'IDENTITY_CNIC' ? '••••1234' : null,
        },
        update: { status: 'APPROVED' },
      });
    }

    await prisma.providerService.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerService.createMany({
      data: seed.serviceSlugs
        .map((serviceSlug) => services.get(serviceSlug))
        .filter((entry): entry is { id: string; categorySlug: string } => entry !== undefined)
        .map((entry) => ({
          providerId: provider.id,
          serviceId: entry.id,
          startingPricePaisa: rs(seed.startingRupees),
        })),
    });

    await prisma.serviceArea.deleteMany({ where: { providerId: provider.id } });
    await prisma.serviceArea.createMany({
      data: seed.zoneNames
        .map((name) => zones.get(name))
        .filter((zoneId): zoneId is string => zoneId !== undefined)
        .map((zoneId) => ({ providerId: provider.id, zoneId })),
    });

    // Mon-Sat 09:00-19:00; emergency providers also cover Sunday.
    await prisma.providerAvailability.deleteMany({ where: { providerId: provider.id } });
    const days = seed.emergency ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
    await prisma.providerAvailability.createMany({
      data: days.map((dayOfWeek) => ({
        providerId: provider.id,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 19 * 60,
      })),
      skipDuplicates: true,
    });

    result.push({
      providerId: provider.id,
      userId: user.id,
      serviceSlugs: seed.serviceSlugs,
      zoneNames: seed.zoneNames,
    });
  }

  console.info(`  demo providers: ${result.length} (all VERIFIED, isDemo=true)`);
  return result;
}

async function seedDemoBookings(
  providers: Array<{
    providerId: string;
    userId: string;
    serviceSlugs: string[];
    zoneNames: string[];
  }>,
  services: Map<string, { id: string; categorySlug: string }>,
  zones: Map<string, string>,
): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const customerSeeds = [
    { name: 'Ayesha Khan', email: 'demo.ayesha@example.com', phone: '+923331234501', zone: 'G-10' },
    { name: 'Hassan Ali', email: 'demo.hassan@example.com', phone: '+923331234502', zone: 'F-11' },
    { name: 'Fatima Noor', email: 'demo.fatima@example.com', phone: '+923331234503', zone: 'F-7' },
    { name: 'Zain Abbas', email: 'demo.zain@example.com', phone: '+923331234504', zone: 'I-8' },
  ];

  const customers = [];
  for (const seed of customerSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        email: seed.email,
        phone: seed.phone,
        passwordHash,
        fullName: seed.name,
        role: 'CUSTOMER',
        isDemo: true,
        emailVerifiedAt: new Date(),
        customerProfile: { create: {} },
      },
      update: { isDemo: true },
    });

    const zoneId = zones.get(seed.zone);
    const existingAddress = await prisma.address.findFirst({
      where: { userId: user.id, deletedAt: null },
    });
    const address =
      existingAddress ??
      (await prisma.address.create({
        data: {
          userId: user.id,
          label: 'Home',
          zoneId: zoneId ?? null,
          city: 'Islamabad',
          addressLine: `House 12, Street 4, ${seed.zone}, Islamabad`,
          houseOrBuilding: 'House 12',
          contactPhone: seed.phone,
          isDefault: true,
        },
      }));

    customers.push({ userId: user.id, addressId: address.id, name: seed.name });
  }

  const existingDemoBookings = await prisma.booking.count({ where: { isDemo: true } });
  if (existingDemoBookings > 0) {
    console.info(`  demo customers: ${customers.length}`);
    console.info(`  demo bookings: ${existingDemoBookings} already present, skipping`);
    return;
  }

  const now = Date.now();
  let bookingCount = 0;
  let reviewCount = 0;

  // A spread of statuses so every dashboard tab has something real in it.
  const plan: Array<{
    serviceSlug: string;
    status: 'COMPLETED' | 'SCHEDULED' | 'IN_PROGRESS' | 'QUOTE_PENDING' | 'CANCELLED' | 'PENDING';
    daysOffset: number;
    problem: string;
    totalRupees?: number;
    rating?: number;
  }> = [
    {
      serviceSlug: 'ac-repair',
      status: 'COMPLETED',
      daysOffset: -18,
      problem: 'The AC runs but blows no cold air.',
      totalRupees: 3300,
      rating: 5,
    },
    {
      serviceSlug: 'ac-service',
      status: 'COMPLETED',
      daysOffset: -14,
      problem: 'I need two split ACs serviced, the filters are very dirty.',
      totalRupees: 3000,
      rating: 4,
    },
    {
      serviceSlug: 'pipe-leakage',
      status: 'COMPLETED',
      daysOffset: -11,
      problem: 'A pipe under the kitchen is dripping water.',
      totalRupees: 2500,
      rating: 5,
    },
    {
      serviceSlug: 'drain-blockage',
      status: 'COMPLETED',
      daysOffset: -9,
      problem: 'The bathroom drain is blocked and water is standing.',
      totalRupees: 2000,
      rating: 4,
    },
    {
      serviceSlug: 'home-cleaning',
      status: 'COMPLETED',
      daysOffset: -7,
      problem: 'I need a deep clean of the whole house, 3 bedrooms.',
      totalRupees: 8500,
      rating: 5,
    },
    {
      serviceSlug: 'refrigerator',
      status: 'COMPLETED',
      daysOffset: -5,
      problem: 'The fridge freezer works but there is no cooling below.',
      totalRupees: 4200,
      rating: 4,
    },
    {
      serviceSlug: 'door-repair',
      status: 'COMPLETED',
      daysOffset: -4,
      problem: 'The bedroom door will not shut, the hinges are loose.',
      totalRupees: 1800,
      rating: 5,
    },
    {
      serviceSlug: 'electrical-repair',
      status: 'COMPLETED',
      daysOffset: -3,
      problem: 'Two switches in the lounge are not working.',
      totalRupees: 1600,
      rating: 5,
    },
    {
      serviceSlug: 'geyser',
      status: 'COMPLETED',
      daysOffset: -2,
      problem: 'The geyser is not heating the water.',
      totalRupees: 2800,
      rating: 3,
    },
    {
      serviceSlug: 'cctv-installation',
      status: 'SCHEDULED',
      daysOffset: 1,
      problem: 'I want 4 cameras installed outside the house.',
      totalRupees: 32000,
    },
    {
      serviceSlug: 'ac-installation',
      status: 'SCHEDULED',
      daysOffset: 2,
      problem: 'I need a new 1.5 ton split AC installed.',
      totalRupees: 5500,
    },
    {
      serviceSlug: 'sofa-cleaning',
      status: 'QUOTE_PENDING',
      daysOffset: 1,
      problem: 'I need a 7-seater sofa and one carpet cleaned.',
    },
    {
      serviceSlug: 'room-painting',
      status: 'IN_PROGRESS',
      daysOffset: 0,
      problem: 'I need two rooms painted, and there are some cracks in the wall too.',
      totalRupees: 18000,
    },
    {
      serviceSlug: 'washing-machine',
      status: 'CANCELLED',
      daysOffset: -6,
      problem: 'The washing machine is not spinning.',
    },
    {
      serviceSlug: 'fan-repair',
      status: 'PENDING',
      daysOffset: 2,
      problem: 'The ceiling fan is making a rattling noise.',
    },
  ];

  for (const [index, entry] of plan.entries()) {
    const service = services.get(entry.serviceSlug);
    if (!service) continue;

    const customer = customers[index % customers.length]!;
    // Pick a provider who actually offers this service, as the matcher would.
    const provider = providers.find((p) => p.serviceSlugs.includes(entry.serviceSlug));
    if (!provider) continue;

    const scheduledFor = new Date(now + entry.daysOffset * 86_400_000);
    const isTerminal = entry.status === 'COMPLETED' || entry.status === 'CANCELLED';
    const totalPaisa = entry.totalRupees ? rs(entry.totalRupees) : null;
    const commissionRateBp = 1000;
    const commissionPaisa = totalPaisa
      ? Math.floor((totalPaisa * commissionRateBp) / 10_000)
      : null;

    const booking = await prisma.booking.create({
      data: {
        reference: `IFX-D${String(index + 1).padStart(5, '0')}`,
        customerId: customer.userId,
        serviceId: service.id,
        addressId: customer.addressId,
        providerId: entry.status === 'PENDING' ? null : provider.providerId,
        status: entry.status,
        problemDescription: entry.problem,
        scheduledFor,
        createdAt: new Date(scheduledFor.getTime() - 2 * 86_400_000),
        acceptedAt:
          entry.status === 'PENDING' ? null : new Date(scheduledFor.getTime() - 86_400_000),
        completedAt: entry.status === 'COMPLETED' ? scheduledFor : null,
        cancelledAt: entry.status === 'CANCELLED' ? scheduledFor : null,
        cancellationReason:
          entry.status === 'CANCELLED' ? 'The customer had it repaired themselves.' : null,
        approvedTotalPaisa: entry.status === 'QUOTE_PENDING' ? null : totalPaisa,
        finalTotalPaisa: entry.status === 'COMPLETED' ? totalPaisa : null,
        commissionRateBp: entry.status === 'COMPLETED' ? commissionRateBp : null,
        commissionPaisa: entry.status === 'COMPLETED' ? commissionPaisa : null,
        providerEarningsPaisa:
          entry.status === 'COMPLETED' && totalPaisa && commissionPaisa !== null
            ? totalPaisa - commissionPaisa
            : null,
        guaranteeEligible: entry.status === 'COMPLETED',
        guaranteeDays: entry.status === 'COMPLETED' ? 7 : 0,
        guaranteeExpiresAt:
          entry.status === 'COMPLETED' ? new Date(scheduledFor.getTime() + 7 * 86_400_000) : null,
        isDemo: true,
        statusHistory: {
          create: [
            { fromStatus: null, toStatus: 'PENDING', reason: 'Demo seed' },
            ...(entry.status === 'PENDING'
              ? []
              : [{ fromStatus: 'PENDING' as const, toStatus: entry.status, reason: 'Demo seed' }]),
          ],
        },
      },
    });
    bookingCount += 1;

    // A quote for anything that got past acceptance.
    if (totalPaisa && entry.status !== 'PENDING') {
      const inspection = rs(500);
      const labour = Math.round(totalPaisa * 0.4);
      const parts = totalPaisa - inspection - labour;
      await prisma.quote.create({
        data: {
          bookingId: booking.id,
          providerId: provider.providerId,
          status: entry.status === 'QUOTE_PENDING' ? 'SUBMITTED' : 'APPROVED',
          subtotalPaisa: totalPaisa,
          submittedAt: new Date(scheduledFor.getTime() - 86_400_000),
          respondedAt: entry.status === 'QUOTE_PENDING' ? null : scheduledFor,
          items: {
            create: [
              { kind: 'INSPECTION', label: 'Inspection', quantity: 1, unitPricePaisa: inspection },
              { kind: 'LABOUR', label: 'Labour', quantity: 1, unitPricePaisa: labour },
              ...(parts > 0
                ? [{ kind: 'PARTS' as const, label: 'Parts', quantity: 1, unitPricePaisa: parts }]
                : []),
            ],
          },
        },
      });
    }

    if (entry.status === 'COMPLETED' && totalPaisa) {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          method: 'CASH',
          status: 'PAID',
          amountPaisa: totalPaisa,
          providerKey: 'cash',
          paidAt: scheduledFor,
        },
      });

      if (entry.rating) {
        const comments = DEMO_REVIEW_COMMENTS[service.categorySlug] ?? [];
        await prisma.review.create({
          data: {
            bookingId: booking.id,
            authorId: customer.userId,
            providerId: provider.providerId,
            rating: entry.rating,
            comment: comments[index % Math.max(1, comments.length)] ?? null,
            serviceQuality: entry.rating,
            professionalism: Math.min(5, entry.rating + (index % 2)),
            punctuality: Math.max(1, entry.rating - (index % 2)),
            valueForMoney: entry.rating,
            // Flagged as demo so the UI can label it and never pass it off as
            // a real customer's words.
            isDemo: true,
            createdAt: new Date(scheduledFor.getTime() + 3_600_000),
          },
        });
        reviewCount += 1;
      }
    }

    void isTerminal;
  }

  console.info(`  demo customers: ${customers.length}`);
  console.info(`  demo bookings: ${bookingCount}, demo reviews: ${reviewCount}`);
  console.info(`  demo account password: ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.info('\nSeeding complete.');
  })
  .catch(async (error) => {
    console.error('\nSeeding failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
