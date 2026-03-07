import React, { useState } from 'react';
import usePhantom from '../hooks/usePhantom';

export default function WalletConnect() {
  const {
    wallet,
    balance,
    connecting,
    error,
    phantomInstalled,
    connect,
    disconnect,
    sendSol,
    walletAddress,
    network,
  } = usePhantom();

  const [expanded, setExpanded] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!recipient || !amount) return;

    setSending(true);
    setTxStatus(null);

    try {
      const result = await sendSol(recipient, parseFloat(amount));
      setTxStatus({
        type: 'success',
        message: 'Transaction confirmed!',
        explorerUrl: result.explorerUrl,
      });
      setRecipient('');
      setAmount('');
    } catch (err) {
      setTxStatus({
        type: 'error',
        message: err.message || 'Transaction failed',
      });
    } finally {
      setSending(false);
    }
  };

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : '';

  // Phantom not installed
  if (phantomInstalled === false) {
    return (
      <a
        href="https://phantom.app/"
        target="_blank"
        rel="noopener noreferrer"
        style={styles.installBtn}
      >
        Install Phantom
      </a>
    );
  }

  // Still checking for Phantom
  if (phantomInstalled === null) {
    return null;
  }

  // Not connected
  if (!wallet) {
    return (
      <div style={styles.container}>
        <button
          onClick={connect}
          disabled={connecting}
          style={styles.connectBtn}
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </div>
    );
  }

  // Connected - compact view
  return (
    <div style={styles.container}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={styles.walletBtn}
      >
        <span style={styles.connectedDot} />
        <span style={styles.balanceText}>
          {balance !== null ? `${balance.toFixed(2)} SOL` : '...'}
        </span>
        <span style={styles.addressText}>{shortAddress}</span>
        <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            <div>
              <div style={styles.fullAddress} title={walletAddress}>
                {walletAddress}
              </div>
              <div style={styles.networkBadge}>{network}</div>
            </div>
            <button onClick={disconnect} style={styles.disconnectBtn}>
              Disconnect
            </button>
          </div>

          <form onSubmit={handleSend} style={styles.sendForm}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Recipient</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="Solana address"
                style={styles.input}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Amount (SOL)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.01"
                  step="0.001"
                  min="0"
                  style={styles.input}
                />
              </div>
              <button
                type="submit"
                disabled={sending || !recipient || !amount}
                style={styles.sendBtn}
              >
                {sending ? '...' : 'Send'}
              </button>
            </div>
          </form>

          {txStatus && (
            <div
              style={{
                ...styles.status,
                ...(txStatus.type === 'success' ? styles.statusSuccess : styles.statusError),
              }}
            >
              <p>{txStatus.message}</p>
              {txStatus.explorerUrl && (
                <a
                  href={txStatus.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.explorerLink}
                >
                  View on Explorer
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
  },
  installBtn: {
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: 10,
    background: 'linear-gradient(90deg, #ab9ff2, #6e56cf)',
    color: '#fff',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
  },
  connectBtn: {
    background: 'linear-gradient(90deg, #ab9ff2, #6e56cf)',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  error: {
    color: 'var(--red)',
    fontSize: 12,
    marginTop: 8,
    position: 'absolute',
    right: 0,
    whiteSpace: 'nowrap',
  },
  walletBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '10px 16px',
    borderRadius: 10,
    color: 'var(--text)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--green)',
  },
  balanceText: {
    fontWeight: 600,
  },
  addressText: {
    color: 'var(--text-dim)',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  chevron: {
    fontSize: 10,
    color: 'var(--text-dim)',
    marginLeft: 4,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    right: 0,
    width: 320,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 16,
    zIndex: 100,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  dropdownHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid var(--border)',
  },
  fullAddress: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'var(--accent)',
    wordBreak: 'break-all',
    marginBottom: 6,
  },
  networkBadge: {
    display: 'inline-block',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(108, 92, 231, 0.2)',
    color: 'var(--accent)',
    textTransform: 'uppercase',
  },
  disconnectBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    padding: '6px 12px',
    borderRadius: 6,
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    flexShrink: 0,
  },
  sendForm: {},
  formGroup: {
    marginBottom: 12,
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: 10,
    alignItems: 'flex-end',
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 12,
    color: 'var(--text-dim)',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'rgba(0, 0, 0, 0.2)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  },
  sendBtn: {
    background: 'linear-gradient(90deg, var(--green), #00b377)',
    border: 'none',
    padding: '10px 20px',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    marginBottom: 12,
  },
  status: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 12,
  },
  statusSuccess: {
    background: 'rgba(0, 214, 143, 0.1)',
    border: '1px solid var(--green)',
    color: 'var(--green)',
  },
  statusError: {
    background: 'rgba(255, 107, 107, 0.1)',
    border: '1px solid var(--red)',
    color: 'var(--red)',
  },
  explorerLink: {
    display: 'inline-block',
    marginTop: 6,
    color: 'var(--accent)',
    textDecoration: 'none',
    fontSize: 11,
  },
};
