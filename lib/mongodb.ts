import { MongoClient, Db } from 'mongodb';

// Validate MongoDB URI at module load time
const mongoUri = process.env.MONGODB_URI;
const isMongodbConfigured = !!mongoUri;

if (!isMongodbConfigured) {
  console.warn(
    '⚠ MONGODB_URI environment variable is not set.\n' +
    'Running in development mode without database persistence.\n' +
    'For local development with Docker Compose, set:\n' +
    '  MONGODB_URI=mongodb://admin:password@mongodb:27017/team-flags-edu?authSource=admin\n' +
    'Or provide your MongoDB Atlas connection string.\n' +
    'Once MongoDB credentials are available next week, update the environment variable.'
  );
}

const uri = mongoUri || 'mongodb://localhost:27017/team-flags-edu';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;
let mongoConnectionError: Error | null = null;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so the MongoClient is not constantly created
  const globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
    _mongoConnectionError?: Error | null;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    // Only try to connect if MongoDB is configured
    globalWithMongo._mongoClientPromise = isMongodbConfigured 
      ? client.connect().catch((error) => {
          console.error('✗ Failed to connect to MongoDB:', error.message);
          globalWithMongo._mongoConnectionError = error;
          mongoConnectionError = error;
          throw error;
        })
      : Promise.resolve(client); // Don't connect, just return the client
  }
  clientPromise = globalWithMongo._mongoClientPromise;
  mongoConnectionError = globalWithMongo._mongoConnectionError || null;
} else {
  // In production mode, create a new client for each request
  client = new MongoClient(uri, options);
  clientPromise = isMongodbConfigured 
    ? client.connect().catch((error) => {
        console.error('✗ Failed to connect to MongoDB:', error.message);
        mongoConnectionError = error;
        throw error;
      })
    : Promise.resolve(client); // Don't connect, just return the client
}

export async function getDatabase(): Promise<Db> {
  // If MongoDB is not configured, return a stub that won't crash
  if (!isMongodbConfigured) {
    return {
      collection: () => ({
        find: async () => ({ toArray: async () => [] }),
        findOne: async () => null,
        insertOne: async (doc: any) => ({ insertedId: 'mock' }),
        updateOne: async () => ({ modifiedCount: 0 }),
        deleteOne: async () => ({ deletedCount: 0 }),
      }),
    } as any;
  }

  try {
    const mongoClient = await clientPromise;
    const dbName = process.env.MONGODB_DB || 'team-flags-edu';
    console.log(`✓ Connected to MongoDB database: ${dbName}`);
    return mongoClient.db(dbName);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('✗ MongoDB error:', errorMessage);
    
    // Return stub database instead of crashing
    console.warn('⚠ Returning mock database - features requiring MongoDB will be limited');
    return {
      collection: () => ({
        find: async () => ({ toArray: async () => [] }),
        findOne: async () => null,
        insertOne: async (doc: any) => ({ insertedId: 'mock' }),
        updateOne: async () => ({ modifiedCount: 0 }),
        deleteOne: async () => ({ deletedCount: 0 }),
      }),
    } as any;
  }
}

export default clientPromise;
