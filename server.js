const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// AWS SDK Imports
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ENVIRONMENT AND CONFIG ---
const isAWSLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (isAWSLambda) {
  delete process.env.AWS_PROFILE;
}
const isAWS = isAWSLambda || process.env.USE_AWS_LOCALLY === 'true';
const uploadsDir = isAWSLambda ? '/tmp' : path.join(__dirname, 'uploads');

if (!isAWSLambda) {
  // Serve cake menu locally
  app.use('/cake-menu', express.static(path.join(__dirname, 'cake-menu')));
  // Serve uploaded files statically locally
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  app.use('/uploads', express.static(uploadsDir));
  // Serve other workspace files statically locally
  app.use(express.static(__dirname));
}


// --- AWS CLIENTS ---
const s3Client = isAWS ? new S3Client({ region: process.env.AWS_REGION || 'us-east-1' }) : null;
const dynamoClient = isAWS ? new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }) : null;
const docClient = dynamoClient ? DynamoDBDocumentClient.from(dynamoClient, { marshallOptions: { removeUndefinedValues: true } }) : null;

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'ammas-pastries-backend-db-v2';
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

// --- SUPABASE CLIENT ---
let supabase = null;
if (!isAWS && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  console.log("====================================================");
  console.log("Supabase Client initialized successfully!");
  console.log("====================================================");
} else if (!isAWS) {
  console.log("====================================================");
  console.log("No Supabase configuration detected. Using local fallback.");
  console.log("====================================================");
}

// --- DATABASE MANAGER ---
const DYNAMODB_TABLE_LOCAL_FALLBACK = path.join(__dirname, 'db_fallback.json');

// --- HELPER METHODS FOR WAFFLES ---

const defaultWaffles = [];
const categories = ['CLASSIC WAFFLES', 'PREMIUM WAFFLES', 'SIGNATURE CAKES', 'SPECIAL CAKES'];
for (let i = 1; i <= 40; i++) {
  defaultWaffles.push({
    id: 'w-' + i,
    name: (i <= 20 ? 'Waffle ' : 'Cake ') + i,
    description: 'Delicious ' + (i <= 20 ? 'waffle' : 'cake') + ' with premium ingredients',
    price: '₹' + (100 + (i * 10)) + '.00',
    category: categories[Math.floor((i - 1) / 10)],
    isVeg: i % 4 !== 0 // 3 out of 4 are veg
  });
}

async function getWaffles(branch) {
  if (isAWS) {
    const id = branch ? `branchWaffles#${branch}` : 'waffles';
    try {
      const command = new GetCommand({ TableName: DYNAMODB_TABLE, Key: { id } });
      const response = await docClient.send(command);
      if (response.Item && response.Item.data) {
        return response.Item.data;
      }
    } catch (err) {
      console.error("Error reading waffles from DynamoDB:", err);
    }
  }
  const db = await readDb();
  if (branch) {
    db.branchWaffles = db.branchWaffles || {};
    return db.branchWaffles[branch] || defaultWaffles;
  }
  return db.waffles || defaultWaffles;
}

async function saveWaffles(waffles, branch) {
  if (isAWS) {
    const id = branch ? `branchWaffles#${branch}` : 'waffles';
    try {
      const command = new PutCommand({ TableName: DYNAMODB_TABLE, Item: { id, data: waffles, updatedAt: new Date().toISOString() } });
      await docClient.send(command);
      return;
    } catch (err) {
      console.error("Error saving waffles to DynamoDB:", err);
    }
  }
  const db = await readDb();
  if (branch) {
    db.branchWaffles = db.branchWaffles || {};
    db.branchWaffles[branch] = waffles;
  } else {
    db.waffles = waffles;
  }
  await saveDb(db);
}

async function getWaffleConfig(branch) {
  if (isAWS) {
    const id = branch ? `branchWaffleConfig#${branch}` : 'waffleConfig';
    try {
      const command = new GetCommand({ TableName: DYNAMODB_TABLE, Key: { id } });
      const response = await docClient.send(command);
      return response.Item?.data || { orientation: 'portrait' };
    } catch (err) {
      console.error("Error reading waffle config from DynamoDB:", err);
      return { orientation: 'portrait' };
    }
  }
  const db = await readDb();
  if (branch) {
    return db.branchWaffleConfig?.[branch] || db.waffleConfig || { orientation: 'portrait' };
  }
  return db.waffleConfig || { orientation: 'portrait' };
}

async function saveWaffleConfig(config, branch) {
  if (isAWS) {
    const id = branch ? `branchWaffleConfig#${branch}` : 'waffleConfig';
    try {
      const command = new PutCommand({ TableName: DYNAMODB_TABLE, Item: { id, data: config, updatedAt: new Date().toISOString() } });
      await docClient.send(command);
      return;
    } catch (err) {
      console.error("Error saving waffle config to DynamoDB:", err);
    }
  }
  const db = await readDb();
  if (branch) {
    db.branchWaffleConfig = db.branchWaffleConfig || {};
    db.branchWaffleConfig[branch] = config;
  } else {
    db.waffleConfig = config;
  }
  await saveDb(db);
}

