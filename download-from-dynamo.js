// download-from-dynamo.js
// Run this to pull all data from AWS DynamoDB into a local data/db.json
// Usage: node download-from-dynamo.js
//        node download-from-dynamo.js --profile ammas

const profileArgIndex = process.argv.indexOf('--profile');
if (profileArgIndex !== -1 && process.argv[profileArgIndex + 1]) {
  process.env.AWS_PROFILE = process.argv[profileArgIndex + 1];
} else {
  process.env.AWS_PROFILE = process.env.AWS_PROFILE || 'ammas';
}

const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'ammas-pastries-backend-db-v2';
const REGION = 'ap-south-1';

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'db.json');

const defaultDb = {
  branches: [],
  globalMedia: [],
  branchMedia: {},
  branchAnnouncements: {},
  branchOrders: {}
};

async function downloadFromDynamo() {
  console.log('=========================================');
  console.log('Downloading database from AWS DynamoDB...');
  console.log('Table  :', TABLE_NAME);
  console.log('Region :', REGION);
  console.log('Profile:', process.env.AWS_PROFILE);
  console.log('=========================================');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  let items = [];
  let lastKey = undefined;

  do {
    const params = { TableName: TABLE_NAME };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await docClient.send(new ScanCommand(params));
    items = items.concat(result.Items || []);
    lastKey = result.LastEvaluatedKey;
    console.log('  Fetched', (result.Items || []).length, 'items (total:', items.length + ')...');
  } while (lastKey);

  console.log('\n✓ Total items from DynamoDB:', items.length);

  const db = JSON.parse(JSON.stringify(defaultDb));

  for (const item of items) {
    const { id, data } = item;
    if (!id) continue;

    if (id === 'branches') {
      db.branches = data;
    } else if (id === 'globalMedia') {
      db.globalMedia = data;
    } else if (id.startsWith('branchMedia#')) {
      db.branchMedia[id.slice('branchMedia#'.length)] = data;
    } else if (id.startsWith('branchAnnouncements#')) {
      db.branchAnnouncements[id.slice('branchAnnouncements#'.length)] = data;
    } else if (id.startsWith('branchOrders#')) {
      db.branchOrders[id.slice('branchOrders#'.length)] = data;
    } else {
      console.warn('  ⚠ Unknown item skipped:', id);
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

  console.log('\n=========================================');
  console.log('SUCCESS! Data saved to data/db.json');
  console.log('  Branches          :', db.branches.length);
  console.log('  Global Media Items:', db.globalMedia.length);
  console.log('  Branch Media Keys :', Object.keys(db.branchMedia).join(', ') || 'none');
  console.log('  Branch Ann. Keys  :', Object.keys(db.branchAnnouncements).join(', ') || 'none');
  console.log('  Branch Order Keys :', Object.keys(db.branchOrders).join(', ') || 'none');
  console.log('=========================================');
  console.log('\nYou can now run: npm start');
}

downloadFromDynamo().catch(err => {
  console.error('\nDownload failed:', err.message);
  if (err.name === 'CredentialsProviderError' || err.message.includes('credential')) {
    console.error('\nTip: Make sure your AWS credentials are set up.');
    console.error('     Run: aws configure --profile ammas');
    console.error('     Or set: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars');
  }
  process.exit(1);
});
