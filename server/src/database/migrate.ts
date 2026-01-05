import { readFileSync } from 'fs';
import { join } from 'path';
import { query, testConnection, closePool } from './index';

/**
 * Database Migration Script
 * 
 * Runs schema.sql to create tables and indexes
 * Usage: npm run db:migrate
 */

async function migrate() {
  console.log('🔄 Starting database migration...\n');

  try {
    // Test connection first
    console.log('1. Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('❌ Database connection failed. Check your .env configuration.');
      process.exit(1);
    }
    
    console.log('✅ Database connection successful\n');

    // Read schema file
    console.log('2. Reading schema.sql...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    console.log('✅ Schema file loaded\n');

    // Execute schema
    console.log('3. Executing schema...');
    await query(schemaSql);
    console.log('✅ Schema executed successfully\n');

    // Verify tables were created
    console.log('4. Verifying tables...');
    const tablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('\n📊 Tables in database:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Check for expected tables
    const tableNames = tablesResult.rows.map(r => r.table_name);
    const expectedTables = ['users', 'hand_histories'];
    const missing = expectedTables.filter(t => !tableNames.includes(t));

    if (missing.length > 0) {
      console.warn(`\n⚠️  Warning: Expected tables not found: ${missing.join(', ')}`);
    } else {
      console.log('\n✅ All expected tables exist');
    }

    console.log('\n🎉 Migration completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run migration
migrate();