// --- LOCAL JSON FALLBACK FUNCTIONS ---
const dbPath = process.env.TEST_DB_PATH || path.join(__dirname, 'data', 'db.json');
const dbDir = path.dirname(dbPath);
if (!isAWSLambda && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const defaultDb = {
  branches: [],
  globalMedia: [],
  branchMedia: {},
  branchAnnouncements: {},
  branchOrders: {},
  waffles: [],
  branchWaffles: {},
  waffleConfig: {},
  branchWaffleConfig: {}
};

let globalDbCache = null;

async function initDatabase() {
  if (isAWS) {
    console.log("DynamoDB initialized in granular mode.");
    return;
  }

  await sqliteStorage.initSqlite();
  const localData = await readLocalDb();
  if (supabase) {
    try {
      console.log("Connecting to Supabase DB...");
      const { data, error } = await supabase
        .from('ammas_db')
        .select('data')
        .eq('id', 1)
        .single();
        
      if (error || !data) {
        console.log("Supabase table empty or row not found. Bootstrapping with local/default DB...");
        const { error: insertError } = await supabase
          .from('ammas_db')
          .insert([{ id: 1, data: localData }]);
          
        if (insertError) {
          console.error("Failed to bootstrap Supabase database:", insertError);
        }
        globalDbCache = localData;
      } else {
        const supabaseData = data.data;
        const localTime = localData.lastUpdated || 0;
        const supabaseTime = supabaseData.lastUpdated || 0;
        
        if (localTime > supabaseTime) {
          console.log(`Local database is newer (${localTime} > ${supabaseTime}). Synchronizing Supabase...`);
          globalDbCache = localData;
          const { error: syncError } = await supabase
            .from('ammas_db')
            .update({ data: localData })
            .eq('id', 1);
          if (syncError) {
            console.error("Failed to sync newer local database to Supabase:", syncError);
          } else {
            console.log("Supabase successfully updated with newer local database.");
          }
        } else {
          globalDbCache = supabaseData;
          saveLocalDb(supabaseData);
          console.log("Database successfully synchronized from Supabase.");
        }
      }
    } catch (err) {
      console.error("Error connecting to Supabase database, falling back to local file:", err);
      globalDbCache = localData;
    }
  } else {
    globalDbCache = localData;
  }
}

async function readLocalDb() {
  try {
    const data = await sqliteStorage.readFullDb();
    if (data && data.branches && data.branches.length > 0) {
      return data;
    }
    // Fallback to reading db.json if SQLite is empty
    if (fs.existsSync(dbPath)) {
      const jsonData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      await sqliteStorage.writeFullDb(jsonData); // migrate it
      return jsonData;
    }
    await sqliteStorage.writeFullDb(defaultDb);
    return defaultDb;
  } catch (err) {
    console.error("Error reading database, returning defaults:", err);
    return defaultDb;
  }
}

async function saveLocalDb(data) {
  try {
    await sqliteStorage.writeFullDb(data);
    // Also save to json for backward compatibility during transition if needed
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving database to SQLite:", err);
  }
}

async function readDb() {
  if (!globalDbCache) {
    globalDbCache = await readLocalDb();
  }
  return globalDbCache;
}

async function saveDb(data) {
  data.lastUpdated = Date.now();
  globalDbCache = data;
  await saveLocalDb(data);
  if (supabase) {
    try {
      const { error } = await supabase
        .from('ammas_db')
        .update({ data })
        .eq('id', 1);
      if (error) console.error("Error syncing database update to Supabase:", error);
    } catch (err) {
      console.error("Unhandled network error while syncing to Supabase:", err);
    }
  }
}

async function getBranches() {
  if (isAWS) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { id: 'branches' }
      }));
      if (result.Item && result.Item.data !== undefined) {
        return result.Item.data;
      }
      const defaultBranches = defaultDb.branches;
      await docClient.send(new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: { id: 'branches', data: defaultBranches, lastUpdated: Date.now() }
      }));
      return defaultBranches;
    } catch (err) {
      console.error("Error reading branches from DynamoDB:", err);
      return defaultDb.branches;
    }
  } else {
    const db = await readDb();
    return db.branches || [];
  }
}

async function saveBranches(branches) {
  if (isAWS) {
    try {
      await docClient.send(new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: { id: 'branches', data: branches, lastUpdated: Date.now() }
      }));
    } catch (err) {
      console.error("Error saving branches to DynamoDB:", err);
    }
  } else {
    const db = await readDb();
    db.branches = branches;
    await saveDb(db);
  }
}

async function getGlobalMedia() {
  let data;
  if (isAWS) {
    try {
      const result = await docClient.send(new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { id: 'globalMedia' }
      }));
      if (result.Item && result.Item.data !== undefined) {
        data = result.Item.data;
      } else {
        const defaultGlobal = defaultDb.globalMedia;
        await docClient.send(new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: { id: 'globalMedia', data: defaultGlobal, lastUpdated: Date.now() }
        }));
        data = defaultGlobal;
      }
    } catch (err) {
      console.error("Error reading globalMedia from DynamoDB:", err);
      data = defaultDb.globalMedia;
    }
  } else {
    const db = await readDb();
    data = db.globalMedia || [];
  }

  // Intercept globalMedia to inject default Logo if not present
  if (!Array.isArray(data)) data = [];
  const logoExists = data.some(m => m.id === 'logo');
  if (!logoExists) {
    data.unshift({
      id: 'logo',
      name: 'Store Logo',
      url: 'images/Ammas%20logo.svg',
      type: 'logo',
      active: true
    });
  }

  return data;
}

async function saveGlobalMedia(globalMedia) {
  if (isAWS) {
    await docClient.send(new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: { id: 'globalMedia', data: globalMedia, lastUpdated: Date.now() }
    }));
  } else {
    const db = await readDb();
    db.globalMedia = globalMedia;
    await saveDb(db);
  }
}

async function getBranchData(branchId, category, defaults = []) {
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  let data;
  if (isAWS) {
    try {
      const key = `${category}#${normalizedId}`;
      const result = await docClient.send(new GetCommand({
        TableName: DYNAMODB_TABLE,
        Key: { id: key }
      }));
      if (result.Item && result.Item.data !== undefined) {
        data = result.Item.data;
      } else {
        await docClient.send(new PutCommand({
          TableName: DYNAMODB_TABLE,
          Item: { id: key, data: defaults, lastUpdated: Date.now() }
        }));
        data = defaults;
      }
    } catch (err) {
      console.error(`Error reading ${category} for ${branchId} from DynamoDB:`, err);
      data = defaults;
    }
  } else {
    const db = await readDb();
    if (!db[category]) db[category] = {};
    if (!db[category][normalizedId]) {
      db[category][normalizedId] = JSON.parse(JSON.stringify(defaults));
      await saveDb(db);
    }
    data = db[category][normalizedId];
  }

  // Intercept branchMedia to inject default Logo if not present
  if (category === 'branchMedia') {
    if (!Array.isArray(data)) data = [];
    const logoExists = data.some(m => m.id === 'logo');
    if (!logoExists) {
      // Use global logo setting as the default fallback
      const globalMedia = await getGlobalMedia();
      const globalLogo = globalMedia.find(m => m.id === 'logo');
      const defaultActive = globalLogo ? globalLogo.active : true;

      data.unshift({
        id: 'logo',
        name: 'Store Logo',
        url: 'images/Ammas%20logo.svg',
        type: 'logo',
        active: defaultActive
      });
    }
  }

  // Intercept branchAnnouncements to inject default Banner Settings if not present
  if (category === 'branchAnnouncements') {
    if (!Array.isArray(data)) data = [];
    const bannerExists = data.some(a => a.id === 'banner-settings');
    if (!bannerExists) {
      data.unshift({
        id: 'banner-settings',
        text: 'Banner Settings',
        active: true
      });
    }
  }

  return data;
}

