// Supabase configuration - replace with your values
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Solana network (use 'mainnet-beta' for production)
const NETWORK = 'devnet';
const CLUSTER_URL = NETWORK === 'devnet'
  ? 'https://api.devnet.solana.com'
  : 'https://api.mainnet-beta.solana.com';

// Initialize Solana connection
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = solanaWeb3;
const connection = new Connection(CLUSTER_URL, 'confirmed');

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const walletInfo = document.getElementById('wallet-info');
const walletAddress = document.getElementById('wallet-address');
const balanceEl = document.getElementById('balance');
const depositSection = document.getElementById('deposit-section');
const recipientInput = document.getElementById('recipient');
const amountInput = document.getElementById('amount');
const depositBtn = document.getElementById('deposit-btn');
const statusEl = document.getElementById('status');
const noPhantom = document.getElementById('no-phantom');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');

let connectedWallet = null;

// Check if Phantom is installed
const getProvider = () => {
  if ('phantom' in window) {
    const provider = window.phantom?.solana;
    if (provider?.isPhantom) {
      return provider;
    }
  }
  return null;
};

// Initialize Supabase client
const initSupabase = () => {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.warn('Supabase not configured - transactions will not be saved');
    return null;
  }

  // Simple Supabase client using fetch
  return {
    async insert(table, data) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      });
      return response.json();
    },

    async select(table, column, value) {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${value}&order=created_at.desc&limit=10`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
          }
        }
      );
      return response.json();
    }
  };
};

const supabase = initSupabase();

// Connect wallet
const connectWallet = async () => {
  const provider = getProvider();

  if (!provider) {
    noPhantom.style.display = 'block';
    connectBtn.style.display = 'none';
    return;
  }

  try {
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';

    const response = await provider.connect();
    connectedWallet = response.publicKey;

    // Update UI
    connectBtn.style.display = 'none';
    walletInfo.style.display = 'block';
    walletAddress.textContent = connectedWallet.toString();
    depositSection.classList.add('active');
    historySection.classList.add('active');

    // Get balance
    await updateBalance();

    // Load transaction history
    await loadHistory();

    // Listen for account changes
    provider.on('accountChanged', async (publicKey) => {
      if (publicKey) {
        connectedWallet = publicKey;
        walletAddress.textContent = publicKey.toString();
        await updateBalance();
        await loadHistory();
      } else {
        // Disconnected
        disconnectWallet();
      }
    });

  } catch (error) {
    console.error('Connection error:', error);
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Phantom';
    showStatus(`Connection failed: ${error.message}`, 'error');
  }
};

// Disconnect wallet
const disconnectWallet = () => {
  connectedWallet = null;
  connectBtn.style.display = 'block';
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect Phantom';
  walletInfo.style.display = 'none';
  depositSection.classList.remove('active');
  historySection.classList.remove('active');
};

// Update balance
const updateBalance = async () => {
  if (!connectedWallet) return;

  try {
    const balance = await connection.getBalance(connectedWallet);
    const solBalance = balance / LAMPORTS_PER_SOL;
    balanceEl.textContent = `${solBalance.toFixed(4)} SOL`;
  } catch (error) {
    console.error('Balance error:', error);
    balanceEl.textContent = 'Error loading balance';
  }
};

// Send SOL
const sendSol = async () => {
  const provider = getProvider();
  if (!provider || !connectedWallet) return;

  const recipient = recipientInput.value.trim();
  const amount = parseFloat(amountInput.value);

  // Validation
  if (!recipient) {
    showStatus('Please enter a recipient address', 'error');
    return;
  }

  if (!amount || amount <= 0) {
    showStatus('Please enter a valid amount', 'error');
    return;
  }

  try {
    // Validate recipient address
    const recipientPubkey = new PublicKey(recipient);

    depositBtn.disabled = true;
    depositBtn.textContent = 'Sending...';
    showStatus('Preparing transaction...', 'success');

    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: connectedWallet,
        toPubkey: recipientPubkey,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL)
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = connectedWallet;

    // Sign and send via Phantom
    const { signature } = await provider.signAndSendTransaction(transaction);

    showStatus(`Transaction sent! Confirming...`, 'success');

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error('Transaction failed');
    }

    // Save to Supabase
    if (supabase) {
      await supabase.insert('transactions', {
        wallet_address: connectedWallet.toString(),
        recipient: recipient,
        amount: amount,
        signature: signature,
        network: NETWORK,
        status: 'confirmed'
      });
    }

    // Success!
    const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`;
    statusEl.innerHTML = `
      Transaction confirmed!
      <br><a href="${explorerUrl}" target="_blank" class="tx-link">View on Explorer</a>
    `;
    statusEl.className = 'status success';

    // Clear inputs and update balance
    recipientInput.value = '';
    amountInput.value = '';
    await updateBalance();
    await loadHistory();

  } catch (error) {
    console.error('Transaction error:', error);
    showStatus(`Transaction failed: ${error.message}`, 'error');
  } finally {
    depositBtn.disabled = false;
    depositBtn.textContent = 'Send SOL';
  }
};

// Load transaction history from Supabase
const loadHistory = async () => {
  if (!supabase || !connectedWallet) {
    historyList.innerHTML = '<p style="color: #666; font-size: 13px;">Configure Supabase to see history</p>';
    return;
  }

  try {
    const transactions = await supabase.select('transactions', 'wallet_address', connectedWallet.toString());

    if (!transactions || transactions.length === 0) {
      historyList.innerHTML = '<p style="color: #666; font-size: 13px;">No transactions yet</p>';
      return;
    }

    historyList.innerHTML = transactions.map(tx => {
      const date = new Date(tx.created_at).toLocaleDateString();
      const shortSig = tx.signature.slice(0, 8) + '...' + tx.signature.slice(-8);
      const explorerUrl = `https://explorer.solana.com/tx/${tx.signature}?cluster=${tx.network}`;

      return `
        <div class="history-item">
          <span class="amount">${tx.amount} SOL</span> to ${tx.recipient.slice(0, 8)}...
          <br>
          <a href="${explorerUrl}" target="_blank" class="tx-link">${shortSig}</a>
          <span style="float: right; color: #666;">${date}</span>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('History error:', error);
    historyList.innerHTML = '<p style="color: #666; font-size: 13px;">Error loading history</p>';
  }
};

// Show status message
const showStatus = (message, type) => {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
};

// Event listeners
connectBtn.addEventListener('click', connectWallet);
depositBtn.addEventListener('click', sendSol);

// Check for existing connection on load
window.addEventListener('load', async () => {
  const provider = getProvider();

  if (!provider) {
    noPhantom.style.display = 'block';
    connectBtn.style.display = 'none';
    return;
  }

  // Try to reconnect if previously connected
  try {
    const response = await provider.connect({ onlyIfTrusted: true });
    connectedWallet = response.publicKey;

    connectBtn.style.display = 'none';
    walletInfo.style.display = 'block';
    walletAddress.textContent = connectedWallet.toString();
    depositSection.classList.add('active');
    historySection.classList.add('active');

    await updateBalance();
    await loadHistory();
  } catch (error) {
    // Not previously connected, that's fine
    console.log('No existing connection');
  }
});
