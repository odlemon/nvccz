const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createTables() {
  try {
    console.log('📊 Creating Purchase Invoice tables in database...\n');

    // Create purchase_invoices table
    console.log('1. Creating purchase_invoices table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS purchase_invoices (
        id VARCHAR(255) PRIMARY KEY,
        invoice_number VARCHAR(255) UNIQUE NOT NULL,
        vendor_id VARCHAR(255) NOT NULL,
        invoice_date DATETIME NOT NULL,
        due_date DATETIME,
        subtotal DECIMAL(15,2) DEFAULT 0.00,
        vat_amount DECIMAL(15,2) DEFAULT 0.00,
        total_amount DECIMAL(15,2) DEFAULT 0.00,
        currency_id VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(255) DEFAULT 'DRAFT',
        payment_status VARCHAR(255) DEFAULT 'PENDING',
        payment_method VARCHAR(255),
        is_taxable BOOLEAN DEFAULT false,
        journal_entry_id VARCHAR(255),
        payment_journal_entry_id VARCHAR(255),
        cashbook_entry_id VARCHAR(255) UNIQUE,
        paid_amount DECIMAL(15,2) DEFAULT 0.00,
        outstanding_amount DECIMAL(15,2),
        payment_date DATETIME,
        payment_reference VARCHAR(255),
        notes TEXT,
        created_by_id VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vendor_id (vendor_id),
        INDEX idx_currency_id (currency_id),
        INDEX idx_status (status),
        INDEX idx_payment_status (payment_status),
        INDEX idx_journal_entry_id (journal_entry_id),
        INDEX idx_cashbook_entry_id (cashbook_entry_id),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
        FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE RESTRICT,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (payment_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (cashbook_entry_id) REFERENCES cashbook_entries(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✅ purchase_invoices table created\n');

    // Create purchase_invoice_items table
    console.log('2. Creating purchase_invoice_items table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS purchase_invoice_items (
        id VARCHAR(255) PRIMARY KEY,
        invoice_id VARCHAR(255) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        description TEXT,
        quantity DECIMAL(10,2) NOT NULL,
        unit_price DECIMAL(15,2) NOT NULL,
        total_price DECIMAL(15,2) NOT NULL,
        unit VARCHAR(255),
        vat_rate DECIMAL(5,2) DEFAULT 0.00,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_invoice_id (invoice_id),
        FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✅ purchase_invoice_items table created\n');

    console.log('✅ All tables created successfully!\n');
    console.log('📝 Next steps:');
    console.log('   1. Run: npx prisma generate');
    console.log('   2. Restart your server');
    console.log('   3. Run the test script\n');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('⚠️  Tables already exist, skipping creation\n');
    } else {
      console.error('❌ Error creating tables:', error.message);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

createTables();

