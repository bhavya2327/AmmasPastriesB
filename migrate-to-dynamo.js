// migrate-to-dynamo.js
// Run this file to upload your local data/db.json directly to AWS DynamoDB!

// Force AWS SDK to use the 'ammas' credentials profile
process.env.AWS_PROFILE = 'ammas';

const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'ammas-pastries-backend-db-v2';
const REGION = 'ap-south-1'; // mumbai

const dbPath = path.join(__dirname, 'data', 'db.json');

async function runMigration() {
  console.log("=========================================");
  console.log("Starting database migration to AWS (Optimized multi-row)...");
  console.log("=========================================");

  // 1. Read local db.json
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Local database file not found at ${dbPath}`);
    process.exit(1);
  }

  let localData;
  try {
    const rawContent = fs.readFileSync(dbPath, 'utf8');
    localData = JSON.parse(rawContent);
    console.log("✓ Successfully read local data/db.json");
  } catch (err) {
    console.error("Error reading local db.json:", err.message);
    process.exit(1);
  }

  // 2. Initialize AWS DynamoDB Document Client
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  // 3. Compile upload items
  const items = [];

  // Branches
  if (localData.branches) {
    items.push({ id: 'branches', data: localData.branches });
  }
  // Global Media
  if (localData.globalMedia) {
    items.push({ id: 'globalMedia', data: localData.globalMedia });
  }
  // Branch Media
  if (localData.branchMedia) {
    for (const branchId in localData.branchMedia) {
      items.push({ id: `branchMedia#${branchId}`, data: localData.branchMedia[branchId] });
    }
  }
  // Branch Announcements
  if (localData.branchAnnouncements) {
    for (const branchId in localData.branchAnnouncements) {
      items.push({ id: `branchAnnouncements#${branchId}`, data: localData.branchAnnouncements[branchId] });
    }
  }
  // Branch Orders
  if (localData.branchOrders) {
    for (const branchId in localData.branchOrders) {
      items.push({ id: `branchOrders#${branchId}`, data: localData.branchOrders[branchId] });
    }
  }

  // 4. Upload items
  try {
    console.log(`Uploading ${items.length} records to DynamoDB table '${TABLE_NAME}'...`);
    for (const item of items) {
      console.log(` -> Writing item: ${item.id}`);
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: item.id,
          data: item.data,
          lastUpdated: Date.now()
        }
      }));
    }
    console.log("=========================================");
    console.log("🎉 SUCCESS! Your database has been migrated to AWS in optimized format.");
    console.log("=========================================");
  } catch (err) {
    console.error("❌ Migration failed with error:", err.message);
    console.error("Ensure your AWS profile is active and you have deployed the backend first.");
  }
}

runMigration();
