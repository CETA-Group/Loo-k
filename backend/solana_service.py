from solana.rpc.api import Client
from solders.keypair import Keypair
from solders.transaction import Transaction
from solders.message import Message
from solders.instruction import Instruction
from solders.pubkey import Pubkey
from solders.hash import Hash

# Connect to devnet
client = Client("https://api.devnet.solana.com")

# Load your wallet (random for now — replace with your real keypair later)
keypair = Keypair()


def write_score_to_solana(address: str, score: float):
    # Create memo message
    message = f"{address} | score={score}"
    data = message.encode("utf-8")

    # Memo program ID
    memo_program_id = Pubkey.from_string(
        "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
    )

    # Memo instruction (no accounts required)
    memo_ix = Instruction(
        program_id=memo_program_id,
        accounts=[],
        data=data
    )

    # Fetch recent blockhash
    resp = client.get_latest_blockhash()
    recent_blockhash = resp.value.blockhash

    # Build message with payer = your wallet
    msg = Message(
        instructions=[memo_ix],
        payer=keypair.pubkey()
    )

    # Build transaction
    tx = Transaction(
        from_keypairs=[keypair],   # signer list
        message=msg,
        recent_blockhash=recent_blockhash
    )

    # Send transaction
    result = client.send_transaction(tx)

    # Extract signature
    signature = result.value

    # Return explorer link (same behavior as before)
    return f"https://explorer.solana.com/tx/{signature}?cluster=devnet"