async function saveBranchData(branchId, category, data) {
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  if (isAWS) {
    const key = `${category}#${normalizedId}`;
    await docClient.send(new PutCommand({
      TableName: DYNAMODB_TABLE,
      Item: { id: key, data: data, lastUpdated: Date.now() }
    }));
  } else {
    const db = await readDb();
    if (!db[category]) db[category] = {};
    db[category][normalizedId] = data;
    await saveDb(db);
  }
}

async function getSyncedBranchAnnouncements(branchId) {
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  if (normalizedId === 'global') {
    return await getBranchData('global', 'branchAnnouncements', []);
  }

  const globalAnns = await getBranchData('global', 'branchAnnouncements', []);
  const branchAnns = await getBranchData(normalizedId, 'branchAnnouncements', []);

  const globalBannerSettings = globalAnns.find(a => a.id === 'banner-settings');
  const branchBannerSettings = branchAnns.find(a => a.id === 'banner-settings');

  const globalItems = globalAnns.filter(a => a.id !== 'banner-settings');
  const branchItems = branchAnns.filter(a => a.id !== 'banner-settings');

  let updated = false;
  const syncedItems = [];

  for (const gItem of globalItems) {
    const existingBranchItem = branchItems.find(b => b.id === gItem.id);
    if (existingBranchItem) {
      if (existingBranchItem.text !== gItem.text) {
        existingBranchItem.text = gItem.text;
        updated = true;
      }
      syncedItems.push(existingBranchItem);
    } else {
      syncedItems.push({
        id: gItem.id,
        text: gItem.text,
        active: gItem.active !== false
      });
      updated = true;
    }
  }

  // check for items deleted globally but still in branch
  const globalIds = new Set(globalItems.map(g => g.id));
  const hasDeletions = branchItems.some(b => !globalIds.has(b.id));
  if (hasDeletions) {
    updated = true;
  }

  const finalBannerSettings = branchBannerSettings || (globalBannerSettings ? { ...globalBannerSettings } : { id: 'banner-settings', text: 'Banner Settings', active: true });

  const finalBranchAnns = [
    finalBannerSettings,
    ...syncedItems
  ];

  if (updated || !branchBannerSettings) {
    await saveBranchData(normalizedId, 'branchAnnouncements', finalBranchAnns);
  }

  return finalBranchAnns;
}

