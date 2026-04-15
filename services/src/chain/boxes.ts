import algosdk from "algosdk"

function uint64Bytes(value: bigint) {
  return new algosdk.ABIUintType(64).encode(value)
}

function boxName(prefix: string, suffix: Uint8Array) {
  return new Uint8Array([...new TextEncoder().encode(prefix), ...suffix])
}

export function vaultBox(appId: bigint, vaultId: bigint) {
  return {
    appId,
    name: boxName("v", uint64Bytes(vaultId)),
  }
}

export function ownerVaultBox(appId: bigint, owner: string, vaultId: bigint) {
  const ownerBytes = algosdk.decodeAddress(owner).publicKey
  return {
    appId,
    name: boxName("o", new Uint8Array([...ownerBytes, ...uint64Bytes(vaultId)])),
  }
}
