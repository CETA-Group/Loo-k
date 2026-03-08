from solana.rpc.api import Client
from solders.keypair import Keypair
from solders.transaction import Transaction
from solders.system_program import TransferParams, transfer
from solders.pubkey import Pubkey

# Connect to devnet
client = Client("https://api.devnet.solana.com")

# Load your wallet
keypair = Keypair()

def write_score_to_solana(address, score):
    message = f"{address} | score={score}"

    # Convert message to bytes
    data = message.encode("utf-8")

    # We send 0 SOL but include the message as "memo"
    from solders.instruction import Instruction
    memo_program_id = Pubkey.from_string("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr")

    memo_ix = Instruction(
        program_id=memo_program_id,
        accounts=[],
        data=data
    )

    # Build transaction
    tx = Transaction().add(memo_ix)

    # Send it
    result = client.send_transaction(tx, keypair)
    return result