async function uploadToS3(file) {
  if (!s3Client) return 'uploads/' + file.filename;
  try {
    const fileBuffer = fs.readFileSync(file.path);
    const s3Key = `uploads/${Date.now()}-${file.filename}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: file.mimetype,
      ACL: 'public-read'
    }));

    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error("Could not delete local temp upload:", e);
    }

    return `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`;
  } catch (err) {
    console.error("Error uploading file to S3 Storage:", err);
    return 'uploads/' + file.filename;
  }
}

async function uploadToSupabase(file) {
  if (!supabase) return 'uploads/' + file.filename;
  try {
    const fileBuffer = fs.readFileSync(file.path);
    const { data, error } = await supabase.storage
      .from('ammas-media')
      .upload(file.filename, fileBuffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error("Supabase Storage upload error:", error);
      return 'uploads/' + file.filename;
    }

    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error("Could not delete local temp upload:", e);
    }

    const { data: publicUrlData } = supabase.storage
      .from('ammas-media')
      .getPublicUrl(file.filename);
      
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Error uploading file to Supabase Storage:", err);
    return 'uploads/' + file.filename;
  }
}

async function uploadMedia(file) {
  if (isAWS) {
    return await uploadToS3(file);
  } else {
    return await uploadToSupabase(file);
  }
}

// Multer Storage Configuration for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

let sqliteStorage;
if (!isAWS) {
  sqliteStorage = require('./sqliteStorage');
}

// --- AWS MIDDLEWARE ---
if (isAWS) {
  app.use(async (req, res, next) => {
    next();
  });
}

// --- AUTHENTICATION MIDDLEWARE ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ammas123';

// Only admin-facing endpoints require auth
const adminOnly = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== ADMIN_PASSWORD) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// --- DYNAMIC MANIFEST ROUTE ---
// Must be declared BEFORE static middleware to take priority over manifest.json file
app.get('/manifest.json', (req, res) => {
  const branch = req.query.branch;
  const startUrlOverride = req.query.start_url;

  if (branch) {
    const slug = branch.toLowerCase().trim().replace(/\s+/g, '-');
    const start_url = startUrlOverride ? decodeURIComponent(startUrlOverride) : `/index.html?branch=${encodeURIComponent(branch)}`;
    const manifest = {
      id: `/app/${slug}`,
      name: "Ammas Pastries",
      short_name: "Ammas Pastries",
      description: 'TV Display for ' + branch,
      start_url: start_url,
      display: 'fullscreen',
      background_color: '#ffffff',
      theme_color: '#F36E21',
      icons: [
        { src: '/images/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: '/images/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
      ]
    };
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Cache-Control', 'no-cache');
    return res.json(manifest);
  }
  // Default manifest
  const start_url = startUrlOverride ? decodeURIComponent(startUrlOverride) : '/index.html';
  const defaultManifest = {
    id: `/app/default`,
    name: "Ammas Pastries",
    short_name: "Ammas Pastries",
    description: "Store Display Sign & Admin Portal for Amma's Pastries",
    start_url: start_url,
    display: 'fullscreen',
    background_color: '#ffffff',
    theme_color: '#F36E21',
    icons: [
      { src: '/images/logo.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/images/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/images/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
    ]
  };
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(defaultManifest);
});

// --- BRANCH WAFFLES ROUTES (NO ADMIN AUTH) ---
app.get('/api/branches/:branchId/waffles/config', async (req, res) => {
  const branch = req.params.branchId || '';
  const config = await getWaffleConfig(branch);
  res.json(config);
});

app.post('/api/branches/:branchId/waffles/config', async (req, res) => {
  const { orientation } = req.body;
  const branch = req.params.branchId || '';
  if (!orientation) return res.status(400).json({ error: "Orientation is required" });
  await saveWaffleConfig({ orientation }, branch);
  res.json({ success: true });
});

app.get('/api/branches/:branchId/waffles', async (req, res) => {
  const branch = req.params.branchId || '';
  const waffles = await getWaffles(branch);
  res.json(waffles);
});

app.post('/api/branches/:branchId/waffles', async (req, res) => {
  const { name, description, price, category, isVeg } = req.body;
  const branch = req.params.branchId || '';
  if (!name || !price) return res.status(400).json({ error: "Name and price required" });
  
  const waffles = await getWaffles(branch);
  const newWaffle = { id: 'w-' + Date.now(), name, description: description || '', price, category: category || 'Uncategorized', isVeg: isVeg !== undefined ? isVeg : true };
  waffles.push(newWaffle);
  await saveWaffles(waffles, branch);
  res.status(201).json({ success: true, waffle: newWaffle });
});

app.put('/api/branches/:branchId/waffles/:id', async (req, res) => {
  const { id } = req.params;
  const branch = req.params.branchId || '';
  const { name, description, price, category, isVeg } = req.body;
  const waffles = await getWaffles(branch);
  
  const idx = waffles.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: "Waffle not found" });
  
  waffles[idx] = { ...waffles[idx], name, description: description || '', price, category: category || 'Uncategorized', isVeg: isVeg !== undefined ? isVeg : true };
  await saveWaffles(waffles, branch);
  res.json({ success: true, waffle: waffles[idx] });
});

app.delete('/api/branches/:branchId/waffles/:id', async (req, res) => {
  const { id } = req.params;
  const branch = req.params.branchId || '';
  let waffles = await getWaffles(branch);
  const initLen = waffles.length;
  waffles = waffles.filter(w => w.id !== id);
  
  if (waffles.length === initLen) return res.status(404).json({ error: "Waffle not found" });
  
  await saveWaffles(waffles, branch);
  res.json({ success: true, message: "Waffle deleted" });
});

// --- ORDERS ROUTES ---

// Auth Verification (admin only)
app.get('/api/auth/verify', adminOnly, (_req, res) => {
  res.json({ success: true, role: 'admin' });
});

// Local mock file upload handler for binary streams
app.put('/api/upload/local', (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });

  const safeKey = path.basename(key);
  const filePath = path.join(uploadsDir, safeKey);
  const writeStream = fs.createWriteStream(filePath);

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    res.json({ success: true });
  });

  writeStream.on('error', (err) => {
    console.error("Local upload write stream error:", err);
    res.status(500).json({ error: 'Upload failed' });
  });
});

// Presigned URL for direct browser→S3 upload (bypasses Lambda payload limit)
app.get('/api/upload/presign', async (req, res) => {
  const { filename, contentType } = req.query;
  if (!filename || !contentType) return res.status(400).json({ error: 'filename and contentType required' });

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const localKey = `${Date.now()}-${safeFilename}`;

  if (!s3Client) {
    // Generate a local mock presigned upload URL pointing to our local express server
    const uploadUrl = `${req.protocol}://${req.get('host')}/api/upload/local?key=${localKey}`;
    const fileUrl = `uploads/${localKey}`;
    return res.json({ uploadUrl, fileUrl });
  }

  const key = `uploads/${localKey}`;
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ACL: 'public-read'
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  const fileUrl = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
  res.json({ uploadUrl, fileUrl });
});

// 1. Branches List & Add
app.get('/api/branches', async (req, res) => {
  const branches = await getBranches();
  const now = Date.now();
  const branchesWithStatus = branches.map(b => ({
    ...b,
    online: b.lastHeartbeat ? (now - b.lastHeartbeat) < 15000 : false
  }));
  res.json(branchesWithStatus);
});

app.get('/api/branches/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const branches = await getBranches();
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  const branch = branches.find(b => b.id === normalizedId || b.name.toLowerCase() === branchId.toLowerCase());
  if (!branch) return res.status(404).json({ error: "Branch not found" });
  res.json(branch);
});

app.post('/api/branches', adminOnly, async (req, res) => {
  const { name, state } = req.body;
  if (!name) return res.status(400).json({ error: "Branch name is required" });

  const branches = await getBranches();
  const id = name.toLowerCase().trim().replace(/\s+/g, '-');

  if (branches.some(b => b.id === id)) {
    return res.status(400).json({ error: "Branch already exists" });
  }

  const newBranch = {
    id,
    name: name.trim(),
    state: state || 'Karnataka',
    lastHeartbeat: 0,
    tokensEnabled: true
  };

  branches.push(newBranch);
  await saveBranches(branches);
  res.status(201).json(newBranch);
});

// Delete a branch (admin only)
app.delete('/api/branches/:branchId', adminOnly, async (req, res) => {
  const { branchId } = req.params;
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');

  const branches = await getBranches();
  const initialLen = branches.length;
  const filteredBranches = branches.filter(b => b.id !== normalizedId);

  if (filteredBranches.length === initialLen) {
    return res.status(404).json({ error: "Branch not found" });
  }

  try {
    await saveBranches(filteredBranches);

    // Clean up branch specific data in local db mode
    if (!isAWS) {
      const db = await readDb();
      if (db.branchMedia && db.branchMedia[normalizedId]) {
        delete db.branchMedia[normalizedId];
      }
      if (db.branchAnnouncements && db.branchAnnouncements[normalizedId]) {
        delete db.branchAnnouncements[normalizedId];
      }
      if (db.branchOrders && db.branchOrders[normalizedId]) {
        delete db.branchOrders[normalizedId];
      }
      await saveDb(db);
    }

    res.json({ success: true, message: "Branch deleted successfully" });
  } catch (err) {
    console.error("Failed to delete branch:", err);
    res.status(500).json({ error: "Failed to delete branch: " + err.message });
  }
});

