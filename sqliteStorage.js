const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.TEST_DB_PATH ? process.env.TEST_DB_PATH.replace('.json', '.sqlite') : path.join(__dirname, 'data', 'database.sqlite');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new sqlite3.Database(dbPath);

function initSqlite() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Branches table
      db.run(`CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT
      )`);
      // Waffles table
      db.run(`CREATE TABLE IF NOT EXISTS waffles (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        name TEXT,
        description TEXT,
        price TEXT,
        category TEXT,
        isVeg INTEGER
      )`);
      // Waffle Config
      db.run(`CREATE TABLE IF NOT EXISTS waffle_config (
        branch_id TEXT PRIMARY KEY,
        orientation TEXT
      )`);
      // Global Media
      db.run(`CREATE TABLE IF NOT EXISTS global_media (
        id TEXT PRIMARY KEY,
        title TEXT,
        url TEXT,
        type TEXT
      )`);
      // Branch Media
      db.run(`CREATE TABLE IF NOT EXISTS branch_media (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        title TEXT,
        url TEXT,
        type TEXT
      )`);
      // Announcements
      db.run(`CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        text TEXT
      )`);
      // Orders
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        text TEXT
      )`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

let dbWritePromise = Promise.resolve();

async function writeFullDb(data) {
  const op = async () => {
    return new Promise((resolve, reject) => {
      db.serialize(async () => {
      try {
        await runQuery('BEGIN TRANSACTION');
        
        // Clear tables
        await runQuery('DELETE FROM branches');
        await runQuery('DELETE FROM waffles');
        await runQuery('DELETE FROM waffle_config');
        await runQuery('DELETE FROM global_media');
        await runQuery('DELETE FROM branch_media');
        await runQuery('DELETE FROM announcements');
        await runQuery('DELETE FROM orders');

        // Insert Branches
        if (data.branches) {
          for (const b of data.branches) {
            await runQuery('INSERT INTO branches (id, name) VALUES (?, ?)', [b.id, b.name]);
          }
        }

        // Insert Waffles (Global)
        if (data.waffles) {
          for (const w of data.waffles) {
            await runQuery('INSERT INTO waffles (id, branch_id, name, description, price, category, isVeg) VALUES (?, ?, ?, ?, ?, ?, ?)', 
              [w.id, 'global', w.name, w.description, w.price, w.category, w.isVeg ? 1 : 0]);
          }
        }
        // Insert Waffles (Branch)
        if (data.branchWaffles) {
          for (const [branchId, waffles] of Object.entries(data.branchWaffles)) {
            for (const w of waffles) {
              await runQuery('INSERT INTO waffles (id, branch_id, name, description, price, category, isVeg) VALUES (?, ?, ?, ?, ?, ?, ?)', 
                [w.id, branchId, w.name, w.description, w.price, w.category, w.isVeg ? 1 : 0]);
            }
          }
        }

        // Configs
        if (data.waffleConfig) {
          await runQuery('INSERT INTO waffle_config (branch_id, orientation) VALUES (?, ?)', ['global', data.waffleConfig.orientation]);
        }
        if (data.branchWaffleConfig) {
          for (const [branchId, config] of Object.entries(data.branchWaffleConfig)) {
            await runQuery('INSERT INTO waffle_config (branch_id, orientation) VALUES (?, ?)', [branchId, config.orientation]);
          }
        }

        // Global Media
        if (data.globalMedia) {
          for (const m of data.globalMedia) {
            await runQuery('INSERT INTO global_media (id, title, url, type) VALUES (?, ?, ?, ?)', [m.id, m.title, m.url, m.type]);
          }
        }
        
        // Branch Media
        if (data.branchMedia) {
          for (const [branchId, medias] of Object.entries(data.branchMedia)) {
            for (const m of medias) {
              await runQuery('INSERT INTO branch_media (id, branch_id, title, url, type) VALUES (?, ?, ?, ?, ?)', [m.id, branchId, m.title, m.url, m.type]);
            }
          }
        }

        // Announcements
        if (data.branchAnnouncements) {
          for (const [branchId, texts] of Object.entries(data.branchAnnouncements)) {
            for (let i = 0; i < texts.length; i++) {
              await runQuery('INSERT INTO announcements (id, branch_id, text) VALUES (?, ?, ?)', [`${branchId}-ann-${i}`, branchId, texts[i]]);
            }
          }
        }

        // Orders
        if (data.branchOrders) {
          for (const [branchId, texts] of Object.entries(data.branchOrders)) {
            for (let i = 0; i < texts.length; i++) {
              await runQuery('INSERT INTO orders (id, branch_id, text) VALUES (?, ?, ?)', [`${branchId}-ord-${i}`, branchId, texts[i]]);
            }
          }
        }

        await runQuery('COMMIT');
        resolve();
      } catch (e) {
        await runQuery('ROLLBACK');
        reject(e);
      }
    });
  });
  };
  
  dbWritePromise = dbWritePromise.then(op).catch(() => op());
  return dbWritePromise;
}

async function readFullDb() {
  const data = {
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

  const branches = await allQuery('SELECT * FROM branches');
  data.branches = branches.map(b => ({ id: b.id, name: b.name }));

  const waffles = await allQuery('SELECT * FROM waffles');
  for (const w of waffles) {
    const wObj = { id: w.id, name: w.name, description: w.description, price: w.price, category: w.category, isVeg: w.isVeg === 1 };
    if (w.branch_id === 'global') {
      data.waffles.push(wObj);
    } else {
      data.branchWaffles[w.branch_id] = data.branchWaffles[w.branch_id] || [];
      data.branchWaffles[w.branch_id].push(wObj);
    }
  }

  const configs = await allQuery('SELECT * FROM waffle_config');
  for (const c of configs) {
    if (c.branch_id === 'global') {
      data.waffleConfig = { orientation: c.orientation };
    } else {
      data.branchWaffleConfig[c.branch_id] = { orientation: c.orientation };
    }
  }

  const gMedia = await allQuery('SELECT * FROM global_media');
  data.globalMedia = gMedia.map(m => ({ id: m.id, title: m.title, url: m.url, type: m.type }));

  const bMedia = await allQuery('SELECT * FROM branch_media');
  for (const m of bMedia) {
    data.branchMedia[m.branch_id] = data.branchMedia[m.branch_id] || [];
    data.branchMedia[m.branch_id].push({ id: m.id, title: m.title, url: m.url, type: m.type });
  }

  const anns = await allQuery('SELECT * FROM announcements');
  for (const a of anns) {
    data.branchAnnouncements[a.branch_id] = data.branchAnnouncements[a.branch_id] || [];
    data.branchAnnouncements[a.branch_id].push(a.text);
  }

  const ords = await allQuery('SELECT * FROM orders');
  for (const o of ords) {
    data.branchOrders[o.branch_id] = data.branchOrders[o.branch_id] || [];
    data.branchOrders[o.branch_id].push(o.text);
  }

  return data;
}

module.exports = {
  initSqlite,
  readFullDb,
  writeFullDb
};
