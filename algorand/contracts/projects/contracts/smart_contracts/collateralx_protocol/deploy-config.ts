import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { CollateralXProtocolManagerFactory } from '../artifacts/collateralx_protocol/CollateralXProtocolManagerClient'

export async function deploy() {
  console.log('=== Deploying CollateralXProtocolManager ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  const factory = algorand.client.getTypedAppFactory(CollateralXProtocolManagerFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
    createParams: {
      method: 'createApplication',
      args: { admin: deployer.addr.toString() },
    },
  })

  // Box-backed vault storage raises app-account MBR. This initial funding is a
  // deploy-time buffer; production vault creation can also group per-vault MBR.
  if (['create', 'replace'].includes(result.operationPerformed)) {
    await algorand.send.payment({
      amount: (5).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })
  }

  console.log(`CollateralXProtocolManager app id: ${appClient.appClient.appId}`)
}