// Toggle tokens enabled/disabled for a branch
app.put('/api/branches/:branchId/tokens', async (req, res) => {
  const { branchId } = req.params;
  const { tokensEnabled } = req.body;
  const branches = await getBranches();
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  const branch = branches.find(b => b.id === normalizedId || b.name.toLowerCase() === branchId.toLowerCase());
  if (!branch) return res.status(404).json({ error: "Branch not found" });
  branch.tokensEnabled = tokensEnabled !== undefined ? tokensEnabled : !branch.tokensEnabled;
  await saveBranches(branches);
  res.json({ success: true, tokensEnabled: branch.tokensEnabled });
});

// 2. Heartbeat Ping
app.post('/api/branches/:branchId/heartbeat', async (req, res) => {
  const { branchId } = req.params;
  const branches = await getBranches();
  const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
  
  const branch = branches.find(b => b.id === normalizedId || b.name.toLowerCase() === branchId.toLowerCase());
  if (branch) {
    branch.lastHeartbeat = Date.now();
    await saveBranches(branches);
    res.json({ success: true, status: "online", branchId: branch.id });
  } else {
    // If heartbeat received for auto-generated display, register it as a branch
    const newBranch = {
      id: normalizedId,
      name: branchId,
      state: 'Karnataka',
      lastHeartbeat: Date.now()
    };
    branches.push(newBranch);
    await saveBranches(branches);
    res.json({ success: true, status: "online", registered: true, branchId: normalizedId });
  }
});

// 3. Media Management API (Specific Branch)
app.get('/api/branches/:branchId/media', async (req, res) => {
  const { branchId } = req.params;
  const branchMedia = await getBranchData(branchId, 'branchMedia', []);
  const globalMedia = await getGlobalMedia();

  const globalItems = globalMedia.filter(m => m.id !== 'logo');
  // Build URL → global item lookup for fast access
  const globalByUrl = new Map(globalItems.map(g => [g.url, g]));
  let updated = false;

  // 1. Sync additions: Add any global items not yet in branchMedia
  globalItems.forEach(gItem => {
    const exists = branchMedia.some(bItem => bItem.url === gItem.url);
    if (!exists) {
      branchMedia.push({
        id: 'm-sync-' + gItem.id.replace('g-', '') + '-' + Math.round(Math.random() * 1000),
        name: gItem.name,
        type: gItem.type,
        url: gItem.url,
        ...(gItem.thumbnail ? { thumbnail: gItem.thumbnail } : {}),
        active: gItem.active !== false   // inherit global active state
      });
      updated = true;
    }
  });

  // 2. Sync active state: skipped to preserve branch-specific checkbox states

  // 3. Sync deletions: Remove items whose global source no longer exists
  const initialCount = branchMedia.length;
  const filteredBranchMedia = branchMedia.filter(bItem => {
    if (bItem.id === 'logo') return true;
    return globalByUrl.has(bItem.url);
  });

  if (filteredBranchMedia.length !== initialCount) {
    branchMedia.length = 0;
    branchMedia.push(...filteredBranchMedia);
    updated = true;
  }

  // 4. Persist changes if any sync operations occurred
  if (updated) {
    try {
      await saveBranchData(branchId, 'branchMedia', branchMedia);
    } catch (err) {
      console.error(`Failed to auto-sync global media to branch ${branchId}:`, err);
    }
  }

  res.json(branchMedia);
});

// Consolidated Display Data API to reduce network roundtrips (makes client load much faster)
app.get('/api/branches/:branchId/display-data', async (req, res) => {
  const { branchId } = req.params;
  try {
    const [media, orders, announcements, branchInfo] = await Promise.all([
      // Fetch and sync media
      (async () => {
        const branchMedia = await getBranchData(branchId, 'branchMedia', []);
        const globalMedia = await getGlobalMedia();
        const globalItems = globalMedia.filter(m => m.id !== 'logo');
        const globalByUrl = new Map(globalItems.map(g => [g.url, g]));
        let updated = false;

        // additions
        globalItems.forEach(gItem => {
          const exists = branchMedia.some(bItem => bItem.url === gItem.url);
          if (!exists) {
            branchMedia.push({
              id: 'm-sync-' + gItem.id.replace('g-', '') + '-' + Math.round(Math.random() * 1000),
              name: gItem.name,
              type: gItem.type,
              url: gItem.url,
              ...(gItem.thumbnail ? { thumbnail: gItem.thumbnail } : {}),
              active: gItem.active !== false
            });
            updated = true;
          }
        });

        // active status: skipped to preserve branch-specific checkbox states

        // deletions
        const filteredBranchMedia = branchMedia.filter(bItem => {
          if (bItem.id === 'logo') return true;
          return globalByUrl.has(bItem.url);
        });

        if (filteredBranchMedia.length !== branchMedia.length) {
          branchMedia.length = 0;
          branchMedia.push(...filteredBranchMedia);
          updated = true;
        }

        if (updated) {
          await saveBranchData(branchId, 'branchMedia', branchMedia);
        }
        return branchMedia;
      })(),
      getBranchData(branchId, 'branchOrders', []),
      getSyncedBranchAnnouncements(branchId),
      (async () => {
        const branches = await getBranches();
        const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
        return branches.find(b => b.id === normalizedId) || null;
      })()
    ]);

    res.json({ media, orders, announcements, branchInfo });
  } catch (err) {
    console.error("Failed to compile display data:", err);
    res.status(500).json({ error: "Failed to compile display data: " + err.message });
  }
});

// Upload media to branch — accepts multipart (image) or JSON (video pre-uploaded via presigned URL)
app.post('/api/branches/:branchId/media', upload.fields([
  { name: 'file', maxCount: 1 }
]), async (req, res) => {
  const { branchId } = req.params;
  const { title, type, url: bodyUrl, thumbnail: bodyThumb } = req.body;

  let url = bodyUrl || '';
  let thumbUrl = bodyThumb || '';

  if (!url && req.files && req.files['file'] && req.files['file'][0]) {
    url = await uploadMedia(req.files['file'][0]);
  }

  if (!url) return res.status(400).json({ error: "No media file or URL provided" });

  const mediaList = await getBranchData(branchId, 'branchMedia', []);
  const newMediaItem = {
    id: 'm-' + Date.now(),
    name: title || 'Untitled Upload',
    type: type || 'image',
    url,
    ...(thumbUrl ? { thumbnail: thumbUrl } : {}),
    active: true
  };

  try {
    mediaList.push(newMediaItem);
    await saveBranchData(branchId, 'branchMedia', mediaList);
    res.status(201).json(newMediaItem);
  } catch (err) {
    console.error('Failed to save media to DynamoDB:', err);
    res.status(500).json({ error: 'Failed to save media: ' + err.message });
  }
});

