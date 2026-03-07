-- Supabase SQL Schema for SlideFund
-- Run this in the Supabase SQL Editor

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  recipient TEXT NOT NULL,
  amount DECIMAL(20, 9) NOT NULL,
  signature TEXT UNIQUE NOT NULL,
  network TEXT DEFAULT 'devnet',
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by wallet
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert (for simplicity - you may want to restrict this)
CREATE POLICY "Allow public insert" ON transactions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow users to read their own transactions
CREATE POLICY "Allow read own transactions" ON transactions
  FOR SELECT
  TO anon
  USING (true);

-- Optional: Create a view for transaction stats
CREATE OR REPLACE VIEW wallet_stats AS
SELECT
  wallet_address,
  COUNT(*) as total_transactions,
  SUM(amount) as total_sent,
  MAX(created_at) as last_transaction
FROM transactions
GROUP BY wallet_address;
