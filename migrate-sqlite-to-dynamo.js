// migrate-sqlite-to-dynamo.js
// Run this file to upload your local SQLite database directly to AWS DynamoDB!

process.env.AWS_PROFILE = 'ammas';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { readFullDb } = require('./sqliteStorage.js');

const TABLE_NAME = 'ammas-pastries-custom-db-v2';
const REGION = 'ap-south-1'; // mumbai

async function runMigration() {
  console.log("=========================================");
  console.log("Starting SQLite database migration to AWS DynamoDB...");
  console.log("=========================================");

  let localData;
  try {
    localData = await readFullDb();
    console.log("✓ Successfully read local SQLite data");
  } catch (err) {
    console.error("Error reading local SQLite db:", err.message);
    process.exit(1);
  }

  // Initialize AWS DynamoDB Document Client
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  const items = [];

  // Branches
  if (localData.branches && localData.branches.length > 0) {
    items.push({ id: 'branches', data: localData.branches });
  }
  
  // Waffle Config (Global)
  if (localData.waffleConfig && Object.keys(localData.waffleConfig).length > 0) {
    items.push({ id: 'waffleConfig', data: localData.waffleConfig });
  }

  // Waffle Configs (Branches)
  if (localData.branchWaffleConfig) {
    for (const branchId in localData.branchWaffleConfig) {
      items.push({ id: `branchWaffleConfig#${branchId}`, data: localData.branchWaffleConfig[branchId] });
    }
  }

  // Waffles (Global)
  if (localData.waffles && localData.waffles.length > 0) {
    items.push({ id: 'waffles', data: localData.waffles });
  }

  // Waffles (Branches)
  if (localData.branchWaffles) {
    for (const branchId in localData.branchWaffles) {
      items.push({ id: `branchWaffles#${branchId}`, data: localData.branchWaffles[branchId] });
    }
  }

  // Global Media
  if (localData.globalMedia && localData.globalMedia.length > 0) {
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

  // Upload items
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
    console.log("🎉 SUCCESS! Your database has been migrated to AWS.");
    console.log("=========================================");
  } catch (err) {
    console.error("❌ Migration failed with error:", err.message);
    console.error("Ensure your AWS profile 'ammas' is active and you have deployed the backend first.");
  }
}

runMigration();