// Update media list order (drag and drop)
app.put('/api/branches/:branchId/media/order', async (req, res) => {
  const { branchId } = req.params;
  const { order } = req.body;
  if (!order || !Array.isArray(order)) {
    return res.status(400).json({ error: "Invalid order array" });
  }

  const mediaList = await getBranchData(branchId, 'branchMedia', []);
  const idMap = new Map(mediaList.map(item => [item.id, item]));
  const reorderedList = [];
  
  order.forEach(id => {
    const item = idMap.get(id);
    if (item) {
      reorderedList.push(item);
      idMap.delete(id);
    }
  });

  for (const item of idMap.values()) {
    reorderedList.push(item);
  }

  await saveBranchData(branchId, 'branchMedia', reorderedList);
  res.json({ success: true, media: reorderedList });
});

// Toggle media item active checkbox status
app.put('/api/branches/:branchId/media/:mediaId/toggle', async (req, res) => {
  const { branchId, mediaId } = req.params;
  const { active } = req.body;

  const mediaList = await getBranchData(branchId, 'branchMedia', []);
  const mediaItem = mediaList.find(m => m.id === mediaId);
  if (!mediaItem) return res.status(404).json({ error: "Media item not found" });

  mediaItem.active = active !== undefined ? active : !mediaItem.active;
  await saveBranchData(branchId, 'branchMedia', mediaList);
  res.json(mediaItem);
});

// Delete media item
app.delete('/api/branches/:branchId/media/:mediaId', async (req, res) => {
  const { branchId, mediaId } = req.params;
  let mediaList = await getBranchData(branchId, 'branchMedia', []);
  const initialLen = mediaList.length;
  mediaList = mediaList.filter(m => m.id !== mediaId);
  
  if (mediaList.length === initialLen) {
    return res.status(404).json({ error: "Media item not found" });
  }

  await saveBranchData(branchId, 'branchMedia', mediaList);
  res.json({ success: true, message: "Media deleted successfully" });
});

// 4. Global Media Endpoints
app.get('/api/global/media', async (req, res) => {
  const globalMedia = await getGlobalMedia();
  res.json(globalMedia);
});

app.post('/api/global/media', adminOnly, upload.fields([
  { name: 'file', maxCount: 1 }
]), async (req, res) => {
  const { title, type, url: bodyUrl, thumbnail: bodyThumb } = req.body;
  let url = bodyUrl || '';
  let thumbUrl = bodyThumb || '';

  if (!url && req.files && req.files['file'] && req.files['file'][0]) {
    url = await uploadMedia(req.files['file'][0]);
  }

  if (!url) return res.status(400).json({ error: "No media file or URL provided" });

  const globalMedia = await getGlobalMedia();
  const newGlobalMedia = {
    id: 'g-' + Date.now(),
    name: title || 'Global Upload',
    type: type || (req.files['file'] ? 'image' : 'video'),
    url: url,
    ...(thumbUrl ? { thumbnail: thumbUrl } : {}),
    active: true
  };

  try {
    globalMedia.push(newGlobalMedia);
    await saveGlobalMedia(globalMedia);

    // Auto-sync new global media to all branches with same active state as global
    const branches = await getBranches();
    await Promise.all(branches.map(async (branch) => {
      const branchMedia = await getBranchData(branch.id, 'branchMedia', []);
      if (!branchMedia.some(m => m.url === newGlobalMedia.url)) {
        branchMedia.push({
          ...newGlobalMedia,
          id: 'm-sync-' + Date.now() + '-' + Math.round(Math.random() * 1000),
          active: newGlobalMedia.active !== false  // inherit global active state
        });
        await saveBranchData(branch.id, 'branchMedia', branchMedia);
      }
    }));

    res.status(201).json(newGlobalMedia);
  } catch (err) {
    console.error('Failed to save global media to DynamoDB:', err);
    res.status(500).json({ error: 'Failed to save media: ' + err.message });
  }
});

app.delete('/api/global/media/:mediaId', adminOnly, async (req, res) => {
  const { mediaId } = req.params;
  let globalMedia = await getGlobalMedia();
  const initialLen = globalMedia.length;
  globalMedia = globalMedia.filter(m => m.id !== mediaId);
  
  if (globalMedia.length === initialLen) {
    return res.status(404).json({ error: "Global media item not found" });
  }
  await saveGlobalMedia(globalMedia);
  res.json({ success: true });
});

app.put('/api/global/media/:mediaId/toggle', adminOnly, async (req, res) => {
  const { mediaId } = req.params;
  const { active } = req.body;

  const globalMedia = await getGlobalMedia();
  const mediaItem = globalMedia.find(m => m.id === mediaId);
  if (!mediaItem) return res.status(404).json({ error: "Global media item not found" });

  mediaItem.active = active !== undefined ? active : !mediaItem.active;
  await saveGlobalMedia(globalMedia);
  res.json(mediaItem);
});

app.put('/api/global/media/order', adminOnly, async (req, res) => {
  const { order } = req.body;
  if (!order || !Array.isArray(order)) {
    return res.status(400).json({ error: "Invalid order array" });
  }

  const globalMedia = await getGlobalMedia();
  const idMap = new Map(globalMedia.map(item => [item.id, item]));
  const reorderedList = [];
  
  order.forEach(id => {
    const item = idMap.get(id);
    if (item) {
      reorderedList.push(item);
      idMap.delete(id);
    }
  });

  for (const item of idMap.values()) {
    reorderedList.push(item);
  }

  await saveGlobalMedia(reorderedList);
  res.json({ success: true, media: reorderedList });
});

