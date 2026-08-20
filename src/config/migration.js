const autoMigrate = async (pool) => {
  try {
    const usersColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    const existingColumns = usersColumns.rows.map(row => row.column_name.toLowerCase());
    
    const desiredUsersColumns = ['id', 'phone', 'pin', 'name', 'profile_image', 'user_type', 'otp', 'isverified', 'last_otp_sent_at', 'fcm_token'];
    
    for (const column of desiredUsersColumns) {
      if (!existingColumns.includes(column)) {
        console.log(`Adding column ${column} to users table`);
        if (column === 'name') {
          await pool.query('ALTER TABLE users ADD COLUMN name VARCHAR(255)');
        } else if (column === 'profile_image') {
          await pool.query('ALTER TABLE users ADD COLUMN profile_image VARCHAR(500)');
        } else if (column === 'user_type') {
          await pool.query('ALTER TABLE users ADD COLUMN user_type VARCHAR(20) DEFAULT \'Personal\'');
        } else if (column === 'otp') {
          await pool.query('ALTER TABLE users ADD COLUMN otp VARCHAR(10)');
        } else if (column === 'phone') {
          await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20)');
        } else if (column === 'pin') {
          await pool.query('ALTER TABLE users ADD COLUMN pin VARCHAR(10)');
        } else if (column === 'last_otp_sent_at') {
          await pool.query('ALTER TABLE users ADD COLUMN last_otp_sent_at TIMESTAMP');
        } else if (column === 'fcm_token') {
          await pool.query('ALTER TABLE users ADD COLUMN fcm_token TEXT');
        }
      }
    }

    if (existingColumns.includes('email') && !desiredUsersColumns.includes('email')) {
      console.log('Dropping email column from users table');
      await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS email');
    }

    if (existingColumns.includes('password') && !desiredUsersColumns.includes('password')) {
      console.log('Dropping password column from users table');
      await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS password');
    }

    const walletsColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'wallets'
    `);
    const existingWalletColumns = walletsColumns.rows.map(row => row.column_name.toLowerCase());
    
    const desiredWalletColumns = ['id', 'user_id', 'balance', 'status', 'created_at'];
    
    for (const column of desiredWalletColumns) {
      if (!existingWalletColumns.includes(column)) {
        console.log(`Adding column ${column} to wallets table`);
        if (column === 'balance') {
          await pool.query('ALTER TABLE wallets ADD COLUMN balance DECIMAL(10, 2) DEFAULT 0.00');
        } else if (column === 'created_at') {
          await pool.query('ALTER TABLE wallets ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        } else if (column === 'user_id') {
          await pool.query('ALTER TABLE wallets ADD COLUMN user_id INTEGER REFERENCES users(id)');
        } else if (column === 'status') {
          await pool.query('ALTER TABLE wallets ADD COLUMN status VARCHAR(20) DEFAULT \'active\'');
        }
      }
    }

    const transactionsColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'transactions'
    `);
    const existingTransactionColumns = transactionsColumns.rows.map(row => row.column_name.toLowerCase());
    
    const desiredTransactionColumns = ['id', 'sender_id', 'receiver_id', 'amount', 'transaction_type', 'status', 'created_at', 'sslcommerz_transaction_id', 'bank_transaction_id'];
    
    for (const column of desiredTransactionColumns) {
      if (!existingTransactionColumns.includes(column)) {
        console.log(`Adding column ${column} to transactions table`);
        if (column === 'amount') {
          await pool.query('ALTER TABLE transactions ADD COLUMN amount DECIMAL(10, 2)');
        } else if (column === 'transaction_type') {
          await pool.query('ALTER TABLE transactions ADD COLUMN transaction_type VARCHAR(20) DEFAULT \'send_money\'');
        } else if (column === 'status') {
          await pool.query('ALTER TABLE transactions ADD COLUMN status VARCHAR(20) DEFAULT \'completed\'');
        } else if (column === 'created_at') {
          await pool.query('ALTER TABLE transactions ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        } else if (column === 'sender_id') {
          await pool.query('ALTER TABLE transactions ADD COLUMN sender_id INTEGER REFERENCES users(id)');
        } else if (column === 'receiver_id') {
          await pool.query('ALTER TABLE transactions ADD COLUMN receiver_id INTEGER REFERENCES users(id)');
        } else if (column === 'sslcommerz_transaction_id') {
          await pool.query('ALTER TABLE transactions ADD COLUMN sslcommerz_transaction_id VARCHAR(100)');
        } else if (column === 'bank_transaction_id') {
          await pool.query('ALTER TABLE transactions ADD COLUMN bank_transaction_id VARCHAR(100)');
        }
      }
    }

    // Group Savings tables migration
    const groupSavingsTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'group_savings'
    `);
    
    if (groupSavingsTable.rows.length === 0) {
      console.log('Creating group_savings table');
      await pool.query(`
        CREATE TABLE group_savings (
          id SERIAL PRIMARY KEY,
          creator_id INTEGER REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          goal_amount DECIMAL(15, 2) NOT NULL,
          current_amount DECIMAL(15, 2) DEFAULT 0,
          duration INTEGER NOT NULL,
          frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
          status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
          start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          end_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const groupSavingsMembersTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'group_savings_members'
    `);
    
    if (groupSavingsMembersTable.rows.length === 0) {
      console.log('Creating group_savings_members table');
      await pool.query(`
        CREATE TABLE group_savings_members (
          id SERIAL PRIMARY KEY,
          group_savings_id INTEGER REFERENCES group_savings(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'left')),
          contribution_amount DECIMAL(15, 2) NOT NULL,
          joined_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(group_savings_id, user_id)
        )
      `);
      
      // Create indexes
      await pool.query('CREATE INDEX idx_group_savings_creator ON group_savings(creator_id)');
      await pool.query('CREATE INDEX idx_group_savings_members_user ON group_savings_members(user_id)');
      await pool.query('CREATE INDEX idx_group_savings_members_group ON group_savings_members(group_savings_id)');
    }

    // Notifications table migration
    const notificationsTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'notifications'
    `);
    
    if (notificationsTable.rows.length === 0) {
      console.log('Creating notifications table');
      await pool.query(`
        CREATE TABLE notifications (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255),
          description TEXT,
          image_url VARCHAR(500),
          created_by INTEGER REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Group Savings Pending Deductions table migration
    const pendingDeductionsTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'group_savings_pending_deductions'
    `);
    
    if (pendingDeductionsTable.rows.length === 0) {
      console.log('Creating group_savings_pending_deductions table');
      await pool.query(`
        CREATE TABLE group_savings_pending_deductions (
          id SERIAL PRIMARY KEY,
          group_savings_id INTEGER REFERENCES group_savings(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id),
          amount DECIMAL(15, 2) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          UNIQUE(group_savings_id, user_id)
        )
      `);
      
      // Create indexes
      await pool.query('CREATE INDEX idx_pending_deductions_user ON group_savings_pending_deductions(user_id)');
      await pool.query('CREATE INDEX idx_pending_deductions_status ON group_savings_pending_deductions(status)');
    }

  } catch (err) {
    console.log('Auto migration skipped (tables may not exist yet)');
  }
};

module.exports = { autoMigrate };
