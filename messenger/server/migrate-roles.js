// Migration script: move single role column to user_roles table
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'messenger.db'));

console.log('🔄 Migrating roles to user_roles table...');

// Step 1: Create user_roles table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Step 2: Add VIP columns if missing
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!cols.includes('animated_name')) db.exec("ALTER TABLE users ADD COLUMN animated_name TEXT");
if (!cols.includes('profile_music')) db.exec("ALTER TABLE users ADD COLUMN profile_music TEXT");

// Step 3: Check if 'role' column exists before migrating
if (cols.includes('role')) {
  const users = db.prepare("SELECT id, role FROM users WHERE role IS NOT NULL AND role != '' AND role != 'user'").all();
  console.log(`Found ${users.length} users with non-default roles`);

  const insert = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)');
  const migrate = db.transaction((users) => {
    users.forEach(u => {
      insert.run(u.id, u.role);
      console.log(`  ✓ User ${u.id}: ${u.role}`);
    });
  });
  migrate(users);
} else {
  console.log('No role column found, skipping migration');
}

console.log('✅ Migration complete!');