// 5. Clone Media to Target Branches (admin only)
app.post('/api/global/clone', adminOnly, async (req, res) => {
  const { mediaIds, targetBranches } = req.body;
  if (!mediaIds || !Array.isArray(mediaIds) || !targetBranches || !Array.isArray(targetBranches)) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  const sourceItems = [];
  const globalMedia = await getGlobalMedia();
  const branches = await getBranches();
  
  for (const id of mediaIds) {
    let item = globalMedia.find(m => m.id === id);
    if (!item) {
      for (const branch of branches) {
        const branchMedia = await getBranchData(branch.id, 'branchMedia', []);
        const found = branchMedia.find(m => m.id === id);
        if (found) {
          item = found;
          break;
        }
      }
    }
    if (item) {
      sourceItems.push(item);
    }
  }

  if (sourceItems.length === 0) {
    return res.status(404).json({ error: "No source media found to clone" });
  }

  const clonePromises = targetBranches.map(async (branchId) => {
    const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
    const branchMediaList = await getBranchData(normalizedId, 'branchMedia', []);
    
    sourceItems.forEach(item => {
      if (!branchMediaList.some(m => m.url === item.url)) {
        branchMediaList.push({
          ...item,
          id: 'm-clone-' + Date.now() + '-' + Math.round(Math.random() * 1000),
          active: true
        });
      }
    });
    await saveBranchData(normalizedId, 'branchMedia', branchMediaList);
  });

  await Promise.all(clonePromises);
  res.json({ success: true, message: `Cloned ${sourceItems.length} items to ${targetBranches.length} branches.` });
});

// Clone Announcements API
app.post('/api/global/clone-announcements', adminOnly, async (req, res) => {
  const { announcementIds, targetBranches } = req.body;
  if (!announcementIds || !Array.isArray(announcementIds) || !targetBranches || !Array.isArray(targetBranches)) {
    return res.status(400).json({ error: "Invalid request payload" });
  }

  // Fetch source announcements from global or any branch
  const sourceItems = [];
  const globalAnns = await getBranchData('global', 'branchAnnouncements', []);
  const branches = await getBranches();

  for (const id of announcementIds) {
    let item = globalAnns.find(a => a.id === id);
    if (!item) {
      for (const branch of branches) {
        const branchAnns = await getBranchData(branch.id, 'branchAnnouncements', []);
        const found = branchAnns.find(a => a.id === id);
        if (found) {
          item = found;
          break;
        }
      }
    }
    if (item && item.id !== 'banner-settings') {
      sourceItems.push(item);
    }
  }

  if (sourceItems.length === 0) {
    return res.status(404).json({ error: "No announcements found to clone" });
  }

  const clonePromises = targetBranches.map(async (branchId) => {
    const normalizedId = branchId.toLowerCase().trim().replace(/\s+/g, '-');
    const branchAnns = await getBranchData(normalizedId, 'branchAnnouncements', []);

    sourceItems.forEach(item => {
      // Deduplicate by text to avoid adding the same announcement twice
      if (!branchAnns.some(a => a.text === item.text)) {
        branchAnns.push({
          id: 'a-clone-' + Date.now() + '-' + Math.round(Math.random() * 1000),
          text: item.text,
          active: item.active !== undefined ? item.active : true
        });
      }
    });

    await saveBranchData(normalizedId, 'branchAnnouncements', branchAnns);
  });

  await Promise.all(clonePromises);
  res.json({ success: true, message: `Cloned ${sourceItems.length} announcement(s) to ${targetBranches.length} branch(es).` });
});

// 6. Announcements API
app.get('/api/branches/:branchId/announcements', async (req, res) => {
  const { branchId } = req.params;
  try {
    const result = await getSyncedBranchAnnouncements(branchId);
    res.json(result);
  } catch (err) {
    console.error("Error fetching announcements:", err);
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
});

app.post('/api/branches/:branchId/announcements', async (req, res) => {
  const { branchId } = req.params;
  const { text } = req.body;
  if (!text || text.trim() === '') {
    return res.status(400).json({ error: "Announcement text is required" });
  }

  const announcements = await getSyncedBranchAnnouncements(branchId);
  const newItem = {
    id: 'a-' + Date.now(),
    text: text.trim(),
    active: true
  };
  announcements.push(newItem);
  await saveBranchData(branchId, 'branchAnnouncements', announcements);
  res.status(201).json(newItem);
});

app.put('/api/branches/:branchId/announcements/:id/toggle', async (req, res) => {
  const { branchId, id } = req.params;
  const { active } = req.body;

  const announcements = await getSyncedBranchAnnouncements(branchId);
  const item = announcements.find(a => a.id === id);
  if (!item) return res.status(404).json({ error: "Announcement not found" });

  item.active = active !== undefined ? active : !item.active;
  await saveBranchData(branchId, 'branchAnnouncements', announcements);
  res.json(item);
});

app.delete('/api/branches/:branchId/announcements/:id', async (req, res) => {
  const { branchId, id } = req.params;
  let announcements = await getSyncedBranchAnnouncements(branchId);
  const initialLen = announcements.length;
  announcements = announcements.filter(a => a.id !== id);
  
  if (announcements.length === initialLen) {
    return res.status(404).json({ error: "Announcement not found" });
  }

  await saveBranchData(branchId, 'branchAnnouncements', announcements);
  res.json({ success: true });
});

// --- WAFFLES ROUTES ---
app.get('/api/waffles/config', async (req, res) => {
  const branch = req.query.branch || '';
  const config = await getWaffleConfig(branch);
  res.json(config);
});

app.post('/api/waffles/config', adminOnly, async (req, res) => {
  const { orientation } = req.body;
  const branch = req.query.branch || '';
  if (!orientation) return res.status(400).json({ error: "Orientation is required" });
  await saveWaffleConfig({ orientation }, branch);
  res.json({ success: true });
});

app.get('/api/waffles', async (req, res) => {
  const branch = req.query.branch || '';
  const waffles = await getWaffles(branch);
  res.json(waffles);
});

app.post('/api/waffles', adminOnly, async (req, res) => {
  const { name, description, price, category, isVeg } = req.body;
  const branch = req.query.branch || '';
  if (!name || !price) return res.status(400).json({ error: "Name and price required" });
  
  const waffles = await getWaffles(branch);
  const newWaffle = { id: 'w-' + Date.now(), name, description: description || '', price, category: category || 'Uncategorized', isVeg: isVeg !== undefined ? isVeg : true };
  waffles.push(newWaffle);
  await saveWaffles(waffles, branch);
  res.status(201).json({ success: true, waffle: newWaffle });
});

app.put('/api/waffles/:id', adminOnly, async (req, res) => {
  const { id } = req.params;
  const branch = req.query.branch || '';
  const { name, description, price, category, isVeg } = req.body;
  const waffles = await getWaffles(branch);
  
  const idx = waffles.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: "Waffle not found" });
  
  waffles[idx] = { ...waffles[idx], name, description: description || '', price, category: category || 'Uncategorized', isVeg: isVeg !== undefined ? isVeg : true };
  await saveWaffles(waffles, branch);
  res.json({ success: true, waffle: waffles[idx] });
});

