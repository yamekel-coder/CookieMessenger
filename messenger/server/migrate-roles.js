// Migration script: move single role to user_roles table
const db = require('./db');

console.log('🔄 Migrating roles to user_roles table...');

// Get all users with roles
const users = db.prepare('SELECT id, role FROM users WHERE role IS NOT NULL AND role != ""').all();

console.log(`Found ${users.length} users with roles`);

const insert = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)');

const migrate = db.transaction((users) => {
  users.forEach(u => {
    if (u.role && u.role !== 'user') {
      insert.run(u.id, u.role);
      console.log(`  ✓ User ${u.id}: ${u.role}`);
    }
  });
});

migrate(users);

console.log('✅ Migration complete!');
console.log('You can now run the server normally.');
