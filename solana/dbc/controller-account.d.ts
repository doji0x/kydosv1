// Generated account-only view of the canonical browser IDL; never a second ABI.
// Verified by scripts/runtime-typecheck.mjs; regenerate from that IDL on changes.
import type { IdlInstruction, IdlMetadata } from '@coral-xyz/anchor';
export type ControllerAccountIdl = {
  address: string;
  metadata: IdlMetadata;
  instructions: IdlInstruction[];
} & {
  "accounts": [
    {
      "name": "dbcLaunch",
      "discriminator": [
        212,
        192,
        76,
        172,
        222,
        209,
        166,
        88
      ]
    }
  ],
  "types": [
    {
      "name": "dbcLaunch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "dbcPool",
            "type": "pubkey"
          },
          {
            "name": "dammPool",
            "type": "pubkey"
          },
          {
            "name": "quoteDust",
            "type": "u64"
          },
          {
            "name": "baseBurned",
            "type": "u128"
          },
          {
            "name": "creatorQuotePaid",
            "type": "u128"
          },
          {
            "name": "kydosQuotePaid",
            "type": "u128"
          },
          {
            "name": "bondingQuotePaid",
            "type": "u128"
          }
        ]
      }
    }
  ]
};
