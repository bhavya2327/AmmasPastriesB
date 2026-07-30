// migrate-media.js
// Run this to:
// 1. Upload local uploads/* files to your AWS S3 bucket with public-read permissions
// 2. Replace uploads/* references in your DB with the new S3 URLs
// 3. Save the final updated DB state to AWS DynamoDB!

process.env.AWS_PROFILE = 'default';

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const BUCKET_NAME = 'ammas-pastries-backend-media-889629668002-ap-south-1';
const DYNAMO_TABLE = 'ammas-pastries-backend-db';
const REGION = 'ap-south-1';

const dbPath = path.join(__dirname, 'data', 'db.json');
const uploadsDir = path.join(__dirname, 'uploads');

async function run() {
  console.log("=========================================");
  console.log("Starting Media & DB Sync to AWS...");
  console.log("=========================================");

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Local database file not found at ${dbPath}`);
    process.exit(1);
  }

  const s3Client = new S3Client({ region: REGION });
  const dynamoClient = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(dynamoClient);

  // 1. Load database content
  let dbData;
  try {
    dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (err) {
    console.error("Failed to parse db.json:", err.message);
    process.exit(1);
  }

  // Helper to find and upload local files recursively/iteratively in the JSON
  const uploadedUrls = new Map();

  async function uploadFileIfNeeded(localPath) {
    const filename = path.basename(localPath);
    const s3Key = `uploads/${filename}`;
    const fullLocalPath = path.join(uploadsDir, filename);

    if (uploadedUrls.has(localPath)) {
      return uploadedUrls.get(localPath);
    }

    const s3Url = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${s3Key}`;

    if (!fs.existsSync(fullLocalPath)) {
      console.log(`⚠️ Local file not found: ${fullLocalPath}. Skipping upload, retaining fallback.`);
      return localPath; 
    }

    try {
      console.log(`📤 Uploading ${filename} to S3 bucket with public-read...`);
      const fileBuffer = fs.readFileSync(fullLocalPath);
      
      // Determine mimetype
      let mimeType = 'application/octet-stream';
      if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (filename.endsWith('.png')) mimeType = 'image/png';
      else if (filename.endsWith('.mp4')) mimeType = 'video/mp4';

      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: 'public-read' // Enable public read access
      }));

      console.log(`✓ Uploaded. S3 URL: ${s3Url}`);
      uploadedUrls.set(localPath, s3Url);
      return s3Url;
    } catch (err) {
      console.error(`❌ Failed to upload ${filename}:`, err.message);
      return localPath;
    }
  }

  // 2. Traversal function to search and replace uploads/ paths
  async function traverseAndMigrate(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;

    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].startsWith('uploads/')) {
        obj[key] = await uploadFileIfNeeded(obj[key]);
      } else if (typeof obj[key] === 'object') {
        await traverseAndMigrate(obj[key]);
      }
    }
    return obj;
  }

  // Run the traversal
  console.log("Analyzing database for media paths...");
  const migratedDb = await traverseAndMigrate(dbData);

  // 3. Write final database payload to DynamoDB
  try {
    console.log(`Saving final database state to DynamoDB table '${DYNAMO_TABLE}'...`);
    await docClient.send(new PutCommand({
      TableName: DYNAMO_TABLE,
      Item: {
        id: 1,
        data: migratedDb,
        lastUpdated: Date.now()
      }
    }));
    console.log("=========================================");
    console.log("🎉 SUCCESS! Media uploaded and database synced.");
    console.log("=========================================");
  } catch (err) {
    console.error("❌ Failed to update DynamoDB:", err.message);
  }
}

run();
