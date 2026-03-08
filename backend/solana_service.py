import os
import json
import time
from solana.rpc.api import Client
from solders.keypair import Keypair
from solders.transaction import Transaction
from solders.message import Message
from solders.instruction import Instruction
from solders.pubkey import Pubkey

# ── Devnet client ─────────────────────────────────────────────────────────────
client = Client("https://api.devnet.solana.com")

# ── Persistent keypair ────────────────────────────────────────────────────────
# Saved next to this file so it survives server restarts.
_KEYPAIR_FILE = os.path.join(os.path.dirname(__file__), "solana_wallet.json")

def _load_or_create_keypair() -> Keypair:
    if os.path.exists(_KEYPAIR_FILE):
        with open(_KEYPAIR_FILE, "r") as f:
            secret = json.load(f)           # list of 64 ints
        return Keypair.from_bytes(bytes(secret))
    # First run — generate and save
    kp = Keypair()
    with open(_KEYPAIR_FILE, "w") as f:
        json.dump(list(bytes(kp)), f)
    print(f"[Solana] New wallet created: {kp.pubkey()}")
    return kp

keypair = _load_or_create_keypair()

# ── Auto-airdrop if balance is low ────────────────────────────────────────────
def _ensure_funded():
    """Request a free Devnet airdrop if balance is below 0.1 SOL."""
    try:
        bal = client.get_balance(keypair.pubkey()).value  # lamports
        if bal < 100_000_000:                             # < 0.1 SOL
            print(f"[Solana] Balance low ({bal} lamports), requesting airdrop…")
            client.request_airdrop(keypair.pubkey(), 1_000_000_000)  # 1 SOL
            time.sleep(3)                                  # wait for confirmation
            print(f"[Solana] Airdrop requested for {keypair.pubkey()}")
    except Exception as e:
        print(f"[Solana] Airdrop failed (network issue): {e}")

_ensure_funded()

# ── Write livability score as a Solana memo transaction ───────────────────────
def write_score_to_solana(address: str, score: float) -> str:
    _ensure_funded()

    memo_program_id = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

    data = f"loo-k | {address} | score={score}".encode("utf-8")

    memo_ix = Instruction(
        program_id=memo_program_id,
        accounts=[],
        data=data,
    )

    resp             = client.get_latest_blockhash()
    recent_blockhash = resp.value.blockhash

    msg = Message(
        instructions=[memo_ix],
        payer=keypair.pubkey(),
    )

    tx = Transaction(
        from_keypairs=[keypair],
        message=msg,
        recent_blockhash=recent_blockhash,
    )

    result    = client.send_transaction(tx)
    signature = result.value

    return f"https://explorer.solana.com/tx/{signature}?cluster=devnet"
