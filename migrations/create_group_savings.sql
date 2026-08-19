-- Group Savings table
CREATE TABLE IF NOT EXISTS group_savings (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  goal_amount DECIMAL(15, 2) NOT NULL,
  current_amount DECIMAL(15, 2) DEFAULT 0,
  duration INTEGER NOT NULL, -- in days
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group Savings Members table
CREATE TABLE IF NOT EXISTS group_savings_members (
  id SERIAL PRIMARY KEY,
  group_savings_id INTEGER REFERENCES group_savings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'left')),
  contribution_amount DECIMAL(15, 2) NOT NULL,
  joined_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_savings_id, user_id)
);

-- Index for faster queries
CREATE INDEX idx_group_savings_creator ON group_savings(creator_id);
CREATE INDEX idx_group_savings_members_user ON group_savings_members(user_id);
CREATE INDEX idx_group_savings_members_group ON group_savings_members(group_savings_id);