app.delete('/api/waffles/:id', adminOnly, async (req, res) => {
  const { id } = req.params;
  const branch = req.query.branch || '';
  let waffles = await getWaffles(branch);
  const initLen = waffles.length;
  waffles = waffles.filter(w => w.id !== id);
  
  if (waffles.length === initLen) return res.status(404).json({ error: "Waffle not found" });
  
  await saveWaffles(waffles, branch);
  res.json({ success: true, message: "Waffle deleted" });
});

// --- ORDERS API ---
app.get('/api/branches/:branchId/orders', async (req, res) => {
  const { branchId } = req.params;
  const orders = await getBranchData(branchId, 'branchOrders', []);
  
  const now = Date.now();
  const threeMinutesLimit = 3 * 60 * 1000; // 3 minutes in milliseconds
  
  const initialLength = orders.length;
  const activeOrders = orders.filter(o => {
    const timestampStr = o.id.startsWith('o-') ? o.id.substring(2) : null;
    const createdAt = o.createdAt || (timestampStr ? parseInt(timestampStr, 10) : null);
    if (!createdAt) return true;
    return (now - createdAt) < threeMinutesLimit;
  });

  if (activeOrders.length !== initialLength) {
    try {
      await saveBranchData(branchId, 'branchOrders', activeOrders);
    } catch (err) {
      console.error(`Failed to save auto-cleaned orders for branch ${branchId}:`, err);
    }
  }

  res.json(activeOrders);
});

app.post('/api/branches/:branchId/orders', async (req, res) => {
  const { branchId } = req.params;
  const { name, token } = req.body;
  if (!token) return res.status(400).json({ error: "Token/Order ID is required" });

  const orders = await getBranchData(branchId, 'branchOrders', []);
  if (orders.some(o => o.token === token)) {
    return res.status(400).json({ error: "Order ID already marked ready" });
  }

  const newOrder = {
    id: 'o-' + Date.now(),
    name: name ? name.trim() : 'Guest',
    token: token.trim(),
    createdAt: Date.now()
  };

  orders.push(newOrder);
  await saveBranchData(branchId, 'branchOrders', orders);
  res.status(201).json(newOrder);
});

app.delete('/api/branches/:branchId/orders/:orderId', async (req, res) => {
  const { branchId, orderId } = req.params;
  let orders = await getBranchData(branchId, 'branchOrders', []);
  const initialLen = orders.length;
  orders = orders.filter(o => o.id !== orderId && o.token !== orderId);
  
  if (orders.length === initialLen) {
    return res.status(404).json({ error: "Order not found" });
  }

  await saveBranchData(branchId, 'branchOrders', orders);
  res.json({ success: true, message: "Order marked picked up" });
});

// --- CLEAN URL ROUTING (local only, registered AFTER all /api/ routes) ---
if (!isAWSLambda) {
  // /ammas-pastries → index.html (home / branch selector)
  app.get('/ammas-pastries', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // /ammas-pastries/:branchSlug → index.html (display sign for a branch)
  app.get('/ammas-pastries/:branchSlug', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.get('/branch/menu', (req, res) => {
    res.sendFile(path.join(__dirname, 'branch', 'menu.html'));
  });

  app.get('/admin/waffles', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'waffles.html'));
  });

  // Named pages without .html
  const htmlPages = ['login', 'branch', 'details', 'announcements', 'orders', 'image', 'video', 'apk', 'header', 'index1', 'media', 'announcements-view'];
  htmlPages.forEach(page => {
    app.get(`/${page}`, (_req, res) => {
      res.sendFile(path.join(__dirname, `${page}.html`));
    });
  });

  // /admin/branch and /admin/branch.html → branch.html
  app.get(['/admin/branch', '/admin/branch.html'], (_req, res) => {
    res.sendFile(path.join(__dirname, 'branch.html'));
  });

  // /portal/:branchSlug → portal.html
  app.get('/portal/:branchSlug', (_req, res) => {
    res.sendFile(path.join(__dirname, 'portal.html'));
  });

  // /portal (no branch) → portal.html
  app.get('/portal', (_req, res) => {
    res.sendFile(path.join(__dirname, 'portal.html'));
  });

  // /media/:branchSlug → Redirect to /:branchSlug
  app.get('/media/:branchSlug', (req, res) => {
    const { branchSlug } = req.params;
    res.redirect(`/${branchSlug}`);
  });

  // /orders/:branchSlug → orders.html
  app.get('/orders/:branchSlug', (_req, res) => {
    res.sendFile(path.join(__dirname, 'orders.html'));
  });

  // /announcements/:branchSlug → announcements.html (with branch-specific view)
  app.get('/announcements/:branchSlug', (_req, res) => {
    res.sendFile(path.join(__dirname, 'announcements.html'));
  });

  // /admin/:branchSlug → details.html (staff dashboard for that branch)
  app.get('/admin/:branchSlug', (req, res, next) => {
    const { branchSlug } = req.params;
    if (branchSlug.includes('.') || branchSlug.startsWith('api') || branchSlug.startsWith('uploads')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'details.html'));
  });

  // /:branchSlug → media.html (TV display sign for that branch)
  app.get('/:branchSlug', (req, res, next) => {
    const { branchSlug } = req.params;
    if (branchSlug.includes('.') || branchSlug.startsWith('api') || branchSlug.startsWith('uploads') || branchSlug === 'admin') {
      return next();
    }
    res.sendFile(path.join(__dirname, 'media.html'));
  });
}


// Export app for testing (must not reassign module.exports before exports.handler is set)
module.exports.app = app;

// Start server
if (isAWSLambda) {
  const serverlessExpress = require('@codegenie/serverless-express');
  module.exports.handler = serverlessExpress({ app });
} else if (require.main === module) {
  initDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`Amma's Pastries Server is running on port ${PORT}`);
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  });
}
